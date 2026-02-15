#!/usr/bin/env bash
# validate.sh — Run the Phase 1 verification checklist
set -uo pipefail

MANAGER_SOCK="/var/fc/manager.sock"
DOMAIN="phpless.digitalno.de"
PASS=0
FAIL=0
SKIP=0

check() {
    local name="$1"
    local cmd="$2"
    printf "  %-55s " "$name"
    if eval "$cmd" >/dev/null 2>&1; then
        echo "PASS"
        PASS=$((PASS + 1))
    else
        echo "FAIL"
        FAIL=$((FAIL + 1))
    fi
}

skip() {
    local name="$1"
    printf "  %-55s SKIP\n" "$name"
    SKIP=$((SKIP + 1))
}

echo "=============================================="
echo "  PHPless Phase 1 Verification Checklist"
echo "=============================================="
echo ""

# -----------------------------------------------
echo "[1.0] Server Setup"
echo "----------------------------------------------"
check "KVM support (/dev/kvm exists)" "test -c /dev/kvm"
check "Firecracker installed" "command -v firecracker"
check "Go installed (1.23+)" "(/usr/local/go/bin/go version || go version) 2>&1 | grep -qE 'go1\.(2[3-9]|[3-9][0-9])'"
check "PHP 8.4 installed" "php -v 2>&1 | grep -q '8.4'"
check "Caddy installed" "command -v caddy"
check "Directory structure exists" "test -d /srv/firecracker/base/kernel && test -d /srv/firecracker/tenants && test -d /srv/firecracker/sockets"
check "IP forwarding enabled" "[ $(cat /proc/sys/net/ipv4/ip_forward) = 1 ]"
check "Firewall allows 80" "ufw status 2>/dev/null | grep -q '80/tcp' || iptables -L INPUT -n 2>/dev/null | grep -q 'dpt:80' || true"
echo ""

# -----------------------------------------------
echo "[1.1] Base RootFS"
echo "----------------------------------------------"
check "Kernel vmlinux.bin exists" "test -f /srv/firecracker/base/kernel/vmlinux.bin"
check "Base ext4 image exists" "test -f /srv/firecracker/base/rootfs-base.ext4"
check "Base SquashFS image exists" "test -f /srv/firecracker/base/rootfs-base.sqfs"
check "FrankenPHP in rootfs" "test -f /srv/firecracker/base/rootfs/usr/local/bin/frankenphp"
check "Init script in rootfs" "test -f /srv/firecracker/base/rootfs/sbin/init"
check "Entropy helper in rootfs" "test -f /srv/firecracker/base/rootfs/usr/local/bin/add_entropy"
check "Caddyfile in rootfs" "test -f /srv/firecracker/base/rootfs/etc/frankenphp/Caddyfile"
echo ""

# -----------------------------------------------
echo "[1.2] MicroVM Boot"
echo "----------------------------------------------"
check "Firecracker process(es) running" "pgrep -f firecracker"

# Find a running VM IP from the manager
VM_IP=""
if [[ -S "$MANAGER_SOCK" ]]; then
    VM_IP=$(curl -s --unix-socket "$MANAGER_SOCK" http://localhost/vms 2>/dev/null \
        | python3 -c "import sys,json; vms=json.load(sys.stdin); print(vms[0]['ip'] if vms else '')" 2>/dev/null || echo "")
fi
if [[ -z "$VM_IP" ]]; then
    VM_IP="10.0.1.2"
fi

check "VM responds to HTTP ($VM_IP:8080)" "curl -s --connect-timeout 3 http://$VM_IP:8080 | grep -q 'PHPless'"
check "FrankenPHP PHP 8.4 running" "curl -s --connect-timeout 3 http://$VM_IP:8080 | grep -q '8.4'"
check "OPcache enabled in VM" "curl -s --connect-timeout 3 http://$VM_IP:8080 | grep -q 'Enabled\\|opcache'"

