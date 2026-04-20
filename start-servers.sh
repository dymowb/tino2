#!/bin/bash

# Tino 2 - Development Server Startup (Git Bash / Windows compatible)
echo "Starting Tino 2 Development Servers..."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Kill anything on ports 3000 and 3001 (cross-platform via npx kill-port)
echo "Cleaning up ports 3000 and 3001..."
npx --yes kill-port 3000 3001 2>/dev/null || true
sleep 1

echo "Starting Backend Server (Port 3000)..."
nohup bash -c "cd \"$SCRIPT_DIR/backend\" && PORT=3000 npm run dev" \
  > "$SCRIPT_DIR/logs/backend.log" 2>&1 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# Wait for backend to be ready before starting frontend
echo "Waiting for backend..."
for i in $(seq 1 15); do
  sleep 2
  if curl -s --max-time 1 http://localhost:3000/api/v1/auth/login \
      -X POST -H "Content-Type: application/json" \
      -d '{}' > /dev/null 2>&1; then
    echo "Backend ready."
    break
  fi
  echo "  ...waiting ($i/15)"
done

echo "Starting Frontend Server (Port 3001)..."
nohup bash -c "cd \"$SCRIPT_DIR/frontend\" && BROWSER=none DISABLE_ESLINT_PLUGIN=true NODE_OPTIONS='--no-deprecation' PORT=3001 npm start" \
  > "$SCRIPT_DIR/logs/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

echo ""
echo "Both servers launched."
echo "  Backend:  http://localhost:3000"
echo "  Frontend: http://localhost:3001"
echo ""
echo "Logs: logs/backend.log  |  logs/frontend.log"
echo "Stop: ./stop-servers.sh"
echo ""
echo "Frontend takes ~30s to compile. Tail the log:"
echo "  tail -f $SCRIPT_DIR/logs/frontend.log"
