#!/usr/bin/env bash
# create-vm.sh — Boot a single Firecracker microVM for testing
set -euo pipefail

VM_ID="${1:-test}"
KERNEL="/srv/firecracker/base/kernel/vmlinux-5.10-custom"
ROOTFS="/srv/firecracker/base/rootfs-base.ext4"
SOCKET="/srv/firecracker/sockets/fc-${VM_ID}.sock"
TAP_DEV="tap-${VM_ID}"
VM_IP="10.0.1.2"
HOST_IP="10.0.1.1"
SUBNET="255.255.255.0"
VCPUS=1
MEM_MIB=256

echo "=== Creating Firecracker VM: ${VM_ID} ==="

if [[ $EUID -ne 0 ]]; then
    echo "Error: run as root" >&2
    exit 1
fi

# Validate prerequisites
for f in "$KERNEL" "$ROOTFS"; do
    if [[ ! -f "$f" ]]; then
        echo "Error: $f not found. Run build-rootfs.sh first." >&2
        exit 1
    fi
done

if ! command -v firecracker &>/dev/null; then
    echo "Error: firecracker not found. Run server-setup.sh first." >&2
    exit 1
fi

# Clean up any previous instance
if [[ -e "$SOCKET" ]]; then
    echo "Cleaning up previous socket..."
    rm -f "$SOCKET"
fi

# Kill any existing firecracker using this socket
pkill -f "api-sock.*fc-${VM_ID}" 2>/dev/null || true
sleep 0.5

# 1. Create TAP device
echo "[1/4] Setting up network (TAP: ${TAP_DEV}, VM IP: ${VM_IP})..."
ip link del "$TAP_DEV" 2>/dev/null || true
ip tuntap add "$TAP_DEV" mode tap
ip addr add "${HOST_IP}/24" dev "$TAP_DEV" 2>/dev/null || true
ip link set "$TAP_DEV" up

# Enable NAT
MAIN_IFACE=$(ip route | grep default | awk '{print $5}' | head -1)
sysctl -w net.ipv4.ip_forward=1 >/dev/null
iptables -t nat -C POSTROUTING -o "$MAIN_IFACE" -j MASQUERADE 2>/dev/null || \
    iptables -t nat -A POSTROUTING -o "$MAIN_IFACE" -j MASQUERADE

echo "  Network configured ✓"

# 2. Make a writable copy of rootfs for this VM
VM_ROOTFS="/srv/firecracker/tenants/${VM_ID}-rootfs.ext4"
echo "[2/4] Creating rootfs copy for VM..."
cp "$ROOTFS" "$VM_ROOTFS"
echo "  Rootfs copied ✓"

# 3. Start Firecracker
echo "[3/4] Starting Firecracker..."
firecracker --api-sock "$SOCKET" &
FC_PID=$!
sleep 0.5

if ! kill -0 $FC_PID 2>/dev/null; then
    echo "Error: Firecracker failed to start" >&2
    exit 1
fi

# 4. Configure VM via API
echo "[4/4] Configuring VM via API..."

# Set boot source
curl -s --unix-socket "$SOCKET" -X PUT "http://localhost/boot-source" \
    -H "Content-Type: application/json" \
    -d "{
        \"kernel_image_path\": \"${KERNEL}\",
        \"boot_args\": \"console=ttyS0 reboot=k panic=1 pci=off root=/dev/vda rw ip=${VM_IP}::${HOST_IP}:${SUBNET}::eth0:off\"
    }"

# Set rootfs
curl -s --unix-socket "$SOCKET" -X PUT "http://localhost/drives/rootfs" \
    -H "Content-Type: application/json" \
    -d "{
        \"drive_id\": \"rootfs\",
        \"path_on_host\": \"${VM_ROOTFS}\",
        \"is_root_device\": true,
        \"is_read_only\": false
    }"

# Set machine config
curl -s --unix-socket "$SOCKET" -X PUT "http://localhost/machine-config" \
    -H "Content-Type: application/json" \
    -d "{
        \"vcpu_count\": ${VCPUS},
        \"mem_size_mib\": ${MEM_MIB}
    }"

# Add network interface
curl -s --unix-socket "$SOCKET" -X PUT "http://localhost/network-interfaces/eth0" \
    -H "Content-Type: application/json" \
    -d "{
        \"iface_id\": \"eth0\",
        \"guest_mac\": \"AA:FC:00:00:00:01\",
        \"host_dev_name\": \"${TAP_DEV}\"
    }"

# Start the VM
echo "Starting instance..."
START_TIME=$(date +%s%N)
curl -s --unix-socket "$SOCKET" -X PUT "http://localhost/actions" \
    -H "Content-Type: application/json" \
    -d '{"action_type": "InstanceStart"}'
END_TIME=$(date +%s%N)

BOOT_MS=$(( (END_TIME - START_TIME) / 1000000 ))
echo "  VM start API call took: ${BOOT_MS}ms"

# Wait for FrankenPHP to be ready
echo ""
echo "Waiting for FrankenPHP to be ready..."
for i in $(seq 1 30); do
    if curl -s --connect-timeout 1 "http://${VM_IP}:8080" >/dev/null 2>&1; then
        echo "  FrankenPHP is ready! ✓"
        echo ""
        echo "=== VM ${VM_ID} is running ==="
        echo "  PID:     ${FC_PID}"
        echo "  Socket:  ${SOCKET}"
        echo "  VM IP:   ${VM_IP}"
        echo "  Test:    curl http://${VM_IP}:8080"
        echo "  Console: screen -S fc-${VM_ID} firecracker --api-sock ${SOCKET}"
        echo ""
        echo "To stop: kill ${FC_PID} && ip link del ${TAP_DEV}"
        curl -s "http://${VM_IP}:8080" | head -20
        exit 0
    fi
    sleep 1
done

echo "Warning: FrankenPHP did not respond within 30s."
echo "  VM may still be booting. Check: curl http://${VM_IP}:8080"
echo "  FC PID: ${FC_PID}, Socket: ${SOCKET}"
