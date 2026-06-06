---
name: Server startup (local dev)
description: How to start/stop dev servers reliably in this project
type: feedback
---

Run the dev servers locally on Linux: backend on port 3000, frontend on port 3001. Postgres runs in Docker (container `tino2-app-db`).

**Why:** background `&` without proper detachment lets the process get SIGTERM when the launching shell returns, and a stale/duplicate `ts-node-dev` makes the backend serve old code.

**How to apply:**
- Backend: `cd backend && npm run dev` — launch via the Bash tool's `run_in_background: true` (NOT `nohup … &`).
- Frontend: `cd frontend && npm run dev`.
- If backend edits don't take effect (stale-serving trap): `pkill -f ts-node-dev`, then ONE clean `npm run dev`.
- Kill anything already on 3000/3001 before starting.
- Postgres: `docker compose up -d postgres-app`; inspect with `docker exec tino2-app-db psql -U tino -d tino_app`.
- Production also exists at https://newtino.com (PM2 + Cloudflare tunnel) — work on local dev servers; only deploy when explicitly asked. See [[feedback_dev_workflow]].
