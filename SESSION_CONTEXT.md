# Session Context — Current Work

> Lean by design (per CLAUDE.md): current status + roadmap + resume point only.
> Detailed completed-work notes live in `Tests/history/HISTORICAL_CONTEXT.md` and git history.

## Current Status (2026-06-07)
- All goals/phases complete (productionization 8–22, Agentic Memory 1–9, Find-Providers + cross-role E2E audits). **No formal goals pending** — remaining work is the loose ends below.

### Session 2026-06-07 (b) — 5 deployed-app CX fixes (`043c55a`) + earlier hotfixes (`396e739`,`2nd`,auth-storm) — all deployed to newtino.com, verified
- **Msg attachments**: upload timeout 10s→60s; Vite proxies `/uploads`→backend (dev only) so attachments render/download instead of hitting SPA fallback.
- **Rate-limit 429 storm**: scoped general limiter to `/api` (was global → static assets burned the per-IP budget); fixed client token-refresh recursion (refresh/logout 401 re-entered refresh → 990-call storm) via auth-endpoint guard + single-flight refresh.
- **#1** My Bookings count: `results_count_plural` key doesn't exist (i18next v4 `_one/_other`) → use count-based key.
- **#2** Stale lists on role switch: `queryClient.clear()` on logout+login (AuthContext).
- **#3** Notification bell English in PT: `createNotification` now stores i18n key+params in `metadata.i18n`; bell + center translate on render (fallback to stored strings). ~18 sites migrated; `titles/body/statuses` keys in notifications ns (en/pt/es). Old notifications keep original language by design.
- **#5** Providers couldn't start chats: added "Message Customer" to provider dashboard booking menu (mirrors customer button; open from quote-accept until booking closes).
- **#4** Mobile CX: provider card actions stack full-width (no label wrap); My Quotes header stacks + scrollable tabs; fixed MUI Rating string-value warning; silenced nested-`<p>` warnings in notification lists.

### This session (2026-06-06→07) — all committed + pushed, verified in UI (EN+PT)
Git history has the full per-commit detail; one-liners here for resume.

**AI Assistant** (`d6b9956`, `c1d59f0`, `34ad1ab`)
- Multi-turn follow-up questions no longer vanish from the transcript — unified `useEffect` in `useAssistantWorkflow` persists every `followUpQuestion`.
- "Re-run Search" now re-runs *in place* by seeding edited structured requirements into a fresh workflow (coordinator skips the requirements agent — no re-extraction/re-asked questions). Backend `createWorkflow(…, seededRequirements?)` + `startWorkflowStream` optional `requirements` body field.
- Requirements agent emits `requirementsSummary.description` — provider-facing job summary synthesized from the whole conversation; flows into the quote-request `description` (was the terse initial message). Excludes location/date/budget (own fields).
- Enter sends the first message (welcome textarea was multiline-only; Shift+Enter = newline).
- Editing the "Localização" field replaces instead of prepending the stale neighborhood (parse positionally matching the display order).
- **LLM JSON hardening** — new `backend/src/agents/utils/llm-json.ts` (`parseLlmJson` + `parseClaudeJson` with 1 retry, unit-tested). analysis/recommendation/verification/requirements no longer crash the *whole* workflow on an empty/truncated LLM response — they fall back gracefully (was: raw `JSON.parse` → "Unexpected end of JSON input" → error screen).

**Messaging** (`c888b7b`, `7250c7e`, `36eb8d0`)
- Deep-linked conversation (My Bookings "Message") now reliably scrolls into view + highlights in the left list — gated on `!isFetching` so it can't lock onto a stale list position; `['conversations']` invalidated on conversation create. (`data-conv-id` on rows.)
- Messaging blocked once a booking is `completed`/`cancelled`: authoritative backend guard (`MessageService.sendMessage` → `MESSAGING_CLOSED` → 403); `getConversationById` returns `messagingClosed`/`bookingStatus`; MyBookings hides the button; ChatInterface shows a localized closed notice (`conversation.messaging_closed_*` en/pt/es).

**Notifications** (`d52ac28`, `77260a3`, `59f47e0`)
- **Preferences were a dead-end + email/SMS delivery silently broken**: existing users' stored prefs were legacy flat booleans `{email:true,…}`, but the UI *and* delivery gating expect granular `prefs.email.bookings` → empty UI AND `if (preferences.email.bookings)` always falsy (real email/SMS never sent). `NotificationService.getUserPreferences`/`updateUserPreferences` now **normalize** any stored blob to the canonical granular shape — fixes both. **No DB migration needed** (normalizes on read; legacy boolean channel → all-categories=that value).
- Rebuilt the Preferences tab as real per-channel (email/SMS/push) category toggles (optimistic save; race-hardened by reading freshest React-Query cache). Removed the redundant broken cog/`<Dialog>`.
- Filter tabs (All/Unread/Bookings/Payments/Reviews/Messages) now actually filter (set `selectedTab` but nothing consumed it before); added `unreadOnly` to `GET /notifications`.
- Removed the stub "History" tab → folded retention info into an ⓘ popover in the All-Notifications header. Translated hardcoded English; added `preferences.categories.*` + `refresh/deleted/delete_failed` in en/pt/es.
- _Known non-issue: a pathological burst of toggle clicks in a single JS tick can still race (React-Query optimistic update is a microtask); not reproducible by a human, left as-is._

### ⚠️ Dev-DB data state (NOT in seed — lost on reseed)
- Demo customer name restored to "Demo Customer" (a profile-update test had overwritten it). Seed already says "Demo Customer".
- 33 message-notification `actionUrl`s migrated `/messages/<id>` → `/messages?conversationId=<id>` (new ones correct from code).
- Demo customer/provider notifications were marked read and notification *preferences* toggled during testing (currently all-on). Cosmetic only.

## Open loose ends (not pending phases — pick as desired)
1. **User's manual-test backlog** (`Tests/Pending bugs and features - manual check.md`) — needs the user's review; partly stale. **Still open**: Book Service **address validation/autocomplete** (new feature). _(Resolved: My Bookings "Message" deep-link now opens + scrolls the correct conversation into view in the left list.)_
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