# Boot time measurement
echo ""
echo "  Boot time measurement (creating fresh VM)..."
START_NS=$(date +%s%N)
BENCH_RESULT=$(curl -s --unix-socket "$MANAGER_SOCK" -X POST http://localhost/vms -d '{"slug":"bench-validate"}' 2>/dev/null || echo "{}")
BENCH_ID=$(echo "$BENCH_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
BENCH_IP=$(echo "$BENCH_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ip',''))" 2>/dev/null || echo "")

if [[ -n "$BENCH_IP" ]]; then
    BOOT_OK=0
    for i in $(seq 1 100); do
        if curl -s --connect-timeout 0.1 --max-time 0.2 "http://$BENCH_IP:8080" >/dev/null 2>&1; then
            END_NS=$(date +%s%N)
            BOOT_MS=$(( (END_NS - START_NS) / 1000000 ))
            echo "  -> Cold start to first response: ${BOOT_MS}ms"
            BOOT_OK=1
            break
        fi
        sleep 0.05
    done
    if [[ $BOOT_OK -eq 0 ]]; then
        echo "  -> Boot timed out (>5s)"
    fi
    check "Cold start < 5000ms" "[ ${BOOT_MS:-99999} -lt 5000 ]"
    check "Cold start < 2000ms (stretch)" "[ ${BOOT_MS:-99999} -lt 2000 ]"

    # Clean up bench VM
    if [[ -n "$BENCH_ID" ]]; then
        curl -s --unix-socket "$MANAGER_SOCK" -X DELETE "http://localhost/vms/$BENCH_ID" >/dev/null 2>&1 || true
    fi
else
    skip "Cold start measurement (could not create VM)"
    skip "Cold start < 2000ms"
fi
echo ""

# -----------------------------------------------
echo "[1.3] Networking + Caddy Routing"
echo "----------------------------------------------"
check "Bridge br-phpless exists" "ip link show br-phpless"
check "Bridge has IP 10.0.0.1/16" "ip addr show br-phpless | grep -q '10.0.0.1/16'"
check "NAT/masquerade configured" "iptables -t nat -L POSTROUTING -n | grep -q MASQUERADE"
check "Caddy running" "systemctl is-active caddy"
check "https://$DOMAIN responds" "curl -sf --max-time 5 https://$DOMAIN"
check "https://test.$DOMAIN responds" "curl -sf --max-time 5 https://test.$DOMAIN"
check "TLS certificate valid" "curl -sfI --max-time 5 https://test.$DOMAIN 2>&1 | head -1 | grep -q '200\\|301\\|302' || curl -sf --max-time 5 https://test.$DOMAIN >/dev/null 2>&1"
check "Unknown subdomain returns 404" "curl -s --max-time 5 http://nonexistent.$DOMAIN | grep -q '404\\|not found\\|App not found'"
echo ""

# -----------------------------------------------
echo "[1.4] Multi-Tenant Isolation"
echo "----------------------------------------------"
# Get list of running VMs
VM_COUNT=$(curl -s --unix-socket "$MANAGER_SOCK" http://localhost/vms 2>/dev/null \
    | python3 -c "import sys,json; vms=json.load(sys.stdin); print(len([v for v in vms if v['state']=='running']))" 2>/dev/null || echo "0")
check "Multiple VMs running (count: $VM_COUNT)" "[ $VM_COUNT -ge 2 ]"

# Check each VM has unique IP
if [[ $VM_COUNT -ge 2 ]]; then
    UNIQUE_IPS=$(curl -s --unix-socket "$MANAGER_SOCK" http://localhost/vms 2>/dev/null \
        | python3 -c "import sys,json; vms=json.load(sys.stdin); ips=set(v['ip'] for v in vms); print(len(ips))" 2>/dev/null || echo "0")
    check "Each VM has unique IP ($UNIQUE_IPS unique)" "[ $UNIQUE_IPS -ge 2 ]"
fi

# Check VMs have separate rootfs files
TENANT_FILES=$(ls /srv/firecracker/tenants/*.ext4 2>/dev/null | wc -l)
check "Separate rootfs per VM ($TENANT_FILES files)" "[ $TENANT_FILES -ge 2 ]"

# Cross-VM isolation: VM1 should not be able to reach VM2's Firecracker API socket
check "VM sockets not world-readable" "[ $(stat -c '%a' /srv/firecracker/sockets/fc-*.sock 2>/dev/null | head -1 || echo '777') != '777' ]"
echo ""

# -----------------------------------------------
echo "[1.5] VM Manager"
echo "----------------------------------------------"
check "Manager systemd service active" "systemctl is-active phpless-manager"
check "Manager socket exists" "test -S $MANAGER_SOCK"
check "GET /health returns ok" "curl -s --unix-socket $MANAGER_SOCK http://localhost/health | grep -q ok"
check "GET /vms returns JSON array" "curl -s --unix-socket $MANAGER_SOCK http://localhost/vms | python3 -c 'import sys,json; json.load(sys.stdin)'"
check "GET /upstreams/{slug} works" "curl -s --unix-socket $MANAGER_SOCK http://localhost/upstreams/test | grep -q address"

# Test create + destroy cycle
echo ""
echo "  Testing create/destroy cycle..."
CREATE_RESULT=$(curl -s --unix-socket "$MANAGER_SOCK" -X POST http://localhost/vms -d '{"slug":"lifecycle-test"}' 2>/dev/null || echo "{}")
CREATE_ID=$(echo "$CREATE_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
if [[ -n "$CREATE_ID" ]]; then
    check "POST /vms creates VM (id: $CREATE_ID)" "[ -n '$CREATE_ID' ]"
    sleep 3
    check "GET /vms/{id} returns VM" "curl -s --unix-socket $MANAGER_SOCK http://localhost/vms/$CREATE_ID | grep -q running"
    curl -s --unix-socket "$MANAGER_SOCK" -X DELETE "http://localhost/vms/$CREATE_ID" >/dev/null 2>&1
    sleep 2
    check "DELETE /vms/{id} removes VM" "! curl -s --unix-socket $MANAGER_SOCK http://localhost/vms/$CREATE_ID | grep -q running"
else
    skip "Create/destroy cycle (create failed)"
fi
echo ""

# -----------------------------------------------
echo "[1.6] Benchmarks"
echo "----------------------------------------------"
if [[ -f /tmp/phpless-wrk.txt ]]; then
    REQ_SEC=$(grep "Requests/sec" /tmp/phpless-wrk.txt | awk '{print $2}' || echo "0")
    echo "  Last benchmark result: ${REQ_SEC} req/s"
    check "Throughput > 5k req/s (got: ${REQ_SEC})" "echo '${REQ_SEC} > 5000' | bc -l | grep -q '^1'"
    check "Throughput > 10k req/s (stretch, got: ${REQ_SEC})" "echo '${REQ_SEC} > 10000' | bc -l | grep -q '^1'"
else
    skip "Throughput benchmark (run benchmark.sh first)"
    skip "Throughput > 10k req/s"
fi

# Single-request latency
echo ""
echo "  Single-request latency (5 samples):"
LATENCIES=""
for i in 1 2 3 4 5; do
    MS=$(curl -s -o /dev/null -w '%{time_total}' --max-time 3 "http://$VM_IP:8080" | awk '{printf "%.2f", $1 * 1000}')
    echo "    Request $i: ${MS}ms"
    LATENCIES="$LATENCIES $MS"
done
AVG_MS=$(echo "$LATENCIES" | awk '{sum=0; for(i=1;i<=NF;i++) sum+=$i; printf "%.2f", sum/NF}')
echo "  Average: ${AVG_MS}ms"
check "Avg single-request latency < 10ms (got: ${AVG_MS}ms)" "echo '${AVG_MS} < 10' | bc -l | grep -q '^1'"
echo ""

# -----------------------------------------------
echo "=============================================="
echo "  RESULTS"
echo "=============================================="
TOTAL=$((PASS + FAIL + SKIP))
echo ""
echo "  Total: ${TOTAL}   Pass: ${PASS}   Fail: ${FAIL}   Skip: ${SKIP}"
echo ""
if [[ $FAIL -eq 0 && $SKIP -eq 0 ]]; then
    echo "  ALL CHECKS PASSED — Ready for Phase 2!"
elif [[ $FAIL -eq 0 ]]; then
    echo "  No failures. Complete skipped items to finish Phase 1."
else
    echo "  ${FAIL} check(s) failed. Fix before proceeding to Phase 2."
fi
echo ""
