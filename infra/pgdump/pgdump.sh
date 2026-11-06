#!/bin/sh
# Nightly pg_dump -Fc loop for the nkshop-pgdump container (alpine/busybox sh).
#   (no args)  run forever: dump at DUMP_AT local time every day, plus once at start if the newest dump is >24h old
#   once       dump now and exit (used by `make pgdump-now`)
set -eu
umask 077
OUT=/backups
PREFIX="${DUMP_PREFIX:-nkshop}"
KEEP="${DUMP_KEEP:-7}"
AT="${DUMP_AT:-01:30}"
export TZ="${TZ_POSIX:-SAST-2}"

log() { echo "[pgdump $(date '+%F %T')] $*"; }

dump_once() {
  ts="$(date '+%Y%m%d-%H%M')"
  tmp="$OUT/.${PREFIX}-${ts}.partial"
  final="$OUT/${PREFIX}-${ts}.dump"
  log "dumping $PGDATABASE@$PGHOST -> $final"
  if pg_dump -Fc --no-owner --no-privileges -f "$tmp" && [ -s "$tmp" ]; then
    mv "$tmp" "$final"
    # integrity check: the archive must be listable
    pg_restore --list "$final" >/dev/null
    touch "$OUT/.last_success"
    # keep the newest $KEEP dumps
    ls -1t "$OUT"/${PREFIX}-*.dump 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
      log "pruning $old"; rm -f -- "$old"
    done
    log "ok ($(du -h "$final" | cut -f1))"
  else
    rm -f -- "$tmp"; log "FAILED"; return 1
  fi
}

if [ "${1:-}" = "once" ]; then dump_once; exit $?; fi

# catch-up dump at container start if there is no dump newer than 24h
if ! find "$OUT" -maxdepth 1 -name "${PREFIX}-*.dump" -mmin -1440 | grep -q .; then
  dump_once || true
fi

num() { v="${1#0}"; echo "${v:-0}"; }   # "08" -> 8, "00" -> 0 (sh arithmetic would read 08 as bad octal)

while true; do
  h="$(num "${AT%%:*}")"; m="$(num "${AT##*:}")"
  sod=$(( $(num "$(date +%H)") * 3600 + $(num "$(date +%M)") * 60 + $(num "$(date +%S)") ))
  wait_s=$(( h * 3600 + m * 60 - sod ))
  [ "$wait_s" -le 0 ] && wait_s=$(( wait_s + 86400 ))
  log "next dump in ${wait_s}s (at $AT SAST)"
  sleep "$wait_s"
  dump_once || true
  sleep 61   # avoid a double run inside the same minute
done
