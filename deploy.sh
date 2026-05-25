#!/usr/bin/env bash
set -e

REPO=/home/dymowb/dev/tino2
BACKEND=$REPO/backend

echo "=== Tino 2 — homelab deploy ==="

# 1. Install PM2 if missing
if ! command -v pm2 &>/dev/null; then
  echo "→ Installing PM2..."
  sudo npm install -g pm2
fi

# 2. Install cloudflared if missing
mkdir -p ~/.local/bin
if [ ! -f ~/.local/bin/cloudflared ]; then
  echo "→ Installing cloudflared..."
  if [ -f /tmp/cloudflared ]; then
    cp /tmp/cloudflared ~/.local/bin/cloudflared
  else
    curl -sSL -o ~/.local/bin/cloudflared \
      https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  fi
  chmod +x ~/.local/bin/cloudflared
fi
export PATH="$HOME/.local/bin:$PATH"

# 3. Build backend (compiles TypeScript → dist/)
echo "→ Building backend..."
cd $BACKEND
npm run build 2>&1 | grep -E "^src.*error TS" | grep -v "test\|spec" || true

# 4. Stop any running backend instances, start fresh
echo "→ Starting backend under PM2..."
pm2 delete tino-backend 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save

# Register PM2 to restart on boot (extracts and runs the sudo command)
STARTUP_CMD=$(pm2 startup systemd -u "$USER" --hp "$HOME" 2>&1 | grep "^sudo")
if [ -n "$STARTUP_CMD" ]; then
  eval "$STARTUP_CMD"
fi

# 5. Launch Cloudflare tunnel — prints the public URL
echo ""
echo "=== Services started ==="
pm2 list
echo ""
echo "→ Opening Cloudflare tunnel to port 3000 (Ctrl+C to stop)..."
cloudflared tunnel --url http://localhost:3000
