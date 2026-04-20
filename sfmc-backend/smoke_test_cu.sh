#!/usr/bin/env bash
# =============================================================================
# SFMC Bénin — Smoke test CU-01 / CU-02 / CU-03 + Sécurité (28 assertions)
# =============================================================================
# Pré-requis : la stack complète est démarrée et accessible sur :
#   auth 3001  user 3002  product 3003  inventory 3004  order 3005
#   production 3006  billing 3007  notification 3008  reporting 3009
#   rabbitmq 5672  postgres (par service)
#
# Outillage requis : bash, curl, jq
# Sortie : affichage console + fichier smoke_report.txt (1 ligne/assertion)
# Code de sortie : 0 si 28/28 PASS, 1 sinon.
# =============================================================================

set -uo pipefail

PASS=0
FAIL=0
REPORT=()
REPORT_FILE="${SMOKE_REPORT_FILE:-smoke_report.txt}"

AUTH_URL="${AUTH_URL:-http://localhost:3001}"
USER_URL="${USER_URL:-http://localhost:3002}"
INVENTORY_URL="${INVENTORY_URL:-http://localhost:3004}"
ORDER_URL="${ORDER_URL:-http://localhost:3005}"
PRODUCTION_URL="${PRODUCTION_URL:-http://localhost:3006}"
BILLING_URL="${BILLING_URL:-http://localhost:3007}"
NOTIFICATION_URL="${NOTIFICATION_URL:-http://localhost:3008}"

ADMIN_EMAIL="${ADMIN_EMAIL:-admin@sfmc.bj}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin@2026}"
CLIENT_EMAIL="${CLIENT_EMAIL:-client@sfmc.bj}"
CLIENT_PASSWORD="${CLIENT_PASSWORD:-Client@2026}"

color_green='\033[32m'
color_red='\033[31m'
color_reset='\033[0m'

assert() {
  local cond="$1"
  local label="$2"
  if [ "$cond" = "true" ]; then
    printf "  ${color_green}PASS${color_reset}  %s\n" "$label"
    REPORT+=("PASS  $label")
    PASS=$((PASS + 1))
  else
    printf "  ${color_red}FAIL${color_reset}  %s\n" "$label"
    REPORT+=("FAIL  $label")
    FAIL=$((FAIL + 1))
  fi
}

jqval() { echo "$1" | jq -r "$2" 2>/dev/null || echo "null"; }

http_code() {
  curl -s -o /dev/null -w "%{http_code}" "$@"
}

wait_ms() {
  local ms="$1"
  local s
  s=$(awk "BEGIN {printf \"%.2f\", $ms / 1000}")
  sleep "$s"
}

login() {
  local email="$1"
  local password="$2"
  curl -sS -X POST -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$password\"}" \
    "$AUTH_URL/api/v1/auth/login"
}

# =============================================================================
# Section 0 — Préparation : reset rate-limit + login admin + produit disponible
# =============================================================================
echo ""
echo "=== Préparation ==="
# Best-effort : purge des clés de rate-limit pour éviter 429 sur les runs répétés
REDIS_CONTAINER="$(docker ps --filter "name=sfmc-redis" --format '{{.Names}}' 2>/dev/null | head -n 1 || true)"
if [ -n "$REDIS_CONTAINER" ]; then
  docker exec "$REDIS_CONTAINER" redis-cli EVAL \
    "for _,k in ipairs(redis.call('keys','ratelimit:login:*')) do redis.call('del',k) end" 0 \
    >/dev/null 2>&1 || true
  echo "  (rate-limit Redis purgé via $REDIS_CONTAINER)"
fi

LOGIN_BODY="$(login "$ADMIN_EMAIL" "$ADMIN_PASSWORD" || true)"
ADMIN_TOKEN="$(jqval "$LOGIN_BODY" '.data.accessToken // .accessToken // empty')"
if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
  echo "!! Impossible de se connecter en admin ($ADMIN_EMAIL) — arrêt avant assertions"
  exit 2
fi

