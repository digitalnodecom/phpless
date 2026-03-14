package network

import (
	"fmt"
	"net"
	"os"
	"os/exec"
	"sync"
)

// Bridge manages the virtual bridge network for all microVMs.
type Bridge struct {
	name    string
	cidr    string
	baseIP  net.IP
	mask    net.IPMask
	used    map[string]bool // allocated IPs
	counter int             // next subnet to allocate
	mu      sync.Mutex
}

// NewBridge creates and configures a Linux bridge for VM networking.
func NewBridge(name, cidr string) (*Bridge, error) {
	ip, ipNet, err := net.ParseCIDR(cidr)
	if err != nil {
		return nil, fmt.Errorf("parse CIDR %s: %w", cidr, err)
	}

	b := &Bridge{
		name:    name,
		cidr:    cidr,
		baseIP:  ip,
		mask:    ipNet.Mask,
		used:    make(map[string]bool),
		counter: 0,
	}

	if err := b.create(); err != nil {
		return nil, err
	}

	return b, nil
}

// create sets up the bridge interface on the host.
func (b *Bridge) create() error {
	// Check if bridge already exists
	if _, err := net.InterfaceByName(b.name); err == nil {
		// Bridge exists, ensure it's up and forward rules are in place
		run("ip", "link", "set", b.name, "up")
		b.ensureForwardRules()
		b.blockVMToVM()
		return nil
	}

	// Create bridge
	if err := run("ip", "link", "add", b.name, "type", "bridge"); err != nil {
		return fmt.Errorf("create bridge: %w", err)
	}

	// Assign IP
	if err := run("ip", "addr", "add", b.cidr, "dev", b.name); err != nil {
		// May already be assigned
	}

	// Bring up
	if err := run("ip", "link", "set", b.name, "up"); err != nil {
		return fmt.Errorf("bring up bridge: %w", err)
	}

	// Enable NAT for VM traffic
	mainIface, err := getDefaultInterface()
	if err != nil {
		return fmt.Errorf("get default interface: %w", err)
	}

	run("iptables", "-t", "nat", "-A", "POSTROUTING", "-o", mainIface, "-j", "MASQUERADE")

	// Allow forwarding for bridge subnet (works even when UFW FORWARD policy is DROP)
	b.ensureForwardRules()

	// Block VM-to-VM traffic
	b.blockVMToVM()

	return nil
}

// Name returns the bridge interface name.
func (b *Bridge) Name() string {
	return b.name
}

// AllocateAddress returns a unique IP, gateway, and MAC for a new VM.
// All VMs share the bridge gateway (10.0.0.1) on a /16 network.
// VM IPs are assigned sequentially: 10.0.1.2, 10.0.1.3, ..., 10.0.254.254.
func (b *Bridge) AllocateAddress() (vmIP, gateway, mac string, err error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	// Gateway is always the bridge IP
	gateway = b.baseIP.String()

	// Find next available IP starting from 10.0.1.2
	for b.counter < 65000 {
		third := (b.counter / 253) + 1
		fourth := (b.counter % 253) + 2
		if third > 254 {
			break
		}
		vmIP = fmt.Sprintf("10.0.%d.%d", third, fourth)
		if !b.used[vmIP] {
			mac = fmt.Sprintf("AA:FC:00:%02X:%02X:01", third, fourth)
			b.used[vmIP] = true
			b.counter++
			return vmIP, gateway, mac, nil
		}
		b.counter++
	}

	return "", "", "", fmt.Errorf("no available addresses")
}

// ReleaseAddress marks an IP as available.
func (b *Bridge) ReleaseAddress(ip string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.used, ip)
}

// Destroy removes the bridge interface.
func (b *Bridge) Destroy() error {
	return run("ip", "link", "del", b.name)
}

// getDefaultInterface returns the name of the default route interface.
func getDefaultInterface() (string, error) {
	out, err := exec.Command("ip", "route", "show", "default").Output()
	if err != nil {
		return "", err
	}

	// Parse "default via X.X.X.X dev ethN ..."
	fields := splitFields(string(out))
	for i, f := range fields {
		if f == "dev" && i+1 < len(fields) {
			return fields[i+1], nil
		}
	}

	return "eth0", nil
}

// splitFields splits a string by whitespace.
func splitFields(s string) []string {
	var fields []string
	current := ""
	for _, c := range s {
		if c == ' ' || c == '\t' || c == '\n' {
			if current != "" {
				fields = append(fields, current)
				current = ""
			}
		} else {
			current += string(c)
		}
	}
	if current != "" {
		fields = append(fields, current)
	}
	return fields
}

// ensureForwardRules idempotently inserts an iptables FORWARD rule that allows
// all traffic originating from the bridge subnet to be forwarded. This is
// required when UFW (or any firewall) sets the FORWARD chain policy to DROP.
// Uses -C (check) before -I (insert) to avoid duplicate rules.
func (b *Bridge) ensureForwardRules() {
	// Derive subnet (e.g. "10.0.0.0/16") from the bridge CIDR
	_, ipNet, err := net.ParseCIDR(b.cidr)
	if err != nil {
		return
	}
	subnet := ipNet.String()

	// Check if the rule already exists before inserting
	check := exec.Command("iptables", "-C", "FORWARD", "-s", subnet, "-j", "ACCEPT")
	if check.Run() != nil {
		// Rule missing — insert at position 1 so it fires before any DROP rules
		run("iptables", "-I", "FORWARD", "1", "-s", subnet, "-j", "ACCEPT")
	}
}

// blockVMToVM prevents direct VM-to-VM traffic by dropping packets that are
// being L2-switched within the bridge. VMs can still reach the host (gateway)
// and the internet via NAT, but cannot reach each other's internal IPs.
//
// This works by loading the br_netfilter kernel module so that bridged packets
// pass through iptables, then inserting a FORWARD rule that matches only
// packets being physically switched between bridge ports (not routed packets).
func (b *Bridge) blockVMToVM() {
	// Load br_netfilter so iptables can inspect bridged traffic.
	exec.Command("modprobe", "br_netfilter").Run() //nolint:errcheck

	// Enable iptables processing for bridged IPv4 packets.
	os.WriteFile("/proc/sys/net/bridge/bridge-nf-call-iptables", []byte("1"), 0644) //nolint:errcheck

	// Drop any packet being switched between bridge ports (VM→VM).
	// --physdev-is-bridged matches only L2-switched traffic, never routed traffic,
	// so VM→internet and host→VM paths are unaffected.
	check := exec.Command("iptables", "-C", "FORWARD",
		"-m", "physdev", "--physdev-is-bridged", "-j", "DROP")
	if check.Run() != nil {
		run("iptables", "-I", "FORWARD", "1",
			"-m", "physdev", "--physdev-is-bridged", "-j", "DROP")
	}
}

// run executes a command and returns any error.
func run(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%s %v: %s: %w", name, args, string(out), err)
	}
	return nil
}
