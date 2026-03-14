package terminal

import (
	"encoding/json"
	"net"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
	log "github.com/sirupsen/logrus"
	"golang.org/x/crypto/ssh"
)

var upgrader = websocket.Upgrader{
	// Allow all origins — the manager TCP port is only reachable via Caddy reverse-proxy
	CheckOrigin: func(r *http.Request) bool { return true },
}

type resizeMsg struct {
	Type string `json:"type"`
	Cols int    `json:"cols"`
	Rows int    `json:"rows"`
}

// HandleTerminal returns an http.HandlerFunc that upgrades the connection to a
// WebSocket, looks up the session, SSHs into the VM, and proxies PTY I/O.
func HandleTerminal(store *Store, signer ssh.Signer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sessionID := chi.URLParam(r, "sessionID")

		vmIP, ok := store.Take(sessionID)
		if !ok {
			http.Error(w, "session not found or expired", http.StatusForbidden)
			return
		}

		logger := log.WithFields(log.Fields{
			"session": sessionID,
			"vm_ip":   vmIP,
		})

		// Upgrade to WebSocket
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			logger.WithError(err).Error("WebSocket upgrade failed")
			return
		}
		defer conn.Close()

		// Dial SSH into the VM with retries (VM may still be booting)
		sshCfg := &ssh.ClientConfig{
			User: "root",
			Auth: []ssh.AuthMethod{ssh.PublicKeys(signer)},
			// VMs are ephemeral and we control the key injection
			HostKeyCallback: ssh.InsecureIgnoreHostKey(), //nolint:gosec
			Timeout:         3 * time.Second,
		}

		var client *ssh.Client
		const maxRetries = 10
		for attempt := 1; attempt <= maxRetries; attempt++ {
			client, err = ssh.Dial("tcp", vmIP+":22", sshCfg)
			if err == nil {
				break
			}
			// Only retry on connection refused (VM still booting)
			if netErr, ok := err.(*net.OpError); ok && netErr.Op == "dial" {
				if attempt < maxRetries {
					conn.WriteMessage(websocket.TextMessage, []byte("\x1b[33mWaiting for VM to boot...\x1b[0m\r\n")) //nolint:errcheck
					time.Sleep(time.Duration(attempt) * 500 * time.Millisecond)
					continue
				}
			} else {
				break // non-retryable error
			}
		}
		if err != nil {
			logger.WithError(err).Error("SSH dial failed")
			conn.WriteMessage(websocket.TextMessage, []byte("\r\n\x1b[31mSSH connection failed: "+err.Error()+"\x1b[0m\r\n")) //nolint:errcheck
			return
		}
		defer client.Close()

		// Open SSH session with PTY
		sess, err := client.NewSession()
		if err != nil {
			logger.WithError(err).Error("SSH session failed")
			conn.WriteMessage(websocket.TextMessage, []byte("\r\n\x1b[31mSSH session failed: "+err.Error()+"\x1b[0m\r\n")) //nolint:errcheck
			return
		}
		defer sess.Close()

		modes := ssh.TerminalModes{
			ssh.ECHO:          1,
			ssh.TTY_OP_ISPEED: 14400,
			ssh.TTY_OP_OSPEED: 14400,
		}
		if err := sess.RequestPty("xterm-256color", 24, 80, modes); err != nil {
			logger.WithError(err).Error("PTY request failed")
			conn.WriteMessage(websocket.TextMessage, []byte("\r\n\x1b[31mPTY request failed: "+err.Error()+"\x1b[0m\r\n")) //nolint:errcheck
			return
		}

		stdin, err := sess.StdinPipe()
		if err != nil {
			logger.WithError(err).Error("stdin pipe failed")
			return
		}
		stdout, err := sess.StdoutPipe()
		if err != nil {
			logger.WithError(err).Error("stdout pipe failed")
			return
		}
		stderr, err := sess.StderrPipe()
		if err != nil {
			logger.WithError(err).Error("stderr pipe failed")
			return
		}

		if err := sess.Shell(); err != nil {
			logger.WithError(err).Error("shell start failed")
			conn.WriteMessage(websocket.TextMessage, []byte("\r\n\x1b[31mShell start failed: "+err.Error()+"\x1b[0m\r\n")) //nolint:errcheck
			return
		}

		logger.Info("Terminal session started")
		done := make(chan struct{}, 2)

		// SSH stdout → WebSocket (binary frames)
		go func() {
			defer func() { done <- struct{}{} }()
			buf := make([]byte, 32*1024)
			for {
				n, err := stdout.Read(buf)
				if n > 0 {
					if err2 := conn.WriteMessage(websocket.BinaryMessage, buf[:n]); err2 != nil {
						return
					}
				}
				if err != nil {
					return
				}
			}
		}()

		// SSH stderr → WebSocket (binary frames)
		go func() {
			buf := make([]byte, 4096)
			for {
				n, err := stderr.Read(buf)
				if n > 0 {
					conn.WriteMessage(websocket.BinaryMessage, buf[:n]) //nolint:errcheck
				}
				if err != nil {
					return
				}
			}
		}()

		// WebSocket → SSH stdin (binary frames) or resize (text JSON frames)
		go func() {
			defer func() { done <- struct{}{} }()
			for {
				msgType, msg, err := conn.ReadMessage()
				if err != nil {
					return
				}
				if msgType == websocket.TextMessage {
					// Try to parse as resize message
					var resize resizeMsg
					if json.Unmarshal(msg, &resize) == nil && resize.Type == "resize" {
						sess.WindowChange(resize.Rows, resize.Cols) //nolint:errcheck
						continue
					}
					// Plain text input
					stdin.Write(msg) //nolint:errcheck
				} else if msgType == websocket.BinaryMessage {
					stdin.Write(msg) //nolint:errcheck
				}
			}
		}()

		// Wait for either the SSH output goroutine or the WS read goroutine to finish
		<-done
		sess.Close()
		client.Close()
		conn.Close()
		<-done

		logger.Info("Terminal session ended")
	}
}
