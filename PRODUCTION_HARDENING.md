# Production Hardening Backlog

**Status**: Pending — do this before first public deployment
**Estimated effort**: ~1 session (45–60 min of actual work)

---

## Context

Codebase is architecturally sound. No feature rework needed. These are purely
infrastructure/config issues identified in a March 2026 audit.

The `.env` file is correctly in `.gitignore` — API keys are NOT exposed in git.

---

## Issues to Fix (Prioritized)

### P0 — Do before any public deployment

| # | Issue | File(s) | Fix |
|---|-------|---------|-----|
| 1 | CORS hardcoded to `localhost` | `backend/src/app.ts`, `backend/src/middleware/security.ts` | Read `ALLOWED_ORIGINS` env var (comma-separated list); use it in both CORS config and Socket.IO config |
| 2 | JWT secret is placeholder string | `backend/.env`, `backend/src/config/environment.ts` | Generate real secret (`openssl rand -base64 64`); add startup validation that rejects the placeholder |
| 3 | Frontend API URL hardcoded to localhost | `frontend/.env` | Already an env var (`REACT_APP_API_URL`); just needs production value at deploy time |
| 4 | Auth rate limit set for development | `backend/src/middleware/security.ts:64-65` | `100 attempts/window` → `10 attempts/15 min` for auth routes |
| 5 | No startup env validation | `backend/src/config/environment.ts` | Fail fast if `JWT_SECRET`, `ANTHROPIC_API_KEY` or `NODE_ENV` missing/default |

### P1 — Do at deployment time (hosting provider setup)

| # | Issue | File(s) | Fix |
|---|-------|---------|-----|
| 6 | SQLite instead of PostgreSQL | `backend/src/config/database.ts` | TypeORM supports both; swap `type: 'sqlite'` to `type: 'postgres'` + read `DATABASE_URL` from env. `.env` already has PostgreSQL config — it's just ignored. |
| 7 | `synchronize: true` in dev | `backend/src/config/database.ts:7` | Replace with TypeORM migrations (`npm run typeorm migration:generate`). Never use synchronize in production — it can wipe tables on schema changes. |
| 8 | Health check doesn't verify DB | `backend/src/app.ts` (health route) | Add DB connectivity check (`AppDataSource.query('SELECT 1')`) and Redis ping to the `/health` response |

### P2 — Nice to have before launch

| # | Issue | Notes |
|---|-------|-------|
| 9 | No process manager config | Add `ecosystem.config.js` for PM2 or `Dockerfile` for containerized hosting |
| 10 | Missing React error boundaries | Wrap main routes in `<ErrorBoundary>` so a crashed component doesn't blank the whole app |
| 11 | CORS/SocketIO config mismatch | SocketIO hardcodes localhost separately from SecurityMiddleware. Both should read the same `ALLOWED_ORIGINS` env var (fixed by P0 #1) |

---

## Deployment Target Recommendations

When ready to deploy:
- **Backend**: [Render](https://render.com) or [Railway](https://railway.app) — both support Node.js + PostgreSQL add-ons, free tier, GitHub auto-deploy
- **Frontend**: [Vercel](https://vercel.com) or [Netlify](https://netlify.com) — CRA builds deploy in 2 minutes
- **Database**: Render PostgreSQL (free tier: 256MB) or [Neon](https://neon.tech) (serverless PostgreSQL, generous free tier)
- **Redis**: Render Redis or [Upstash](https://upstash.com) (serverless Redis, free tier)

One-time setup steps at deployment:
1. Set all env vars in hosting dashboard (never commit real `.env`)
2. Run `npm run build` for frontend, point to backend URL
3. Run TypeORM migrations instead of synchronize
4. Set `NODE_ENV=production`

---

## What Does NOT Need Rework

- Agent pipeline (recommendation, analysis, verification, coordinator) ✅
- Socket.IO real-time messaging ✅
- JWT auth flow ✅
- All feature modules (bookings, payments, quotes, reviews, messages) ✅
- Rate limiting middleware (just needs threshold tuning) ✅
- Helmet.js security headers ✅
