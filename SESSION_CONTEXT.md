# Session Context — Current Work

> Lean by design (per CLAUDE.md): current status + roadmap + resume point only.
> Detailed completed-work notes live in `Tests/history/HISTORICAL_CONTEXT.md` and git history.

## Current Status (2026-06-06)
- **Goal 1 — Find Providers E2E audit**: ✅ complete (16 defects fixed).
- **Goal 2 — Cross-role service lifecycle E2E audit**: ✅ complete (Chunk A + B = 8 defects, + 7 follow-up improvements). Commits `3f01b0d`, `0215d6a`.
- **All productionization phases (8–22) and Agentic Memory phases (1–9) are done** — see roadmap tables below.
- No formal goals/phases pending. Remaining work is loose ends (below).

### Ad-hoc bug fixes — session 2026-06-06 (all committed + pushed, verified in UI)
- Provider login fired 400s: `GET /reviews/provider/my` was shadowed by `/provider/:providerId` (param route declared first → "my" failed UUID validation). Moved literal route above param route. (`1fca115`)
- Notifications "mark all read" never reached 0: `read-all` marked only one fetched page; replaced with a bulk `markAllAsRead` UPDATE. (`1fca115`)
- Quote submit 409/404: provider "Available Requests" listed already-quoted/closed requests; `searchQuoteRequests` now excludes requests the provider already quoted (NOT EXISTS) + dialog invalidates `['available-quote-requests']` on success. (`ba10d97`)
- Message notification → home: actionUrl was `/messages/<id>` (path) but route reads `?conversationId=` query param; emit `/messages?conversationId=<id>`. (`3f3a605`)
- MUI Grid warnings in MyQuotesPage (`<Grid xs md>` without `item`). (`3f3a605`)
- Provider dashboard "Ganhos Totais" wrapped mid-number (`R$ 632,/00`): StatCard now `whiteSpace: nowrap` + length-tiered font. (`cfcbbd8`)
- CLAUDE.md decluttered (removed status table that belonged in SESSION_CONTEXT). (`d68e563`) See memory [[feedback-doc-separation]].

