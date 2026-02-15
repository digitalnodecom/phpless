#!/usr/bin/env bash
# stop-vm.sh — Stop a running Firecracker VM
set -euo pipefail

VM_ID="${1:-test}"
SOCKET="/srv/firecracker/sockets/fc-${VM_ID}.sock"
TAP_DEV="tap-${VM_ID}"

echo "Stopping VM: ${VM_ID}"

# Send shutdown via Firecracker API
if [[ -S "$SOCKET" ]]; then
    curl -s --unix-socket "$SOCKET" -X PUT "http://localhost/actions" \
        -H "Content-Type: application/json" \
        -d '{"action_type": "SendCtrlAltDel"}' 2>/dev/null || true
    sleep 1
fi

# Kill firecracker process
pkill -f "api-sock.*fc-${VM_ID}" 2>/dev/null || true

# Clean up TAP device
ip link del "$TAP_DEV" 2>/dev/null || true

# Clean up socket
rm -f "$SOCKET"

# Clean up rootfs copy
rm -f "/srv/firecracker/tenants/${VM_ID}-rootfs.ext4"

echo "VM ${VM_ID} stopped ✓"
