---
name: Phase 23 production hardening plan
description: Ordered work list from prod readiness audit — security/resilience gaps before deployment
type: project
originSessionId: f3188795-03db-448a-9927-1b5c2cb95399
---
Phase 23 completed 2026-04-22. P0 + P1 all done.

**Decisions made:** AWS (EC2 + PM2), JWT httpOnly cookies deferred to post-beta.

**ACTION REQUIRED:** User must rotate Browserbase API key — `bb_live_vrmnWlqL665ASF4nar3sJPGn0xI` was committed in git history via CLAUDE.md. Redacted now but the key itself is compromised. Go to browserbase.com dashboard to regenerate.

**What was done:** See SESSION_CONTEXT.md for full list. Key additions: TypeORM migrations framework, seed guard, ALLOWED_ORIGINS hard fail, Sentry (both BE+FE), Winston in agents, PM2 backoff config, Postgres pool config.

**P0 — Blocks prod:**
1. Rotate live secrets in `backend/.env` (ANTHROPIC_API_KEY, BROWSERBASE_API_KEY, GOOGLE_MAPS_API_KEY committed to git) + ensure `.env` in `.gitignore`
2. Move JWT from localStorage → httpOnly cookies (`frontend/src/services/api.ts`, `AuthContext.tsx`, backend CORS + cookie middleware)
3. `validateConfig()` throw (not warn) on placeholder JWT_SECRET in prod — `backend/src/config/environment.ts:147`
4. TypeORM migrations framework — remove `synchronize: true`; `backend/src/config/database.ts`
5. Seed script idempotency guard — add NODE_ENV check so it can't run against prod accidentally; `backend/src/scripts/seedDatabase.ts`

**P1 — Before real users:**
6. `ALLOWED_ORIGINS` hard-fail if unset in prod — `backend/src/middleware/security.ts:8`
7. Verify `ecosystem.config.js` exists with restart policy + log rotation
8. PostgreSQL connection pool config — `backend/src/config/database.ts`
9. Replace `console.log` in agents with Winston logger — `backend/src/agents/`
10. Sentry integration (backend + frontend)
11. `REACT_APP_API_URL` warn/fail if unset — `frontend/src/services/api.ts:298`

**P2 — Post-launch:**
12. Express static serving for React build OR nginx config docs
13. Health check probing Redis/MongoDB/Stripe
14. Structured logging + request correlation IDs

**How to apply:** Start next session by asking user the two blocked questions, then implement P0 items in order.
