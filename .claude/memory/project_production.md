---
name: project-production
description: "Production deployment details for newtino.com — how to deploy, what's live, known infra patterns"
metadata: 
  node_type: memory
  type: project
  originSessionId: 763df409-1b1a-4b5d-9634-a5ec45cc4d13
---

App is live at https://newtino.com via PM2 + Cloudflare tunnel on the homelab.

**Deploy**: `bash deploy.sh` from repo root — builds backend + frontend, restarts PM2, keeps tunnel alive.

**Why:** PM2 manages `tino-backend` (dist/server.js) and `tino-tunnel` (cloudflared). Never kill the tunnel unnecessarily.

**Local dev**: `pm2 stop tino-backend` → `cd backend && npm run dev` → test → `bash deploy.sh` to restore.

**How to apply:** Always deploy via `deploy.sh`. Do not use `npm run dev` as the primary server — PM2 owns port 3000 in production.

**Env files:**
- Dev config: `backend/.env`
- Prod config: `backend/.env.production` (loaded when NODE_ENV=production via PM2)
- ALLOWED_ORIGINS, OPENAI_API_KEY, ANTHROPIC_API_KEY, STRIPE keys all in `.env.production`

**Key infra facts:**
- ES module hoisting bug: `security.ts` CORS allowlist must be read lazily (fn call at request time), not at module init — dotenv hasn't run yet when modules load. Fixed via `getAllowedOrigins()`.
- Providers stored by Florianópolis neighbourhood as `city` field — city-level search always returns 0. Search agent uses state-only filter.
- Rate limit: 1000 req/15min general; voice routes exempt (auth-only).
- Node 18 in prod: `globalThis.File` polyfill required for OpenAI SDK v6 uploads.
