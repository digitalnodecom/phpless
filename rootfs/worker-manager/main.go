// phpless-workers — Lightweight process manager for PHPless microVMs.
//
// Reads worker definitions from /etc/phpless-workers.json, starts each as a
// supervised child process with automatic restart (exponential backoff), and
// exposes a tiny HTTP status API on 127.0.0.1:9111.
//
// Build: CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o phpless-workers .
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const (
	configPath = "/etc/phpless-workers.json"
	logDir     = "/var/log/phpless/workers"
	listenAddr = "0.0.0.0:9111"

	minBackoff = 1 * time.Second
	maxBackoff = 30 * time.Second
)

// WorkerDef is a single worker definition from the config file.
type WorkerDef struct {
	Name      string `json:"name"`
	Command   string `json:"command"`
	Processes int    `json:"processes"`
	Directory string `json:"directory,omitempty"`
}

// WorkerStatus is the runtime state of a single worker process.
type WorkerStatus struct {
	Name     string `json:"name"`
	Index    int    `json:"index"`
	PID      int    `json:"pid"`
	State    string `json:"state"` // running, stopped, backoff
	Restarts int    `json:"restarts"`
	Uptime   int64  `json:"uptime_seconds"`
	ExitCode int    `json:"last_exit_code"`
}

// worker tracks a single supervised process.
type worker struct {
	def     WorkerDef
	index   int
	mu      sync.Mutex
	cmd     *exec.Cmd
	state   string
	pid     int
	started time.Time
	exits   int
	lastErr int
	stop    chan struct{}
	logFile *os.File
}

var (
	workers []*worker
	wg      sync.WaitGroup
)

func main() {
	// Read config
	data, err := os.ReadFile(configPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "phpless-workers: no config at %s, exiting\n", configPath)
		os.Exit(0) // not an error — just no workers configured
	}

	var defs []WorkerDef
	if err := json.Unmarshal(data, &defs); err != nil {
		fmt.Fprintf(os.Stderr, "phpless-workers: invalid config: %v\n", err)
		os.Exit(1)
	}

	if len(defs) == 0 {
		fmt.Fprintln(os.Stderr, "phpless-workers: empty config, exiting")
		os.Exit(0)
	}

	os.MkdirAll(logDir, 0755)

	// Start workers
	for _, def := range defs {
		if def.Processes <= 0 {
			def.Processes = 1
		}
		if def.Directory == "" {
			def.Directory = "/app"
		}
		for i := 0; i < def.Processes; i++ {
			w := &worker{
				def:   def,
				index: i,
				state: "starting",
				stop:  make(chan struct{}),
			}
			workers = append(workers, w)
			wg.Add(1)
			go w.run()
		}
	}

	fmt.Fprintf(os.Stderr, "phpless-workers: started %d worker(s)\n", len(workers))

	// Start HTTP status API
	go serveAPI()

	// Wait for shutdown signal
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGTERM, syscall.SIGINT)
	<-sig

	fmt.Fprintln(os.Stderr, "phpless-workers: shutting down...")
	for _, w := range workers {
		close(w.stop)
	}
	wg.Wait()
	fmt.Fprintln(os.Stderr, "phpless-workers: stopped")
}

