---
name: feedback_dev_workflow
description: "Don't build or deploy during development/testing sessions — use local dev servers only"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 5d042ee2-602c-43a6-8a66-8c00717a20c4
---

Do NOT run `npm run build`, `bash deploy.sh`, or `pm2 restart` during a working session unless the user explicitly asks to deploy to production.

**Why:** The user tests locally at http://192.168.1.98:3001 (LAN) using the Vite dev server. Building and deploying is unnecessary overhead during development and testing.

**How to apply:**
- Backend changes: just save the file — `ts-node` / nodemon picks them up if dev server is running, or restart `npm run dev` in backend if needed.
- Frontend changes: Vite HMR updates the browser automatically. No build step needed.
- Only deploy (build + pm2 restart) when the user says "deploy" or "push to production" or "newtino.com".
- Dev servers: backend on port 3000, frontend on port 3001, accessible on LAN at 192.168.1.98:3001.
