#!/usr/bin/env bash
# Starts the 9 SFMC services in background (after running migrations).
# Writes PIDs to /tmp/sfmc-pids. Intended for CI and local verification.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIDFILE="/tmp/sfmc-pids"
: > "$PIDFILE"

SERVICES=(
  "auth-service:3001:sfmc_auth"
  "user-service:3002:sfmc_user"
  "product-service:3003:sfmc_product"
  "inventory-service:3004:sfmc_inventory"
  "order-service:3005:sfmc_order"
  "production-service:3006:sfmc_production"
  "billing-service:3007:sfmc_billing"
  "notification-service:3008:sfmc_notification"
  "reporting-service:3009:sfmc_reporting"
)

start_one() {
  local svc="$1"; local port="$2"; local db="$3"
  local dir="$ROOT/services/$svc"
  echo "[start] $svc on port $port"
  (
    cd "$dir"
    node ace migration:run --force >/tmp/${svc}-migrate.log 2>&1 || true
    PORT=$port DB_DATABASE=$db node ace serve >/tmp/${svc}.log 2>&1 &
    echo "$svc:$!" >> "$PIDFILE"
  )
}

for spec in "${SERVICES[@]}"; do
  IFS=":" read -r svc port db <<< "$spec"
  start_one "$svc" "$port" "$db"
done

echo "[wait] giving services up to 60s to warm up"
for i in $(seq 1 30); do
  ok=0
  for spec in "${SERVICES[@]}"; do
    IFS=":" read -r _ port _ <<< "$spec"
    curl -fsS -m 1 "http://localhost:$port/health" >/dev/null 2>&1 && ok=$((ok+1)) || true
  done
  echo "  ready: $ok/9"
  [ "$ok" -eq 9 ] && exit 0
  sleep 2
done

echo "[warn] not all services came up within 60s — continuing anyway"
exit 0
