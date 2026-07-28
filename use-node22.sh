#!/bin/bash
# Run a command with the repository's required Node.js version.
set -euo pipefail

required_major=22
current_major="$(node -p 'process.versions.node.split(\".\")[0]' 2>/dev/null || true)"

if [ "$current_major" != "$required_major" ]; then
  nvm_script="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  if [ -s "$nvm_script" ]; then
    # shellcheck disable=SC1090
    . "$nvm_script"
    nvm use
  fi
fi

current_major="$(node -p 'process.versions.node.split(\".\")[0]' 2>/dev/null || true)"
if [ "$current_major" != "$required_major" ]; then
  echo "Tino 2 requires Node.js 22 (found: $(node --version 2>/dev/null || echo unavailable))." >&2
  echo "Install Node 22, or install nvm and run: nvm install" >&2
  exit 1
fi

exec "$@"
