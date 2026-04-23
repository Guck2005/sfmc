#!/usr/bin/env sh
set -e
cd "$(dirname "$0")/.."
exec node scripts/reset-all-dbs.mjs
