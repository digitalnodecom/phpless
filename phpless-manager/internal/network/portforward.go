package network

import (
	"fmt"
	"os/exec"
	"strings"
	"sync"

	log "github.com/sirupsen/logrus"
)

// PortMapping represents a single external→internal port forwarding rule.
type PortMapping struct {
	External int    `json:"external"`
	Internal int    `json:"internal"`
	Protocol string `json:"protocol"` // "tcp" or "udp"
}

// PortForwarder manages iptables DNAT rules for forwarding host ports to VM IPs.
type PortForwarder struct {
	mu       sync.Mutex
	extIface string // external network interface (e.g. "enp8s0")
	brIface  string // bridge interface (e.g. "br-phpless")
}

// NewPortForwarder creates a new PortForwarder.
func NewPortForwarder(extIface, brIface string) *PortForwarder {
	return &PortForwarder{
		extIface: extIface,
		brIface:  brIface,
	}
}

// Apply sets up iptables rules to forward external ports to a VM.
// First removes ALL existing PREROUTING rules for the given external ports
// (regardless of which IP they previously pointed to), then adds new rules.
func (pf *PortForwarder) Apply(vmIP string, mappings []PortMapping, allowedIPs []string) error {
	pf.mu.Lock()
	defer pf.mu.Unlock()

	if len(mappings) == 0 {
		return nil
	}

	for _, m := range mappings {
		proto := m.Protocol
		if proto == "" {
			proto = "tcp"
		}

		// Flush any existing rules for this external port (from any previous VM IP)
		pf.flushPort(m.External, proto)

		// If allowlist is set, create one rule per allowed source IP.
		// Otherwise, create a single rule allowing all sources.
		sources := allowedIPs
		if len(sources) == 0 {
			sources = []string{""} // empty string = no -s flag
		}

		for _, src := range sources {
			// PREROUTING DNAT
			args := []string{"-t", "nat", "-A", "PREROUTING", "-i", pf.extIface}
			if src != "" {
				args = append(args, "-s", src)
			}
			args = append(args, "-p", proto, "--dport", fmt.Sprintf("%d", m.External),
				"-j", "DNAT", "--to-destination", fmt.Sprintf("%s:%d", vmIP, m.Internal))
			if err := iptablesRun(args...); err != nil {
				return fmt.Errorf("DNAT rule for port %d src %s: %w", m.External, src, err)
			}

			// FORWARD
			fwdArgs := []string{"-I", "FORWARD", "1", "-i", pf.extIface, "-o", pf.brIface}
			if src != "" {
				fwdArgs = append(fwdArgs, "-s", src)
			}
			fwdArgs = append(fwdArgs, "-p", proto, "-d", vmIP, "--dport", fmt.Sprintf("%d", m.Internal),
				"-j", "ACCEPT")
			if err := iptablesRun(fwdArgs...); err != nil {
				return fmt.Errorf("FORWARD rule for port %d src %s: %w", m.Internal, src, err)
			}
		}

		log.WithFields(log.Fields{
			"vm_ip":      vmIP,
			"external":   m.External,
			"internal":   m.Internal,
			"protocol":   proto,
			"allowed_ips": len(allowedIPs),
		}).Info("Port forwarding rule applied")
	}

	return nil
}

// Remove deletes all iptables port forwarding rules for a VM IP by scanning
// the actual iptables chains. Does not rely on in-memory state.
func (pf *PortForwarder) Remove(vmIP string) {
	pf.mu.Lock()
	defer pf.mu.Unlock()
	pf.removeByIP(vmIP)
}

// RemoveAll scans iptables and removes all DNAT rules pointing to the VM bridge subnet.
func (pf *PortForwarder) RemoveAll() {
	pf.mu.Lock()
	defer pf.mu.Unlock()

	// Remove all DNAT rules in PREROUTING that target our bridge subnet (10.0.x.x)
	for {
		out, err := exec.Command("iptables", "-t", "nat", "-L", "PREROUTING", "--line-numbers", "-n").Output()
		if err != nil {
			break
		}
		deleted := false
		// Parse in reverse to delete by line number safely
		lines := strings.Split(string(out), "\n")
		for i := len(lines) - 1; i >= 0; i-- {
			if strings.Contains(lines[i], "DNAT") && strings.Contains(lines[i], "to:10.0.") {
				fields := strings.Fields(lines[i])
				if len(fields) > 0 {
					iptablesRun("-t", "nat", "-D", "PREROUTING", fields[0])
					deleted = true
				}
			}
		}
		if !deleted {
			break
		}
	}

	// Remove all FORWARD rules targeting our bridge subnet
	for {
		out, err := exec.Command("iptables", "-L", "FORWARD", "--line-numbers", "-n").Output()
		if err != nil {
			break
		}
		deleted := false
		lines := strings.Split(string(out), "\n")
		for i := len(lines) - 1; i >= 0; i-- {
			if strings.Contains(lines[i], "ACCEPT") && strings.Contains(lines[i], "10.0.") &&
				strings.Contains(lines[i], pf.extIface) {
				fields := strings.Fields(lines[i])
				if len(fields) > 0 {
					iptablesRun("-D", "FORWARD", fields[0])
					deleted = true
				}
			}
		}
		if !deleted {
			break
		}
	}

	log.Info("All port forwarding rules removed")
}

