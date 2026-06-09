# Session Context — Current Work

> Lean by design (per CLAUDE.md): current status + roadmap + resume point only.
> Detailed completed-work notes live in `Tests/history/HISTORICAL_CONTEXT.md` and git history.

## Current Status (2026-06-07)
- All prior goals complete. **Active goal: Unified Bookings Lifecycle Hub** (refactor — see below). Other remaining work is the loose ends further down.

### 🎯 ACTIVE GOAL — Unified Bookings Lifecycle Hub (started 2026-06-07)
**Why:** "My Requests" + "Received Quotes" were two parallel flat tabs (confusing — quotes always belong to a request) and `/quotes` was unreachable for customers (only via Messages/notifications). Collapse the whole **request → quotes → booking → completion** arc into ONE screen per role, anchored on the booking lifecycle. Decisions locked with user:
- **Unified hub** (single nav entry, lifecycle stages), **both roles symmetrically**.
- **Direct hire = single-provider request** (`targetProviderIds:[pid]`); provider responds with a quote that **confirms or counters** terms (real say on price, not just yes/no). No separate instant-book path. Already representable — `targetProviderIds` + provider-visibility queries exist.
- Provider **"Available requests" browse feed stays separate** (Opportunities / find-work); Dashboard stays the summary landing. Nav label stays **My Bookings / Minhas Reservas**.

**6-phase plan (each phase = a goal, context updated between):**
| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Backend: link `Booking.quoteId/requestId` to origin (migration + populate + expose) | ✅ |
| 2 | Direct hire → single-provider request (BookingDialog → createQuoteRequest; provider counter) | ✅ |
| 3 | Frontend: unified customer hub (master-detail request cards w/ nested quotes; lifecycle filter chips) | ✅ |
| 4 | Frontend: provider symmetry (own jobs + counter-offer; Opportunities separate) | ✅ |
| 5 | Nav + i18n (EN/PT/ES) + retire `MyQuotesPage`/`QuoteManagementPage`; `/quotes`→`/bookings` redirect | ✅ |
| 6 | Playwright verification (both roles, EN+PT) + concise validation report for user | ✅ |

**Phase 1 done:** Added nullable `quoteId`+`requestId` uuid cols to `bookings` (migration `1780700000000-AddQuoteLinkToBooking`, idempotent, indexed on requestId); populated in `QuoteService.createBookingFromQuote`; full entities already serialize so API exposes them; frontend `Booking` type updated. Migration also caught up the previously-unrun `targetProviderIds` migration. `tsc` clean.

