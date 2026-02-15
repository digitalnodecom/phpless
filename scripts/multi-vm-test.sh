#!/usr/bin/env bash
# multi-vm-test.sh — Start 5 VMs to test multi-tenant isolation
set -euo pipefail

MANAGER_SOCK="/var/fc/manager.sock"
API="curl -s --unix-socket $MANAGER_SOCK http://localhost"

echo "=== PHPless Multi-VM Test ==="

# Check if manager is running
if [[ ! -S "$MANAGER_SOCK" ]]; then
    echo "Error: VM Manager not running. Start with: systemctl start phpless-manager" >&2
    exit 1
fi

# Create 5 VMs
SLUGS=("app-one" "app-two" "app-three" "app-four" "app-five")

echo "[1/3] Creating 5 VMs..."
for slug in "${SLUGS[@]}"; do
    echo -n "  Creating ${slug}... "
    RESULT=$($API/vms -X POST -H "Content-Type: application/json" \
        -d "{\"slug\": \"$slug\"}")
    ID=$(echo "$RESULT" | jq -r '.id // "error"')
    STATE=$(echo "$RESULT" | jq -r '.state // .error // "unknown"')
    echo "ID: ${ID}, State: ${STATE}"
done

# Wait for VMs to start
echo ""
echo "[2/3] Waiting for VMs to start (15s)..."
sleep 15

# List all VMs
echo ""
echo "[3/3] VM Status:"
$API/vms | jq '.'

echo ""
echo "Testing connectivity..."
VMS=$($API/vms)
echo "$VMS" | jq -r '.[] | "\(.slug) \(.ip)"' | while read slug ip; do
    printf "  %-15s (%-12s): " "$slug" "$ip"
    if curl -s --connect-timeout 3 "http://${ip}:8080" >/dev/null 2>&1; then
        echo "OK ✓"
    else
        echo "UNREACHABLE ✗"
    fi
done

echo ""
echo "=== Multi-VM Test Complete ==="
echo "Access via Caddy: curl https://<slug>.phpless.app"
echo ""
echo "To clean up: $API/vms | jq -r '.[].id' | xargs -I{} $API/vms/{} -X DELETE"
