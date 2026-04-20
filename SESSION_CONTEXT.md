# Session Context - Current Work

## CURRENT SESSION: Phase 19 — Password Change & Recovery (E2E Test)
**Date**: 2026-04-19
**Goal**: Verify password change/recovery works end-to-end; then harden for beta; then Florianópolis seed + PT_BR
**Status**: ✅ Phase 19 & 20 complete. Phase 21 in progress — PT translations 99% done (1 key fixed in reviews.json); seed rewrite not started

---

## Productionization Roadmap

| Phase | Feature | FRs | Status |
|-------|---------|-----|--------|
| 8 | Real-time messaging (Socket.IO JWT auth) | FR-053 | ✅ Done |
| 9 | Notifications system (in-app + Socket.IO push) | FR-010, FR-034, FR-043 | ✅ Done |
| 10 | Quote system (My Quotes page + full flow) | FR-037 | ✅ Done |
| 11 | Provider availability calendar | FR-019 | ✅ Done |
| 12 | Provider responses to reviews + AI draft agent | FR-069 | ✅ Done |
| 13 | Admin panel | FR-074–081 | ✅ Done — all 3 pages tested end-to-end incl. suspend/reactivate login flow |
| 13b | Streaming AI provider search (SSE + Anthropic stream) | FR-025 | ✅ Done — progress events + token streaming working end-to-end |
| 14 | Stripe integration (escrow flow) | FR-057–063 | ✅ Done — all P1–P10 tests passed |
| 15 | Dispute resolution (admin-mediated) | FR-063 | ✅ Done — P1–P17 passed; 2 bugs fixed in UI test session (see below) |
| 16 | Email verification on register | FR-002 | ✅ Done — Ethereal SMTP, hard block login, resend flow; EV1–EV5 tested |
| 17 | GPS geocoding | FR-022 | ✅ Done — geocode/distance/nearby routes wired; GPS1–GPS4 tested |
| 18 | Message file attachments | FR-050 | ✅ Done — multer upload endpoint; image/file preview + send + render; FA1–FA2 tested |
| 19 | Password change & recovery | FR-004 | ✅ Done — PW1–PW4 passed; bug fixed (BasicUser missing passwordResetToken/Expiry columns) |
| 20 | Production hardening | — | ✅ Done — P0 #1–5, P1 #6–8, P2 #9–11 all implemented |
| 21 | Florianópolis seed data + PT_BR default locale | — | 🔄 In progress — PT translations complete; need: i18n default→pt, seed rewrite, SERVICES→PT |

---

## Resume Point
1. Backend on port 3000, frontend on port 3001
2. DB seeded; demo password: `Demo123!`
3. Customer login: `customer@demo.com` / `Demo123!`
4. **NEXT ACTION**: Phase 21 — Three remaining tasks:
   - (a) Change i18n.ts `fallbackLng: 'en'` → `'pt'` and add `'pt'` as first in `supportedLngs`
   - (b) Rewrite `backend/src/scripts/seedDatabase.ts` — replace SERVICES (English→PT), LOCATIONS (US cities→Florianópolis bairros, lat -27.59/lng -48.55), FIRST_NAMES/LAST_NAMES (→Brazilian), MESSAGE_TEMPLATES and REVIEW_TEMPLATES (→PT), pricing in BRL
   - (c) Reseed DB and smoke-test the app in PT
5. **NOTE**: Phase 19 bug — BasicUser entity was missing `passwordResetToken` and `passwordResetExpiry` columns; added to fix forgot-password flow
6. **NOTE**: Phase 20 hardening — CORS now reads ALLOWED_ORIGINS env var; auth rate limit is 10/15min in prod, 100/1min in dev; health check includes DB ping; database.ts auto-selects SQLite (dev) or PostgreSQL (prod) via NODE_ENV; startup validateConfig() rejects placeholder JWT in prod; React ErrorBoundary wraps AppContent; ecosystem.config.js added for PM2
5. **NOTE**: Phase 18 bug: route validator required `message.notEmpty()` — attachment-only messages failed 400. Fixed by making `message` optional with a cross-field validator requiring message OR attachments.
5. **NOTE**: Phase 16 UX test found 2 bugs in AuthContext.tsx — `login()` and `register()` both called `setLoading(true/false)`, causing ProtectedRoute to remount public-only route components (LoginForm, RegisterForm) mid-flight, resetting local state. Fixed by removing `setLoading` from both functions (they are not auth initialization — forms manage their own loading state locally).
11. **NOTE**: Phase 15 bugs fixed in UI test session: (a) AdminDisputesPage used `r.data` instead of `r.data.data` — disputes never rendered; (b) getDisputes queried `status=IN_DISPUTE` which excluded resolved disputes — changed to `isDisputed=true`
5. **NOTE**: Email verification uses Ethereal (dev fake SMTP). After register, backend logs a preview URL — open it in a browser to see the email and get the verification link.
6. **NOTE**: Seeded demo users have isVerified=true so they bypass email verification. New registrations must verify.
7. **NOTE**: After reseed, re-run Stripe setup (setup-intent → attach PM → save-method) since stripeCustomerId/stripePaymentMethodId are cleared
8. **NOTE**: `automatic_payment_methods: { enabled: true, allow_redirects: 'never' }` required on PaymentIntent.create
9. **NOTE**: Stripe blocks saving declined cards at setup (correct behavior) — P3 cancel path verified via error-path test
10. **NOTE**: DB is SQLite (`backend/database.sqlite`), not PostgreSQL — TypeORM config says SQLite, "PostgreSQL connected" log message is misleading

### Key Files (Agents)
- **Recommendation agent**: `backend/src/agents/recommendation.agent.ts`
- **Analysis agent**: `backend/src/agents/analysis.agent.ts`
- **Coordinator**: `backend/src/agents/coordinator.ts`
- **Verification agent**: `backend/src/agents/verification.agent.ts`
- **Review response agent**: `backend/src/agents/review-response.agent.ts`
