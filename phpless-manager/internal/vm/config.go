package vm

import (
	"fmt"
	"path/filepath"
)

// ManagerConfig holds static configuration for the VM manager.
type ManagerConfig struct {
	KernelPath     string
	BaseSqfsPath   string
	BaseExt4Path   string
	TenantDir      string
	SocketDir      string
	LogDir         string // Directory for per-VM console log files
	SSHPubKey      string // authorized_keys content injected into each VM for terminal access
	RootfsSizeMiB  int    // Size to resize each tenant rootfs copy to (0 = no resize)
}

// VMConfig holds the configuration for a single microVM.
type VMConfig struct {
	ID       string
	Slug     string // App slug used for subdomain routing
	VCPUs    int
	MemMiB   int
	IP       string // Guest IP
	GatewayIP string // Host-side TAP IP
	Subnet   string
	MAC      string
	Overlay  bool // Use SquashFS + overlay instead of ext4 copy
}

// DefaultVMConfig returns a VMConfig with sensible defaults.
func DefaultVMConfig(id, slug string) VMConfig {
	return VMConfig{
		ID:     id,
		Slug:   slug,
		VCPUs:  1,
		MemMiB: 256,
		Subnet: "255.255.0.0",
		Overlay: false,
	}
}

// SocketPath returns the Firecracker API socket path for this VM.
func (c VMConfig) SocketPath(socketDir string) string {
	return filepath.Join(socketDir, fmt.Sprintf("fc-%s.sock", c.ID))
}

// OverlayPath returns the path to the tenant's overlay ext4 image.
func (c VMConfig) OverlayPath(tenantDir string) string {
	return filepath.Join(tenantDir, fmt.Sprintf("%s-overlay.ext4", c.ID))
}

// RootfsPath returns the path to the tenant's rootfs copy (non-overlay mode).
func (c VMConfig) RootfsPath(tenantDir string) string {
	return filepath.Join(tenantDir, fmt.Sprintf("%s-rootfs.ext4", c.ID))
}

// BootArgs returns kernel boot arguments for this VM.
func (c VMConfig) BootArgs() string {
	args := fmt.Sprintf(
		"console=ttyS0 reboot=k panic=1 pci=off init=/init root=/dev/vda rw ip=%s::%s:%s::eth0:off phpless.slug=%s",
		c.IP, c.GatewayIP, c.Subnet, c.Slug,
	)
	if c.Overlay {
		args += " overlay=1"
	}
	return args
}
