#!/usr/bin/env bash
# Wait for the FastAPI server to be ready, then launch Chromium in kiosk mode.
# This script is called from ~/.config/labwc/autostart

# Give systemd services a moment to start
sleep 3

# Poll /api/status up to 60 seconds
for i in $(seq 1 60); do
  if curl -sf http://127.0.0.1:8000/api/status > /dev/null 2>&1; then
    echo "Tempest API ready after ${i}s"
    break
  fi
  sleep 1
done

CHROMIUM_BIN=$(command -v chromium-browser || command -v chromium)

exec "$CHROMIUM_BIN" \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --disable-features=TranslateUI \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --disable-restore-session-state \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000 \
  --disk-cache-size=1 \
  --ozone-platform=wayland \
  --enable-features=UseOzonePlatform \
  http://127.0.0.1:8000/
