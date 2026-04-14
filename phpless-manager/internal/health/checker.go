package health

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	log "github.com/sirupsen/logrus"
)

// CheckResult represents a single health check result.
type CheckResult struct {
	StatusCode     int       `json:"status_code"`
	ResponseTimeMs int64     `json:"response_time_ms"`
	IsUp           bool      `json:"is_up"`
	CheckedAt      time.Time `json:"checked_at"`
}

// VMHealthConfig holds health check configuration for a VM.
type VMHealthConfig struct {
	Slug     string
	IP       string
	Path     string
	Interval time.Duration
	Enabled  bool
}

// VMHealthStatus is the current health status of a VM.
type VMHealthStatus struct {
	IsUp           bool          `json:"is_up"`
	LastCheck      *CheckResult  `json:"last_check,omitempty"`
	RecentChecks   []CheckResult `json:"recent_checks"`
	UptimePercent  float64       `json:"uptime_percent"`
}

// WebhookPayload is sent to the panel when health state changes.
type WebhookPayload struct {
	Slug           string `json:"slug"`
	IsUp           bool   `json:"is_up"`
	StatusCode     int    `json:"status_code"`
	ResponseTimeMs int64  `json:"response_time_ms"`
}

// ringBuffer is a fixed-size circular buffer for CheckResults.
type ringBuffer struct {
	buf   []CheckResult
	size  int
	pos   int
	count int
}

func newRingBuffer(size int) *ringBuffer {
	return &ringBuffer{
		buf:  make([]CheckResult, size),
		size: size,
	}
}

func (rb *ringBuffer) push(r CheckResult) {
	rb.buf[rb.pos] = r
	rb.pos = (rb.pos + 1) % rb.size
	if rb.count < rb.size {
		rb.count++
	}
}

func (rb *ringBuffer) all() []CheckResult {
	if rb.count == 0 {
		return nil
	}
	results := make([]CheckResult, rb.count)
	start := rb.pos - rb.count
	if start < 0 {
		start += rb.size
	}
	for i := 0; i < rb.count; i++ {
		results[i] = rb.buf[(start+i)%rb.size]
	}
	return results
}

func (rb *ringBuffer) last() *CheckResult {
	if rb.count == 0 {
		return nil
	}
	idx := rb.pos - 1
	if idx < 0 {
		idx = rb.size - 1
	}
	r := rb.buf[idx]
	return &r
}

// vmState tracks per-VM health state.
type vmState struct {
	config  VMHealthConfig
	history *ringBuffer
	wasUp   *bool // nil = unknown
	stopCh  chan struct{}
}

// Checker runs periodic health checks for registered VMs.
type Checker struct {
	mu         sync.RWMutex
	vms        map[string]*vmState // keyed by slug
	webhookURL string
	authSecret string
	httpClient *http.Client
}

// NewChecker creates a new health checker.
func NewChecker(webhookURL, authSecret string) *Checker {
	return &Checker{
		vms:        make(map[string]*vmState),
		webhookURL: webhookURL,
		authSecret: authSecret,
		httpClient: &http.Client{Timeout: 5 * time.Second},
	}
}

// Register adds or updates a VM's health check configuration.
// If the VM is already registered, it is stopped and re-registered.
func (c *Checker) Register(cfg VMHealthConfig) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Stop existing checker if any
	if existing, ok := c.vms[cfg.Slug]; ok {
		close(existing.stopCh)
	}

	if !cfg.Enabled {
		delete(c.vms, cfg.Slug)
		return
	}

	state := &vmState{
		config:  cfg,
		history: newRingBuffer(100),
		stopCh:  make(chan struct{}),
	}
	c.vms[cfg.Slug] = state

	go c.runLoop(state)
}

// Unregister removes a VM from health checking.
func (c *Checker) Unregister(slug string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if state, ok := c.vms[slug]; ok {
		close(state.stopCh)
		delete(c.vms, slug)
	}
}

