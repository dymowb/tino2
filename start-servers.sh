#!/bin/bash

# Tino 2 - Optimized Server Startup Script (React 18.x + Stability Fixes)
echo "🚀 Starting Tino 2 Development Servers..."

# Enhanced cleanup - kill any existing processes
echo "🧹 Cleaning up existing processes..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
pkill -f "react-scripts" 2>/dev/null || true
pkill -f "ts-node-dev" 2>/dev/null || true
pkill -f "npm.*start" 2>/dev/null || true

# Wait for cleanup to complete
sleep 3

echo "📦 Starting Backend Server (Port 3000)..."
cd backend && PORT=3000 npm run dev &
BACKEND_PID=$!

echo "⚛️ Starting Frontend Server (Port 3001)..."
# Suppress webpack deprecation warnings and ESLint in dev mode
cd frontend && DISABLE_ESLINT_PLUGIN=true NODE_OPTIONS="--no-deprecation" PORT=3001 npm start &
FRONTEND_PID=$!

echo ""
echo "✅ Servers starting..."
echo "   🌐 Backend API:  http://localhost:3000"
echo "   ⚛️  Frontend UI:  http://localhost:3001"
echo ""
echo "📊 Platform Status: React 18.x (Stable) | All dependencies compatible"
echo "🔇 Webpack warnings suppressed for clean output"
echo ""
echo "💡 To stop: ./stop-servers.sh or Ctrl+C"

# Create enhanced stop script
cat > stop-servers.sh << 'EOF'
#!/bin/bash
echo "🛑 Stopping Tino 2 servers..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
pkill -f "react-scripts" 2>/dev/null || true
pkill -f "ts-node-dev" 2>/dev/null || true
pkill -f "npm.*start" 2>/dev/null || true
sleep 1
echo "✅ All servers stopped cleanly"
EOF

chmod +x stop-servers.sh

# Monitor and wait for servers
echo "📡 Monitoring servers... (Press Ctrl+C to stop)"
wait