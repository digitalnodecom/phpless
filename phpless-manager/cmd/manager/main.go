package main

import (
	"context"
	"flag"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/go-chi/chi/v5"
	"github.com/phpless/phpless-manager/internal/api"
	"github.com/phpless/phpless-manager/internal/network"
	"github.com/phpless/phpless-manager/internal/sshproxy"
	"github.com/phpless/phpless-manager/internal/terminal"
	"github.com/phpless/phpless-manager/internal/vm"
	log "github.com/sirupsen/logrus"
)

func main() {
	socketPath := flag.String("socket", "/var/fc/manager.sock", "Unix socket path for API")
	bridgeName := flag.String("bridge", "br-phpless", "Bridge interface name")
	bridgeCIDR := flag.String("bridge-cidr", "10.0.0.1/16", "Bridge network CIDR")
	kernelPath := flag.String("kernel", "/srv/firecracker/base/kernel/vmlinux-5.10-custom", "Path to vmlinux kernel")
	baseSqfs := flag.String("base-image", "/srv/firecracker/base/rootfs-base.sqfs", "Path to base SquashFS image")
	baseExt4 := flag.String("base-ext4", "/srv/firecracker/base/rootfs-base.ext4", "Path to base ext4 image")
	tenantDir := flag.String("tenant-dir", "/srv/firecracker/tenants", "Directory for tenant overlays")
	socketDir := flag.String("socket-dir", "/srv/firecracker/sockets", "Directory for VM API sockets")
	logLevel := flag.String("log-level", "info", "Log level (debug, info, warn, error)")
	logDir := flag.String("log-dir", "/var/log/phpless/vms", "Directory for per-VM console log files")
	sshKeyPath := flag.String("ssh-key", "/etc/phpless/terminal_id_rsa", "Path to the manager's SSH private key for terminal access")
	termAddr := flag.String("term-addr", "127.0.0.1:7474", "TCP address for WebSocket terminal server")
	sshProxyAddr := flag.String("ssh-proxy-addr", "0.0.0.0:7068", "TCP address for SSH proxy server")
	panelURL := flag.String("panel-url", "https://phpless.digitalno.de", "Panel URL for SSH auth verification")
	flag.Parse()

	// Configure logging
	level, err := log.ParseLevel(*logLevel)
	if err != nil {
		log.WithError(err).Fatal("Invalid log level")
	}
	log.SetLevel(level)
	log.SetFormatter(&log.TextFormatter{
		FullTimestamp: true,
	})

	log.Info("PHPless VM Manager starting")

	// Initialise SSH keypair for terminal access
	sshSigner, sshPubKey, err := terminal.EnsureKeyPair(*sshKeyPath)
	if err != nil {
		log.WithError(err).Warn("Could not initialise SSH keypair; terminal access will be disabled")
		sshPubKey = ""
	} else {
		log.WithField("key", *sshKeyPath).Info("SSH keypair ready for terminal access")
	}
	_ = sshSigner // used below for the TCP terminal server

	// Initialise terminal session store
	termStore := terminal.NewStore()

	// Kill any orphaned firecracker processes left over from a previous crash.
	// On a clean shutdown StopAll() handles this, but SIGKILL leaves them behind.
	if out, err := exec.Command("pkill", "-x", "firecracker").CombinedOutput(); err == nil {
		log.WithField("output", strings.TrimSpace(string(out))).Info("Killed orphaned firecracker processes")
	}

	// Initialize bridge network
	bridge, err := network.NewBridge(*bridgeName, *bridgeCIDR)
	if err != nil {
		log.WithError(err).Fatal("Failed to initialize bridge network")
	}
	log.WithField("bridge", *bridgeName).Info("Bridge network initialized")

	// Remove stale TAP devices from a previous run before any VMs are created.
	// Without this, ghost TAP devices on the bridge cause ARP conflicts when
	// the IP allocator reassigns the same subnet addresses to new VMs.
	network.CleanupStaleTAPs(*bridgeName)
	log.WithField("bridge", *bridgeName).Info("Stale TAP devices cleaned up")

	// Remove stale Firecracker socket files from a previous run.
	if entries, err := os.ReadDir(*socketDir); err == nil {
		for _, e := range entries {
			if strings.HasPrefix(e.Name(), "fc-") && strings.HasSuffix(e.Name(), ".sock") {
				os.Remove(filepath.Join(*socketDir, e.Name()))
			}
		}
	}

	// Initialize VM manager
	vmConfig := vm.ManagerConfig{
		KernelPath:    *kernelPath,
		BaseSqfsPath:  *baseSqfs,
		BaseExt4Path:  *baseExt4,
		TenantDir:     *tenantDir,
		SocketDir:     *socketDir,
		LogDir:        *logDir,
		SSHPubKey:     sshPubKey,
		RootfsSizeMiB: 2048, // Resize each tenant rootfs copy to 2 GB
	}

	manager, err := vm.NewManager(vmConfig, bridge)
	if err != nil {
		log.WithError(err).Fatal("Failed to initialize VM manager")
	}

	// Configure allowed WebSocket origins from the panel URL
	terminal.SetAllowedOrigins([]string{*panelURL})

	// Start WebSocket terminal server on TCP
	tr := chi.NewRouter()
	tr.Get("/terminal/{sessionID}", terminal.HandleTerminal(termStore, sshSigner))
	go func() {
		log.WithField("addr", *termAddr).Info("Terminal WebSocket server listening")
		if err := http.ListenAndServe(*termAddr, tr); err != nil {
			log.WithError(err).Error("Terminal server error")
		}
	}()

	// Start SSH proxy server
	if sshSigner != nil {
		// Generate a separate host key for the SSH proxy server
		proxyHostKey, _, err := terminal.EnsureKeyPair(*sshKeyPath + "_proxy")
		if err != nil {
			log.WithError(err).Warn("Could not initialise SSH proxy host key")
		} else {
			proxy := sshproxy.NewServer(sshproxy.Config{
				ListenAddr: *sshProxyAddr,
				HostKey:    proxyHostKey,
				VMSigner:   sshSigner,
				PanelURL:   *panelURL,
			})
			go func() {
				if err := proxy.ListenAndServe(); err != nil {
					log.WithError(err).Error("SSH proxy server error")
				}
			}()
		}
	}

	// Initialize port forwarder — detect external interface from default route
	extIface := detectExternalInterface()
	portFwd := network.NewPortForwarder(extIface, *bridgeName)
	log.WithField("interface", extIface).Info("Port forwarder initialized")

	// Create API server
	server := api.NewServer(manager, termStore, sshSigner, portFwd)

	// Remove old socket if it exists
	os.Remove(*socketPath)

	// Listen on Unix socket
	listener, err := net.Listen("unix", *socketPath)
	if err != nil {
		log.WithError(err).Fatal("Failed to listen on socket")
	}
	defer listener.Close()

	// Make socket accessible (www-data needs access for Laravel panel)
	os.Chmod(*socketPath, 0660)

	log.WithField("socket", *socketPath).Info("API server listening")

	// Start HTTP server
	httpServer := &http.Server{
		Handler: server.Router(),
	}

	// Graceful shutdown on SIGINT/SIGTERM
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		sig := <-sigCh
		log.WithField("signal", sig).Info("Shutting down...")
		cancel()
		httpServer.Close()
	}()

	go func() {
		if err := httpServer.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.WithError(err).Fatal("HTTP server error")
		}
	}()

	<-ctx.Done()

	// Clean up port forwarding rules before stopping VMs
	portFwd.RemoveAll()

	// Clean up all VMs
	log.Info("Stopping all VMs...")
	manager.StopAll()
	bridge.Destroy()

	log.Info("PHPless VM Manager stopped")
}

// detectExternalInterface finds the network interface used for the default route.
func detectExternalInterface() string {
	out, err := exec.Command("ip", "route", "show", "default").Output()
	if err == nil {
		// Output: "default via X.X.X.X dev enp8s0 ..."
		fields := strings.Fields(string(out))
		for i, f := range fields {
			if f == "dev" && i+1 < len(fields) {
				return fields[i+1]
			}
		}
	}
	return "eth0" // fallback
}
