package api

import (
	"bufio"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/phpless/phpless-manager/internal/deploy"
	"github.com/phpless/phpless-manager/internal/network"
	"github.com/phpless/phpless-manager/internal/terminal"
	"github.com/phpless/phpless-manager/internal/vm"
	log "github.com/sirupsen/logrus"
	"golang.org/x/crypto/ssh"
)

// Server is the HTTP API server for managing VMs.
type Server struct {
	manager      *vm.Manager
	termSessions *terminal.Store
	sshSigner    ssh.Signer
	portFwd      *network.PortForwarder
}

// NewServer creates a new API server.
func NewServer(manager *vm.Manager, termSessions *terminal.Store, sshSigner ssh.Signer, portFwd *network.PortForwarder) *Server {
	return &Server{manager: manager, termSessions: termSessions, sshSigner: sshSigner, portFwd: portFwd}
}

// Router returns the chi router with all API routes registered.
func (s *Server) Router() *chi.Mux {
	r := chi.NewRouter()

	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// Most routes use a 30s timeout
	r.Group(func(r chi.Router) {
		r.Use(middleware.Timeout(30 * time.Second))

		r.Route("/vms", func(r chi.Router) {
			r.Post("/", s.createVM)
			r.Get("/", s.listVMs)
			r.Get("/{id}", s.getVM)
			r.Delete("/{id}", s.destroyVM)
			r.Post("/{id}/deploy", s.deployCode)
			r.Get("/{id}/logs", s.getVMLogs)
		})

		r.Get("/upstreams/{slug}", s.getUpstream)
		r.Get("/health", s.health)
		r.Post("/terminal-sessions", s.createTerminalSession)
		r.Get("/workers/status", s.proxyWorkerStatus)
		r.Get("/workers/logs/*", s.proxyWorkerLogs)
		r.Post("/port-mappings", s.applyPortMappings)
		r.Delete("/port-mappings", s.removePortMappings)
	})

	// Exec has its own timeout (up to 5 min)
	r.Group(func(r chi.Router) {
		r.Use(middleware.Timeout(5 * time.Minute))
		r.Post("/exec", s.execCommand)
	})

	return r
}

// --- Request/Response types ---

// CreateVMRequest is the request body for creating a new VM.
type CreateVMRequest struct {
	ID     string `json:"id,omitempty"`
	Slug   string `json:"slug"`
	VCPUs  int    `json:"vcpus,omitempty"`
	MemMiB int    `json:"mem_mib,omitempty"`
}

// VMResponse is the API response for a VM.
type VMResponse struct {
	ID        string    `json:"id"`
	Slug      string    `json:"slug"`
	State     string    `json:"state"`
	IP        string    `json:"ip"`
	VCPUs     int       `json:"vcpus"`
	MemMiB    int       `json:"mem_mib"`
	StartedAt time.Time `json:"started_at,omitempty"`
	Error     string    `json:"error,omitempty"`
	DiskUsed  int64     `json:"disk_used"`  // bytes used inside the rootfs ext4
	DiskTotal int64     `json:"disk_total"` // total bytes of the rootfs ext4
	MemUsed   int64     `json:"mem_used"`   // RSS of the Firecracker process in bytes
	CPUPct    float64   `json:"cpu_pct"`    // CPU usage percentage (0-100 per vCPU)
}

// DeployRequest is the request body for deploying code.
type DeployRequest struct {
	AppDir           string   `json:"app_dir"`
	PersistentPaths  []string `json:"persistent_paths,omitempty"`
	EnvContent       string   `json:"env_content,omitempty"`
	CaddyfileContent string   `json:"caddyfile_content,omitempty"`
	WorkersConfig    string   `json:"workers_config,omitempty"` // JSON array of worker definitions
}

// UpstreamResponse is returned for Caddy routing queries.
type UpstreamResponse struct {
	Slug    string `json:"slug"`
	Address string `json:"address"`
}

// --- Handlers ---

