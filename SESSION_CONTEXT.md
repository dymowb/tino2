# Session Context - Current Work

## CURRENT SESSION: Agentic Memory — All Phases Complete (6–9)
**Date**: 2026-05-25
**Goal**: Agentic memory phases 6–9
**Status**: ✅ Phase 6 ✅ Phase 7 ✅ Phase 8 ✅ Phase 9 — all done

---

## ⚠️ FIRST THING NEXT SESSION
Docker auto-starts via `restart: unless-stopped`. Start backend: `cd backend && npm run dev` (port 3000). Start frontend: `cd frontend && npm start` (port 3001).

### Memory system status (end of session 2026-05-23)
### Booking flow bugs fixed (2026-05-24 session 2)
- **BookingService.checkScheduleConflict**: SQLite `datetime()` syntax never updated for PostgreSQL — replaced with `booking.scheduledDate + (booking.estimatedDuration * interval '1 minute')`. This caused 500 on every booking creation.
- **BookingService.updateBookingStatus**: `isOwner = booking.customerId === userId` always false for providers — fixed to `booking.customerId === userId || booking.provider?.userId === userId`. Providers could not accept/confirm bookings.
- **MyBookingsPage**: `updateStatusMutation` called `apiService.updateBooking` (customer-only PUT /:id) instead of `apiService.updateBookingStatus` (PUT /:id/status). Provider "Aceitar" button returned 403.
- **BookingController.startBooking + confirmCompletion**: `getStripeInstance()` called outside try/catch — throws when STRIPE_SECRET_KEY unset, causing hanging requests. Moved inside try block so Express returns proper 500.
- **FindProvidersPage**: `<Rating value={provider.rating}>` got string instead of number — fixed with `Number(provider.rating)`.
- **MyReviewsPage**: `<Rating value={review.rating}>` string + Grid missing `item` prop — fixed with `Number()` coercion and sed patch for item props.
- **Escrow flow status**: Requires STRIPE_SECRET_KEY + customer.stripePaymentMethodId. Both absent in dev env without Stripe setup. Booking creation → provider accept ✅ tested; start service → escrow hold requires real Stripe credentials.

### E2E tests completed (2026-05-24 session 2)
- ✅ Customer creates booking via browser UI (Consultoria Nutricional / Carina Pereira Serviços) → dialog closes, booking saved
- ✅ Carina Pereira logs in, sees pending booking, clicks Aceitar → status changes to Confirmada
- ✅ Customer sees completed booking ("Limpeza Residencial" advanced to completed via status API) → "Deixar Avaliação" shown
- ✅ Review submitted via API (rating 5, comment) → appears in provider's "Avaliações Sobre Meus Serviços" tab with 0 console errors
- ✅ UI review stub: "Deixar Avaliação" button shows tooltip "Em breve na Tarefa 6" — not a full dialog; review write path is API-only for now

### PostgreSQL numeric string bugs fixed (2026-05-24)
All PostgreSQL `numeric`/`decimal` columns return as strings via the `pg` library. This caused crashes and NaN throughout the UI. Fixed:
- **ProviderDashboardPage**: crash on `rating.toFixed()` — fixed with `Number(rating).toFixed()`
- **PaymentsPage**: NaN totals from string concat in `.reduce()` — fixed with `Number(amount)` in accumulator
- **BookingController**: provider bookings returning 0 — `query.providerId` was set to `users.id` instead of `providers.id`; fixed by looking up provider profile first
- **ProviderController dashboard stats**: `totalEarnings` was string-concatenated — fixed with `parseFloat()`; `averageRating` was NaN → null — fixed
- **MyQuotesPage**: all English strings — added `page` section to both locale files; component fully wired to `t()`
- **AssistantProviderCard, ReviewList, PaymentDialog, AdminDashboardPage**: similar `toFixed` on string fields — all fixed with `Number()` guards
- **MyBookingsPage**: `formatCurrency` now uses `Number()` coercion and `pt-BR`/`BRL` locale