### AI Assistant fixes — session 2026-06-06 (uncommitted, verified in UI EN/PT-agnostic, no new strings)
- **Multi-turn questions vanishing**: only the *first* follow-up question was pushed into `messages` (in the SSE `complete` handler); later turns recorded only the user's answer, so previous questions dropped from the transcript. Replaced the one-off append with a unified `useEffect` in `useAssistantWorkflow.ts` that persists every `followUpQuestion` into history as it appears (dedup by content). Verified across 5 turns — full Q/A transcript retained.
- **"Re-run Search" reset to welcome**: `onRerun` was `reset()` (wiped workflow → welcome screen). Now re-runs *in place* with the edited requirements. Added a re-run path that **seeds structured requirements** into a fresh workflow so the coordinator skips the requirements agent (no re-extraction, no re-asked questions) and runs search→analysis→recommendation directly. Backend: `createWorkflow(…, seededRequirements?)` seeds `context.requirements` as `{isComplete:true,…}`; `startWorkflowStream` accepts optional `requirements` body field (free-text then optional). Frontend: `startWorkflow(message, requirements?)` sends `requirements`; `AIAssistantTab` `onRerun` calls `startWorkflow(editedDescription, {...editedRequirements, description: editedDescription})`. Verified: editing budget R$300→R$800 re-ran in place; narrative/reasoning/quality-score all reflected R$800; no welcome bounce.
- **LLM JSON hardening (workflow-crash fix)**: analysis & recommendation agents did a raw `JSON.parse` on LLM output — an empty/truncated/rate-limited response threw "Unexpected end of JSON input" and crashed the *whole* workflow into the error screen (losing search/analysis already done). New shared util `backend/src/agents/utils/llm-json.ts`: `parseLlmJson` (strips fences/prose/trailing commas, returns null vs throw — 10/10 unit-tested) + `parseClaudeJson` (call + parse, **1 retry** on parse failure for transient hiccups). Wired into analysis (fallback: minimal per-provider analysis from search matchScore), recommendation (fallback: rank by matchScore + generic localized reasoning), verification (uses parseLlmJson + guards missing check-objects → soft pass instead of `undefined.passed` throw), requirements (robust extract). Also removed a stray dead `twilio/lib/http/response` import in requirements.agent.
- **AI-generated job description**: the "Seus Requisitos" description (which is what's sent as the quote-request `description`) was seeded from the *initial* message — so nuances clarified across follow-ups ("blocked toilet upstairs, water rises on flush") never reached the provider. Requirements agent now emits `requirementsSummary.description`: a 1-3 sentence provider-facing summary of the job synthesized from the whole conversation, deliberately excluding location/date/budget (those have their own fields). Frontend seeds `editedDescription` from it (falls back to userRequest). **Verified end-to-end**: vague "preciso de um encanador" → clarified nuances → DB `quote_requests.description` stored the full AI summary, not the terse opener.

### ⚠️ Dev-DB data fixes applied this session (NOT in seed — lost on reseed)
- Demo customer name restored to "Demo Customer" (a profile-update test had overwritten it to "UpdatedFirst UpdatedLast"). Seed already says "Demo Customer".
- 33 existing message-notification `actionUrl`s migrated `/messages/<id>` → `/messages?conversationId=<id>`. New ones are correct from code.
- Demo provider's notifications marked all-read during testing.

## Open loose ends (not pending phases — pick as desired)
1. **User's manual-test backlog** (`Tests/Pending bugs and features - manual check.md`) — needs the user's review; partly stale. **Still open**: My Bookings "Message" button opens the **wrong conversation** (the `?with=` selection, NOT the notification deep-link which is now fixed); Book Service **address validation/autocomplete** (new feature).
2. **Finish backend i18n sweep** — the `t(req,key)` layer (`backend/src/i18n/`) is migrated for dispute/admin/booking/auth controllers; ~10 others (payments, messages, providers, users, locations, memory…) still emit English on the same pattern. (Note: quote 409/404 messages e.g. "Quote already submitted" are still English.)
3. **Stripe money-movement verification** — escrow hold/capture/refund + dispute resolution are unreachable in dev without a real `STRIPE_SECRET_KEY` + a saved test payment method.
4. **Goal-1 CX findings** (low priority): AI welcome placeholder says "São Paulo" (data is Florianópolis); search radius is a square bounding box under a "25km" label; `/voice/synthesize` 500s instead of silent-skip when OpenAI key absent.
5. **`VITE_MAX_PROVIDERS_PER_QUOTE`** is a hardcoded frontend env default (5) in `AIAssistantTab.tsx` — should become a proper system/admin config.
6. **Real-time notification push** uses 30s polling; Socket.IO push not wired.
7. **Cosmetic**: `validateDOMNesting` warnings (nested `<p>`) on the `/notifications` page (`NotificationCenter`) — pre-existing, harmless.

## Dev setup (local, Linux)
- Backend `:3000` — `cd backend && npm run dev`. **Stale-serving trap**: if backend edits don't take effect, `pkill -f ts-node-dev` then ONE clean `npm run dev` (run via the Bash tool's `run_in_background:true`, not `nohup &`).
- Frontend `:3001` — `cd frontend && npm run dev`.
- Postgres in Docker: container `tino2-app-db` (`docker exec tino2-app-db psql -U tino -d tino_app …`).
- Demo logins (all `Demo123!`): `customer@demo.com`, `provider@demo.com`, `admin@demo.com`; outsider test accounts `fábio.nascimento0@test.com` (customer), `tatiane.ferreira24@test.com` (provider).
- Demo provider profile id `d8ddddc0-ecfc-403f-ae0c-58b788c50458`.
- Production also runs at https://newtino.com (PM2 + Cloudflare tunnel) — **work on local dev servers; only deploy when explicitly asked.**

