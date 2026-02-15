#!/usr/bin/env bash
# create-overlay-vm.sh — Boot a Firecracker VM using SquashFS base + ext4 overlay
set -euo pipefail

VM_ID="${1:?Usage: $0 <vm-id> [vm-ip-suffix]}"
IP_SUFFIX="${2:-2}"
KERNEL="/srv/firecracker/base/kernel/vmlinux-5.10-custom"
BASE_SQFS="/srv/firecracker/base/rootfs-base.sqfs"
SOCKET="/srv/firecracker/sockets/fc-${VM_ID}.sock"
TAP_DEV="tap-${VM_ID}"
VM_IP="10.0.${IP_SUFFIX}.2"
HOST_IP="10.0.${IP_SUFFIX}.1"
SUBNET="255.255.255.0"
VCPUS=1
MEM_MIB=256
OVERLAY_SIZE="1G"

echo "=== Creating Overlay VM: ${VM_ID} (IP: ${VM_IP}) ==="

if [[ $EUID -ne 0 ]]; then
    echo "Error: run as root" >&2
    exit 1
fi

for f in "$KERNEL" "$BASE_SQFS"; do
    if [[ ! -f "$f" ]]; then
        echo "Error: $f not found. Run build-rootfs.sh first." >&2
        exit 1
    fi
done

# Clean previous
rm -f "$SOCKET"
pkill -f "api-sock.*fc-${VM_ID}" 2>/dev/null || true
sleep 0.3

# Create per-tenant overlay
OVERLAY="/srv/firecracker/tenants/${VM_ID}-overlay.ext4"
if [[ ! -f "$OVERLAY" ]]; then
    echo "Creating overlay image..."
    dd if=/dev/zero of="$OVERLAY" bs=1 count=0 seek="$OVERLAY_SIZE" 2>/dev/null
    mkfs.ext4 -q -F "$OVERLAY"
fi

# Network setup
ip link del "$TAP_DEV" 2>/dev/null || true
ip tuntap add "$TAP_DEV" mode tap
ip addr add "${HOST_IP}/24" dev "$TAP_DEV" 2>/dev/null || true
ip link set "$TAP_DEV" up

MAIN_IFACE=$(ip route | grep default | awk '{print $5}' | head -1)
iptables -t nat -C POSTROUTING -o "$MAIN_IFACE" -j MASQUERADE 2>/dev/null || \
    iptables -t nat -A POSTROUTING -o "$MAIN_IFACE" -j MASQUERADE

# Start Firecracker
firecracker --api-sock "$SOCKET" &
FC_PID=$!
sleep 0.5

# Configure VM
curl -s --unix-socket "$SOCKET" -X PUT "http://localhost/boot-source" \
    -H "Content-Type: application/json" \
    -d "{
        \"kernel_image_path\": \"${KERNEL}\",
        \"boot_args\": \"console=ttyS0 reboot=k panic=1 pci=off ip=${VM_IP}::${HOST_IP}:${SUBNET}::eth0:off overlay=1\"
    }"

# Base image (read-only)
curl -s --unix-socket "$SOCKET" -X PUT "http://localhost/drives/rootfs" \
    -H "Content-Type: application/json" \
    -d "{
        \"drive_id\": \"rootfs\",
        \"path_on_host\": \"${BASE_SQFS}\",
        \"is_root_device\": true,
        \"is_read_only\": true
    }"

# Overlay drive
curl -s --unix-socket "$SOCKET" -X PUT "http://localhost/drives/overlay" \
    -H "Content-Type: application/json" \
    -d "{
        \"drive_id\": \"overlay\",
        \"path_on_host\": \"${OVERLAY}\",
        \"is_root_device\": false,
        \"is_read_only\": false
    }"

curl -s --unix-socket "$SOCKET" -X PUT "http://localhost/machine-config" \
    -H "Content-Type: application/json" \
    -d "{\"vcpu_count\": ${VCPUS}, \"mem_size_mib\": ${MEM_MIB}}"

curl -s --unix-socket "$SOCKET" -X PUT "http://localhost/network-interfaces/eth0" \
    -H "Content-Type: application/json" \
    -d "{
        \"iface_id\": \"eth0\",
        \"guest_mac\": \"AA:FC:00:00:$(printf '%02X' $IP_SUFFIX):01\",
        \"host_dev_name\": \"${TAP_DEV}\"
    }"

# Start
curl -s --unix-socket "$SOCKET" -X PUT "http://localhost/actions" \
    -H "Content-Type: application/json" \
    -d '{"action_type": "InstanceStart"}'

echo "VM ${VM_ID} started (PID: ${FC_PID}, IP: ${VM_IP})"
echo "  Test:  curl http://${VM_IP}:8080"
echo "  Stop:  kill ${FC_PID} && ip link del ${TAP_DEV}"
