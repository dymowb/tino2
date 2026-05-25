#!/usr/bin/env bash
set -e

REPO=/home/dymowb/dev/tino2
BACKEND=$REPO/backend

echo "=== Tino 2 — homelab deploy ==="

# 1. Install nginx + PM2 if missing
if ! command -v nginx &>/dev/null; then
  echo "→ Installing nginx..."
  sudo apt-get install -y nginx
fi

if ! command -v pm2 &>/dev/null; then
  echo "→ Installing PM2..."
  sudo npm install -g pm2
fi

# 2. Install cloudflared
mkdir -p ~/.local/bin
if [ ! -f ~/.local/bin/cloudflared ]; then
  echo "→ Installing cloudflared..."
  cp /tmp/cloudflared ~/.local/bin/cloudflared 2>/dev/null || \
    curl -sSL -o ~/.local/bin/cloudflared \
      https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  chmod +x ~/.local/bin/cloudflared
fi
export PATH="$HOME/.local/bin:$PATH"

# 3. Nginx site config
echo "→ Configuring nginx..."
sudo cp $REPO/nginx/tino.conf /etc/nginx/sites-available/tino
sudo ln -sf /etc/nginx/sites-available/tino /etc/nginx/sites-enabled/tino
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx

# 4. Stop any running backend instances
pm2 delete tino-backend 2>/dev/null || true

# 5. Start backend under PM2
echo "→ Starting backend..."
cd $BACKEND
pm2 start ecosystem.config.js --env production
pm2 save

# 6. Register PM2 to start on boot
pm2 startup systemd -u "$USER" --hp "$HOME" | grep "sudo" | bash || true

# 7. Launch Cloudflare tunnel (foreground — Ctrl+C to stop)
echo ""
echo "=== All services up ==="
echo "  Backend : http://localhost:3000 (PM2)"
echo "  Nginx   : http://localhost:80"
echo ""
echo "→ Opening Cloudflare tunnel (Ctrl+C to exit)..."
cloudflared tunnel --url http://localhost:80