func (s *Server) createVM(w http.ResponseWriter, r *http.Request) {
	var req CreateVMRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, http.StatusBadRequest, "invalid request body: %v", err)
		return
	}

	if req.Slug == "" {
		httpError(w, http.StatusBadRequest, "slug is required")
		return
	}

	// Check for duplicate slug
	if _, err := s.manager.GetBySlug(req.Slug); err == nil {
		httpError(w, http.StatusConflict, "slug %q already exists", req.Slug)
		return
	}

	id := req.ID
	if id == "" {
		id = uuid.New().String()[:8]
	}
	cfg := vm.DefaultVMConfig(id, req.Slug)

	if req.VCPUs > 0 {
		cfg.VCPUs = req.VCPUs
	}
	if req.MemMiB > 0 {
		cfg.MemMiB = req.MemMiB
	}

	v, err := s.manager.Create(cfg)
	if err != nil {
		log.WithError(err).Error("Failed to create VM")
		httpError(w, http.StatusInternalServerError, "failed to create VM: %v", err)
		return
	}

	respondJSON(w, http.StatusCreated, s.vmToResponse(v))
}

func (s *Server) listVMs(w http.ResponseWriter, r *http.Request) {
	vms := s.manager.List()
	resp := make([]VMResponse, len(vms))
	for i, v := range vms {
		resp[i] = s.vmToResponse(v)
	}
	respondJSON(w, http.StatusOK, resp)
}

func (s *Server) getVM(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	v, err := s.manager.Get(id)
	if err != nil {
		httpError(w, http.StatusNotFound, "VM not found: %s", id)
		return
	}

	respondJSON(w, http.StatusOK, s.vmToResponse(v))
}

func (s *Server) destroyVM(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	if err := s.manager.Destroy(id); err != nil {
		httpError(w, http.StatusNotFound, "failed to destroy VM: %v", err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) deployCode(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req DeployRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, http.StatusBadRequest, "invalid request body: %v", err)
		return
	}

	if req.AppDir == "" {
		httpError(w, http.StatusBadRequest, "app_dir is required")
		return
	}

	v, err := s.manager.Get(id)
	if err != nil {
		httpError(w, http.StatusNotFound, "VM not found: %s", id)
		return
	}

	if v.Config.Overlay {
		overlayPath := v.Config.OverlayPath(s.manager.TenantDir())
		if err := deploy.DeployToOverlay(overlayPath, req.AppDir, req.PersistentPaths, req.EnvContent, req.CaddyfileContent, req.WorkersConfig); err != nil {
			httpError(w, http.StatusInternalServerError, "deploy failed: %v", err)
			return
		}
		respondJSON(w, http.StatusOK, map[string]string{
			"status":  "deployed",
			"vm_id":   id,
			"app_dir": req.AppDir,
		})
		return
	}

	// Non-overlay: stop VM, deploy to rootfs, restart
	appDir := req.AppDir
	persistentPaths := req.PersistentPaths
	envContent := req.EnvContent
	caddyfileContent := req.CaddyfileContent
	workersConfig := req.WorkersConfig
	newVM, err := s.manager.Redeploy(id, func(rootfsPath string) error {
		return deploy.DeployToRootfs(rootfsPath, appDir, persistentPaths, envContent, caddyfileContent, workersConfig)
	})
	if err != nil {
		httpError(w, http.StatusInternalServerError, "deploy failed: %v", err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"status":  "deployed",
		"vm_id":   newVM.Config.ID,
		"app_dir": req.AppDir,
	})
}

func (s *Server) getUpstream(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

	v, err := s.manager.GetBySlug(slug)
	if err != nil {
		httpError(w, http.StatusNotFound, "no VM for slug: %s", slug)
		return
	}

	if v.State != vm.StateRunning {
		httpError(w, http.StatusServiceUnavailable, "VM is not running (state: %s)", v.State)
		return
	}

	respondJSON(w, http.StatusOK, UpstreamResponse{
		Slug:    slug,
		Address: fmt.Sprintf("%s:8080", v.Config.IP),
	})
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	vms := s.manager.List()
	running := 0
	for _, v := range vms {
		if v.State == vm.StateRunning {
			running++
		}
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"status":      "ok",
		"total_vms":   len(vms),
		"running_vms": running,
	})
}

