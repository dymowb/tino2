# Session Context - Current Work

## CURRENT SESSION: Phase 24 — Agentic Memory System + PostgreSQL migration
**Date**: 2026-04-25
**Goal**: Add per-user memory layer to the agentic assistant (semantic + episodic + procedural)
**Status**: ✅ Phase 1 done ✅ Phase 2 done ✅ Phase 3 done ✅ Phase 4 done ✅ PostgreSQL migration done ✅ Bugfixes complete ✅ Live demo verified end-to-end
**ADR:** `docs/adr/0001-agentic-memory.md` — full design, data model, scoring formula, prompt template, phase plan

---

## ⚠️ FIRST THING NEXT SESSION
Docker auto-starts via `restart: unless-stopped`. Start backend: `cd backend && npm run dev` (port 3000). Start frontend: `cd frontend && npm start` (port 3001).

### Memory system status (end of session 2026-04-26)
- 5 semantic memories in DB for customer@demo.com (Lagoa da Conceição, Florianópolis, cats, R$200 budget, Saturday mornings)
- 1 episodic summary in DB
- Memory injected on every new workflow — confirmed live via Playwright demo
- **Prompt engineering fix**: `requirements.agent.ts` now has explicit "Memory Usage" section instructing Claude to treat <memory> facts as pre-filled — agent skips asking about known location/budget/timing
- **Live demo result**: user typed "Preciso de uma faxineira" → agent replied knowing Lagoa da Conceição + sábado 9h from memory; then asked about date only; then confirmed R$200 from memory; full pipeline ran to completion in 3 turns
- Debug endpoint: `GET /api/v1/agentic-assistant/memory-debug?query=...` — shows scored memories + exact `<memory>` block Claude receives
- Next: Phase 5 (Reflection job), Phase 6 (Procedural rules), or UX work to surface memories to the user

---

### PostgreSQL Migration — Done (this session, code complete, DB setup pending)
The app was on SQLite (dev) / PostgreSQL (prod). Now **PostgreSQL everywhere** via Docker.

**What changed:**
- `docker-compose.yml` — added `postgres-app` (postgres:16) on port 5432; Adminer now depends on both
- `backend/src/config/database.ts` — dropped SQLite branch; always PostgreSQL from `DATABASE_URL`
- `backend/src/config/typeorm.data-source.ts` — dropped SQLite branch
- `backend/.env` — `DATABASE_URL=postgresql://tino:tino@localhost:5432/tino_app`
- `backend/src/scripts/seedDatabase.ts` — `PRAGMA foreign_keys` → `SET session_replication_role = replica`
- `backend/src/services/ProviderService.ts` + `QuoteService.ts` — `JSON_EXTRACT()` → PostgreSQL `->>` operator
- All main models — `type: 'json'` → `type: 'jsonb'`, `type: 'datetime'` → `type: 'timestamp'`
- `backend/src/server.ts` — removed stale "SQLite initialized" log

**No initial migration exists yet** — `npm run migration:generate` will create it from the entities against the fresh empty DB.

---

### Phase 1 — Done
- `docker-compose.yml` — pgvector/pgvector:pg16 on port 5433 + Adminer on 8080
- 5 TypeORM entities: SemanticMemory, EpisodicMemory, ProceduralRule, MemoryRetrievalLog, MemoryWriteLog
- `src/config/memoryDatabase.ts` — separate DataSource (always PostgreSQL, graceful no-op if MEMORY_DATABASE_URL unset)
- `src/config/memory.ts` — all tunable params (weights, TTLs, thresholds) as env-var-backed config
- `src/services/memory/EmbeddingService.ts` — EmbeddingProvider interface + VoyageAIClient impl + cosineSimilarity util + formatEmbeddingForPg
- `src/migrations/memory/1777161600000-MemoryTables.ts` — manual migration: 5 tables + HNSW indexes on all vector columns + pgvector extension
- `src/config/memory.data-source.ts` — CLI data source for memory migrations
- npm scripts: `memory:migration:run`, `memory:migration:revert`, `memory:migration:show`
- `backend/.env` — memory vars added (MEMORY_DATABASE_URL, VOYAGE_API_KEY, etc.)

### Phase 2 — Done (semantic write path)
- `src/services/memory/PiiScrubber.ts` — regex scrubber for phone/CPF/email/card/address; returns `{ text, detected, types }`
- `src/services/memory/Deduper.ts` — embeds candidate → cosine ANN search via pgvector → merge (sim≥0.92) / create / discard (conf<0.50); logs every decision to `memory_write_log`
- `src/agents/memory/ExtractionAgent.ts` — Claude Haiku extraction from last 20 turns → structured JSON → PII scrub → Deduper → DB; hooked into coordinator async post-completion
- `src/agents/coordinator.ts` — fires `extractionAgent.extractAndWrite()` async (non-blocking) after `completeWorkflow()`
- `src/models/memory/MemoryWriteLog.ts` — `dedupDecision` type relaxed to `Record<string, unknown>`