### Pattern to remember
Any field typed as `numeric(p,s)` or `decimal` in the DB comes back as a string from PostgreSQL via `pg`. Always wrap with `Number()` or `parseFloat()` before arithmetic or `.toFixed()`. The TypeORM entity type annotation (`number`) doesn't prevent this.

### Phase 24 Agentic Memory — Phase 5 done (previous session)
- Reflection job complete, procedural rules auto-approved at conf ≥ 0.85

### Agentic Memory — Phase status
| Phase | Feature | Status |
|-------|---------|--------|
| 1 | Schema + infra (pgvector, entities, DataSource) | ✅ Done |
| 2 | Semantic write path (ExtractionAgent, Deduper, PiiScrubber) | ✅ Done |
| 3 | Semantic read path (MemoryRetriever, ContextInjector) | ✅ Done |
| 4 | Episodic memory | ✅ Done |
| 5 | Reflection job (procedural rule derivation) | ✅ Done |
| 6 | Wire procedural rules as constraints into all agents | ✅ Done (2026-05-25) |
| 7 | Memory UI — view & edit | ✅ Done (2026-05-25) |
| 8 | Evaluation framework | ✅ Done (2026-05-25) |
| 9 | Extend memory to providers | — |

### Phase 6 — Implementation notes (2026-05-25)
- `ContextInjector.formatConstraints()` produces a `<constraints>` block with imperative Portuguese phrasing — distinct from the advisory `<memory>` block
- `WorkflowContext.constraintContext` stores it independently alongside `memoryContext`
- System prompt layer order: `<constraints>` → `<memory>` → base instructions (highest priority first)
- Search agent excluded: its LLM call maps catalog names, not provider behaviour
- All 4 LLM-calling agents (requirements, analysis, recommendation, verification) receive `constraintContext` via `prepareAgentInput()`

### Phase 7 — Done (2026-05-25)
- `/memory` page: three sections — Regras ativas / O que sabemos / Histórico de sessões
- Delete any memory (soft-delete: is_active=FALSE or status='deprecated')
- Opt-out toggle: sets user.settings.memoryOptOut=true + immediately deactivates all memories
- ExtractionAgent skips write when opted out; retriever naturally returns empty (is_active=FALSE)
- "Minha Memória" added to avatar dropdown in Navigation
- apiService.patch() generic method added

### Phase 8 — Next: Evaluation framework
- Track memory hit rate, retrieval latency, dedup decisions over time
- Add `/memory/stats` endpoint
- Log recall precision against known facts (can seed test memories)

---

### Production Deployment — Plan (next session)
**Goal**: deploy to a public URL for beta access.

**Status check** (already done):
- ✅ `synchronize: false` in database.ts — migrations in place (`src/migrations/1777158117672-InitialSchema.ts`)
- ✅ CORS reads `ALLOWED_ORIGINS` env var
- ✅ `validateConfig()` throws at startup for missing JWT/NODE_ENV
- ✅ Auth rate limiting (10/15min in prod)
- ✅ PM2 `ecosystem.config.js` exists
- ✅ React `ErrorBoundary` wraps app

**Remaining before deploy (in order):**
1. **Frontend build + serving** — either `npm run build` → serve via Express static OR document nginx reverse-proxy config. Pick one.
2. **Health check completeness** — current `/health` pings DB; add Redis + optional Stripe connectivity check.
3. **Structured logging + correlation IDs** — add `X-Request-Id` header middleware; include request ID in all Winston log entries. Helps debug prod issues.
4. **Environment setup** — provision hosting (recommendation: Railway for backend + Neon for PostgreSQL; Vercel for frontend). Set all env vars. Run `npm run migration:run`.
5. **Stripe live keys** — configure real `STRIPE_SECRET_KEY` + customer payment method setup for escrow flow to work in prod.
6. **Browserbase key rotation** — rotate the key that was accidentally committed (user action required in Browserbase dashboard).

**Recommended hosting:**
- Backend: Railway (Node.js, GitHub auto-deploy, add-ons for Postgres)
- Frontend: Vercel (CRA, zero-config)
- DB: Neon (serverless PostgreSQL, supports pgvector for memory system)
- Redis: Upstash (serverless, free tier, no persistent connection needed)

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
