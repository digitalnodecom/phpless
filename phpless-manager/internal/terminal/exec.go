package terminal

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"time"

	log "github.com/sirupsen/logrus"
	"golang.org/x/crypto/ssh"
)

// ExecRequest is the JSON body for the /exec endpoint.
type ExecRequest struct {
	VmIP           string `json:"vm_ip"`
	Command        string `json:"command"`
	TimeoutSeconds int    `json:"timeout_seconds,omitempty"` // default 30, max 300
}

// ExecResult is a single NDJSON line in the streaming response.
type ExecResult struct {
	Stream   string `json:"stream"`             // "stdout", "stderr", or "exit"
	Data     string `json:"data,omitempty"`      // output data
	ExitCode int    `json:"exit_code,omitempty"` // only for stream="exit"
}

const (
	defaultExecTimeout = 30
	maxExecTimeout     = 300
	maxOutputBytes     = 1 << 20 // 1 MB per stream
)

// HandleExec returns an http.HandlerFunc that SSHs into a VM,
// runs a command, and streams stdout/stderr as NDJSON.
func HandleExec(signer ssh.Signer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req ExecRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}
		if req.VmIP == "" || req.Command == "" {
			http.Error(w, `{"error":"vm_ip and command are required"}`, http.StatusBadRequest)
			return
		}

		timeout := req.TimeoutSeconds
		if timeout <= 0 {
			timeout = defaultExecTimeout
		}
		if timeout > maxExecTimeout {
			timeout = maxExecTimeout
		}

		logger := log.WithFields(log.Fields{
			"vm_ip":   req.VmIP,
			"command": req.Command,
			"timeout": timeout,
		})

		// SSH into VM with retries
		sshCfg := &ssh.ClientConfig{
			User:            "root",
			Auth:            []ssh.AuthMethod{ssh.PublicKeys(signer)},
			HostKeyCallback: ssh.InsecureIgnoreHostKey(), //nolint:gosec
			Timeout:         3 * time.Second,
		}

		var client *ssh.Client
		var err error
		const maxRetries = 5
		for attempt := 1; attempt <= maxRetries; attempt++ {
			client, err = ssh.Dial("tcp", req.VmIP+":22", sshCfg)
			if err == nil {
				break
			}
			if netErr, ok := err.(*net.OpError); ok && netErr.Op == "dial" {
				if attempt < maxRetries {
					time.Sleep(time.Duration(attempt) * 300 * time.Millisecond)
					continue
				}
			} else {
				break
			}
		}
		if err != nil {
			logger.WithError(err).Error("SSH dial failed for exec")
			http.Error(w, fmt.Sprintf(`{"error":"SSH connection failed: %s"}`, err.Error()), http.StatusBadGateway)
			return
		}
		defer client.Close()

		sess, err := client.NewSession()
		if err != nil {
			logger.WithError(err).Error("SSH session failed for exec")
			http.Error(w, fmt.Sprintf(`{"error":"SSH session failed: %s"}`, err.Error()), http.StatusBadGateway)
			return
		}
		defer sess.Close()

		// Capture stdout and stderr
		var stdoutBuf, stderrBuf bytes.Buffer
		sess.Stdout = &limitedWriter{buf: &stdoutBuf, limit: maxOutputBytes}
		sess.Stderr = &limitedWriter{buf: &stderrBuf, limit: maxOutputBytes}

		// Run command with timeout
		ctx, cancel := context.WithTimeout(r.Context(), time.Duration(timeout)*time.Second)
		defer cancel()

		doneCh := make(chan error, 1)
		go func() {
			doneCh <- sess.Run(req.Command)
		}()

		var runErr error
		select {
		case runErr = <-doneCh:
			// command completed
		case <-ctx.Done():
			sess.Signal(ssh.SIGKILL) //nolint:errcheck
			sess.Close()
			runErr = fmt.Errorf("command timed out after %ds", timeout)
		}

		// Determine exit code
		exitCode := 0
		if runErr != nil {
			if exitErr, ok := runErr.(*ssh.ExitError); ok {
				exitCode = exitErr.ExitStatus()
			} else {
				exitCode = -1
			}
		}

		logger.WithFields(log.Fields{
			"exit_code":   exitCode,
			"stdout_size": stdoutBuf.Len(),
			"stderr_size": stderrBuf.Len(),
		}).Info("Exec completed")

		// Write NDJSON response
		w.Header().Set("Content-Type", "application/x-ndjson")
		w.WriteHeader(http.StatusOK)

		enc := json.NewEncoder(w)
		if stdoutBuf.Len() > 0 {
			enc.Encode(ExecResult{Stream: "stdout", Data: stdoutBuf.String()}) //nolint:errcheck
		}
		if stderrBuf.Len() > 0 {
			enc.Encode(ExecResult{Stream: "stderr", Data: stderrBuf.String()}) //nolint:errcheck
		}
		enc.Encode(ExecResult{Stream: "exit", ExitCode: exitCode}) //nolint:errcheck
	}
}

// limitedWriter wraps a bytes.Buffer and stops writing after limit bytes.
type limitedWriter struct {
	buf     *bytes.Buffer
	limit   int
	written int
}

func (lw *limitedWriter) Write(p []byte) (int, error) {
	remaining := lw.limit - lw.written
	if remaining <= 0 {
		return len(p), nil // silently discard
	}
	if len(p) > remaining {
		p = p[:remaining]
	}
	n, err := lw.buf.Write(p)
	lw.written += n
	return len(p), err // report full write to caller
}
