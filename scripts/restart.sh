#!/bin/bash
# Cleanly restart pglite (DB) and Next (app) without ever killing this
# script's own shell or process group. Usage: bash scripts/restart.sh
set -u
SELF=$$
PARENT=$PPID

echo "stopping old servers..."
for pid in $(ls /proc | grep -E '^[0-9]+$'); do
  [ "$pid" = "$SELF" ] || [ "$pid" = "$PARENT" ] && continue
  cmd=$(tr '\0' ' ' < /proc/$pid/cmdline 2>/dev/null) || continue
  [ -z "$cmd" ] && continue
  # never touch shells / tool wrappers: their cmdline contains our own text
  case "$cmd" in *"bash -c"* | *"bash "*) continue;; esac
  case "$cmd" in
    *pglite-server.mjs* | *"next start"* | *next-server* | *"npm exec next"*)
      kill -9 "$pid" 2>/dev/null && echo "  killed $pid"
      ;;
  esac
done
sleep 2

cd "$(dirname "$0")/.." || exit 1

echo "starting pglite..."
setsid nohup node db/pglite-server.mjs > /tmp/pglite.log 2>&1 < /dev/null &
sleep 16
grep -q "listening" /tmp/pglite.log || { echo "pglite failed:"; tail -3 /tmp/pglite.log; exit 1; }
echo "  ok on :5432"

echo "seeding bots..."
DATABASE_URL=postgres://localhost:5432 node db/seed.mjs 2>/dev/null | grep -c "bot ok"

echo "starting next..."
setsid nohup env DATABASE_URL=postgres://localhost:5432 SERVER_SECRET=test-secret-123 \
  npx next start -p 3100 > /tmp/next.log 2>&1 < /dev/null &
for i in $(seq 1 20); do
  sleep 1
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3100/api/me)
  [ "$code" = "200" ] && { echo "  ok on :3100 (me:$code)"; exit 0; }
done
echo "next failed (last code $code):"; tail -3 /tmp/next.log
exit 1
