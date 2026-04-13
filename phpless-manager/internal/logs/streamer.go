package logs

import (
	"bufio"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	log "github.com/sirupsen/logrus"
)

// AllowedOrigins controls which origins may connect to the log WebSocket.
var allowedOrigins []string

// SetAllowedOrigins configures the list of allowed WebSocket origins.
func SetAllowedOrigins(origins []string) {
	allowedOrigins = origins
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		if len(allowedOrigins) == 0 {
			return true
		}
		origin := r.Header.Get("Origin")
		for _, allowed := range allowedOrigins {
			if origin == allowed {
				return true
			}
		}
		return false
	},
}

// Session holds the app slug and expiry for a pending log stream connection.
type Session struct {
	Slug      string
	ExpiresAt time.Time
}

// Store is a thread-safe, TTL-based session store for log streams.
type Store struct {
	mu       sync.Mutex
	sessions map[string]*Session
}

// NewStore returns an initialised log stream session Store.
func NewStore() *Store {
	return &Store{
		sessions: make(map[string]*Session),
	}
}

// Create stores a new log stream session and returns its UUID.
func (s *Store) Create(slug string, ttl time.Duration) string {
	id := uuid.New().String()
	s.mu.Lock()
	s.sessions[id] = &Session{
		Slug:      slug,
		ExpiresAt: time.Now().Add(ttl),
	}
	s.mu.Unlock()
	return id
}

// Take validates, consumes (one-use), and returns the slug for the given session ID.
func (s *Store) Take(id string) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	sess, ok := s.sessions[id]
	if !ok {
		return "", false
	}
	delete(s.sessions, id)

	if time.Now().After(sess.ExpiresAt) {
		return "", false
	}
	return sess.Slug, true
}

// HandleLogStream returns an http.HandlerFunc that upgrades to a WebSocket
// and streams new lines from the app's Caddy access log file in real time.
//
// The session ID is taken from the URL path (chi param). The session must have
// been created via the manager API first.
func HandleLogStream(store *Store, logDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sessionID := chi.URLParam(r, "sessionID")

		slug, ok := store.Take(sessionID)
		if !ok {
			http.Error(w, "session not found or expired", http.StatusForbidden)
			return
		}

		// Sanitize slug to prevent path traversal
		slug = filepath.Base(slug)
		logPath := filepath.Join(logDir, slug+".log")

		logger := log.WithFields(log.Fields{
			"session":  sessionID,
			"slug":     slug,
			"log_path": logPath,
		})

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			logger.WithError(err).Error("WebSocket upgrade failed")
			return
		}
		defer conn.Close()

		logger.Info("Log stream started")

		// Read and discard WebSocket messages (required by gorilla/websocket to
		// detect close frames).
		closeCh := make(chan struct{})
		go func() {
			defer close(closeCh)
			for {
				if _, _, err := conn.ReadMessage(); err != nil {
					return
				}
			}
		}()

		tailLog(conn, logPath, closeCh, logger)

		logger.Info("Log stream ended")
	}
}

// tailLog opens the log file, seeks to the end, and sends new lines over the
// WebSocket connection until closeCh is closed.
func tailLog(conn *websocket.Conn, logPath string, closeCh <-chan struct{}, logger *log.Entry) {
	const pollInterval = 250 * time.Millisecond

	f, err := os.Open(logPath)
	if err != nil {
		if !os.IsNotExist(err) {
			logger.WithError(err).Error("Failed to open log file")
			conn.WriteMessage(websocket.TextMessage, []byte(`{"error":"failed to open log file"}`)) //nolint:errcheck
			return
		}
		// Wait for file to appear
		for {
			select {
			case <-closeCh:
				return
			case <-time.After(pollInterval):
			}
			f, err = os.Open(logPath)
			if err == nil {
				break
			}
		}
	}
	defer f.Close()

	// Seek to end — only stream new lines
	if _, err := f.Seek(0, 2); err != nil {
		logger.WithError(err).Error("Failed to seek log file")
		return
	}

	scanner := bufio.NewScanner(f)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)

	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-closeCh:
			return
		case <-ticker.C:
			// Check for file rotation/truncation
			newInfo, statErr := os.Stat(logPath)
			if statErr == nil {
				curPos, _ := f.Seek(0, 1)
				if newInfo.Size() < curPos {
					f.Close()
					f, err = os.Open(logPath)
					if err != nil {
						continue
					}
					scanner = bufio.NewScanner(f)
					scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
				}
			}

			for scanner.Scan() {
				line := scanner.Text()
				if line == "" {
					continue
				}
				if err := conn.WriteMessage(websocket.TextMessage, []byte(line)); err != nil {
					return
				}
			}
		}
	}
}
