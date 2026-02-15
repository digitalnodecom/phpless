package vm

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"sync"
	"time"

	firecracker "github.com/firecracker-microvm/firecracker-go-sdk"
	"github.com/firecracker-microvm/firecracker-go-sdk/client/models"
	"github.com/phpless/phpless-manager/internal/network"
	log "github.com/sirupsen/logrus"
)

// VMState represents the current state of a microVM.
type VMState string

const (
	StateStarting VMState = "starting"
	StateRunning  VMState = "running"
	StateStopping VMState = "stopping"
	StateStopped  VMState = "stopped"
	StateError    VMState = "error"
)

// VM represents a running Firecracker microVM instance.
type VM struct {
	Config    VMConfig
	State     VMState
	StartedAt time.Time
	PID       int
	Error     string

	machine *firecracker.Machine
	cancel  context.CancelFunc
	tap     *network.TAPDevice
}

// Manager handles the lifecycle of multiple Firecracker microVMs.
type Manager struct {
	config ManagerConfig
	bridge *network.Bridge
	vms    map[string]*VM
	mu     sync.RWMutex
}

// NewManager creates a new VM manager.
func NewManager(config ManagerConfig, bridge *network.Bridge) (*Manager, error) {
	// Ensure directories exist
	for _, dir := range []string{config.TenantDir, config.SocketDir} {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, fmt.Errorf("create directory %s: %w", dir, err)
		}
	}

	return &Manager{
		config: config,
		bridge: bridge,
		vms:    make(map[string]*VM),
	}, nil
}

// Create creates and starts a new microVM.
func (m *Manager) Create(cfg VMConfig) (*VM, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.vms[cfg.ID]; exists {
		return nil, fmt.Errorf("VM %s already exists", cfg.ID)
	}

	logger := log.WithFields(log.Fields{
		"vm_id": cfg.ID,
		"slug":  cfg.Slug,
	})

	// Allocate network
	ip, gateway, mac, err := m.bridge.AllocateAddress()
	if err != nil {
		return nil, fmt.Errorf("allocate address: %w", err)
	}
	cfg.IP = ip
	cfg.GatewayIP = gateway
	cfg.MAC = mac

	logger.WithFields(log.Fields{
		"ip":      ip,
		"gateway": gateway,
	}).Info("Network allocated")

	// Create TAP device
	tap, err := network.CreateTAP(cfg.ID, m.bridge.Name())
	if err != nil {
		return nil, fmt.Errorf("create TAP: %w", err)
	}

	// Prepare rootfs
	rootfsPath, err := m.prepareRootfs(cfg)
	if err != nil {
		tap.Destroy()
		return nil, fmt.Errorf("prepare rootfs: %w", err)
	}

	// Build Firecracker machine config
	socketPath := cfg.SocketPath(m.config.SocketDir)
	os.Remove(socketPath) // Clean up stale socket

	drives := []models.Drive{}
	if cfg.Overlay {
		// SquashFS base (read-only) + ext4 overlay
		trueVal := true
		falseVal := false
		baseID := "rootfs"
		overlayID := "overlay"
		drives = append(drives,
			models.Drive{
				DriveID:      &baseID,
				PathOnHost:   &m.config.BaseSqfsPath,
				IsRootDevice: &trueVal,
				IsReadOnly:   &trueVal,
			},
			models.Drive{
				DriveID:      &overlayID,
				PathOnHost:   firecracker.String(cfg.OverlayPath(m.config.TenantDir)),
				IsRootDevice: &falseVal,
				IsReadOnly:   &falseVal,
			},
		)
	} else {
		// Single ext4 rootfs copy
		trueVal := true
		falseVal := false
		driveID := "rootfs"
		drives = append(drives, models.Drive{
			DriveID:      &driveID,
			PathOnHost:   &rootfsPath,
			IsRootDevice: &trueVal,
			IsReadOnly:   &falseVal,
		})
	}

	vcpuCount := int64(cfg.VCPUs)
	memSize := int64(cfg.MemMiB)

	fcConfig := firecracker.Config{
		SocketPath:      socketPath,
		KernelImagePath: m.config.KernelPath,
		KernelArgs:      cfg.BootArgs(),
		Drives:          drives,
		MachineCfg: models.MachineConfiguration{
			VcpuCount:  &vcpuCount,
			MemSizeMib: &memSize,
		},
		NetworkInterfaces: []firecracker.NetworkInterface{
			{
				StaticConfiguration: &firecracker.StaticNetworkConfiguration{
					MacAddress:  cfg.MAC,
					HostDevName: tap.Name(),
				},
			},
		},
	}

	ctx, cancel := context.WithCancel(context.Background())

	machine, err := firecracker.NewMachine(ctx, fcConfig)
	if err != nil {
		cancel()
		tap.Destroy()
		return nil, fmt.Errorf("create machine: %w", err)
	}

	vm := &VM{
		Config:  cfg,
		State:   StateStarting,
		machine: machine,
		cancel:  cancel,
		tap:     tap,
	}

	m.vms[cfg.ID] = vm

	// Start the VM asynchronously
	go m.startVM(ctx, vm, logger)

	return vm, nil
}