### Phase 3 — Next (semantic read path)
Files to build: `src/services/memory/MemoryRetriever.ts` + `src/services/memory/ContextInjector.ts`
- MemoryRetriever: hybrid scoring (sim·0.55 + recency·0.15 + importance·0.20 + access·0.10), top-5 semantic + top-3 episodic + all active procedural rules
- ContextInjector: formats retrieved memories into the `<memory>` block template (see ADR §Context Injection)
- Wire into coordinator: inject memory context before requirements agent runs (read path must be blocking — context must be ready before Haiku starts)

**Key architecture note:** embedding column is NOT in TypeORM entity mapping. All vector ops (insert embedding, cosine search) use `MemoryDataSource.query()` raw SQL. TypeORM manages all other columns normally.

### Key Decisions (summary — full details in ADR)
- Framework: direct implementation (no Mem0, no LangGraph)
- Embeddings: Voyage AI `voyage-3` (1024-dim), `voyage-3-lite` for dev
- Vector store: pgvector on PostgreSQL (same instance as prod DB)
- Memory scope: per-user, customers first, providers later
- Procedural rule approval: tiered confidence (≥0.85 auto-approve, 0.65–0.84 queued, <0.65 discarded)
- PII: opt-out, scrubbing on write
- 8 implementation phases: Semantic write → Semantic read → Episodic → Reflection → Procedural → UI → Eval

### Previous Session: Phase 23 — Production Hardening Round 2
**Status**: ✅ P0 + P1 done — P2 remaining + Browserbase key rotation needed
**Decisions**: AWS (EC2 + PM2), JWT cookies deferred to post-beta

### Phase 23 — Work list

**P0 — Done:**
1. ✅ CLAUDE.md Browserbase key redacted (was `bb_live_vrmnWlqL665ASF4nar3sJPGn0xI`) — **USER MUST ROTATE** in Browserbase dashboard
2. ✅ JWT httpOnly cookies — DEFERRED to post-beta (XSS risk acceptable for small known beta audience)
3. ✅ `validateConfig()` already throws in prod for JWT_SECRET (Phase 20)
4. ✅ TypeORM migrations framework — `typeorm.data-source.ts` added; npm scripts: `migration:generate/run/revert/show`; `database.ts` has pool config
5. ✅ Seed script idempotency — refuses to run in prod without `--seed` flag

**P1 — Done:**
6. ✅ `ALLOWED_ORIGINS` throws at startup if unset in prod — `backend/src/middleware/security.ts:8`
7. ✅ `ecosystem.config.js` — added `exp_backoff_restart_delay`, `min_uptime`, `merge_logs`
8. ✅ PostgreSQL pool config — `poolSize: 20`, `max: 20`, `min: 2`, `connectionTimeoutMillis: 10000`
9. ✅ `console.log` → Winston in all agents (anthropic.service, requirements.agent, mock.agent, state.service)
10. ✅ Sentry — `@sentry/node` backend + `@sentry/react` frontend; gated on `SENTRY_DSN` / `REACT_APP_SENTRY_DSN` env vars
11. ✅ `REACT_APP_API_URL` warns to console in prod if unset — `frontend/src/services/api.ts:299`

**P2 — Post-launch polish (not yet done):**
12. Express static serving for React build OR document nginx config
13. Health check to probe Redis/MongoDB/Stripe
14. Structured logging + request correlation IDs

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
| 21 | Florianópolis seed data + PT_BR default locale | — | ✅ Done — i18n fallback→pt, localStorage seeded on first visit; seedDatabase.ts fully rewritten (PT services/names/messages/reviews, Florianópolis bairros, BRL pricing); hardcoded "Forgot your password?" fixed |
| 22 | Full i18n coverage — remove all hardcoded strings | — | ✅ Done — admin.json namespace (pt+en) created; all 6 admin pages + AdminLayout, auth flows, messaging, notifications, nav all wired to i18n; role chips fixed (Prestador/Cliente) |

---

## Resume Point
1. Backend on port 3000, frontend on port 3001
2. DB seeded with Florianópolis data; demo password: `Demo123!`
3. Customer login: `customer@demo.com` / `Demo123!`
4. **ALL PHASES COMPLETE** — app is ready for beta. Next: define new feature phases or begin beta testing.
5. **NOTE**: Phase 22 — No new bugs. admin.json is the only new locale file; all other namespaces extended. Key pattern for enum-like arrays: use `as const` key arrays and resolve labels via `t()` at render time (not at module init).
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
