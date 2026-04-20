#!/usr/bin/env bash
# Stops services previously launched by start_all_services.sh.
set -u
PIDFILE="/tmp/sfmc-pids"
[ -f "$PIDFILE" ] || exit 0
while IFS=":" read -r svc pid; do
  if kill -0 "$pid" 2>/dev/null; then
    echo "[stop] $svc ($pid)"
    kill "$pid" 2>/dev/null || true
  fi
done < "$PIDFILE"
rm -f "$PIDFILE"
exit 0
