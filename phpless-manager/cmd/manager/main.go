package main

import (
	"context"
	"flag"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/phpless/phpless-manager/internal/api"
	"github.com/phpless/phpless-manager/internal/network"
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

	// Initialize bridge network
	bridge, err := network.NewBridge(*bridgeName, *bridgeCIDR)
	if err != nil {
		log.WithError(err).Fatal("Failed to initialize bridge network")
	}
	log.WithField("bridge", *bridgeName).Info("Bridge network initialized")

	// Initialize VM manager
	vmConfig := vm.ManagerConfig{
		KernelPath:   *kernelPath,
		BaseSqfsPath: *baseSqfs,
		BaseExt4Path: *baseExt4,
		TenantDir:    *tenantDir,
		SocketDir:    *socketDir,
	}

	manager, err := vm.NewManager(vmConfig, bridge)
	if err != nil {
		log.WithError(err).Fatal("Failed to initialize VM manager")
	}

	// Create API server
	server := api.NewServer(manager)

	// Remove old socket if it exists
	os.Remove(*socketPath)

	// Listen on Unix socket
	listener, err := net.Listen("unix", *socketPath)
	if err != nil {
		log.WithError(err).Fatal("Failed to listen on socket")
	}
	defer listener.Close()

	// Make socket accessible (www-data needs access for Laravel panel)
	os.Chmod(*socketPath, 0666)

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

	// Clean up all VMs
	log.Info("Stopping all VMs...")
	manager.StopAll()
	bridge.Destroy()

	log.Info("PHPless VM Manager stopped")
}