STOCKS="$(curl -sS "$INVENTORY_URL/api/v1/stocks")"
PRODUCT_ID="$(echo "$STOCKS" | jq -r '(.data // .)[] | select(.stockType=="FINISHED_PRODUCT" and (.quantity|tonumber) - (.reserved|tonumber) >= 1) | .productId' | head -n 1)"
if [ -z "$PRODUCT_ID" ] || [ "$PRODUCT_ID" = "null" ]; then
  echo "!! Aucun produit FINISHED_PRODUCT avec stock > 0 — certaines assertions seront FAIL"
fi

# =============================================================================
# Section 1 — Health checks profonds (9 assertions)
# =============================================================================
echo ""
echo "=== 1. Health checks (9) ==="
for svc in "auth:$AUTH_URL" "user:$USER_URL" "product:http://localhost:3003" \
           "inventory:$INVENTORY_URL" "order:$ORDER_URL" \
           "production:$PRODUCTION_URL" "billing:$BILLING_URL" \
           "notification:$NOTIFICATION_URL" "reporting:http://localhost:3009"; do
  name="${svc%%:*}"
  url="${svc#*:}"
  body="$(curl -sS -m 5 "$url/health" || true)"
  if echo "$body" | grep -q '"status":"ok"'; then
    assert true "Health $name=ok"
  else
    assert false "Health $name=ok"
  fi
done

# =============================================================================
# Section 2 — Sécurité OWASP + rate limiting (4 assertions)
# =============================================================================
echo ""
echo "=== 2. Sécurité (4) ==="
HEADERS="$(curl -sSI "$AUTH_URL/health")"
echo "$HEADERS" | grep -qi "x-frame-options: DENY" \
  && assert true "Header X-Frame-Options=DENY" \
  || assert false "Header X-Frame-Options=DENY"
echo "$HEADERS" | grep -qi "x-content-type-options: nosniff" \
  && assert true "Header X-Content-Type-Options=nosniff" \
  || assert false "Header X-Content-Type-Options=nosniff"
echo "$HEADERS" | grep -qi "content-security-policy" \
  && assert true "Header CSP présent" \
  || assert false "Header CSP présent"

throttled=false
for i in 1 2 3 4 5 6 7 8 9 10; do
  code="$(http_code -X POST -H "Content-Type: application/json" \
    -d '{"email":"nobody@test.local","password":"bad"}' \
    "$AUTH_URL/api/v1/auth/login")"
  if [ "$code" = "429" ]; then throttled=true; break; fi
done
$throttled && assert true "Rate limit /auth/login → 429" \
          || assert false "Rate limit /auth/login → 429"

# =============================================================================
# Section 3 — CU-01 : création commande (7 assertions)
# =============================================================================
echo ""
echo "=== 3. CU-01 Création commande (7) ==="
CUSTOMER_ID="$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)"

if [ -n "$PRODUCT_ID" ] && [ "$PRODUCT_ID" != "null" ]; then
  CREATE_ORDER_PAYLOAD=$(jq -n --arg cid "$CUSTOMER_ID" --arg pid "$PRODUCT_ID" \
    '{customerId:$cid, lines:[{productId:$pid, quantity:1, unitPrice:2500}]}')
  ORDER_RESP="$(curl -sS -w "\n%{http_code}" -X POST \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$CREATE_ORDER_PAYLOAD" \
    "$ORDER_URL/api/v1/orders")"
  ORDER_CODE="$(echo "$ORDER_RESP" | tail -n 1)"
  ORDER_BODY="$(echo "$ORDER_RESP" | sed '$d')"
  ORDER_ID="$(jqval "$ORDER_BODY" '.data.id // empty')"
  INITIAL_STATUS="$(jqval "$ORDER_BODY" '.data.status // empty')"
else
  ORDER_CODE="000"
  ORDER_ID=""
  INITIAL_STATUS=""
fi

[ "$ORDER_CODE" = "201" ] \
  && assert true "CU-01 #1 POST /orders → 201" \
  || assert false "CU-01 #1 POST /orders → 201 (obtenu $ORDER_CODE)"