func (w *worker) run() {
	defer wg.Done()
	backoff := minBackoff

	for {
		// Open log file (append mode, one per worker instance)
		logName := fmt.Sprintf("%s-%d.log", w.def.Name, w.index)
		logPath := filepath.Join(logDir, logName)
		lf, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			fmt.Fprintf(os.Stderr, "phpless-workers: cannot open log %s: %v\n", logPath, err)
			lf = os.Stderr
		}

		w.mu.Lock()
		w.logFile = lf
		w.mu.Unlock()

		// Build command
		cmd := exec.Command("/bin/sh", "-c", w.def.Command)
		cmd.Dir = w.def.Directory
		// Inherit environment and ensure PATH includes common binary locations
		env := os.Environ()
		hasPath := false
		for _, e := range env {
			if len(e) > 5 && e[:5] == "PATH=" {
				hasPath = true
				break
			}
		}
		if !hasPath {
			env = append(env, "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin")
		}
		cmd.Env = env

		// Pipe stdout+stderr to log file with timestamps
		pr, pw := io.Pipe()
		cmd.Stdout = pw
		cmd.Stderr = pw

		go func() {
			scanner := bufio.NewScanner(pr)
			for scanner.Scan() {
				ts := time.Now().Format("2006-01-02 15:04:05")
				fmt.Fprintf(lf, "[%s] %s\n", ts, scanner.Text())
			}
		}()

		if err := cmd.Start(); err != nil {
			w.mu.Lock()
			w.state = "backoff"
			w.mu.Unlock()
			pw.Close()
			fmt.Fprintf(lf, "[%s] ERROR: failed to start: %v\n", time.Now().Format("2006-01-02 15:04:05"), err)
		} else {
			w.mu.Lock()
			w.state = "running"
			w.pid = cmd.Process.Pid
			w.started = time.Now()
			w.cmd = cmd
			w.mu.Unlock()

			// Wait for process to exit
			exitErr := cmd.Wait()
			pw.Close()

			w.mu.Lock()
			w.exits++
			if exitErr != nil {
				if exitError, ok := exitErr.(*exec.ExitError); ok {
					w.lastErr = exitError.ExitCode()
				} else {
					w.lastErr = -1
				}
			} else {
				w.lastErr = 0
			}
			w.state = "backoff"
			w.pid = 0
			w.cmd = nil
			w.mu.Unlock()

			ts := time.Now().Format("2006-01-02 15:04:05")
			fmt.Fprintf(lf, "[%s] Process exited (code=%d, restarts=%d)\n", ts, w.lastErr, w.exits)
		}

		if lf != os.Stderr {
			lf.Close()
		}

		// Check if we should stop
		select {
		case <-w.stop:
			w.mu.Lock()
			w.state = "stopped"
			w.mu.Unlock()
			return
		default:
		}

		// Reset backoff if process ran for more than 60 seconds
		w.mu.Lock()
		if !w.started.IsZero() && time.Since(w.started) > 60*time.Second {
			backoff = minBackoff
		}
		w.mu.Unlock()

		// Wait with backoff, interruptible by stop signal
		select {
		case <-w.stop:
			w.mu.Lock()
			w.state = "stopped"
			w.mu.Unlock()
			return
		case <-time.After(backoff):
		}

		// Increase backoff for next crash
		backoff *= 2
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
	}
}

func serveAPI() {
	mux := http.NewServeMux()

	mux.HandleFunc("/status", func(w http.ResponseWriter, r *http.Request) {
		statuses := make([]WorkerStatus, len(workers))
		for i, wk := range workers {
			wk.mu.Lock()
			var uptime int64
			if wk.state == "running" && !wk.started.IsZero() {
				uptime = int64(time.Since(wk.started).Seconds())
			}
			statuses[i] = WorkerStatus{
				Name:     wk.def.Name,
				Index:    wk.index,
				PID:      wk.pid,
				State:    wk.state,
				Restarts: wk.exits,
				Uptime:   uptime,
				ExitCode: wk.lastErr,
			}
			wk.mu.Unlock()
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(statuses)
	})

	mux.HandleFunc("/logs/", func(w http.ResponseWriter, r *http.Request) {
		// /logs/{name}?index=0&lines=100
		parts := strings.TrimPrefix(r.URL.Path, "/logs/")
		if parts == "" {
			http.Error(w, "name required", http.StatusBadRequest)
			return
		}

		index := 0
		if v := r.URL.Query().Get("index"); v != "" {
			index, _ = strconv.Atoi(v)
		}
		lines := 100
		if v := r.URL.Query().Get("lines"); v != "" {
			lines, _ = strconv.Atoi(v)
			if lines <= 0 {
				lines = 100
			}
			if lines > 1000 {
				lines = 1000
			}
		}

		logName := fmt.Sprintf("%s-%d.log", parts, index)
		logPath := filepath.Join(logDir, logName)

		data, err := os.ReadFile(logPath)
		if err != nil {
			http.Error(w, "log not found", http.StatusNotFound)
			return
		}

		// Return last N lines
		allLines := strings.Split(string(data), "\n")
		start := len(allLines) - lines
		if start < 0 {
			start = 0
		}
		result := allLines[start:]

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"name":  parts,
			"index": index,
			"lines": result,
		})
	})

	http.ListenAndServe(listenAddr, mux)
}
