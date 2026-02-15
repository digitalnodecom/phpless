package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/phpless/phpless-manager/internal/deploy"
	"github.com/phpless/phpless-manager/internal/vm"
	log "github.com/sirupsen/logrus"
)

// Server is the HTTP API server for managing VMs.
type Server struct {
	manager *vm.Manager
}

// NewServer creates a new API server.
func NewServer(manager *vm.Manager) *Server {
	return &Server{manager: manager}
}

// Router returns the chi router with all API routes registered.
func (s *Server) Router() *chi.Mux {
	r := chi.NewRouter()

	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	r.Route("/vms", func(r chi.Router) {
		r.Post("/", s.createVM)
		r.Get("/", s.listVMs)
		r.Get("/{id}", s.getVM)
		r.Delete("/{id}", s.destroyVM)
		r.Post("/{id}/deploy", s.deployCode)
	})

	r.Get("/upstreams/{slug}", s.getUpstream)
	r.Get("/health", s.health)

	return r
}

// --- Request/Response types ---

// CreateVMRequest is the request body for creating a new VM.
type CreateVMRequest struct {
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
}

// DeployRequest is the request body for deploying code.
type DeployRequest struct {
	AppDir     string `json:"app_dir"`
	EnvContent string `json:"env_content,omitempty"`
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

	id := uuid.New().String()[:8]
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

	respondJSON(w, http.StatusCreated, vmToResponse(v))
}

func (s *Server) listVMs(w http.ResponseWriter, r *http.Request) {
	vms := s.manager.List()
	resp := make([]VMResponse, len(vms))
	for i, v := range vms {
		resp[i] = vmToResponse(v)
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

	respondJSON(w, http.StatusOK, vmToResponse(v))
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
		overlayPath := v.Config.OverlayPath("/srv/firecracker/tenants")
		if err := deploy.DeployToOverlay(overlayPath, req.AppDir, req.EnvContent); err != nil {
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
	envContent := req.EnvContent
	newVM, err := s.manager.Redeploy(id, func(rootfsPath string) error {
		return deploy.DeployToRootfs(rootfsPath, appDir, envContent)
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

// --- Helpers ---

func vmToResponse(v *vm.VM) VMResponse {
	return VMResponse{
		ID:        v.Config.ID,
		Slug:      v.Config.Slug,
		State:     string(v.State),
		IP:        v.Config.IP,
		VCPUs:     v.Config.VCPUs,
		MemMiB:    v.Config.MemMiB,
		StartedAt: v.StartedAt,
		Error:     v.Error,
	}
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