[ "$INITIAL_STATUS" = "PENDING" ] \
  && assert true "CU-01 #2 Order initial status=PENDING" \
  || assert false "CU-01 #2 Order initial status=PENDING (obtenu $INITIAL_STATUS)"

wait_ms 3500

if [ -n "$ORDER_ID" ]; then
  GET_ORDER="$(curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" "$ORDER_URL/api/v1/orders/$ORDER_ID")"
  FINAL_STATUS="$(jqval "$GET_ORDER" '.data.status // empty')"
else
  FINAL_STATUS=""
fi

[ "$FINAL_STATUS" = "VALIDATED" ] \
  && assert true "CU-01 #3 Order après saga → VALIDATED" \
  || assert false "CU-01 #3 Order après saga → VALIDATED (obtenu $FINAL_STATUS)"

# Facture PENDING côté billing
if [ -n "$ORDER_ID" ]; then
  INVOICES="$(curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" \
    "$BILLING_URL/api/v1/invoices?orderId=$ORDER_ID&limit=5")"
  INVOICE_COUNT="$(jqval "$INVOICES" '(.data // []) | length')"
  INVOICE_STATUS="$(jqval "$INVOICES" '(.data // [])[0].status // empty')"
  INVOICE_AMOUNT="$(jqval "$INVOICES" '(.data // [])[0].amount // empty')"
else
  INVOICE_COUNT="0"
  INVOICE_STATUS=""
  INVOICE_AMOUNT=""
fi

[ "$INVOICE_COUNT" != "0" ] \
  && assert true "CU-01 #4 Billing: facture créée pour l'order" \
  || assert false "CU-01 #4 Billing: facture créée pour l'order"

[ "$INVOICE_STATUS" = "PENDING" ] \
  && assert true "CU-01 #5 Billing: facture.status=PENDING" \
  || assert false "CU-01 #5 Billing: facture.status=PENDING (obtenu $INVOICE_STATUS)"

[ "$(awk "BEGIN {print ($INVOICE_AMOUNT == 2500)}")" = "1" ] \
  && assert true "CU-01 #6 Billing: montant=2500" \
  || assert false "CU-01 #6 Billing: montant=2500 (obtenu $INVOICE_AMOUNT)"

# Notification EMAIL ORDER_VALIDATED
NOTIFS="$(curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$NOTIFICATION_URL/api/v1/notifications?type=ORDER_VALIDATED&limit=5")"
NOTIF_CHANNEL="$(jqval "$NOTIFS" '(.data // [])[0].channel // empty')"

[ "$NOTIF_CHANNEL" = "EMAIL" ] \
  && assert true "CU-01 #7 Notification ORDER_VALIDATED channel=EMAIL" \
  || assert false "CU-01 #7 Notification ORDER_VALIDATED channel=EMAIL (obtenu $NOTIF_CHANNEL)"

# =============================================================================
# Section 4 — CU-02 : production completed → stock update (5 assertions)
# =============================================================================
echo ""
echo "=== 4. CU-02 Production (5) ==="

total_finished() {
  local pid="$1"
  curl -sS "$INVENTORY_URL/api/v1/stocks?productId=$pid" \
    | jq '[(.data // [])[] | select(.stockType=="FINISHED_PRODUCT") | (.quantity|tonumber)] | add // 0'
}

if [ -n "$PRODUCT_ID" ] && [ "$PRODUCT_ID" != "null" ]; then
  QTY_BEFORE="$(total_finished "$PRODUCT_ID")"

  PO_ORDER_REF="$ORDER_ID"
  if [ -z "$PO_ORDER_REF" ]; then
    PO_ORDER_REF="$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)"
  fi
  PO_PAYLOAD=$(jq -n --arg pid "$PRODUCT_ID" --arg oid "$PO_ORDER_REF" \
    '{productId:$pid, quantity:3, orderId:$oid}')
  PO_RESP="$(curl -sS -w "\n%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d "$PO_PAYLOAD" \
    "$PRODUCTION_URL/api/v1/production-orders")"
  PO_CODE="$(echo "$PO_RESP" | tail -n 1)"
  PO_BODY="$(echo "$PO_RESP" | sed '$d')"
  PO_ID="$(jqval "$PO_BODY" '.data.id // empty')"
