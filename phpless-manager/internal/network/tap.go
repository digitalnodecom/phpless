package network

import (
	"fmt"
	"os/exec"
	"strings"
)

// TAPDevice represents a TAP network device attached to a bridge.
type TAPDevice struct {
	name   string
	bridge string
}

// CreateTAP creates a new TAP device and attaches it to the bridge.
func CreateTAP(vmID, bridgeName string) (*TAPDevice, error) {
	name := tapName(vmID)

	// Remove if exists (cleanup from previous run)
	exec.Command("ip", "link", "del", name).Run()

	// Create TAP device
	if err := run("ip", "tuntap", "add", name, "mode", "tap"); err != nil {
		return nil, fmt.Errorf("create TAP %s: %w", name, err)
	}

	// Attach to bridge
	if err := run("ip", "link", "set", name, "master", bridgeName); err != nil {
		// Clean up on failure
		exec.Command("ip", "link", "del", name).Run()
		return nil, fmt.Errorf("attach TAP to bridge: %w", err)
	}

	// Bring up
	if err := run("ip", "link", "set", name, "up"); err != nil {
		exec.Command("ip", "link", "del", name).Run()
		return nil, fmt.Errorf("bring up TAP: %w", err)
	}

	return &TAPDevice{
		name:   name,
		bridge: bridgeName,
	}, nil
}

// Name returns the TAP device name.
func (t *TAPDevice) Name() string {
	return t.name
}

// Destroy removes the TAP device.
func (t *TAPDevice) Destroy() error {
	return run("ip", "link", "del", t.name)
}

// CleanupStaleTAPs removes all tap-* interfaces attached to the given bridge.
// Call this on startup before creating any VMs to clear state from a previous run.
func CleanupStaleTAPs(bridgeName string) {
	out, err := exec.Command("ip", "link", "show", "master", bridgeName).Output()
	if err != nil {
		return
	}

	for _, line := range strings.Split(string(out), "\n") {
		// Lines look like: "133: tap-abc12345: <BROADCAST,...>"
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		name := strings.TrimSuffix(fields[1], ":")
		if strings.HasPrefix(name, "tap-") {
			exec.Command("ip", "link", "del", name).Run()
		}
	}
}

// tapName generates a TAP device name from a VM ID.
// Truncates to fit the 15-char Linux interface name limit.
func tapName(vmID string) string {
	name := "tap-" + vmID
	if len(name) > 15 {
		name = name[:15]
	}
	return name
}
