# Session Context - Current Work

## ✅ GOAL 2 COMPLETE (2026-06-05) — Chunk A (customer↔provider, 6 defects) + Chunk B (admin-mediated, 2 defects) = 8 fixed. See the two ✅ sections below. Original brief kept for reference.

## GOAL 2 BRIEF (reference): Cross-role service lifecycle E2E (self-contained)
Trigger this with: "Start Goal 2 — read SESSION_CONTEXT.md". Goal 1 (Find Providers audit) is ✅ complete (below).

**Objective**: critical E2E test of the *service lifecycle* across roles, the same way Goal 1 tested discovery — verify semantic intent and the cross-role customer/provider/admin journey, not just "does it load". Fix defects as you go; show a defect report at the end.

**Scope decisions (already made by user)**: **every state × every transition** (exhaustive, not just happy path) + **fix-as-you-go**. This is the most context-heavy combo → **chunk it**: (A) customer↔provider transitions first, then (B) admin-mediated states. Consider a `/clear` between A and B.

**Lifecycle states/transitions to cover** (booking is the spine):
- Booking: create → pending → provider accept/reject → confirmed → start (escrow hold) → in-progress → complete → customer confirm completion → review. Plus cancellation (by each side, at each stage), no-show, schedule conflict.
- Quote→booking path: quote request (incl. the new **targeted** vs broadcast — provider visibility), provider submits quote, customer accepts → booking created; expire/withdraw/close.
- Payments/escrow: hold on start, release on completion confirm, refund paths. NOTE escrow needs STRIPE_SECRET_KEY + customer payment method — may be absent in dev; test what's reachable and flag the rest.
- Disputes (admin-mediated): open dispute → admin views → resolve (favour customer / favour provider) → refund/release. Suspend/reactivate provider mid-lifecycle.
- Reviews: customer review after completion; provider response (FR-069 if present).

**Cross-role rule**: for each transition test BOTH the actor who's allowed and one who isn't (authorization/IDOR), and verify the *other* party's view updates (notifications, list status).

**Env / setup**: local dev. Backend :3000 (`cd backend && npm run dev` — **first `pkill -f src/server.ts` to avoid the duplicate-ts-node-dev stale-serving trap seen in Goal 1**), frontend :3001 (`npm run dev`). PT default locale; also spot-check EN per CLAUDE.md. Seed data present (customer@demo.com / provider@demo.com / admin@demo.com — Demo123!). Postgres in docker (tino2-app-db). Test with Playwright MCP + verify DB state after each transition.

**Carry-over context from Goal 1 worth knowing**: quote requests now persist `targetProviderIds` (targeted requests only visible to the target provider — test this in the quote→booking path). Booking/escrow bugs were fixed in earlier sessions (see history below). i18next is v4 (`_one`/`_other` plurals).

---

## ⏳ GOAL 2 IN PROGRESS — 2026-06-05 (Chunk A: customer↔provider)
**Method**: API-level state×transition matrix (scripted curl, 5 tokens: demo cust/prov/admin + outsider cust `fábio.nascimento0@test.com` + outsider prov `tatiane.ferreira24@test.com`, all `Demo123!`) verifying DB after each transition; Playwright for semantic-intent UI spot-checks. Harness: `/tmp/h.sh` + `/tmp/matrix.sh` (random per-run slot via `/tmp/off.cnt` to avoid schedule-conflict collisions on reruns). Demo provider profile id = `d8ddddc0-ecfc-403f-ae0c-58b788c50458`.
**Env note**: STRIPE_SECRET_KEY empty + demo customer has no payment method → escrow-bearing steps (`/start` hold, `/confirm-completion` capture) unreachable in dev; `completed` state unreachable for NEW bookings. Reviews tested vs existing seed completed bookings.

