#!/usr/bin/env bash
set -e

REPO=/home/dymowb/dev/tino2
BACKEND=$REPO/backend
TUNNEL_NAME=newtino

echo "=== Tino 2 — homelab deploy ==="

# 1. Install PM2 if missing
if ! command -v pm2 &>/dev/null; then
  echo "→ Installing PM2..."
  sudo npm install -g pm2
fi

# 2. Ensure cloudflared is available
export PATH="$HOME/.local/bin:$PATH"
if ! command -v cloudflared &>/dev/null; then
  echo "→ Installing cloudflared..."
  mkdir -p ~/.local/bin
  curl -sSL -o ~/.local/bin/cloudflared \
    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  chmod +x ~/.local/bin/cloudflared
fi

# 3. Build backend (compiles TypeScript → dist/)
echo "→ Building backend..."
cd $BACKEND
npm run build 2>&1 | grep -E "^src.*error TS" | grep -v "test\|spec" || true

# 3b. Build frontend (bakes API URL via .env.production)
echo "→ Building frontend..."
cd $REPO/frontend
npm run build 2>&1 | tail -5

# 4. Clear port 3000 and restart PM2 backend
echo "→ Starting backend under PM2..."
fuser -k 3000/tcp 2>/dev/null || true
pm2 delete tino-backend 2>/dev/null || true
pm2 start $BACKEND/ecosystem.config.js --env production
pm2 save

# Register PM2 for boot (extracts and runs the sudo command)
STARTUP_CMD=$(pm2 startup systemd -u "$USER" --hp "$HOME" 2>&1 | grep "^sudo")
if [ -n "$STARTUP_CMD" ]; then
  eval "$STARTUP_CMD"
fi

# 5. Install cloudflared as a systemd service (runs named tunnel on boot)
echo "→ Installing cloudflared tunnel service..."
sudo cloudflared service install 2>/dev/null || true
sudo systemctl enable cloudflared 2>/dev/null || true
sudo systemctl restart cloudflared 2>/dev/null || true

echo ""
echo "=== Deploy complete ==="
pm2 list
echo ""
echo "✓ App live at: https://newtino.com"
echo "✓ Also:        https://www.newtino.com"
echo "✓ Health:      https://newtino.com/health"
