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

**Local dev (non-disruptive — preferred):** PM2's `tino-backend` holds **:3000** AND the Cloudflare tunnel serves newtino.com from it, so don't stop it just to test. Instead run a dev backend on an **alt port** and point the dev frontend at it: `PORT=3002 npm run dev` (backend) + `VITE_PROXY_TARGET=http://localhost:3002 npm run dev` (frontend, :3001). `VITE_PROXY_TARGET` is a dev-only vite.config override (defaults :3000). Prod stays up. (Old approach `pm2 stop tino-backend → npm run dev → deploy` takes the live site down — avoid.)

**⚠️ Dev & prod SHARE the same database** (`postgresql://tino:tino@localhost:5432/tino_app`, the `tino2-app-db` Docker container) — both `.env` and `.env.production` point to it. So any test data written locally appears on live newtino.com. Migrations applied locally are already applied for prod. `deploy.sh` builds the **working tree** (no git pull) — commit to main first for a rollback point.

**psql heredoc:** use `docker exec -i tino2-app-db psql ...` — without `-i`, a `<<SQL` heredoc sends nothing to stdin (silent no-op). `-c "..."` is fine without `-i`.

**How to apply:** Always deploy via `deploy.sh`. Do not use `npm run dev` as the primary server — PM2 owns port 3000 in production.

**Env files:**
- Dev config: `backend/.env`
- Prod config: `backend/.env.production` (loaded when NODE_ENV=production via PM2)
- ALLOWED_ORIGINS, OPENAI_API_KEY, ANTHROPIC_API_KEY, STRIPE keys all in `.env.production`

**⚠️ pm2 env reload:** changing `.env.production` then `pm2 restart tino-backend` does NOT pick it up — pm2 reuses the **saved process env** and `dotenv.config()` won't override an already-present var (incl. empty string). Use `pm2 delete tino-backend && pm2 start ecosystem.config.js --env production && pm2 save` (what `deploy.sh` effectively does) to rebuild env from scratch. Confirmed 2026-06-15: a corrected STRIPE_SECRET_KEY only took effect after delete+start, not restart. Also: env keys for prod go in `.env.production`, NOT `.env` (dev only).

**Key infra facts:**
- ES module hoisting bug: `security.ts` CORS allowlist must be read lazily (fn call at request time), not at module init — dotenv hasn't run yet when modules load. Fixed via `getAllowedOrigins()`.
- Providers stored by Florianópolis neighbourhood as `city` field — city-level search always returns 0. Search agent uses state-only filter.
- Rate limit: 1000 req/15min general; voice routes exempt (auth-only).
- Node 18 in prod: `globalThis.File` polyfill required for OpenAI SDK v6 uploads.
