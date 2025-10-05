#!/bin/bash
# Script to use Node.js 22.12.0 for chrome-devtools MCP compatibility

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22.12.0
export PATH="$NVM_DIR/versions/node/v22.12.0/bin:$PATH"

# Execute any command passed as arguments
exec "$@"