package terminal

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

// Session holds the VM IP and expiry for a pending terminal connection.
type Session struct {
	VmIP      string
	ExpiresAt time.Time
}

// Store is a thread-safe, TTL-based session store.
type Store struct {
	mu       sync.Mutex
	sessions map[string]*Session
}

// NewStore returns an initialised Store.
func NewStore() *Store {
	return &Store{
		sessions: make(map[string]*Session),
	}
}

// Create stores a new session and returns its UUID.
func (s *Store) Create(vmIP string, ttl time.Duration) string {
	id := uuid.New().String()
	s.mu.Lock()
	s.sessions[id] = &Session{
		VmIP:      vmIP,
		ExpiresAt: time.Now().Add(ttl),
	}
	s.mu.Unlock()
	return id
}

// Take validates, consumes (one-use), and returns the VM IP for the given session ID.
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
	return sess.VmIP, true
}