else
  QTY_BEFORE="0"
  PO_CODE="000"
  PO_ID=""
fi

[ "$PO_CODE" = "201" ] \
  && assert true "CU-02 #1 POST /production-orders → 201" \
  || assert false "CU-02 #1 POST /production-orders → 201 (obtenu $PO_CODE)"

if [ -n "$PO_ID" ]; then
  curl -sS -X PUT -H "Content-Type: application/json" \
    -d '{"status":"IN_PROGRESS"}' \
    "$PRODUCTION_URL/api/v1/production-orders/$PO_ID/status" >/dev/null || true
  curl -sS -X PUT -H "Content-Type: application/json" \
    -d '{"status":"QUALITY_CHECK"}' \
    "$PRODUCTION_URL/api/v1/production-orders/$PO_ID/status" >/dev/null || true

  QC_CODE="$(http_code -X POST -H "Content-Type: application/json" \
    -d '{"passed":true}' \
    "$PRODUCTION_URL/api/v1/production-orders/$PO_ID/quality")"
else
  QC_CODE="000"
fi

[ "$QC_CODE" = "200" ] \
  && assert true "CU-02 #2 Quality control pass → 200" \
  || assert false "CU-02 #2 Quality control pass → 200 (obtenu $QC_CODE)"

wait_ms 3500

if [ -n "$PO_ID" ]; then
  GET_PO="$(curl -sS "$PRODUCTION_URL/api/v1/production-orders/$PO_ID")"
  PO_STATUS="$(jqval "$GET_PO" '.data.status // empty')"
else
  PO_STATUS=""
fi

[ "$PO_STATUS" = "COMPLETED" ] \
  && assert true "CU-02 #3 OF final status=COMPLETED" \
  || assert false "CU-02 #3 OF final status=COMPLETED (obtenu $PO_STATUS)"

QTY_AFTER="0"
if [ -n "$PRODUCT_ID" ] && [ "$PRODUCT_ID" != "null" ]; then
  for i in 1 2 3 4 5; do
    QTY_AFTER="$(total_finished "$PRODUCT_ID")"
    if [ "$(awk "BEGIN {print ($QTY_AFTER > $QTY_BEFORE)}")" = "1" ]; then break; fi
    wait_ms 1500
  done
fi

[ "$(awk "BEGIN {print ($QTY_AFTER > $QTY_BEFORE)}")" = "1" ] \
  && assert true "CU-02 #4 Stock produit fini augmenté après production" \
  || assert false "CU-02 #4 Stock produit fini augmenté (avant=$QTY_BEFORE, après=$QTY_AFTER)"

# Notification PRODUCTION_COMPLETED logistique
PROD_NOTIFS="$(curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$NOTIFICATION_URL/api/v1/notifications?type=PRODUCTION_COMPLETED&limit=5")"
PROD_NOTIF_COUNT="$(jqval "$PROD_NOTIFS" '(.data // []) | length')"

[ "$PROD_NOTIF_COUNT" != "0" ] \
  && assert true "CU-02 #5 Notification PRODUCTION_COMPLETED émise" \
  || assert false "CU-02 #5 Notification PRODUCTION_COMPLETED émise"

# =============================================================================
# Section 5 — CU-03 : alerte stock critique (3 assertions)
# =============================================================================
echo ""
echo "=== 5. CU-03 Alerte stock critique (3) ==="

BASELINE_CRIT="$(curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$NOTIFICATION_URL/api/v1/notifications?type=CRITICAL_STOCK&limit=50")"
BASELINE_COUNT="$(jqval "$BASELINE_CRIT" '(.data // []) | length')"