// startVM starts the Firecracker machine in the background.
func (m *Manager) startVM(ctx context.Context, v *VM, logger *log.Entry) {
	startTime := time.Now()

	if err := v.machine.Start(ctx); err != nil {
		logger.WithError(err).Error("Failed to start VM")
		m.mu.Lock()
		v.State = StateError
		v.Error = err.Error()
		m.mu.Unlock()
		return
	}

	bootDuration := time.Since(startTime)
	logger.WithField("boot_ms", bootDuration.Milliseconds()).Info("VM started")

	m.mu.Lock()
	v.State = StateRunning
	v.StartedAt = time.Now()
	if pid, err := v.machine.PID(); err == nil && pid != 0 {
		v.PID = pid
	}
	m.mu.Unlock()

	// Wait for the VM to exit
	if err := v.machine.Wait(ctx); err != nil {
		if ctx.Err() == nil {
			logger.WithError(err).Warn("VM exited unexpectedly")
		}
	}

	m.mu.Lock()
	v.State = StateStopped
	m.mu.Unlock()
}

// Stop stops a running VM.
func (m *Manager) Stop(id string) error {
	m.mu.Lock()
	v, exists := m.vms[id]
	if !exists {
		m.mu.Unlock()
		return fmt.Errorf("VM %s not found", id)
	}
	m.mu.Unlock()

	log.WithField("vm_id", id).Info("Stopping VM")

	v.State = StateStopping

	// Shutdown the machine
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := v.machine.Shutdown(ctx); err != nil {
		log.WithError(err).Warn("Graceful shutdown failed, forcing stop")
		v.machine.StopVMM()
	}

	v.cancel()

	// Cleanup TAP
	if v.tap != nil {
		v.tap.Destroy()
	}

	// Release IP
	m.bridge.ReleaseAddress(v.Config.IP)

	return nil
}

// Destroy stops and removes a VM completely, including its overlay.
func (m *Manager) Destroy(id string) error {
	if err := m.Stop(id); err != nil {
		// Continue with cleanup even if stop fails
		log.WithError(err).Warn("Error stopping VM during destroy")
	}

	m.mu.Lock()
	v, exists := m.vms[id]
	if exists {
		delete(m.vms, id)
	}
	m.mu.Unlock()

	if !exists {
		return fmt.Errorf("VM %s not found", id)
	}

	// Remove socket
	os.Remove(v.Config.SocketPath(m.config.SocketDir))

	// Remove overlay/rootfs
	os.Remove(v.Config.OverlayPath(m.config.TenantDir))
	os.Remove(v.Config.RootfsPath(m.config.TenantDir))

	log.WithField("vm_id", id).Info("VM destroyed")
	return nil
}

// Get returns info about a specific VM.
func (m *Manager) Get(id string) (*VM, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	v, exists := m.vms[id]
	if !exists {
		return nil, fmt.Errorf("VM %s not found", id)
	}
	return v, nil
}

// List returns all managed VMs.
func (m *Manager) List() []*VM {
	m.mu.RLock()
	defer m.mu.RUnlock()

	vms := make([]*VM, 0, len(m.vms))
	for _, v := range m.vms {
		vms = append(vms, v)
	}
	return vms
}

