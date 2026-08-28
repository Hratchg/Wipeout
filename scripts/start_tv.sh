#!/usr/bin/env bash
# Starts everything for the living-room setup: the input service, the game
# server (production build), and Chrome fullscreen in kiosk mode.
# Usage: ./scripts/start_tv.sh [--dev]
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=5173
MODE=${1:-prod}

# 1. Camera/voice input service
if ! pgrep -f wipeout_input.py >/dev/null; then
  (cd input-service && .venv/bin/python wipeout_input.py >/tmp/wipeout-input.log 2>&1 &)
  echo "input service started (log: /tmp/wipeout-input.log)"
fi

# 2. Game server
if ! curl -s "http://localhost:$PORT" >/dev/null; then
  if [ "$MODE" = "--dev" ]; then
    (cd game && npm run dev >/tmp/wipeout-game.log 2>&1 &)
  else
    (cd game && npm run build >/tmp/wipeout-build.log 2>&1 \
      && npm run preview -- --host --port "$PORT" >/tmp/wipeout-game.log 2>&1 &)
  fi
  echo "game server starting on :$PORT (log: /tmp/wipeout-game.log)"
  for _ in $(seq 1 60); do
    curl -s "http://localhost:$PORT" >/dev/null && break
    sleep 1
  done
fi

# 3. Chrome in kiosk mode (TV fullscreen)
CHROME=""
for c in google-chrome chromium-browser chromium \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
  if command -v "$c" >/dev/null 2>&1 || [ -x "$c" ]; then CHROME=$c; break; fi
done
[ -n "$CHROME" ] || { echo "Chrome not found"; exit 1; }

exec "$CHROME" --kiosk --autoplay-policy=no-user-gesture-required \
  --disable-session-crashed-bubble --noerrdialogs \
  "http://localhost:$PORT"
