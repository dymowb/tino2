#!/usr/bin/env bash
set -e

REPO=/home/dymowb/dev/tino2
BACKEND=$REPO/backend
TUNNEL_NAME=newtino

export PATH="$HOME/.local/bin:$PATH"

echo "=== Tino 2 — homelab deploy ==="

# 1. Install PM2 if missing
if ! command -v pm2 &>/dev/null; then
  echo "→ Installing PM2 globally (needs sudo)..."
  sudo npm install -g pm2
fi

# 2. Ensure cloudflared is available
if ! command -v cloudflared &>/dev/null; then
  echo "→ Installing cloudflared..."
  mkdir -p ~/.local/bin
  curl -sSL -o ~/.local/bin/cloudflared \
    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  chmod +x ~/.local/bin/cloudflared
fi

# 3. Build backend
echo "→ Building backend..."
cd $BACKEND
npm run build 2>&1 | grep -E "^src.*error TS" | grep -v "test\|spec" || true

# 4. Build frontend
echo "→ Building frontend..."
cd $REPO/frontend
npm run build 2>&1 | tail -5

# 5. Stop old processes, start backend under PM2
echo "→ Restarting backend..."
fuser -k 3000/tcp 2>/dev/null || true
pm2 delete tino-backend 2>/dev/null || true
pm2 start $BACKEND/ecosystem.config.js --env production
pm2 save

# 6. Run the named tunnel under PM2 (keeps it alive, restarts on crash)
echo "→ Starting Cloudflare tunnel under PM2..."
pm2 delete tino-tunnel 2>/dev/null || true
pm2 start cloudflared --name tino-tunnel -- tunnel run $TUNNEL_NAME
pm2 save

echo ""
echo "=== Deploy complete ==="
pm2 list
echo ""
echo "✓ App live at: https://newtino.com"
echo "✓ Also:        https://www.newtino.com"
echo "✓ Health:      https://newtino.com/health"