if [ -n "$PRODUCT_ID" ] && [ "$PRODUCT_ID" != "null" ]; then
  STOCK_INFO="$(curl -sS "$INVENTORY_URL/api/v1/stocks?productId=$PRODUCT_ID")"
  STOCK_ID="$(jqval "$STOCK_INFO" '(.data // [])[0].id // empty')"
  STOCK_Q="$(jqval "$STOCK_INFO" '(.data // [])[0].quantity // 0')"
  STOCK_R="$(jqval "$STOCK_INFO" '(.data // [])[0].reserved // 0')"
  STOCK_T_ORIG="$(jqval "$STOCK_INFO" '(.data // [])[0].threshold // 0')"
  AVAIL=$((STOCK_Q - STOCK_R))
  NEW_THRESHOLD=$((AVAIL + 10))

  TH_CODE="$(http_code -X PUT -H "Content-Type: application/json" \
    -d "{\"threshold\":$NEW_THRESHOLD}" \
    "$INVENTORY_URL/api/v1/stocks/$STOCK_ID/threshold")"

  MV_PAYLOAD=$(jq -n --arg sid "$STOCK_ID" \
    '{stockId:$sid, type:"OUT", quantity:1, origin:"smoke_cu03"}')
  MV_CODE="$(http_code -X POST -H "Content-Type: application/json" \
    -d "$MV_PAYLOAD" \
    "$INVENTORY_URL/api/v1/stocks/movements")"
else
  TH_CODE="000"
  MV_CODE="000"
  STOCK_ID=""
  STOCK_T_ORIG="0"
fi

[ "$TH_CODE" = "200" ] \
  && assert true "CU-03 #1 PUT threshold → 200" \
  || assert false "CU-03 #1 PUT threshold → 200 (obtenu $TH_CODE)"

[ "$MV_CODE" = "201" ] \
  && assert true "CU-03 #2 POST mouvement OUT → 201" \
  || assert false "CU-03 #2 POST mouvement OUT → 201 (obtenu $MV_CODE)"

wait_ms 4000

CRIT_AFTER="$(curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$NOTIFICATION_URL/api/v1/notifications?type=CRITICAL_STOCK&limit=50")"
CRIT_COUNT_AFTER="$(jqval "$CRIT_AFTER" '(.data // []) | length')"

[ "$(awk "BEGIN {print ($CRIT_COUNT_AFTER > $BASELINE_COUNT)}")" = "1" ] \
  && assert true "CU-03 #3 Notification CRITICAL_STOCK déclenchée" \
  || assert false "CU-03 #3 Notification CRITICAL_STOCK déclenchée (avant=$BASELINE_COUNT, après=$CRIT_COUNT_AFTER)"

# Rollback best-effort
if [ -n "$STOCK_ID" ]; then
  curl -sS -X PUT -H "Content-Type: application/json" \
    -d "{\"threshold\":$STOCK_T_ORIG}" \
    "$INVENTORY_URL/api/v1/stocks/$STOCK_ID/threshold" >/dev/null 2>&1 || true
  curl -sS -X POST -H "Content-Type: application/json" \
    -d "$(jq -n --arg sid "$STOCK_ID" '{stockId:$sid,type:"IN",quantity:1,origin:"smoke_cu03_rollback"}')" \
    "$INVENTORY_URL/api/v1/stocks/movements" >/dev/null 2>&1 || true
fi

# =============================================================================
# Rapport final
# =============================================================================
echo ""
echo "============================="
echo "RAPPORT SMOKE CU-01/02/03 + Sécurité"
echo "============================="
{
  echo "SFMC Bénin — Smoke test CU-01 / CU-02 / CU-03 + Sécurité"
  echo "Date : $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "============================="
  for line in "${REPORT[@]}"; do echo "$line"; done
  echo "============================="
  echo "TOTAL : PASS=$PASS  FAIL=$FAIL  (attendu 28)"
} > "$REPORT_FILE"

cat "$REPORT_FILE"

if [ "$FAIL" -eq 0 ] && [ "$PASS" -eq 28 ]; then
  exit 0
else
  exit 1
fi