// Status returns the current health status for a VM.
func (c *Checker) Status(slug string) (*VMHealthStatus, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	state, ok := c.vms[slug]
	if !ok {
		return nil, false
	}

	checks := state.history.all()
	upCount := 0
	for _, ch := range checks {
		if ch.IsUp {
			upCount++
		}
	}

	var uptimePct float64
	if len(checks) > 0 {
		uptimePct = float64(upCount) / float64(len(checks)) * 100
	}

	isUp := false
	if state.wasUp != nil {
		isUp = *state.wasUp
	}

	return &VMHealthStatus{
		IsUp:          isUp,
		LastCheck:     state.history.last(),
		RecentChecks:  checks,
		UptimePercent: uptimePct,
	}, true
}

func (c *Checker) runLoop(state *vmState) {
	cfg := state.config
	interval := cfg.Interval
	if interval < 10*time.Second {
		interval = 30 * time.Second
	}

	logger := log.WithField("slug", cfg.Slug)
	logger.WithField("interval", interval).Info("Health checker started")

	// Run first check immediately
	c.doCheck(state)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-state.stopCh:
			logger.Info("Health checker stopped")
			return
		case <-ticker.C:
			c.doCheck(state)
		}
	}
}

func (c *Checker) doCheck(state *vmState) {
	cfg := state.config
	url := fmt.Sprintf("http://%s:8080%s", cfg.IP, cfg.Path)

	start := time.Now()
	resp, err := c.httpClient.Get(url)
	elapsed := time.Since(start).Milliseconds()

	result := CheckResult{
		ResponseTimeMs: elapsed,
		CheckedAt:      time.Now(),
	}

	if err != nil {
		result.StatusCode = 0
		result.IsUp = false
	} else {
		result.StatusCode = resp.StatusCode
		result.IsUp = resp.StatusCode >= 200 && resp.StatusCode < 300
		resp.Body.Close()
	}

	c.mu.Lock()
	state.history.push(result)

	// Detect state transition
	previousUp := state.wasUp
	state.wasUp = &result.IsUp
	c.mu.Unlock()

	// If state changed, fire webhook
	if previousUp != nil && *previousUp != result.IsUp {
		log.WithFields(log.Fields{
			"slug":  cfg.Slug,
			"is_up": result.IsUp,
			"code":  result.StatusCode,
		}).Info("Health state changed")

		go c.fireWebhook(WebhookPayload{
			Slug:           cfg.Slug,
			IsUp:           result.IsUp,
			StatusCode:     result.StatusCode,
			ResponseTimeMs: elapsed,
		})
	}
}

func (c *Checker) fireWebhook(payload WebhookPayload) {
	if c.webhookURL == "" {
		return
	}

	body, err := json.Marshal(payload)
	if err != nil {
		log.WithError(err).Error("Failed to marshal health webhook payload")
		return
	}

	req, err := http.NewRequest("POST", c.webhookURL, nil)
	if err != nil {
		log.WithError(err).Error("Failed to create health webhook request")
		return
	}

	req.Header.Set("Content-Type", "application/json")
	if c.authSecret != "" {
		req.Header.Set("X-Manager-Secret", c.authSecret)
	}
	req.Body = http.NoBody
	// Re-create with body
	req, _ = http.NewRequest("POST", c.webhookURL, jsonReader(body))
	req.Header.Set("Content-Type", "application/json")
	if c.authSecret != "" {
		req.Header.Set("X-Manager-Secret", c.authSecret)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.WithError(err).Error("Failed to send health webhook")
		return
	}
	resp.Body.Close()

	if resp.StatusCode >= 400 {
		log.WithField("status", resp.StatusCode).Warn("Health webhook returned error")
	}
}

func jsonReader(data []byte) *bytesReader {
	return &bytesReader{data: data}
}

type bytesReader struct {
	data []byte
	pos  int
}

func (r *bytesReader) Read(p []byte) (n int, err error) {
	if r.pos >= len(r.data) {
		return 0, fmt.Errorf("EOF")
	}
	n = copy(p, r.data[r.pos:])
	r.pos += n
	return n, nil
}

func (r *bytesReader) Close() error { return nil }
