#!/usr/bin/env bash
# benchmark.sh — Run PHPless engine benchmarks
set -euo pipefail

MANAGER_SOCK="/var/fc/manager.sock"

# Find a running VM from the manager
VM_IP="${1:-}"
if [[ -z "$VM_IP" ]] && [[ -S "$MANAGER_SOCK" ]]; then
    VM_IP=$(curl -s --unix-socket "$MANAGER_SOCK" http://localhost/vms 2>/dev/null \
        | python3 -c "import sys,json; vms=json.load(sys.stdin); running=[v for v in vms if v['state']=='running']; print(running[0]['ip'] if running else '')" 2>/dev/null || echo "")
fi
VM_IP="${VM_IP:-10.0.1.2}"
VM_PORT="${2:-8080}"
URL="http://${VM_IP}:${VM_PORT}"

echo "=============================================="
echo "  PHPless Engine Benchmark Suite"
echo "=============================================="
echo "  Target:  ${URL}"
echo "  Date:    $(date -u)"
echo "  Host:    $(hostname)"
echo "  CPUs:    $(nproc)"
echo "  RAM:     $(free -h | awk '/Mem:/{print $2}')"
echo ""

# Check wrk is installed
if ! command -v wrk &>/dev/null; then
    echo "Installing wrk..."
    apt-get install -y wrk >/dev/null 2>&1 || {
        echo "Error: wrk not found and cannot install" >&2
        exit 1
    }
fi

# 1. Connectivity check
echo "--- [1/7] Connectivity ---"
RESPONSE=$(curl -s --connect-timeout 3 "${URL}" 2>/dev/null || echo "UNREACHABLE")
if echo "$RESPONSE" | grep -q "PHPless"; then
    echo "  Reachable: YES"
    PHP_VER=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['info']['php'])" 2>/dev/null || echo "unknown")
    SAPI=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['info']['sapi'])" 2>/dev/null || echo "unknown")
    echo "  PHP:       $PHP_VER"
    echo "  SAPI:      $SAPI"
else
    echo "  Error: Cannot reach ${URL}" >&2
    exit 1
fi
echo ""

# 2. Single-request latency
echo "--- [2/7] Single Request Latency (10 samples) ---"
TOTAL_MS=0
MIN_MS=999999
MAX_MS=0
for i in $(seq 1 10); do
    TIME_US=$(curl -s -o /dev/null -w '%{time_total}' "${URL}" | awk '{printf "%.0f", $1 * 1000000}')
    TIME_MS=$(echo "$TIME_US" | awk '{printf "%.2f", $1/1000}')
    printf "  Request %2d: %7sms\n" "$i" "$TIME_MS"
    TOTAL_MS=$(echo "$TOTAL_MS + $TIME_MS" | bc)
    if (( $(echo "$TIME_MS < $MIN_MS" | bc -l) )); then MIN_MS=$TIME_MS; fi
    if (( $(echo "$TIME_MS > $MAX_MS" | bc -l) )); then MAX_MS=$TIME_MS; fi
done
AVG_MS=$(echo "scale=2; $TOTAL_MS / 10" | bc)
echo "  ─────────────────────────"
echo "  Min: ${MIN_MS}ms  Avg: ${AVG_MS}ms  Max: ${MAX_MS}ms"
echo ""

# 3. Throughput warmup
echo "--- [3/7] Warmup (5s) ---"
wrk -t2 -c20 -d5s "${URL}" 2>&1 | grep "Requests/sec"
echo ""

# 4. Light load
echo "--- [4/7] Light Load (10s, 2 threads, 10 connections) ---"
wrk -t2 -c10 -d10s --latency "${URL}" 2>&1 | tee /tmp/phpless-wrk-light.txt
echo ""

# 5. Medium load
echo "--- [5/7] Medium Load (10s, 4 threads, 100 connections) ---"
wrk -t4 -c100 -d10s --latency "${URL}" 2>&1 | tee /tmp/phpless-wrk.txt
echo ""

# 6. Heavy load
echo "--- [6/7] Heavy Load (30s, 4 threads, 200 connections) ---"
wrk -t4 -c200 -d30s --latency "${URL}" 2>&1 | tee /tmp/phpless-wrk-heavy.txt
echo ""

# 7. Resource usage
echo "--- [7/7] Resource Usage ---"

# Firecracker processes
echo "  Firecracker processes:"
ps aux | grep '[f]irecracker' | while read line; do
    PID=$(echo "$line" | awk '{print $2}')
    RSS_MB=$(echo "$line" | awk '{printf "%.0f", $6/1024}')
    VSZ_MB=$(echo "$line" | awk '{printf "%.0f", $5/1024}')
    CPU=$(echo "$line" | awk '{print $3}')
    echo "    PID $PID: RSS=${RSS_MB}MB  VSZ=${VSZ_MB}MB  CPU=${CPU}%"
done

echo ""
echo "  Host memory:"
free -h | grep -E "Mem:|Swap:"
echo ""

# VM count
VM_COUNT=$(curl -s --unix-socket "$MANAGER_SOCK" http://localhost/vms 2>/dev/null \
    | python3 -c "import sys,json; vms=json.load(sys.stdin); print(len([v for v in vms if v['state']=='running']))" 2>/dev/null || echo "?")
echo "  Running VMs: $VM_COUNT"
echo ""

# Summary
echo "=============================================="
echo "  SUMMARY"
echo "=============================================="
LIGHT_RPS=$(grep "Requests/sec" /tmp/phpless-wrk-light.txt 2>/dev/null | awk '{print $2}' || echo "?")
MED_RPS=$(grep "Requests/sec" /tmp/phpless-wrk.txt 2>/dev/null | awk '{print $2}' || echo "?")
HEAVY_RPS=$(grep "Requests/sec" /tmp/phpless-wrk-heavy.txt 2>/dev/null | awk '{print $2}' || echo "?")
HEAVY_P99=$(grep "99%" /tmp/phpless-wrk-heavy.txt 2>/dev/null | awk '{print $2}' || echo "?")

echo ""
echo "  Single request:   Min ${MIN_MS}ms / Avg ${AVG_MS}ms / Max ${MAX_MS}ms"
echo "  Light (10 conn):  ${LIGHT_RPS} req/s"
echo "  Medium (100 conn): ${MED_RPS} req/s"
echo "  Heavy (200 conn):  ${HEAVY_RPS} req/s"
echo "  Heavy p99 latency: ${HEAVY_P99}"
echo ""

# Targets
echo "  Targets:"
if (( $(echo "${MED_RPS} > 10000" | bc -l 2>/dev/null || echo 0) )); then
    echo "    >10k req/s:  PASS (${MED_RPS})"
elif (( $(echo "${MED_RPS} > 5000" | bc -l 2>/dev/null || echo 0) )); then
    echo "    >10k req/s:  BELOW TARGET (${MED_RPS}) but >5k"
else
    echo "    >10k req/s:  FAIL (${MED_RPS})"
fi
echo "    <10ms p99:   $(if [[ "$HEAVY_P99" != "?" ]]; then echo "${HEAVY_P99}"; else echo "N/A"; fi)"
echo ""
echo "  Results saved to /tmp/phpless-wrk*.txt"
echo ""
