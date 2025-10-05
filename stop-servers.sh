#!/bin/bash
echo "🛑 Stopping Tino 2 servers..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
pkill -f "react-scripts" 2>/dev/null || true
pkill -f "ts-node-dev" 2>/dev/null || true
pkill -f "npm.*start" 2>/dev/null || true
sleep 1
echo "✅ All servers stopped cleanly"