### Booking state machine — VERIFIED CORRECT (matrix all-PASS)
- pending: prov accept→confirmed, prov reject→cancelled, cust cancel (PUT & DELETE), self-confirm blocked, cust cannot set in_progress/completed.
- IDOR rock-solid: non-participants get 404 on GET/status/start/complete/confirm-completion across all states.
- confirmed: cust cannot self-advance; cust update-details allowed; cancel by both sides.
- in_progress: cust CANNOT cancel (neither PUT nor DELETE — by design); cust cannot complete.
- pending_completion: cust dispute→in_dispute (isDisputed=true, disputeStatus=open); cust cannot PUT to completed/in_dispute (must use endpoints).
- schedule conflict on overlapping booking → 409.

### Defects (Chunk A bookings)
- **DEF-A1 (FIXED, verified)**: `startBooking` + `confirmCompletion` called `getStripeInstance()` as the FIRST line, before owner/state checks → IDOR & wrong-state returned **500** instead of 404/400 (and made endpoints untestable in dev). Fix: moved Stripe init AFTER owner+state(+payment-method) checks in `BookingController.ts`. Now `/start` from wrong state→400, `/confirm` IDOR→404, `/start` valid→400 "Customer has not set up a payment method".
- **DEF-A2 (ARCHITECTURAL — pending user decision)**: generic `PUT /:id/status` lets provider do `confirmed→in_progress` and `in_progress→cancelled`, bypassing the `/start` escrow hold (verified paymentIntent=NULL). Also `in_progress→cancelled` via PUT would leave a placed hold unreleased (no Stripe refund), while DELETE-cancel correctly blocks in_progress. Decision needed: lock escrow-bearing transitions to the dedicated endpoints (tighten route validator to `confirmed|cancelled` + prune `validateStatusTransition`) vs keep as dev fallback.
- **Obs**: no-show has no dedicated status/endpoint (possible FR gap). in_progress→cancelled PUT-vs-DELETE inconsistency (part of DEF-A2).

### STALE-SERVING TRAP (recurred): ts-node-dev did NOT pick up the 2nd controller edit (served startBooking-new + confirmCompletion-old simultaneously). Fix: `pkill -f ts-node-dev` then ONE clean `npm run dev`. **Run backend via the Bash tool's `run_in_background:true` (task b3rob24tx) — `nohup … &` gets SIGTERM when the tool shell returns.** Harness `/tmp/quotes.sh`, `/tmp/reviews` inline. Confirm with focused re-test before trusting.

### Quote→booking path — defects (all CONFIRMED empirically)
- **DEF-A3 (MAJOR, PENDING USER DECISION)**: customer accepts quote → quote=accepted, request=closed, but **NO booking is created** (bookings count 422→422). Neither backend (`updateQuoteStatus`) nor frontend (`handleAcceptQuote`) creates one. The agreed service is never scheduled — quote lifecycle dead-ends. Decision needed: booking status on creation (confirmed vs pending) + scheduledDate source (request.preferredDate? TBD?).
- **DEF-A4 (FIXED, verified)**: provider-side quote actions compared `quote.providerId` (Provider entity id) to `req.user.userId` (User id) → provider could NOT withdraw/edit own quote (PUT status 403, DELETE 404). Fixed `updateQuoteStatus`/`withdrawQuote`/`updateQuote` in QuoteService to resolve provider.id from userId (also fixed two leftover `providerId` ReferenceErrors in loggers). Verified: withdraw PUT/DELETE 200, edit 200, IDOR 404.
- **DEF-A5 (FIXED, verified)**: `GET /quotes/requests/:id` had no visibility filter for providers → any provider could read ANY request by id (incl. targeted-at-other + customer PII). Fixed: `getQuoteRequestById` now takes `{customerId|forProviderId}`; controller resolves provider.id and applies broadcast-or-targeted-at-them filter (404 for provider w/o profile). Verified: outProv GET targeted-at-demoProv → 404; demoProv still sees own-targeted.
- **Targeted vs broadcast (Goal 1 carryover) — VERIFIED CORRECT**: demoProv sees broadcast+own-targeted; outProv sees broadcast only (not targeted-at-other). Provider can't create quote (403); customer can't (403→provider-only); duplicate quote 409; close/already-closed/IDOR-close all correct.
- **Obs Q-exp**: `expireOldQuotes` / `expireOldQuoteRequests` exist in QuoteService but are **never scheduled** (no cron — only autoCapture + reflection jobs are). Quotes/requests never auto-expire. Minor gap.
- **Obs**: `searchQuoteRequests` + single GET return full customer object (email/phone) to providers — privacy concern, same family as Goal 1 DEF-1 (not fixed; possibly product-intended for contact).

