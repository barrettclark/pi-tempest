#!/usr/bin/env bash
# install.sh — One-time setup on the Raspberry Pi
# Run as barrettclark from the pi-tempest directory:
#   cd /home/barrettclark/pi-tempest && bash scripts/install.sh

set -euo pipefail

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "Installing from: $INSTALL_DIR"

# ── 1. System packages ────────────────────────────────────────
echo "Installing system dependencies..."
sudo apt-get update -q
sudo apt-get install -y python3-venv python3-pip curl chromium-browser fonts-noto-color-emoji

# ── 2. Python virtual environment ────────────────────────────
echo "Creating Python venv..."
python3 -m venv "$INSTALL_DIR/.venv"
"$INSTALL_DIR/.venv/bin/pip" install --upgrade pip
"$INSTALL_DIR/.venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt"

# ── 3. Create data directory ──────────────────────────────────
mkdir -p "$INSTALL_DIR/data"

# ── 4. .env file ──────────────────────────────────────────────
if [ ! -f "$INSTALL_DIR/.env" ]; then
  echo "No .env found — copying .env.example. Edit it before starting services."
  cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
else
  echo ".env already exists — skipping."
fi

# Update DB_PATH in .env to use absolute path
sed -i "s|DB_PATH=.*|DB_PATH=$INSTALL_DIR/data/tempest.db|" "$INSTALL_DIR/.env"

# ── 5. Systemd services ───────────────────────────────────────
echo "Installing systemd services..."
# Update WorkingDirectory in service files to match actual install path
for svc in tempest-collector tempest-api; do
  sudo cp "$INSTALL_DIR/systemd/${svc}.service" "/etc/systemd/system/${svc}.service"
done

sudo systemctl daemon-reload
sudo systemctl enable tempest-collector tempest-api
sudo systemctl start tempest-collector tempest-api

echo "Services started. Check status with:"
echo "  journalctl -u tempest-collector -f"
echo "  journalctl -u tempest-api -f"

# ── 6. Chromium kiosk autostart ───────────────────────────────
echo "Setting up kiosk autostart..."
chmod +x "$INSTALL_DIR/autostart/chromium-kiosk.sh"

AUTOSTART_DIR="$HOME/.config/labwc"
mkdir -p "$AUTOSTART_DIR"

AUTOSTART_FILE="$AUTOSTART_DIR/autostart"
KIOSK_LINE="$INSTALL_DIR/autostart/chromium-kiosk.sh &"

# Prevent screen blanking
DPMS_LINE="xset s off; xset s noblank; xset -dpms"

if ! grep -qF "chromium-kiosk" "$AUTOSTART_FILE" 2>/dev/null; then
  echo "$DPMS_LINE" >> "$AUTOSTART_FILE"
  echo "$KIOSK_LINE" >> "$AUTOSTART_FILE"
  echo "Added kiosk launch to $AUTOSTART_FILE"
else
  echo "Kiosk entry already present in $AUTOSTART_FILE — skipping."
fi

# ── 7. Desktop launcher ───────────────────────────────────────
echo "Installing desktop launcher..."
DESKTOP_FILE="$INSTALL_DIR/autostart/Tempest Weather.desktop"
sed "s|/home/barrettclark/pi-tempest|$INSTALL_DIR|g" "$DESKTOP_FILE" \
  > "$HOME/Desktop/Tempest Weather.desktop"
chmod +x "$HOME/Desktop/Tempest Weather.desktop"
echo "Desktop launcher created at ~/Desktop/Tempest Weather.desktop"

echo ""
echo "✓ Installation complete."
echo ""
echo "The backfill will run automatically on first collector startup."
echo "This fetches 30 days of history — it may take a few minutes."
echo ""
echo "To launch the kiosk now (without rebooting):"
echo "  $INSTALL_DIR/autostart/chromium-kiosk.sh"
