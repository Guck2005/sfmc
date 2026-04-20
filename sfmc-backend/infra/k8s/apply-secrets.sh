#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# apply-secrets.sh
# -----------------------------------------------------------------------------
# Substitutes environment variables into infra/k8s/secret.yaml and applies the
# rendered manifest via kubectl. Intended to be called by the GitHub Actions
# `deploy` job after the env has been populated from repository Secrets.
#
# Required env vars:
#   JWT_SECRET, DB_PASSWORD, APP_KEY
#
# Usage:
#   JWT_SECRET=xxx DB_PASSWORD=yyy APP_KEY=zzz ./infra/k8s/apply-secrets.sh
# -----------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$SCRIPT_DIR/secret.yaml"
RENDERED="$(mktemp --suffix=.yaml)"

trap 'rm -f "$RENDERED"' EXIT

# ---- validate required variables --------------------------------------------
: "${JWT_SECRET:?JWT_SECRET is required}"
: "${DB_PASSWORD:?DB_PASSWORD is required}"
: "${APP_KEY:?APP_KEY is required}"

# ---- ensure namespace exists ------------------------------------------------
kubectl apply -f "$SCRIPT_DIR/namespace.yaml"

# ---- render template with envsubst ------------------------------------------
# Restrict the variable list so unrelated $VAR strings in the YAML (unlikely
# but possible) don't get clobbered.
export JWT_SECRET DB_PASSWORD APP_KEY
envsubst '${JWT_SECRET} ${DB_PASSWORD} ${APP_KEY}' < "$TEMPLATE" > "$RENDERED"

# ---- apply ------------------------------------------------------------------
kubectl apply -f "$RENDERED"
echo "[apply-secrets] sfmc-secrets applied to namespace sfmc"