### Reviews + cross-role notifications — VERIFIED (DEF-A6 fixed)
- **DEF-A6 (FIXED, verified)**: `addProviderResponse` filtered `review.providerId` (Provider id) by `req.user.userId` (User id) → provider could NEVER respond to a review (FR-069 broken, 400 "not found/unauthorized"). Fixed ReviewService to resolve provider.id. Verified: respond 200, duplicate 400, IDOR(outProv) 400.
- **createReview authz VERIFIED CORRECT**: only the customer of a COMPLETED booking can review (provider→400, outsider-cust→400, double-review→400, happy→201).
- **Obs**: `draftReviewResponse` (AI draft, no persistence) fetches review w/o provider-ownership check — any provider can draft for any review. Low sev. `getReviewById` over-hides customer email/phone from the legit provider (providerId vs userId compare) — cosmetic.
- **Cross-role notifications VERIFIED**: booking create→provider; status change→other party; quote submitted→customer; quote request→targeted provider; review→provider (all land on correct recipient).

### User decisions (2026-06-05) — IMPLEMENTED & verified
- **A2 = "Lock to dedicated endpoints"**: `PUT /:id/status` validator now `confirmed|cancelled` only; `validateStatusTransition` pruned so confirmed→in_progress, in_progress→*, pending_completion→* are removed (escrow-bearing transitions go ONLY through /start, /complete, /confirm-completion, /dispute). Verified: confirmed→in_progress via PUT now 400; accept & cancel still 200. **Dev tradeoff (accepted): bookings can't progress past `confirmed` without Stripe (no /start hold).**
- **A3 = "Auto-create CONFIRMED booking"**: `QuoteService.updateQuoteStatus(ACCEPTED)` now calls new `createBookingFromQuote()` → booking status=confirmed, totalAmount=quote.price, estimatedDuration=quote.duration, scheduledDate=request.preferredDate ?? now+7d (with `specialInstructions` note when defaulted), location from request; created directly (NOT via BookingService — preserves quoted price, skips conflict check). Notifies provider "Orçamento aceito". Frontend `MyQuotesPage` now also invalidates `['bookings']` on accept. Verified API (425→426, fields correct) AND **UI E2E**: customer accepts in Orçamentos Recebidos → "Limpeza Residencial R$ 420,00 Confirmada" appears in Minhas Reservas (PT + EN both clean, no raw-key leaks).

### Chunk A — COMPLETE. Defects FIXED & verified: A1, A2, A3, A4, A5, A6 (6 total).
### New minor findings (logged, NOT fixed):
- **MyQuotesPage "Orçamentos Recebidos" card shows price as `$420.00`** (USD style) — should be `R$ 420,00` (pt-BR/BRL). The Bookings card renders it correctly, so it's localized to that quote card. Same family as Goal-1 currency fixes.
- `expireOldQuotes`/`expireOldQuoteRequests` never scheduled (no cron) → no auto-expiry.
- Booking/quote date renders pt-BR even under EN locale (date formatter pinned to pt-BR); time shows TZ-shifted (13:00Z → "05:00"). Pre-existing, minor.
- `searchQuoteRequests`/single-GET expose customer email/phone to providers (privacy; possibly product-intended).
- `draftReviewResponse` lacks provider-ownership check (read-only AI draft, low sev).
- No-show: no dedicated booking status/endpoint (possible FR gap).

