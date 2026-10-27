#!/bin/bash
# with-mem-cap.sh <timeout_s> <max_rss_mb> <command...>
#
# Runs a command with a hard time limit AND a hard RSS cap. The RSS cap is
# enforced by a watchdog polling `ps` every 2s (macOS does not honor
# ulimit/RLIMIT based memory limits, so this is the reliable mechanism).
# On cap breach: SIGTERM, then SIGKILL after 3s.
#
# Intended for bounding one-off live tests, e.g. child `pi` invocations.

set -u

TIMEOUT_S=$1
CAP_MB=$2
shift 2

CAP_KB=$((CAP_MB * 1024))

"$@" &
PID=$!

# Time limit
( sleep "$TIMEOUT_S"; kill -TERM "$PID" 2>/dev/null; sleep 3; kill -9 "$PID" 2>/dev/null ) &
TIMER=$!

# Memory watchdog
(
  while kill -0 "$PID" 2>/dev/null; do
    RSS=$(ps -o rss= -p "$PID" 2>/dev/null | tr -d ' ')
    if [ -n "$RSS" ] && [ "$RSS" -gt "$CAP_KB" ]; then
      echo "[mem-cap] $PID exceeded cap: $((RSS / 1024)) MB > $CAP_MB MB — terminating" >&2
      kill -TERM "$PID" 2>/dev/null
      sleep 3
      kill -9 "$PID" 2>/dev/null
      break
    fi
    sleep 2
  done
) &
DOG=$!

wait "$PID"
RC=$?

kill "$TIMER" "$DOG" 2>/dev/null
exit "$RC"
