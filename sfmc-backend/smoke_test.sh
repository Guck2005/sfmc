#!/usr/bin/env bash
# =====================================================================
# SFMC Backend — End-to-end smoke test (Linux / CI version)
# Bash equivalent of smoke_test_sprint4.ps1 for GitHub Actions runners.
# =====================================================================
set -euo pipefail

PASS=0
FAIL=0
REPORT=()

assert() {
  local cond="$1"; local label="$2"
  if [ "$cond" = "true" ]; then
    echo "    -> $label : PASS"
    REPORT+=("PASS  $label")
    PASS=$((PASS+1))
  else
    echo "    -> $label : FAIL"
    REPORT+=("FAIL  $label")
    FAIL=$((FAIL+1))
  fi
}

SERVICES=(
  "auth:3001:false"
  "user:3002:false"
  "product:3003:false"
  "inventory:3004:true"
  "order:3005:true"
  "production:3006:true"
  "billing:3007:true"
  "notification:3008:true"
  "reporting:3009:true"
)

wait_for_http() {
  local url="$1"; local retries="${2:-60}"
  for i in $(seq 1 "$retries"); do
    if curl -fsS -m 2 "$url" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}

echo "[*] 1. Health checks enrichis"
for svc in "${SERVICES[@]}"; do
  name="${svc%%:*}"; rest="${svc#*:}"; port="${rest%%:*}"; rabbit="${rest#*:}"
  if wait_for_http "http://localhost:${port}/health" 90; then
    body=$(curl -fsS "http://localhost:${port}/health")
    if echo "$body" | grep -q '"status":"ok"'; then
      assert true "Health ${name} status=ok"
    else
      assert false "Health ${name} status=ok"
    fi
    echo "$body" | grep -q '"database":"ok"' \
      && assert true "Health ${name} DB=ok" \
      || assert false "Health ${name} DB=ok"
    if [ "$rabbit" = "true" ]; then
      echo "$body" | grep -q '"rabbitmq":"ok"' \
        && assert true "Health ${name} RabbitMQ=ok" \
        || assert false "Health ${name} RabbitMQ=ok"
    fi
  else
    assert false "Health ${name} (port ${port}) unreachable"
  fi
done

echo "[*] 2. OWASP headers on auth-service"
headers=$(curl -fsSI http://localhost:3001/health)
echo "$headers" | grep -qi "x-frame-options: DENY" \
  && assert true "Header X-Frame-Options=DENY" \
  || assert false "Header X-Frame-Options=DENY"
echo "$headers" | grep -qi "x-content-type-options: nosniff" \
  && assert true "Header X-Content-Type-Options=nosniff" \
  || assert false "Header X-Content-Type-Options=nosniff"
echo "$headers" | grep -qi "content-security-policy" \
  && assert true "Header CSP present" \
  || assert false "Header CSP present"

echo "[*] 3. Rate-limit /login (Redis-backed, expects 429 before 8 hits)"
throttled=false
for i in 1 2 3 4 5 6 7 8; do
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST -H "Content-Type: application/json" \
    -d '{"email":"nobody@test.local","password":"bad"}' \
    http://localhost:3001/api/v1/auth/login)
  if [ "$code" = "429" ]; then throttled=true; break; fi
done
[ "$throttled" = "true" ] && assert true "Rate limit 429 triggered" || assert false "Rate limit 429 triggered"

echo ""
echo "============================="
echo "RAPPORT SMOKE TEST"
echo "============================="
for line in "${REPORT[@]}"; do echo "$line"; done
echo "============================="
echo "PASS=$PASS  FAIL=$FAIL"

[ "$FAIL" -eq 0 ]