---
## ✅ GOAL 2 CHUNK B — admin-mediated states — COMPLETE (2026-06-05)
**Method**: same API matrix harness (`/tmp/h.sh` + `/tmp/cb.sh`) verifying DB after each transition + Playwright UI spot-check of AdminDisputesPage. Backend clean on :3000 (single ts-node-dev), frontend :3001.

### Defects FIXED & verified (2 total: B1, B2)
- **DEF-B1 (MAJOR, FIXED, verified)**: `AdminController.resolveDispute` called `getStripeInstance()` at the TOP, **outside the try block**, before any validation. With STRIPE_SECRET_KEY absent it throws synchronously → unhandled promise rejection → request **HANGS forever** (no response). The entire dispute-resolve endpoint was dead in dev, and errors were misordered even with Stripe. Fix: moved Stripe init inside `try`, AFTER decision-validation + 404 + IN_DISPUTE-state + no-PaymentIntent checks. Verified API: invalid decision→400, non-existent→404, non-disputed booking→404, valid-but-no-PI→400; AND real UI: admin clicks Resolver → Liberar Pagamento → clean inline error "No Stripe PaymentIntent on this booking" (previously hung). **Same family as DEF-A1** (Stripe-init-before-checks).
- **DEF-B2 (MAJOR, FIXED, verified)**: expired **temporary** suspension not honoured at login. `authenticate` middleware lazy-reactivates when `suspendedUntil` passes, but `authenticateUser` (login) only checked `!isActive` → a user whose token expired during a time-boxed suspension was **permanently locked out** until manual admin reactivation (defeats the purpose of `suspendedUntil`). Compounded by the **`BasicUser` entity (used by the login path) lacking the suspension columns** — same class as the Phase-19 `passwordResetToken` gap. Fix: added `suspendedUntil`/`suspensionReason`/`suspensionComment` to `BasicUser.ts` (columns already exist in DB, no migration); added symmetric lazy-reactivation to `UserService.authenticateUser`. Verified: expired-temp login→200 + isActive flipped + suspension fields cleared; permanent suspension→401; future-dated temp→401.

### VERIFIED CORRECT (no defect)
- **Admin endpoint authz — airtight** (`requireAdminRole`): all 7 GET (dashboard/users/disputes/analytics/providers-pending/reviews-flagged/settings) + 4 mutating (user-status/dispute-resolve/provider-verify/review-moderate) → **403** for cust/prov/outcust/outprov; **200**/handler for admin.
- **Dispute resolution logic**: decision must be capture|refund (else 400); 404 on non-disputed/non-existent (findOne requires status=IN_DISPUTE); admin view loads full relations (customer + provider + provider.user); both-party notification path resolves `provider.userId` correctly — **NO `providerId===userId` bug** (the recurring pattern is absent here).
- **getDisputes filters**: default=all disputed (2), `?disputeStatus=open` (2), relations present.
- **Suspend provider**: blocks live token next-request (403 "Account is suspended"), blocks login (401 "account has been suspended"), **removes provider from public search** (`searchProviders` filters `user.isActive=true`, line ~161 — verified suspended profile absent from 23 returned), records reason/comment in DB.
- **Self-suspend blocked**: admin suspending own account → 400.
- **Reactivate**: clears all suspension fields; restores login + search visibility.
- **UI**: AdminDisputesPage renders both disputes (customer/provider/service/reason/status) + resolution dialog fully PT-localized (capture="Liberar ao prestador…CONCLUÍDA" / refund="Reembolsar ao cliente…CANCELADA"), 0 console errors.

### Unreachable in dev (flagged — needs Stripe)
- Actual **capture/refund money movement** + resulting status→COMPLETED/CANCELLED + disputeStatus='resolved' transition. No STRIPE_SECRET_KEY and the 2 seed disputed bookings have NO paymentIntent (escrow never ran — `/start` hold unreachable, see Chunk A env note). Need Stripe key + an escrow-held booking driven through start→pending_completion→dispute to test the full resolution.

