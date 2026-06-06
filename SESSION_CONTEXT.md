# Session Context — Current Work

> Lean by design (per CLAUDE.md): current status + roadmap + resume point only.
> Detailed completed-work notes live in `Tests/history/HISTORICAL_CONTEXT.md` and git history.

## Current Status (2026-06-05)
- **Goal 1 — Find Providers E2E audit**: ✅ complete (16 defects fixed).
- **Goal 2 — Cross-role service lifecycle E2E audit**: ✅ complete (Chunk A + B = 8 defects, + 7 follow-up improvements). Commits `3f01b0d`, `0215d6a`.
- **All productionization phases (8–22) and Agentic Memory phases (1–9) are done** — see roadmap tables below.
- No formal goals/phases pending. Remaining work is loose ends (below).

## Open loose ends (not pending phases — pick as desired)
1. **User's manual-test backlog** (`Tests/Pending bugs and features - manual check.md`) — needs the user's review; partly stale (Send Message, Privacy/Notification settings, notification seed all since done). Likely still-open: My Bookings "Message" opens the **wrong conversation**; notification bell doesn't deep-link to the booking; Book Service **address validation/autocomplete** (new feature).
2. **Finish backend i18n sweep** — the `t(req,key)` layer (`backend/src/i18n/`) is migrated for dispute/admin/booking/auth controllers; ~10 others (payments, messages, providers, users, locations, memory…) still emit English on the same pattern.
3. **Stripe money-movement verification** — escrow hold/capture/refund + dispute resolution are unreachable in dev without a real `STRIPE_SECRET_KEY` + a saved test payment method.
4. **Goal-1 CX findings** (low priority): AI welcome placeholder says "São Paulo" (data is Florianópolis); search radius is a square bounding box under a "25km" label; `/voice/synthesize` 500s instead of silent-skip when OpenAI key absent.
5. **`VITE_MAX_PROVIDERS_PER_QUOTE`** is a hardcoded frontend env default (5) in `AIAssistantTab.tsx` — should become a proper system/admin config.
6. **Real-time notification push** uses 30s polling; Socket.IO push not wired.

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