## Recurring gotchas (the ones that keep biting)
- **Stripe-init-before-checks** — `getStripeInstance()` throws in dev (no key); calling it before guard clauses hangs/500s the endpoint. Init the payment SDK *last*. (Bit us in A1, B1.)
- **`providerId` vs `userId`** — `quote/review/booking.providerId` stores the **Provider** entity id, not the User id. Provider-scoped authz must resolve `provider.id` from `userId` first. (A4/A5/A6.)
- **PostgreSQL numeric→string** — `numeric`/`decimal` columns come back as strings via `pg`; wrap with `Number()`/`parseFloat()` before arithmetic or `.toFixed()`.
- **i18next is v4** — plural suffixes are `_one`/`_other`, never `_plural`.
- **Backend server messages** — localize via `t(req, key)` from `backend/src/i18n/` (catalogs in `locales/pt.json`+`en.json`); frontend sends `X-Locale`.

---

## Productionization Roadmap — all ✅
| Phase | Feature | FRs | Status |
|-------|---------|-----|--------|
| 8 | Real-time messaging (Socket.IO JWT auth) | FR-053 | ✅ |
| 9 | Notifications system (in-app; push = 30s polling) | FR-010, FR-034, FR-043 | ✅ |
| 10 | Quote system (My Quotes + full flow) | FR-037 | ✅ |
| 11 | Provider availability calendar | FR-019 | ✅ |
| 12 | Provider responses to reviews + AI draft agent | FR-069 | ✅ |
| 13 | Admin panel | FR-074–081 | ✅ |
| 13b | Streaming AI provider search (SSE) | FR-025 | ✅ |
| 14 | Stripe integration (escrow) | FR-057–063 | ✅ (needs live key in prod) |
| 15 | Dispute resolution (admin-mediated) | FR-063 | ✅ |
| 16 | Email verification on register | FR-002 | ✅ (Ethereal in dev) |
| 17 | GPS geocoding | FR-022 | ✅ (needs Google Maps key) |
| 18 | Message file attachments | FR-050 | ✅ |
| 19 | Password change & recovery | FR-004 | ✅ |
| 20 | Production hardening | — | ✅ |
| 21 | Florianópolis seed data + PT_BR default locale | — | ✅ |
| 22 | Full i18n coverage (frontend) | — | ✅ |

## Agentic Memory — all ✅
| Phase | Feature | Status |
|-------|---------|--------|
| 1 | Schema + infra (pgvector, entities, DataSource) | ✅ |
| 2 | Semantic write path (ExtractionAgent, Deduper, PiiScrubber) | ✅ |
| 3 | Semantic read path (MemoryRetriever, ContextInjector) | ✅ |
| 4 | Episodic memory | ✅ |
| 5 | Reflection job (procedural rule derivation) | ✅ |
| 6 | Procedural rules wired as constraints into agents | ✅ |
| 7 | Memory UI (view & edit) | ✅ |
| 8 | Evaluation framework | ✅ |
| 9 | Extend memory to providers (`PROVIDER_SYSTEM_PROMPT` wired) | ✅ |

**Memory architecture quick-ref:** direct implementation (no Mem0/LangGraph); Voyage AI embeddings (`voyage-3`, 1024-dim) in pgvector; per-user scope; procedural rules tiered by confidence (≥0.85 auto-approve); PI   I opt-out + scrub on write. Embedding columns are NOT in the TypeORM entity — all vector ops use raw `MemoryDataSource.query()`.

## Key agent files
- Coordinator `backend/src/agents/coordinator.ts`; Requirements/Analysis/Recommendation/Verification agents under `backend/src/agents/`; Review-response `review-response.agent.ts`; Memory agents under `backend/src/agents/memory/`.