### New minor findings (logged, NOT fixed)
- Backend error strings surface raw English in the PT UI (e.g. "No Stripe PaymentIntent on this booking") — i18n gap (backend messages not localized).
- Disputes table + dialog show currency as `R$141.00` (US decimal) — should be `R$ 141,00` (pt-BR). Same family as Goal-1/Chunk-A currency findings.
- **Suspending a provider does NOT notify their active counterparties** (customers with pending/confirmed bookings) nor cancel/flag those bookings — they just become un-actionable by the suspended provider. Possible product gap (Goal-2 "other party's view updates" rule).
- Login suspension check runs **before** password validation → reveals "suspended" vs "invalid credentials" to an unauthenticated prober (account-status enumeration). Low sev; same family as existing email-enumeration note.
- Middleware lazy-reactivation clears only isActive+suspendedUntil (leaves suspensionReason/Comment stale); the new login-path reactivation clears all four. Minor inconsistency — middleware could clear the other two too.

### GOAL 2 COMPLETE — total defects fixed: Chunk A (6: A1–A6) + Chunk B (2: B1–B2) = **8**.
Recurring root-cause themes across both chunks: (1) **Stripe-init-before-checks** (A1, B1) → always init payment SDK *after* authz/state validation; (2) **Provider-entity-id vs User-id confusion** (A4, A5, A6) — absent in admin handlers (good); (3) **BasicUser missing columns** the login path needs (B2, echoes Phase-19).

---

## CURRENT SESSION: Find Providers E2E Audit (Goal 1 of 2) — 2026-06-04
**Goal**: Critical E2E test of Find Providers — manual + AI paths, consistency, CX. Fix-as-you-go.
**Status**: ✅ COMPLETE. 16 defects fixed. Goal 2 (cross-role service lifecycle, every state×transition, fix-as-you-go) is a SEPARATE session — do a `/clear` first; it's the most context-heavy combo and may need chunking (customer↔provider, then admin-mediated).