func (s *Server) getVMLogs(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	v, err := s.manager.Get(id)
	if err != nil {
		httpError(w, http.StatusNotFound, "VM not found: %s", id)
		return
	}

	if v.LogPath == "" {
		respondJSON(w, http.StatusOK, map[string]any{"lines": []string{}})
		return
	}

	f, err := os.Open(v.LogPath)
	if err != nil {
		respondJSON(w, http.StatusOK, map[string]any{"lines": []string{}})
		return
	}
	defer f.Close()

	// Read all lines into a ring buffer (last 200 lines)
	const maxLines = 200
	var all []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		all = append(all, scanner.Text())
	}
	if len(all) > maxLines {
		all = all[len(all)-maxLines:]
	}

	respondJSON(w, http.StatusOK, map[string]any{"lines": all})
}

func (s *Server) createTerminalSession(w http.ResponseWriter, r *http.Request) {
	var req struct {
		VmIP string `json:"vm_ip"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.VmIP == "" {
		httpError(w, http.StatusBadRequest, "vm_ip is required")
		return
	}

	sessionID := s.termSessions.Create(req.VmIP, 60*time.Second)
	respondJSON(w, http.StatusOK, map[string]string{"session_id": sessionID})
}

// applyPortMappings sets up iptables DNAT rules for a VM.
func (s *Server) applyPortMappings(w http.ResponseWriter, r *http.Request) {
	var req struct {
		VMIP     string                `json:"vm_ip"`
		Mappings []network.PortMapping `json:"mappings"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.VMIP == "" {
		httpError(w, http.StatusBadRequest, "vm_ip and mappings required")
		return
	}

	if err := s.portFwd.Apply(req.VMIP, req.Mappings); err != nil {
		httpError(w, http.StatusInternalServerError, "failed to apply port mappings: %v", err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "applied"})
}

// removePortMappings removes all iptables rules for a VM.
func (s *Server) removePortMappings(w http.ResponseWriter, r *http.Request) {
	var req struct {
		VMIP string `json:"vm_ip"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.VMIP == "" {
		httpError(w, http.StatusBadRequest, "vm_ip required")
		return
	}

	s.portFwd.Remove(req.VMIP)
	w.WriteHeader(http.StatusNoContent)
}

// proxyWorkerStatus proxies a status request to the worker manager inside a VM.
func (s *Server) proxyWorkerStatus(w http.ResponseWriter, r *http.Request) {
	vmIP := r.URL.Query().Get("vm_ip")
	if vmIP == "" {
		httpError(w, http.StatusBadRequest, "vm_ip is required")
		return
	}

	resp, err := http.Get(fmt.Sprintf("http://%s:9111/status", vmIP))
	if err != nil {
		respondJSON(w, http.StatusOK, []any{}) // return empty if worker manager not running
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	body, _ := io.ReadAll(resp.Body)
	w.Write(body)
}

// proxyWorkerLogs proxies a log request to the worker manager inside a VM.
func (s *Server) proxyWorkerLogs(w http.ResponseWriter, r *http.Request) {
	vmIP := r.URL.Query().Get("vm_ip")
	if vmIP == "" {
		httpError(w, http.StatusBadRequest, "vm_ip is required")
		return
	}

	// Forward the rest of the path after /workers/logs/
	path := strings.TrimPrefix(r.URL.Path, "/workers/logs")
	url := fmt.Sprintf("http://%s:9111/logs%s?%s", vmIP, path, r.URL.RawQuery)

	resp, err := http.Get(url)
	if err != nil {
		respondJSON(w, http.StatusOK, map[string]any{"lines": []string{}})
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	body, _ := io.ReadAll(resp.Body)
	w.Write(body)
}

func (s *Server) execCommand(w http.ResponseWriter, r *http.Request) {
	if s.sshSigner == nil {
		httpError(w, http.StatusServiceUnavailable, "SSH not configured")
		return
	}
	// Increase timeout for this handler — exec can run up to 5 min
	terminal.HandleExec(s.sshSigner).ServeHTTP(w, r)
}

// --- Helpers ---

func (s *Server) vmToResponse(v *vm.VM) VMResponse {
	used, total := ext4DiskUsage(v.Config.RootfsPath(s.manager.TenantDir()))
	memUsed := procRSS(v.PID)
	cpuPct := procCPU(v.PID, v.StartedAt)

	return VMResponse{
		ID:        v.Config.ID,
		Slug:      v.Config.Slug,
		State:     string(v.State),
		IP:        v.Config.IP,
		VCPUs:     v.Config.VCPUs,
		MemMiB:    v.Config.MemMiB,
		StartedAt: v.StartedAt,
		Error:     v.Error,
		DiskUsed:  used,
		DiskTotal: total,
		MemUsed:   memUsed,
		CPUPct:    cpuPct,
	}
}

// procRSS reads the resident set size (in bytes) of a process from /proc/<pid>/status.
func procRSS(pid int) int64 {
	if pid <= 0 {
		return 0
	}
	data, err := os.ReadFile(fmt.Sprintf("/proc/%d/status", pid))
	if err != nil {
		return 0
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, "VmRSS:") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				kb, err := strconv.ParseInt(fields[1], 10, 64)
				if err == nil {
					return kb * 1024 // convert kB to bytes
				}
			}
		}
	}
	return 0
}

// procCPU computes the CPU usage percentage of a process based on total CPU time
// consumed since it started. Returns 0-100 * number_of_cpus.
func procCPU(pid int, startedAt time.Time) float64 {
	if pid <= 0 || startedAt.IsZero() {
		return 0
	}
	data, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid))
	if err != nil {
		return 0
	}
	// /proc/<pid>/stat fields are space-separated, but comm (field 2) can contain spaces
	// and is wrapped in parentheses. Find the closing paren and parse from there.
	closeParen := strings.LastIndex(string(data), ")")
	if closeParen < 0 || closeParen+2 >= len(data) {
		return 0
	}
	fields := strings.Fields(string(data)[closeParen+2:])
	// fields[0]=state, [1]=ppid, ..., [11]=utime, [12]=stime (0-indexed from after comm)
	if len(fields) < 13 {
		return 0
	}
	utime, err1 := strconv.ParseInt(fields[11], 10, 64)
	stime, err2 := strconv.ParseInt(fields[12], 10, 64)
	if err1 != nil || err2 != nil {
		return 0
	}
	totalTicks := utime + stime
	// Convert ticks to seconds (Linux typically uses 100 Hz = CLK_TCK)
	cpuSeconds := float64(totalTicks) / 100.0
	elapsed := time.Since(startedAt).Seconds()
	if elapsed <= 0 {
		return 0
	}
	pct := (cpuSeconds / elapsed) * 100.0
	// Round to 1 decimal
	return float64(int(pct*10)) / 10.0
}

// ext4DiskUsage reads the ext4 superblock to compute used/total bytes
// without mounting the filesystem. Safe to call while the VM is running.
func ext4DiskUsage(rootfsPath string) (used, total int64) {
	f, err := os.Open(rootfsPath)
	if err != nil {
		return 0, 0
	}
	defer f.Close()

	// ext4 superblock sits at byte offset 1024.
	// Fields (all little-endian uint32):
	//   +4  s_blocks_count_lo  — total block count
	//   +12 s_free_blocks_count_lo — free block count
	//   +24 s_log_block_size   — block_size = 1024 << value
	buf := make([]byte, 28)
	if _, err := f.ReadAt(buf, 1024); err != nil {
		return 0, 0
	}

	blockCount := int64(binary.LittleEndian.Uint32(buf[4:8]))
	freeBlocks := int64(binary.LittleEndian.Uint32(buf[12:16]))
	logBlockSize := int64(binary.LittleEndian.Uint32(buf[24:28]))
	blockSize := int64(1024) << logBlockSize

	total = blockCount * blockSize
	used = (blockCount - freeBlocks) * blockSize
	return
}

func respondJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func httpError(w http.ResponseWriter, status int, format string, args ...any) {
	respondJSON(w, status, map[string]string{
		"error": fmt.Sprintf(format, args...),
	})
}