// flushPort removes ALL PREROUTING DNAT and FORWARD rules for a given external port,
// regardless of which VM IP they point to. This ensures no stale rules remain
// after VM IP changes.
func (pf *PortForwarder) flushPort(port int, proto string) {
	dport := fmt.Sprintf("dpt:%d", port)

	// Remove all PREROUTING DNAT rules for this port (loop until none left)
	for i := 0; i < 20; i++ { // safety limit
		err := iptablesRun("-t", "nat", "-D", "PREROUTING",
			"-i", pf.extIface,
			"-p", proto, "--dport", fmt.Sprintf("%d", port),
			"-j", "DNAT") // -D without --to-destination won't match; need to find and delete
		if err != nil {
			break
		}
	}

	// The above won't work because -D needs exact match. Parse and delete by line number instead.
	for {
		out, err := exec.Command("iptables", "-t", "nat", "-L", "PREROUTING", "--line-numbers", "-n").Output()
		if err != nil {
			break
		}
		deleted := false
		lines := strings.Split(string(out), "\n")
		for i := len(lines) - 1; i >= 0; i-- {
			if strings.Contains(lines[i], "DNAT") && strings.Contains(lines[i], dport) {
				fields := strings.Fields(lines[i])
				if len(fields) > 0 {
					iptablesRun("-t", "nat", "-D", "PREROUTING", fields[0])
					deleted = true
				}
			}
		}
		if !deleted {
			break
		}
	}

	// Same for FORWARD rules matching the internal port
	for {
		out, err := exec.Command("iptables", "-L", "FORWARD", "--line-numbers", "-n").Output()
		if err != nil {
			break
		}
		deleted := false
		lines := strings.Split(string(out), "\n")
		for i := len(lines) - 1; i >= 0; i-- {
			// Match ACCEPT rules for our interfaces that target this port
			if strings.Contains(lines[i], "ACCEPT") && strings.Contains(lines[i], dport) &&
				strings.Contains(lines[i], pf.brIface) {
				fields := strings.Fields(lines[i])
				if len(fields) > 0 {
					iptablesRun("-D", "FORWARD", fields[0])
					deleted = true
				}
			}
		}
		if !deleted {
			break
		}
	}
}

// removeByIP scans iptables and removes all rules pointing to a specific VM IP.
func (pf *PortForwarder) removeByIP(vmIP string) {
	// PREROUTING
	for {
		out, err := exec.Command("iptables", "-t", "nat", "-L", "PREROUTING", "--line-numbers", "-n").Output()
		if err != nil {
			break
		}
		deleted := false
		lines := strings.Split(string(out), "\n")
		for i := len(lines) - 1; i >= 0; i-- {
			if strings.Contains(lines[i], "DNAT") && strings.Contains(lines[i], "to:"+vmIP+":") {
				fields := strings.Fields(lines[i])
				if len(fields) > 0 {
					iptablesRun("-t", "nat", "-D", "PREROUTING", fields[0])
					deleted = true
				}
			}
		}
		if !deleted {
			break
		}
	}

	// FORWARD
	for {
		out, err := exec.Command("iptables", "-L", "FORWARD", "--line-numbers", "-n").Output()
		if err != nil {
			break
		}
		deleted := false
		lines := strings.Split(string(out), "\n")
		for i := len(lines) - 1; i >= 0; i-- {
			if strings.Contains(lines[i], "ACCEPT") && strings.Contains(lines[i], vmIP) {
				fields := strings.Fields(lines[i])
				if len(fields) > 0 {
					iptablesRun("-D", "FORWARD", fields[0])
					deleted = true
				}
			}
		}
		if !deleted {
			break
		}
	}

	log.WithField("vm_ip", vmIP).Info("Port forwarding rules removed")
}

func iptablesRun(args ...string) error {
	cmd := exec.Command("iptables", args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("iptables %v: %s: %w", args, string(out), err)
	}
	return nil
}