### Defects fixed this session (Find Providers)
- **DEF-1 (security)**: public `/api/v1/providers` + `/:id` leaked bcrypt password hash + reset/verification tokens + Stripe IDs + settings + suspension. Fix: `select:false` on password/emailVerificationToken/passwordResetToken in `User.ts` (login paths explicit-select so unaffected); `searchProviders` join trimmed to public cols; `getProvider` controller sanitizes user. Stripe IDs NOT made select:false (would break payments — they're read via plain relation joins).
- **DEF-5 (major CX)**: `maxPrice` defaulted to 200 in `FindProvidersPage` state, sent as `maxRate`, silently hid ALL providers >R$200 (25% incl. the 4 nearest) with NO UI control. Fix: added Max Price slider (R$50–`MAX_PRICE_CAP`=300; at cap → omit maxRate). 
- **DEF-6**: "Disponível Agora" switch sent `isVerified` (not availability). Relabeled → "Apenas Verificados"/"Verified Only".
- **DEF-12 (AI, significant)**: requirements agent resolved relative dates ("esta sexta") to 2024 past dates — prompt said "based on today's date" but never injected it, and example used 2024-11-15. Fix in `requirements.agent.ts buildSystemPrompt`: inject `Today's date is <ISO> (<weekday>)`, reword to pick NEXT future weekday, dynamic example date (today+7).
- **DEF-9 (AI)**: follow-up question rendered twice (history bubble + active box). Fix: filter active followUpQuestion out of `messages.map` in `AIAssistantTab`.
- **Display/i18n cluster** (manual cards `FindProvidersPage`, AI cards `AssistantProviderCard`, `ProviderDetailDrawer`, `BookingDialog`, `QuoteRequestDialog`): `//hora` double-slash, `/fixed`/`/hourly` raw rateType, `$`→R$ currency, `NaN` rating→"Novo"/"New". Canonical unit keys now `providers:card.hourly`="/hora"/fixed="fixo"/no_rating; reused everywhere.
- **AI loading/labels**: progress labels were backend English SSE `event.message`; now driven by localized `event.stage` (added `progressStage` to `useAssistantWorkflow` + `status.recommendation/verification/narrative` keys). Sort buttons Match/Rating/Price + "Sort by" + "N other providers found" + "Quality verified · Score" all localized.

### Key gotchas discovered
- i18next here is **v4** (no `compatibilityJSON`) → plural suffix must be `_one`/`_other`, NOT `_plural`. All existing `*_plural` keys (reviews_count_plural, completed_jobs_plural, etc.) are DEAD/falling back to singular — app-wide latent bug.
- Manual search uses `apiService.searchProvidersGPS` → `/locations/providers/search` (returns road-distance + duration), NOT `ProviderService.searchProviders` (`GET /providers/`). Two different search backends.
- Demo Provider has `rating=NaN` (real value) with totalReviews=10 — aggregate corruption in seed/data.

### Follow-up fixes (user-decided, 2026-06-04 — all verified)
- **Quote targeting** (decision: target the clicked provider): added persisted `targetProviderIds` jsonb column to `QuoteRequest` (entity + migration `1780601900000` + applied to dev DB). Frontend `QuoteRequestDialog` now takes `providerId` → sends `targetProviderIds:[id]`; `FindProvidersPage` passes the clicked provider (dialog titled "Solicitar Orçamento de {name}"). Backend: `searchQuoteRequests` filters by `forProviderId` (provider sees broadcast + own-targeted only; controller resolves provider.id from userId); service now persists `targetProviderIds` in `create()` (was only in a log line) and notifies targets. **Verified**: provider sees BROADCAST+own-target, NOT others'; UI submit created a request targeted to Mariana Azevedo.
- **Terminology** (decision: Orçamento): all PT "Cotação"→"Orçamento" across quotes.json/providers.json/common.json with gender agreement (Minhas Cotações→Meus Orçamentos, esta cotação→este orçamento, etc.). EN already "Quote". No hardcoded component strings.
- **Ver Perfil on manual cards** (decision: yes): `FindProvidersPage` cards now have a "Ver Perfil" button (uses the previously-unused `card.view_profile` key) opening the shared `ProviderDetailDrawer`. Drawer made manual-safe: match-score chip hidden when `matchScore<=0`, NaN rating guarded. Manual provider mapped → `WorkflowProviderResult`.
- **Plural i18n app-wide** (decision: fix now): converted all 27 `*_plural` keys (9 each × pt/en/es; bookings/messages/notifications/providers) to v4 `_one`/`_other`. See [[project-i18n-plural-v4]].
- **WATCHER GOTCHA**: there were 3 competing `ts-node-dev` backend processes at session start → stale serving (edits not taking effect). Killed all, started one clean `npm run dev`. If backend edits "don't apply", check for duplicate ts-node-dev procs on :3000.

### New minor findings (logged, not fixed)
- Quote dialog: frontend marks Endereço/Estado/CEP as required, but backend validator treats them optional (FE stricter than BE).
- Quote dialog: "Raio de Busca (milhas)" says *miles*; app is metric (km) everywhere else.

### CX findings still open (lower priority — not yet addressed)
- AI welcome placeholder example says "São Paulo" but all data is Florianópolis.
- Radius is a square bounding box (`0.009*radius`/axis) so results to ~31km show under "25km" label.
- `/voice/synthesize` returns 500 (not silent skip) when OpenAI key/availability fails — console error each follow-up.

## CURRENT SESSION: Bug Fixes + AI Quote Flow — 2026-05-31
**Goal**: Booking bug, notification routing, message auto-select, AI quote flow, service type translation
**Status**: In progress

### Pending system config (TODO — not yet wired)
- `VITE_MAX_PROVIDERS_PER_QUOTE` (frontend env var) — controls max providers selectable for a quote request in AI assistant mode. Currently defaults to 5 via `Number(import.meta.env.VITE_MAX_PROVIDERS_PER_QUOTE ?? 5)` in `AIAssistantTab.tsx`. Should be exposed as a proper system config (e.g. from `/api/v1/config` or admin settings) so it can be changed without a redeploy.

### What was built this session

### What was built / fixed

**Bugs fixed:**
- **Booking list not showing new bookings** — default sort changed from `scheduledDate DESC` to `createdAt DESC` in `BookingService.searchBookings()`; limit raised 50→100 in `MyBookingsPage`. New bookings always surface at top.
- **i18n audit (EN locale)** — fixed all hardcoded PT strings across: `HomePage` (hero headline, eyebrow, stat labels), `MyBookingsPage` (filter chips "Aguardando Confirmação"/"Em Disputa", count "56 reservas", payment status labels), `Navigation` ("Minha Memória" avatar item), `NotificationBadge` (full panel: "Notificações", unread count, "Marcar como lidas", "Ver todas"), `ProfilePage` (userType "Cliente"), `MemoryPage` (entire page wired to `memory` namespace), `App.tsx` ErrorBoundary. Created `memory.json` locale for both en/pt.
- **ExtractionAgent memories in English** — added LANGUAGE rule to both customer and provider system prompts: write facts in same language as conversation. Updated examples to use PT.

**Notifications system (fully wired):**
- Fixed crash on `/notifications` page: `NotificationCenter.renderPreferencesDialog` was calling `Object.entries(preferences.email)` but `preferences` was the API wrapper `{ success, data }` — fixed `getNotificationPreferences()` to unwrap `.data`.
- Added `PATCH /notifications/read-all` endpoint to backend routes.
- Added `markAllNotificationsRead()` to `apiService`.
- `NotificationBadge` now uses `markAllNotificationsRead()` and properly translates all strings.
- Wired missing notification emissions: cancellation notifies other party; `updateBookingStatus` now notifies provider when customer updates (not just customer when provider updates).

**Send Message (My Bookings):**
- "Message" button now navigates to `/messages?with={provider.userId}` instead of showing "coming soon" toast.
- `MessagingPage` auto-selects the conversation with that user when `?with=` param is present.

**Profile Settings:**
- Notification Settings button now navigates to `/notifications?tab=settings` (existing preferences UI).
- Privacy Settings button opens a new `PrivacySettingsDialog` with: profile visibility toggle, data export (JSON download), AI memory link (→ /memory), account deletion info.
- Added `privacy` section to `profile.json` locale (en + pt).

**Seed data:**
- `seedDatabase.ts` now seeds notifications for customer@demo.com (7), provider@demo.com (6), admin@demo.com (3). All types covered: booking, payment, review, message, system. Mix of read/unread.

**Known gap:**
- Real-time notification push via Socket.IO still not wired (polling every 30s instead).

## Previous Session: Voice UI — 2026-05-30
**Goal**: Voice input/output for AI assistant
**Status**: ✅ COMPLETE

### What was built
- **`backend/src/routes/voice.ts`** — POST `/voice/transcribe` (Whisper-1, Portuguese) + POST `/voice/synthesize` (TTS-1, nova voice); `openai` npm package added
- **`frontend/src/components/assistant/VoiceMicButton.tsx`** — mic button, MediaRecorder, transcription via `apiService.voiceTranscribe()`; pulse animation while recording (Casa terracotta color)
- **`frontend/src/services/api.ts`** — `voiceTranscribe()` and `voiceSynthesize()` typed methods added to ApiService
- **`AIAssistantTab.tsx`** — VoiceMicButton wired into welcome form (auto-starts workflow on transcript) and follow-up form (auto-sends); `speakText()` TTS function reads follow-up questions aloud; `useEffect` auto-plays each new follow-up
- **CORS bug fixed** — `getAllowedOrigins()` was a top-level constant in security.ts, so ES module hoisting caused dotenv to not be loaded yet → `ALLOWED_ORIGINS` was always undefined. Changed to a lazy function called at request time.
- **PM2 rebuilt** — `npm run build` regenerated `dist/`, PM2 tino-backend restarted with new code

### How voice flow works
1. User taps mic (circle button with Mic icon) → browser requests microphone
2. Recording starts (button turns terracotta + pulse animation)  
3. Tap again → stops recording → uploads webm blob to `/voice/transcribe` → Whisper returns transcript
4. If on welcome screen: transcript auto-starts the AI workflow (no typing needed)
5. If on follow-up screen: transcript auto-sends the answer
6. When AI asks a follow-up question, TTS auto-plays it via `/voice/synthesize` → OpenAI nova voice → browser Audio API
7. Requires `OPENAI_API_KEY` in backend `.env`; TTS silently skips if key absent

---

## Previous Session: UI Redesign — "Casa" Design Language
**Date**: 2026-05-30 (earlier)
**Status**: ✅ Phase 1 · ✅ Phase 2 · ✅ Phase 3 · ✅ Phase 4 · ✅ Phase 5 — ALL PHASES COMPLETE

### Phase reorder (decided 2026-05-29)
Old: Phase 2=Shell, 3=Homepage, 4=Core flow. New: **Restructure first, refine later.**
New order: 2=Homepage+ProviderCards ✅ → 3=Bookings+Dashboard → 4=Nav Shell → 5=Admin+Polish

### Previous Session: Agentic Memory — All Phases Complete (6–9)
**Date**: 2026-05-25
**Status**: ✅ Phase 6 ✅ Phase 7 ✅ Phase 8 ✅ Phase 9 — all done

---

## ⚠️ FIRST THING NEXT SESSION
1. Production is live at https://newtino.com via PM2 + Cloudflare tunnel. **Do not use `npm run dev` — use `bash deploy.sh` to push changes.**
2. To test locally: `pm2 stop tino-backend`, then `cd backend && npm run dev` (port 3000) + `cd frontend && npm run dev` (port 3001). Restart production with `bash deploy.sh` when done.

## Previous "FIRST THING" (now done — left for reference):
2. **UI Redesign Phase 3**: read `UI_REDESIGN.md` Phase 3 checklist. Target pages:
   - `MyBookingsPage` — status-border card layout (gold=pending, green=confirmed, stone=cancelled)
   - `ProviderDashboardPage` — Fraunces stat numbers, styled Recharts (earth fill, cream bg)
   - `BookingDialog` — step indicator at top
   - Provider-facing booking cards (accept/reject)
3. Vite LAN: `server.host: true` already set — app available at 192.168.1.98:3001

### Phase 2 — What was built (2026-05-29)
- **HomePage**: Purple hero killed → editorial split (text + geometric composition). Services: flat grid → bento 4-col asymmetric. Features: checkbox list → 3 pillar cards. CTA: pink gradient → solid earth green with stat numbers.
- **FindProvidersPage provider cards**: Full structural rebuild. 4:3 colored header block with Fraunces initials (deterministic color per provider). DM Mono price pill + frosted glass trust badges overlaid on header. Custom gold star rendering (no MUI Rating). Service chips use card accent color. Two pill-button footer.
- **Default coords**: Changed to Florianópolis (-27.5954, -48.5480) to match seed data.
- **Vite host**: `server.host: true` added — LAN accessible.

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
1. Production live at https://newtino.com (PM2 + Cloudflare tunnel). Demo: `customer@demo.com` / `Demo123!`
2. Voice feature is live and working end-to-end (STT + TTS via OpenAI).
3. AI assistant returns providers correctly — search agent city filter bug fixed.
4. All known bugs from this session are fixed and deployed.
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
