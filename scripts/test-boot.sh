#!/usr/bin/env bash
# test-boot.sh — Test boot with proper output isolation
set -e

KERNEL="${1:-/srv/firecracker/base/kernel/vmlinux-5.10-custom}"
ROOTFS="${2:-/srv/firecracker/tenants/test-rootfs.ext4}"
SOCKET="/srv/firecracker/sockets/fc-test.sock"
LOG="/tmp/fc-console.log"

# Clean state
pkill -9 firecracker 2>/dev/null || true
sleep 0.5
rm -f "$SOCKET" "$LOG"
ip link del tap-test 2>/dev/null || true

# Create TAP
ip tuntap add tap-test mode tap
ip addr add 10.0.1.1/24 dev tap-test 2>/dev/null || true
ip link set tap-test up

# Ensure NAT
MAIN_IF=$(ip route | grep default | awk '{print $5}' | head -1)
iptables -t nat -C POSTROUTING -o "$MAIN_IF" -j MASQUERADE 2>/dev/null || \
    iptables -t nat -A POSTROUTING -o "$MAIN_IF" -j MASQUERADE

# Start firecracker daemonized
nohup firecracker --api-sock "$SOCKET" </dev/null >"$LOG" 2>&1 &
FC_PID=$!
sleep 1

if ! kill -0 $FC_PID 2>/dev/null; then
    echo "ERROR: Firecracker failed to start"
    cat "$LOG"
    exit 1
fi

echo "Firecracker PID: $FC_PID"

# Configure
curl -s --unix-socket "$SOCKET" -X PUT "http://localhost/boot-source" \
    -H "Content-Type: application/json" \
    -d "{
        \"kernel_image_path\": \"$KERNEL\",
        \"boot_args\": \"console=ttyS0 reboot=k panic=1 pci=off root=/dev/vda rw ip=10.0.1.2::10.0.1.1:255.255.255.0::eth0:off\"
    }" || true

curl -s --unix-socket "$SOCKET" -X PUT "http://localhost/drives/rootfs" \
    -H "Content-Type: application/json" \
    -d "{
        \"drive_id\": \"rootfs\",
        \"path_on_host\": \"$ROOTFS\",
        \"is_root_device\": true,
        \"is_read_only\": false
    }" || true

curl -s --unix-socket "$SOCKET" -X PUT "http://localhost/machine-config" \
    -H "Content-Type: application/json" \
    -d "{\"vcpu_count\": 1, \"mem_size_mib\": 256}" || true

curl -s --unix-socket "$SOCKET" -X PUT "http://localhost/network-interfaces/eth0" \
    -H "Content-Type: application/json" \
    -d "{
        \"iface_id\": \"eth0\",
        \"guest_mac\": \"AA:FC:00:00:00:01\",
        \"host_dev_name\": \"tap-test\"
    }" || true

echo "Starting VM..."
curl -s --unix-socket "$SOCKET" -X PUT "http://localhost/actions" \
    -H "Content-Type: application/json" \
    -d "{\"action_type\": \"InstanceStart\"}" || true

# Wait and check
echo "Waiting 5s for boot..."
sleep 5

echo ""
echo "=== FC Process ==="
ps aux | grep "[f]irecracker" | head -3

echo ""
echo "=== Console Log (last 30 lines) ==="
tail -30 "$LOG"

echo ""
echo "=== Connectivity Test ==="
curl -s --connect-timeout 3 http://10.0.1.2:8080 && echo "" || echo "No response on :8080"
ping -c 1 -W 2 10.0.1.2 2>&1 || echo "Ping failed"