**Phase 2 done:** `BookingDialog.tsx` now creates a **single-provider quote request** (`createQuoteRequest({ targetProviderIds:[provider.id], budget:{min=max=proposedCost}, preferredDate=scheduledDate, requirements:[{category:'proposed_duration_hours', requirement:String(hours)}] })`) instead of `createBooking`. Provider receives it in their available-requests and responds with a quote (confirm/counter); customer accepts → booking (Phase-1 link). Removed dead 409/conflict handling (requests don't conflict-check). New i18n `hire_request.*` block (en/pt/es) — dialog reframed "Request a quote from {provider}", proposed-budget/terms-note copy, "Send Request" / success "provider will respond with a quote". Relabeled provider-card `book_now` value → "Request Booking"/"Solicitar Reserva" (honest; key kept). `BookingService.createBooking` retained for internal quote→booking path only; no UI caller now. `tsc` clean both sides.
- **Intermediate-state caveats (resolved by Phase 3/5):** (a) provider card still has TWO targeted-request buttons (`request_quote` open-ended + `book_now`/"Request Booking" with terms) — Phase 3 consolidates entry points; (b) a customer's new direct request is only viewable via `/quotes` (My Requests), which still has no customer nav link until Phase 5. Live Playwright verification consolidated in Phase 6 per user.
**Phase 3 done (customer hub):** Rewrote `MyBookingsPage.tsx` as the unified `/bookings` hub. New `components/bookings/RequestCard.tsx` = request card with **collapsible nested quotes** (chevron, collapsed by default; Accept/Decline/Message per quote + Compare when >1 pending). Booking-card JSX extracted to a shared local `renderBookingCard()` (used by both roles). Customer branch: lifecycle filter chips (All · Awaiting quotes · Active · Completed, with counts), unified `jobs` list = open requests + bookings, **deduped** (a booked request shows only as its booking via `Booking.requestId`). "New request" CTA opens broadcast `QuoteRequestDialog`. Deep-link `?quoteId=` auto-expands the holding request + highlights the quote. Provider branch unchanged (status filter + booking cards) pending Phase 4. New i18n `hub.*` block (+ `qstatus.*`, plural `quotes_count_one/_other`) and filled `actions.confirm_completion/open_dispute` + `messages.service_started/marked_complete/completion_confirmed` (replaced old hardcoded PT) in en/pt/es. `npm run build` green.
**Phase 4 done (provider symmetry):** Both roles now share the same lifecycle stages in `MyBookingsPage` (dropped the provider status-filter). `Job` union gained `sentquote`. Provider jobs = submitted quotes (pending → "Awaiting response"; rejected/withdrawn/expired → Done; accepted deduped via `Booking.quoteId`) + bookings; new local `renderSentQuoteCard` (withdraw on pending). `searchQuotes` is role-scoped server-side so the `['quotes']` query now runs for both roles. New **`OpportunitiesPage`** (`/opportunities`, provider find-work) extracted from the available-requests browse + `QuoteSubmissionDialog`; direct requests show a "customer's proposed terms" banner + "Respond" CTA. `QuoteSubmissionDialog` now pre-fills duration from the `proposed_duration_hours` requirement (price already pre-filled from budget) so a provider can **confirm in one click or counter**. Provider desktop nav: Dashboard · **My Bookings** · **Opportunities** · Messages · Reviews (was My Quotes). Added `Quote.customer/request` + `navigation.opportunities` (en/pt/es) + `hub.awaiting_response/awaiting_customer/withdraw/filter.awaiting_provider` + `opportunities.*` i18n. `npm run build` green.
**Phase 5 done (nav/i18n/cleanup):** `/quotes` route now `QuotesRedirect` → `/bookings` preserving the query string (old `?quoteId` notification deep-links still land + highlight). Backend notification `actionUrl`s fixed: provider new-request `/quotes`→`/opportunities`; customer quote-received `/quotes?tab=received&quoteId=`→`/bookings?quoteId=`. Provider **mobile bottom nav** Home→Opportunities (Dashboard·Opportunities·Bookings·Messages·Profile). Deleted `MyQuotesPage.tsx` + `QuoteManagementPage.tsx` (both unreferenced); pruned dead `quotes.page.*` i18n (en/pt; es lacked it). Both tsc + `npm run build` green; backend tsc green. Customer reaches the hub via the existing My Bookings nav entry — original "unreachable requests" problem solved.
**Phase 6 done (verified live, both roles, EN+PT).** ⚠️ Port 3000 is the **PM2 production backend + Cloudflare tunnel** (newtino.com); dev & prod **share** the `tino_app` DB. To avoid disrupting prod, made the Vite proxy target env-overridable (`VITE_PROXY_TARGET`, defaults :3000) and ran a **dev backend on :3002** + frontend :3001→:3002; **production left untouched on :3000**. Verified: customer hub (chips All/Awaiting/Active/Completed with counts, booking+request cards, Direct-request badge, collapsible nested quotes w/ Accept/Decline/Message), **accept→booking** (DB confirmed `bookings.quoteId`+`requestId` populated by current backend, counts transitioned Awaiting→Active), `/quotes?quoteId=`→`/bookings?quoteId=` redirect, full PT i18n (Minhas Reservas / Aguardando orçamentos / etc.), mobile nav. Provider hub (Aguardando resposta stage = sent quotes, Iniciar Serviço, mobile Oportunidades tab). Opportunities page (direct-request "Termos propostos pelo cliente" banner; Responder → QuoteSubmissionDialog **pre-filled to proposed R$120** = confirm-or-counter). **Fixed** a pre-existing cosmetic bug found during verification: a null-budget request rendered "R$ NaN" → now guarded with `Number.isFinite` in `RequestCard` + `OpportunitiesPage`. Zero console errors throughout. All builds green.

### ✅ GOAL COMPLETE — Unified Bookings Lifecycle Hub (all 6 phases). Awaiting user manual review.
- **Dev servers left running** for review: frontend http://localhost:3001 (or http://192.168.1.98:3001) → dev backend :3002; prod on :3000 untouched. Demo logins `customer@demo.com` / `provider@demo.com` (Demo123!).
- **Not committed** (per workflow — user reviews first).
- **Loose ends to revisit:** FindProviders still has two targeted-request buttons ("Request Quote" open-ended vs "Request Booking" w/ terms) — kept both w/ clear labels per decision; could add tooltips. The shared dev/prod DB has accumulated heavy test data (110+ customer jobs).

### Session 2026-06-07 (b) — 5 deployed-app CX fixes (`043c55a`) + earlier hotfixes (`396e739`,`2nd`,auth-storm) — all deployed to newtino.com, verified
- **Msg attachments**: upload timeout 10s→60s; Vite proxies `/uploads`→backend (dev only) so attachments render/download instead of hitting SPA fallback.
- **Rate-limit 429 storm**: scoped general limiter to `/api` (was global → static assets burned the per-IP budget); fixed client token-refresh recursion (refresh/logout 401 re-entered refresh → 990-call storm) via auth-endpoint guard + single-flight refresh.
- **#1** My Bookings count: `results_count_plural` key doesn't exist (i18next v4 `_one/_other`) → use count-based key.
- **#2** Stale lists on role switch: `queryClient.clear()` on logout+login (AuthContext).
- **#3** Notification bell English in PT: `createNotification` now stores i18n key+params in `metadata.i18n`; bell + center translate on render (fallback to stored strings). ~18 sites migrated; `titles/body/statuses` keys in notifications ns (en/pt/es). Old notifications keep original language by design.
- **#5** Providers couldn't start chats: added "Message Customer" to provider dashboard booking menu (mirrors customer button; open from quote-accept until booking closes).
- **#4** Mobile CX: provider card actions stack full-width (no label wrap); My Quotes header stacks + scrollable tabs; fixed MUI Rating string-value warning; silenced nested-`<p>` warnings in notification lists.

#### Follow-up fixes (same session, separate commits — all deployed + verified)
- **AI-assistant quote bar overflow (PT)**: sticky selection bar's "Enviar Pedido de Orçamento" clipped on phones; stack the bar + buttons on `xs` (Send full-width on top via `column-reverse`), row from `sm`. Verified 360/390/1100px.
- **Mobile bottom nav didn't translate**: labels were hardcoded PT → now `t('navigation.*')` (added short `search`/`bookings` keys en/pt/es); update live on language switch.
- **"New quote received" notification deep-link**: actionUrl was `/quotes` (opened wrong tab). Now `/quotes?tab=received&quoteId=<id>`; `MyQuotesPage` reads `?tab`/`?quoteId` → opens Received tab + scrolls/highlights the quote (`data-quote-id`). Verified end-to-end. (Old notifications keep `/quotes`.)
- **Notifications not appearing live**: `notification:new` socket handler only invalidated `['notification-count']` → list lagged until poll/refresh. Now also invalidates `['recent-notifications']` + `['notifications']`; i18n'd the toast (`notifications_panel.new_received`). Verified: provider message → customer's open bell shows it <1s, badge 1→2, no refresh.

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
- 2026-06-07 verification left a few test artifacts between demo customer/provider: a couple of test quotes (e.g. on request `06a62392…`) and chat messages ("VERIFY_REALTIME_XYZ", "Olá! Recebi sua reserva…"). Cosmetic; gone on reseed.

## Open loose ends (not pending phases — pick as desired)
1. **User's manual-test backlog** (`Tests/Pending bugs and features - manual check.md`) — needs the user's review; partly stale. **Still open**: Book Service **address validation/autocomplete** (new feature). _(Resolved: My Bookings "Message" deep-link now opens + scrolls the correct conversation into view in the left list.)_
2. **Finish backend i18n sweep** — the `t(req,key)` layer (`backend/src/i18n/`) is migrated for dispute/admin/booking/auth controllers; ~10 others (payments, messages, providers, users, locations, memory…) still emit English on the same pattern. (Note: quote 409/404 messages e.g. "Quote already submitted" are still English.)
3. **Stripe money-movement verification** — escrow hold/capture/refund + dispute resolution are unreachable in dev without a real `STRIPE_SECRET_KEY` + a saved test payment method.
4. **Goal-1 CX findings** (low priority): AI welcome placeholder says "São Paulo" (data is Florianópolis); search radius is a square bounding box under a "25km" label; `/voice/synthesize` 500s instead of silent-skip when OpenAI key absent.
5. **`VITE_MAX_PROVIDERS_PER_QUOTE`** is a hardcoded frontend env default (5) in `AIAssistantTab.tsx` — should become a proper system/admin config.
6. **Real-time notification push**: Socket.IO `notification:new` now invalidates badge + list queries so new notifications appear live; 30s polling remains the fallback when the socket is disconnected (no offline/reconnect reconciliation yet).
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