// GetBySlug returns the VM for a given app slug.
func (m *Manager) GetBySlug(slug string) (*VM, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, v := range m.vms {
		if v.Config.Slug == slug {
			return v, nil
		}
	}
	return nil, fmt.Errorf("no VM found for slug %s", slug)
}

// StopAll stops all running VMs (used during shutdown).
func (m *Manager) StopAll() {
	m.mu.RLock()
	ids := make([]string, 0, len(m.vms))
	for id := range m.vms {
		ids = append(ids, id)
	}
	m.mu.RUnlock()

	for _, id := range ids {
		if err := m.Stop(id); err != nil {
			log.WithError(err).WithField("vm_id", id).Warn("Error stopping VM")
		}
	}
}

// Redeploy stops a VM, applies a deploy function to its rootfs, and restarts it.
// The deploy function receives the rootfs path and should modify files on disk.
// The VM keeps its ID and slug; IP/MAC are re-allocated.
func (m *Manager) Redeploy(id string, deployFn func(rootfsPath string) error) (*VM, error) {
	m.mu.RLock()
	oldVM, exists := m.vms[id]
	if !exists {
		m.mu.RUnlock()
		return nil, fmt.Errorf("VM %s not found", id)
	}
	cfg := oldVM.Config
	m.mu.RUnlock()

	logger := log.WithFields(log.Fields{
		"vm_id": cfg.ID,
		"slug":  cfg.Slug,
	})

	// Stop the old VM (releases IP, destroys TAP)
	logger.Info("Stopping VM for redeploy")
	if err := m.Stop(id); err != nil {
		logger.WithError(err).Warn("Error stopping VM during redeploy")
	}

	m.mu.Lock()
	delete(m.vms, id)
	m.mu.Unlock()

	// Remove socket
	os.Remove(cfg.SocketPath(m.config.SocketDir))

	// Run the deploy function on the rootfs (safe: VM is stopped)
	rootfsPath := cfg.RootfsPath(m.config.TenantDir)
	if err := deployFn(rootfsPath); err != nil {
		return nil, fmt.Errorf("deploy to rootfs: %w", err)
	}

	// Clear network fields so Create() re-allocates them
	cfg.IP = ""
	cfg.GatewayIP = ""
	cfg.MAC = ""

	// Recreate the VM (prepareRootfs will reuse the existing rootfs file)
	logger.Info("Restarting VM after deploy")
	newVM, err := m.Create(cfg)
	if err != nil {
		return nil, fmt.Errorf("recreate VM: %w", err)
	}

	return newVM, nil
}

// prepareRootfs sets up the rootfs for a VM (either overlay or full copy).
func (m *Manager) prepareRootfs(cfg VMConfig) (string, error) {
	if cfg.Overlay {
		overlayPath := cfg.OverlayPath(m.config.TenantDir)
		if _, err := os.Stat(overlayPath); os.IsNotExist(err) {
			// Create sparse overlay file (1GB)
			cmd := exec.Command("dd", "if=/dev/zero", fmt.Sprintf("of=%s", overlayPath),
				"bs=1", "count=0", "seek=1G")
			if out, err := cmd.CombinedOutput(); err != nil {
				return "", fmt.Errorf("create overlay: %s: %w", string(out), err)
			}
			cmd = exec.Command("mkfs.ext4", "-q", "-F", overlayPath)
			if out, err := cmd.CombinedOutput(); err != nil {
				return "", fmt.Errorf("format overlay: %s: %w", string(out), err)
			}
		}
		return overlayPath, nil
	}

	// Non-overlay: copy the base ext4 image (skip if already exists)
	rootfsPath := cfg.RootfsPath(m.config.TenantDir)
	if _, err := os.Stat(rootfsPath); os.IsNotExist(err) {
		cmd := exec.Command("cp", m.config.BaseExt4Path, rootfsPath)
		if out, err := cmd.CombinedOutput(); err != nil {
			return "", fmt.Errorf("copy rootfs: %s: %w", string(out), err)
		}
	}
	return rootfsPath, nil
}
