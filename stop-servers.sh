#!/bin/bash

# Tino 2 - Stop Development Servers (Git Bash / Windows compatible)
echo "Stopping Tino 2 servers..."
npx --yes kill-port 3000 3001 2>/dev/null || true
echo "All servers stopped."
