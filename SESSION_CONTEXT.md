# Session Context — Current Work

> Lean by design (per CLAUDE.md): current status + roadmap + resume point only.
> Detailed completed-work notes live in `Tests/history/HISTORICAL_CONTEXT.md` and git history.

## Current Status (2026-09-05) — Codex follow-up audit (`2026-08-16`), HN1–HN3 + MN4/MN6 merged

Source: `docs/code-audits/2026-08-16-follow-up-code-analysis.md` (Codex, audited `3414f19`).
12 new findings (3 high). Each spot-checked against source before acting; two were wrong as
written (see below).

**Merged — #33 `4a4bb36`, HN1 + the legacy payments lifecycle.** The capture route
`POST /payments/:id/confirm` let the *provider* capture escrow before the customer confirmed
anything, and dragged finished bookings back to `confirmed`. It became provider-reachable
through my own M1 fix in the previous round — fixing the reported symptom widened the real
defect. Deleted rather than repaired. `POST /payments/intent` went with it: it authorised
funds with `capture_method: 'manual'` that **nothing in the product could ever capture**
(`autoCapture` reads `Booking` rows, never `payments`), and `PaymentDialog` checked for
`'succeeded'` on a manual-capture intent, which never occurs. Route, dialog, `PaymentsPage`
entry point and orphaned copy all removed.

> ⚠️ **Consequence worth knowing:** nothing now writes the `payments` table outside the
> seeder, because the booking escrow path records only `booking.stripePaymentIntentId`.
> Payment history, revenue views and `processRefund` were already blind to real bookings for
> that reason. Recording payments from the booking lifecycle is the follow-up, and it is a
> feature rather than a fix.

**Merged — #34 `9efb4da`, HN2, the escrow hold.** Scoped deliberately (see below) to: an atomic
`holdPlacedAt` claim taken **before** the Stripe call, a per-booking idempotency key, and a
final write conditioned on `status`, a null intent id, **and the amount actually authorised**.

### The lesson from this round, which cost seven review rounds

The first version tried to make every failure self-healing — a lease so a dead attempt could
be taken over, a fencing token so a superseded attempt could not write, reconciliation against
Stripe when the idempotency key stopped replaying. **Each fix created the next defect**, and
three consecutive findings were one error in different costumes: treating *"an intent exists"*
or *"I found nothing"* as a fact about the customer's money. (The same shape `M6`'s
catch-and-return-`[]` had. It is the recurring one here.)

The scoped version does not recover automatically. A claim never expires: an attempt that dies
mid-flight leaves the booking **stuck and alerting**, because every automatic takeover has to
answer "did the first attempt place a hold?" and every way of answering it from inside the
handler is a guess about money. A stuck booking is visible and fixable; a wrong guess
authorises a card twice.

**Not done, deliberately:** automatic recovery of an interrupted hold. It wants someone who can
verify Stripe's durability semantics against the docs — idempotency records are pruned at 24h
while a manual-capture authorisation lives ~7 days, which I got wrong twice.

### Two findings that were wrong as written — verify before complying

- "`api.ts` still exposes `confirmPayment()`" — it was deleted in the same commit.
- "`confirm-completion` leaves `Payment` PENDING" — the booking escrow path never creates a
  `Payment` row at all, and the `payment_intent.succeeded` webhook already sets `SUCCEEDED`.

Both were rebutted with evidence and the reviewer accepted. The date complaint in the audit's
LN1 is likewise noise: its environment clock was a day behind, not the report.

### Merged — #35 `e901aa3`, HN3 + MN4 + MN6, the three fail-open defaults

One theme: each was a default that answered "I could not
verify" with "everything is fine".

- **HN3 — DB TLS.** The connection string is parsed **once, by pg's own parser**
  (`config/databaseConnection.ts`), and handed to TypeORM as explicit
  `host`/`port`/`username`/`password`/`database` + `ssl`. **No `connectionString` reaches
  pg**, so nothing can re-parse it and overwrite the policy. TLS still follows what the URL
  said (`sslmode=disable` → off, so **prod is unchanged** — both prod URLs carry it), but the
  question is answered from pg's parsed output, never from a second reading of the text.
  Whenever TLS is used the peer is verified; CA from `DATABASE_SSL_CA`/`_CA_FILE` or the
  URL's `sslrootcert`; `no-verify` and `DATABASE_SSL_ALLOW_UNAUTHORIZED` are dev-only and
  **throw in production**; an unrecognised `sslmode` or a `sslcert`/`sslkey` this config
  cannot honour throws rather than dropping TLS. Remaining libpq parameters reach the driver
  through an **allowlist**, because TypeORM merges `extra` *last*: a forwarded
  `?connectionString=…` would otherwise outrank the resolved host and TLS policy and be
  re-parsed by pg. All four data sources use it, including the memory TypeORM CLI one.
- **MN4 — readiness freshness.** `stale: boolean` became
  `freshness: 'current' | 'stale' | 'unknown'`, and a failed reload or snapshot rebuild
  reports `unknown`, never `current`. A booking that no longer exists is `stale`. `stale` is
  kept as `freshness !== 'current'` so an older client degrades to the warning, not to false
  confidence. New EN/PT/ES copy `readiness.freshness_unknown`. **The create endpoint evaluates
  freshness too** rather than claiming `current` because the plan is new: the fingerprint is
  taken *before* a ~25s agent run, so a booking edited during generation is already stale on
  arrival. Nothing after the run may fail the request: if the stored run cannot be read back,
  the response carries the coordinator's own plan with `freshness: 'unknown'` rather than a
  500 that invites a retry paying for a second Opus run.
- **MN6 — `actionUrl`.** New `frontend/src/utils/internalPath.ts`; both `NotificationCenter`
  (which assigned it to `window.location.href` — now `navigate()`) and `NotificationBadge`
  accept only a single-leading-slash same-origin path. Rejects absolute URLs, `//host`,
  `/\host`, any scheme, control characters. The bell falls back to `/notifications`.

### HN3 took five blocking reviews, and four of them were one mistake

The first four attempts all kept handing TypeORM the URL *and* an `ssl` object. pg merges the
parsed connection string **over** the explicit config
(`Object.assign({}, config, parse(connectionString))`), so the URL always won; the repair —
sanitising the URL first — meant re-deriving pg's parsing rules by hand, and each round found
another rule that had been derived wrong:

| Round | Found by | The divergence |
|---|---|---|
| 1 | Codex | pg's parsed URL overrides the explicit `ssl` object entirely |
| 2 | `pr-precheck` | an allowlist with no `throw` on the else-branch: `no-verify` (a **real** mode) and any typo fell through to *plaintext*, where `main` had TLS |
| 3 | Codex | pg percent-decodes query keys; the strip compared raw text (`%73slmode`) |
| 4 | Codex | pg treats *any* `ssl*` parameter as a TLS request, not `sslmode` alone |
| 5 | Codex | pg keeps the **last** duplicate parameter; `URLSearchParams.get` returns the first |

Round 2 also fixed `sslcert`/`sslkey` being silently dropped and brought
`config/memory.data-source.ts` inside the policy. Production was never affected by any of it
(both URLs are `sslmode=disable`), which is exactly why unit tests, green builds and live
dev-server checks passed over every one of these.

The sixth version stopped patching and removed the second parser instead. Nothing to keep in
sync, so the whole table above is unreachable by construction rather than by vigilance.

Tests: backend 224/224 (24 connection + 7 freshness integration), frontend 7/7 (3 new),
lint 142 warnings (baseline 146), both builds green. Verified live on dev `:3002`: app DB and
memory/pgvector both connect with explicit fields, real queries served through each.

### In review — MN5, the AI cost budget

Branch `fix/audit-mn5-ai-cost-budget`. Readiness POST had `authenticate` and nothing else: the
only ceiling was the general limiter (100 requests / 15 min, counted across *all* API traffic),
which bounds request volume, not cost. One authenticated account could spend on ~25s multi-agent
Opus runs all day, and a completed plan could be regenerated forever for an unchanged booking.

Three decisions taken with the user, then built:

- **A completed run is reused, not repeated.** `POST` fingerprints the booking first and returns
  the existing plan (`200`, `reused: true`) when nothing changed; any edit changes the
  fingerprint and unlocks a new run on its own, so there is no cooldown to wait out. Only
  `completed` runs with the current `schemaVersion` qualify — a degraded run must stay
  retryable, and an old output contract must not be served after a release.
- **10 runs / 24h per account, 200 / 24h platform-wide**, both env-overridable
  (`AGENT_BUDGET_*`). Every row created in the window counts whatever it became: a failed run
  still called the models. Reused plans never reach the claim, so they cost nothing.
- **The platform ceiling refuses and alerts** (`429` + `Retry-After`, `logger.error` with
  `alert: 'agent_budget_exhausted'`). Reads stay open, so existing plans are still viewable.

The budget is claimed **before any model call**, in one transaction holding a per-workflow-type
advisory lock. A rolling-window count cannot be enforced by a unique index, and without
serialization two requests for *different* bookings both read "9 used" and both proceed. The
lock is held for the milliseconds of counting and inserting, never across the run. A cheap
in-memory limiter (`rateLimiters.agentRun`, 20 / 15 min per user) sits in front so hammering the
endpoint cannot queue on that lock — deliberately well above the daily budget, so a user out of
budget gets the message that says so rather than a generic rate-limit error.

The budget also lives in the generic `WorkflowRepository`, not in readiness, because Quote
Decision Council will want the same ceiling.

Tests: backend 243/243 (19 new), frontend 11/11 (4 new), lint 142 (baseline), both builds green.
Verified live on dev `:3002`: a real Opus run, then a second click served from cache with the
agents never invoked (EN + PT); with the cap set to 1, a 429 with the right `Retry-After` and
localized copy in both the toast and the inline alert, zero rows written, zero model calls.
Production `:3000` untouched throughout.

**Still open, and reported separately:** the axios response interceptor toasts only `data.error`,
so every localized `t(req, …)` controller `message` — the ~93 strings from the WS3 i18n sweep —
is replaced by raw English axios text. One line to fix, but it changes error toasts app-wide, so
it was kept out of this PR.

### Still open from the follow-up audit

**MN2** email case-sensitivity (needs a collision check + an `ALTER` on the shared dev/prod
DB — pair it with the pending `LockedUntilTimestamptz` window), **MN3** Spanish. Both confirmed
in source; neither started.

**MN3 is bigger than the audit says.** It is not only the two missing namespaces
(`admin` 177 keys, `memory` 29): Spanish is also short ~200 keys *inside* files it already has
(`assistant` -38, `common` -26, `messages` -17, `profile` -15, `quotes` -11, `auth` -9,
`reviews` -8, `providers` -7, `bookings` -1). And `backend/src/i18n/locales/` holds only
`en.json` and `pt.json`, so there is **no Spanish server catalog at all** — forwarding `es`
from `api.ts` has nothing to forward to until one exists. ~450 strings, not a patch.

### Traps MN5 added

- **The database writes `createdAt`, not TypeORM — and a JS `Date` parameter writes a different
  zone.** `InsertQueryBuilder` emits a literal `DEFAULT` for a `@CreateDateColumn` it was given
  no value for, so `agent_workflow_runs.createdAt` (`timestamp without time zone`) comes from the
  DDL's `DEFAULT now()`, in the **database session's** zone. Any JavaScript `Date` bound as a
  parameter — which is what `repository.update({ createdAt })` and a `:cutoff` placeholder both
  send — is rendered in the **node process'** zone instead. Seven hours apart locally. This means
  the *pre-existing* `reclaimExpiredLease` enforced a 15-minute lease as 7h15m — the `lockedUntil`
  bug again, in the file that had just been reviewed. Every age and window comparison is now made
  by the database against `COLUMN_NOW = now()::timestamp`, the same rendering the column's writer
  uses, so it is correct under any session zone.
- **Three rounds of *reasoning* about that column were wrong; the probe settled it in one.**
  First guess: `save()` writes UTC digits (wrong — it writes nothing). Second: `timezone('UTC',
  now())` makes the comparison zone-independent (wrong — it only works because this DB is UTC,
  and it would be *worse* than what it replaced on a non-UTC session). Both were caught by
  checking `InsertQueryBuilder` and a live database rather than by thinking harder. When a
  column's semantics are in question, insert a row and read the stored text.
- **Reading such a column back into JS re-skews it.** node-postgres parses a zoneless timestamp
  in the node process' zone, so a row written moments ago reads back as one written hours from
  now. The first `Retry-After` was 111600s instead of ≤86400 for exactly this reason. Compute
  the interval in SQL; do not subtract the parsed `Date` from `Date.now()`.
- **A fixture written with `update({ createdAt })` tests the wrong clock.** Backdate rows in SQL
  (`now()::timestamp - interval …`) or the test ages them by the offset rather than by the
  amount it names.
- **A boundary test only discriminates on the side the local skew runs.** Node is *behind* the
  database here, so a JS-`Date` cutoff makes every window **longer** — under which a 23h-in-24h
  row and a 14min-in-15min lease both still pass against the bug. Only the tests on the far edge
  (25h past a 24h window, 16min past a 15min lease) actually fail. The pre-check caught two of
  mine claiming to guard something they could not; each was verified by reverting the fix and
  re-running, which is the only way to know a test bites.
- **A `catch`-free budget still fails open through `NaN`.** `COUNT(*)` arrives as a string and
  `Number(undefined)` is `NaN`; every comparison against `NaN` is false, so an unreadable count
  is not a smaller budget, it is no budget. Same for a mistyped `AGENT_BUDGET_*` env — which now
  throws at boot rather than parsing to `NaN`.

### Traps the HN3/MN4/MN6 round added

- **Never let two parsers read the same input.** Five blocking reviews on one file, four of
  them the same mistake: we re-derived node-postgres' URL rules by hand and were wrong about
  percent-encoding, duplicate precedence, and which parameters imply TLS. Re-implementing a
  library's parsing is unbounded work with no signal when you are done. Borrow the library's
  own parser and pass its output on — then there is no second reading to disagree with.
- **Forwarding "the rest" of a config is an override channel.** TypeORM applies `extra` after
  its own fields, so anything passed through blindly can replace the host, credentials or TLS
  that were just resolved. Allowlist what gets forwarded; a blocklist only covers the aliases
  you thought of.
- **After expensive work succeeds, nothing may fail the request.** A transient read after a
  ~25s agent run threw a 500 for work that was already persisted, and the client's retry would
  have paid for a second run. Post-success steps degrade the response; they do not fail it.
- **"I just made it" is not a freshness check.** `createRun` asserted `freshness: 'current'`
  because the plan was newly generated — but the fingerprint is taken before the agents run,
  so an edit during those ~25s leaves the plan stale the moment it is returned. Any endpoint
  that reports a verified property must run the verification, even the one that produced it.
- **An allowlist needs a `throw` on the else-branch, not a default.** Narrowing what you
  accept turns every unrecognised-but-valid input into whatever the fallback is; ours was
  "no TLS", which downgraded working encrypted connections.
- `bookings.holdPlacedAt`/`startedAt` are `timestamp without time zone` — the `lockedUntil`
  bug's column type. A JS `Date` through the driver uses the **node** clock while `NOW()` uses
  the **database's** (7h apart locally). Stamp and compare server-side, or don't compare.
- `PaymentService` builds its **own** Stripe client rather than sharing `config/stripe`'s
  singleton, and the test mock hands out a fresh object per `new Stripe()`. Patching the
  singleton silently patches something the code never touches — a rejection set there yields a
  cheerful 200.
- `setup.ts`'s `jest.clearAllMocks()` empties `Stripe.mock.results`, so read the instance
  through the lazy singleton, not `mock.results`.
- A concurrency test whose mock returns a **fixed** id cannot tell one hold from two, and
  `mock.results[].value` for an **async** mock is the promise, not the value. Both made
  assertions that passed against the bug.

## Current Status (2026-08-17) — Codex audit remediation COMPLETE

Source: `docs/code-audits/2026-08-10-complete-code-analysis.md` (Codex, audited `05d6ebb`).
Every finding re-verified against `main` before fixing; several were larger or differently
shaped than written, and one real money bug (`usd` charged for BRL prices, ~5.4x) was missed
by the audit entirely.

**All findings closed.** Merged: #10–#14 + #15 (C1, C2, H1, H7, L2, M1, and the BRL/USD
overcharge), #16 (H6), #17 + #19 (H2), #18 (H5), #20 (H4), #21 (M5), #22 (M2), #23, #24 (M8),
#25 (M3), #26 (M9), #27 (H3 contract tests), #28 (M6), #29 (M4), #30 (M7).

**Deliberately not done, with reasons:** M5 account deletion (relabelled "Deactivate" rather
than built), M10 lint baseline (churn — the baseline is exactly **146** warnings; do not add
any), H3's requirements traceability matrix (documentation exercise, not code).

### What the last four items actually turned out to be

- **M9 lockout** — reported as 2 defects, was 4. The warning email fired on *every* wrong
  password because TypeORM returns `[rows, rowCount]` for a bare UPDATE, so `rows[0].col` was
  always `undefined` and passed a `!== null` check. And `lockedUntil` was `timestamp without
  time zone`, written from SQL but read back in node — with the DB on UTC and the process on
  UTC-7, a 15-minute lockout was enforced as **7h15m**.
- **H3 contract tests** — the assertion was `status < 500 && !== 401`, weak enough to hide two
  of its own cases: `/quotes/requests/my` and `/quotes/available` are not routes and were
  answering 400. Now exact status, envelope shape, and per-row ownership.
- **M6 data export** — was `getProfile()` serialized in the browser. Now server-assembled,
  ~192KB for the demo customer. Four review rounds, one root cause: the memory section
  returned an empty list on trouble, so wrong columns, wrong table set and wrong data source
  each produced a plausible-looking export instead of an error.
- **M4 accessibility** — 8 `<Box onClick>` controls became real buttons; axe now gates four
  pages. `color-contrast` runs on **Chromium only**: WebKit flagged `text.primary` on cream
  (~15:1) as a failure while Chromium found none on the same DOM. Every other rule runs on
  all five engines.

### ⚠️ Outstanding — needs a deliberate window

- **Migration `1781400000000-LockedUntilTimestamptz` is NOT applied to the shared dev/prod DB.**
  It is an `ALTER COLUMN TYPE`, not additive, so it was left for a chosen moment. Safe when run
  (0 non-null `lockedUntil` rows; session TZ is UTC so Postgres skips the table rewrite).
- **Deploying `main` logs every user out once** — untyped legacy JWTs are now rejected (H7).
  Intended, but time it deliberately, and pair it with the migration above.
- **Repository ruleset (owner-only):** enable "dismiss stale reviews on push" and "require
  approval of the most recent push". #30 enforces this in the workflow; the ruleset is the
  layer a future workflow edit cannot weaken.
- **Known a11y gap, not blocking:** the Browse & Filter tab has pre-existing `aria-label` on
  plain spans/divs (favourite button, verified/insured badges). Outside the pages the axe gate
  scans. Its own piece of work.

### Traps worth remembering (all cost a review round)

- `repository.query()` on a bare UPDATE/DELETE returns `[rows, rowCount]`, so `rows[0].col` is
  `undefined` and fails *open*. Wrap the statement in a CTE so the command tag stays SELECT.
- The memory store is **snake_case** (`user_id`, `source_type`, `created_at`) while its
  entities are camelCase, and it has **two DataSource objects**: `config/memoryDatabase` (the
  one the server initializes and every caller imports) and `config/memory.data-source` (TypeORM
  CLI only). Reading from the wrong one silently yields nothing.
- A path that catches and returns `[]` is invisible to live verification: an empty list reads
  as "nothing stored", not "never ran". Exercise the dependency for real.
- `memory.data-source.ts` calls `dotenv.config()` at import, so before this round any test
  touching memory connected to the **shared development memory store**. `src/tests/setup.ts`
  now pins and guards `MEMORY_DATABASE_URL` the same way it guards the app database.
- Jest wipes the test database (`TRUNCATE` in `beforeEach`), so **reseed before any Playwright
  run** that follows `npm test`.

## Current Status (2026-08-09) — BR-1 Booking Readiness Copilot delivered (read-only slice)

Roadmap milestone 3 (`docs/07-Agentic-Product-Roadmap.md` §3), phase **BR-1**. Design decisions
confirmed with the user before building: hybrid verification, `pending_completion` eligible /
`pending` not, generic runs table, one in-flight run per booking.

**Shipped:** workflow kernel (`agents/workflows/shared/` — `WorkflowRunner`, `WorkflowRepository`,
`SourceFingerprint`), `agent_workflow_runs` table (migration `1781100000000`), readiness snapshot
service (authz + untrusted-message boundary), Scope agent, hybrid verification, three read-only
endpoints, `ReadinessDrawer` UI + EN/PT/ES copy. Feature-flagged on `app_settings.booking_readiness_enabled`.

**The design decision worth remembering — verification is split.** Deterministic code owns
evidence resolution, invented-id rejection, dedupe, role filtering and the readiness rollup;
a small LLM pass owns only contradiction-vs-accepted-terms and speculation. That makes the
security-relevant properties unit-testable without mocking a model (24 tests, no live calls).
Both layers fired on real data: one finding dropped for unresolvable evidence, one for speculation.

**Three real bugs found while verifying — all fixed:**
1. The prompt labelled `Quote.estimatedDuration` as hours. It is **minutes** (default 60;
   `RequestCard.tsx` divides by 60 to display). That manufactured a false 120h-vs-120min
   contradiction on every booking.
2. `maxTokens: 2000` on the Scope agent truncated its JSON intermittently. The reasoning
   profile is Opus 5, where **thinking is on by default and shares the `max_tokens` budget**.
   Raised to 8000; truncation now reports itself instead of hiding as "unparseable output".
3. The frontend's 10s default axios timeout aborted the ~25s run POST. The server still
   finished, so the UI silently kept showing the previous plan. Per-request timeout 150s.

**Verified live:** customer + provider, EN + PT, desktop + 390px mobile, zero console errors.
Eligibility gate holds in UI (button on confirmed/in_progress/pending_completion only).
Outsider → 404 (no existence leak), unauth → 401, ineligible → 409, concurrent double-click →
one 201 + one 409 (DB partial unique index). Staleness: cosmetic `updatedAt` touch does **not**
stale; a `scheduledDate` change does. Backend 56/56, frontend 4/4, both builds green.

**Not in BR-1** (deliberately): Logistics agent, checklists, Risk/Communication agents, message
drafts, SSE progress, scheduled runs. No mutation endpoint exists.

## Current Status (2026-08-09) — Local env synced to Node 22 + test harness fixed

- Pulled `origin/main` (9 commits, up to `95ee654`); local `main` was 9 behind.
- **Node 22.12.0** installed via nvm (repo now requires `>=22.12 <23`; system Node 18 kept).
  `pm2` still resolves from `/usr/local/bin` under either Node — production was untouched
  throughout (`:3000` and newtino.com healthy, 8d uptime).
- Clean `npm ci` in root/backend/frontend. Full verification on Node 22: backend Jest
  **32/32**, frontend Vitest **4/4**, both builds green, Playwright Chromium **12/12**.
- `react-router-dom` 7.18.1 → **7.18.2** (RSC-mode CSRF advisory; SPA not actually exposed).
  Frontend production audit now reports 0 vulnerabilities.
- **Two local-only test-harness bugs fixed** (CI was unaffected, which is why they slipped):
  - `playwright.config.ts` `webServer.env` lacked the AI model chains, so the backend died at
    boot with `fast AI model chain is required`. CI only worked because `quality.yml` exports
    them. Now defaulted in-config (real env still wins).
  - `docker-compose.yml` had no project `name`, so the project defaulted to the directory
    name and sibling worktrees (`tino2` vs `tino2-codex`) collided on the hardcoded
    `container_name`s. Pinned `name: tino2`; test containers recreated under it (no volumes,
    reseeded per run). App DBs untouched.
- **AI model chains configured + verified** (see the corrected profile section below). The
  backend had been unbootable since the gateway landed because no `AI_*_MODEL_CHAIN` existed.
  New `backend/src/scripts/verifyAiChains.ts` exercises all four chains against live providers.
- **Dev backend runs on `:3002`, not `:3000`.** CLAUDE.md says to use 3000 and kill whatever
  holds it — but 3000 is the PM2 production backend + Cloudflare tunnel serving newtino.com,
  so killing it takes the live site down. Use `:3002` + `VITE_PROXY_TARGET` for dev.

## Current Status (2026-08-08) — Favorites/Rebook + configurable AI delivered

**Branch:** `codex-testing`

**Delivery commit:** `28e9954` (`feat: add favorites rebooking and configurable AI`)

**Remote:** pushed to `origin/codex-testing`

### Delivered product behavior

- Customers can favorite providers, browse saved providers, and start a repeat request from
  a genuinely completed booking. Cancelled bookings have their own section and are never
  treated as completed or rebook-eligible.
- Rebooking deterministically prefills the prior provider, service, location, scope, duration,
  and budget while preserving source-booking provenance. The customer must review and submit.
- Optional AI refinement changes only fields explicitly requested by the customer; it does
  not invent agreements or submit requests.
- The AI assistant, agent memory, review-response workflow, and rebook refinement now use a
  provider-neutral gateway. Workflow code selects `fast`, `reasoning`, or `synthesis`
  capabilities rather than hard-coded model IDs.
- Text chains support OpenAI/Anthropic targets; embedding chains support OpenAI/Voyage.
  Retries, timeouts, unconfigured-provider skipping, and ordered fallbacks are centralized.
- AI-powered routes (`/providers`, `/bookings`, `/reviews`, `/memory`) show a compact model
  transparency footer. Admin Platform Settings can validate and update model chains at
  runtime without exposing API keys.

### Active development profile (corrected 2026-08-09 — Anthropic text + Voyage embeddings)

> ⚠️ The previous version of this section described an "all-OpenAI" profile with chains
> `Luna → Terra`, `Terra → Sol`, `Sol → Terra`. **Those are not real model IDs for any
> provider** and no `AI_*_MODEL_CHAIN` was ever present in `backend/.env` — which is why the
> backend could not boot at all (`Error: fast AI model chain is required`, thrown from
> `validateAiConfiguration()` in the `App` constructor). Treat other unverified claims in the
> 2026-08-08 block with the same suspicion.

Real chains now in `backend/.env`, each **verified with a live provider call**
(`npx ts-node src/scripts/verifyAiChains.ts` — 4/4 pass):

| Profile | Chain |
|---|---|
| Fast | `anthropic:claude-haiku-4-5` → `anthropic:claude-sonnet-5` |
| Reasoning | `anthropic:claude-opus-5` → `anthropic:claude-sonnet-5` |
| Synthesis | `anthropic:claude-sonnet-5` → `anthropic:claude-opus-5` |
| Embeddings | `voyage:voyage-3` → `openai:text-embedding-3-small`, 1024 dims |

**Do not make OpenAI the primary embedding provider.** The 73 rows in `semantic_memories`
were embedded with `voyage-3`; vectors from a different model are not comparable to them, so
switching primary silently degrades retrieval rather than erroring. `AI_EMBEDDING_DIMENSIONS`
must stay 1024 to match the `vector(1024)` column and its HNSW index. OpenAI is deliberately
kept in the fallback slot only.

Environment variables remain bootstrap/recovery defaults. Admin overrides live in
`app_settings` and take effect immediately. Embedding dimensions remain environment/schema
configuration and cannot be changed from the admin UI.

**Boot-time validation only parses the chains — it never calls a provider.** A typo'd model ID
or expired key still starts the server cleanly and fails later inside a workflow; run
`verifyAiChains` after any chain change.

### Verification completed

- ~~Live calls passed for all three text profiles and OpenAI embeddings.~~ **Not reproducible**
  — no chains were configured, so the server could not start. Re-verified 2026-08-09 against
  Anthropic + Voyage instead (see the corrected profile section above).
- Full streaming booking workflow completed through search, analysis, recommendation,
  verification, narrative, and memory retrieval/persistence.
- Rebook AI refinement and OpenAI speech synthesis passed.
- Backend/frontend production builds passed; backend lint passed with pre-existing warnings.
- Targeted AI gateway/embedding/provider-boundary tests: 9 passing.
- Playwright confirmed the customer disclosure and admin configuration UI with no console errors.
- Invalid admin configuration returns HTTP 400; valid changes appear immediately.
- Secret scan passed; `backend/.env` and API keys were not committed.

### Current local environment

- Isolated backend: `http://192.168.1.97:3100`
- Isolated frontend: `http://192.168.1.97:3101`
- Test app DB: PostgreSQL on port 5434; test memory DB/pgvector on port 5435.
- The isolated demo database was reseeded after Jest setup cleared it.
- The separate instance on port 3001 was not used for this delivery.

### Resume point

The roadmap order is now:

1. Favorites + Rebook — delivered.
2. Provider-neutral AI configuration/control plane — delivered.
3. Booking Readiness Copilot — next implementation milestone.
4. Quote Decision Council — follows the Copilot.

Authoritative design details are in `docs/07-Agentic-Product-Roadmap.md`; runtime model
operations are in `docs/08-AI-Configuration-Operations.md`; deferred ideas remain in
`docs/IDEAS_BACKLOG.md`.

## Current Status (2026-07-27) — Reliability and product-quality follow-up

- Added a tested quote → booking → escrow hold → completion → capture lifecycle; fixed captured bookings retaining a stale `pending` payment status.
- Accepted quotes are idempotent at both service and database layers.
- Added structured request IDs, JSON logs, background-job metrics, an API contract endpoint, and 24-hour booking reminders.
- Added frontend Vitest coverage, actionable provider onboarding, and scored quote-comparison highlights.
- CI now validates frontend tests; root/backend production dependency gates remain clean.

## Current Status (2026-07-27) — Stabilization pass complete

- Runtime is standardized on Node 22.12; dormant MongoDB and Browserbase server code is removed.
- Backend validation uses disposable PostgreSQL/pgvector databases and real migrations. The supported Jest suite has 18 passing integration tests.
- Browser coverage is consolidated around the current product: nine Chromium smoke journeys cover public, customer, provider, admin, responsive, i18n, accessibility, security, and API surfaces.
- CI now performs clean installs, a high/critical production dependency audit, backend type/format/lint/test checks, the frontend build, and Chromium Playwright tests.
- Frontend routes are lazy-loaded and production output is split into stable framework/feature chunks.
- Production services and production data were not changed during this pass.

## Current Status (2026-06-16) — Loose-ends cleanup ✅ COMPLETE + deployed to prod
All plan workstreams done, committed to **main**, and live on newtino.com. Commits: `901cc17` WS4, `ecc62f1` WS1, `d0721a7`+`faeab25` WS3 (i18n now fully swept), `1de7daf` WS5, `dc846e8`/`6d495ef` WS2 (escrow+webhooks), `5cdcdb3` notification mark-read, plus the Places key + Stripe key/webhook env fixes. Dev servers :3001→dev :3002; prod :3000.

- **Notification mark-as-read on click (done, `5cdcdb3`):** bell dropdown never marked read (only navigated) → added `markNotificationsRead` mutation on click; notifications page awaited the mutation before its full-page nav so the reload can't abort it. Verified: bell 3→2, page 2→1, persisted in DB.

- **WS4 — quick fixes (done, verified):** (a) `/voice/*` → 204 silent-skip when no OPENAI key (verified 204). (b) Provider search now a **true Haversine circular radius** (was a square bbox); distance sort done in JS over the radius-bounded set because TypeORM can't ORDER BY a computed expr through join+pagination — also dropped the unused `reviews` join. Verified radius narrows 1→0, 5→6, 25→24, 100→24. (c) `VITE_MAX_PROVIDERS_PER_QUOTE` → `app_settings.max_providers_per_quote` via new public `GET /api/v1/config`; `AIAssistantTab` reads it (verified `{maxProvidersPerQuote:5}`). (d) Geocoding now surfaces `partialMatch`/`locationType`; `backfillRequestGeocodes` script geocoded the 2 real legacy (0,0) requests, left 4 junk at 0,0. (e) FindProviders request-button tooltips. (f) Fixed nested-`<p>` in bell dropdown. (g) Privacy dialog spinner while loading.
- **WS1 — address autocomplete + validation (done, verified):** backend `LocationService.autocomplete` (Places, BR-biased, **fail-fast** 3s/no-retry so it degrades instantly) + `resolvePlace`; routes `/locations/autocomplete` (degrades to 200 [] if Places unavailable) + `/locations/resolve-place/:id`. New `AddressAutocomplete` component wired into QuoteRequestDialog + BookingDialog: resolving auto-fills city/state/zip+coords (✓ check), submit blocked until coords resolve (kills (0,0) at source). **Verified live:** real address → ROOFTOP coords + autofill; junk → no resolve → blocked. ✅ **Places autocomplete now LIVE** (2026-06-15): root cause was the old Maps key lacked the *legacy* "Places API" (the SDK uses `maps/api/place/autocomplete/json`, not "Places API (New)"). New key `AIzaSyBK1j…` in `.env` → dropdown returns 5 predictions; verified on dev + prod (newtino.com).
- **WS3 — backend i18n sweep (✅ complete):** quote + user, then payments, messages, providers, locations, memory controllers migrated to `t(req,key)` with en/pt catalogs (~93 strings; `MESSAGING_CLOSED` sentinel preserved). Verified PT/EN on location/provider/payment endpoints.
- **WS5 — notification reconnect reconciliation (done):** `socketService.onConnect` → invalidate notification queries on re-connect (skips initial). tsc clean; app renders 0 errors.
- **WS2 — Stripe money-movement (✅ verified 2026-06-15):** root cause of the earlier rejection was a stray trailing `n` on the pasted `sk_test_` key. Corrected key in dev `.env`; `verifyStripeFlow` **PASSES** the full escrow lifecycle (HOLD requires_capture → CAPTURE succeeded → REFUND succeeded → CANCEL canceled) against Stripe test mode — same calls PaymentService uses. ✅ **TEST-mode Stripe now LIVE on prod** (newtino.com setup-intent returns `seti_…`). Keys mirrored into `.env.production`; loaded via clean `pm2 delete+start` (a plain `pm2 restart` reuses the saved empty env — dotenv won't override). **Webhooks now verified too** (2026-06-15): `STRIPE_WEBHOOK_SECRET` set; found+fixed a real bug — global `express.json()` consumed the body before the webhook route's `express.raw()`, so every webhook 400'd ("payload provided as parsed object"). Now skip JSON parsing for the webhook path; `verifyStripeWebhook` script signs a synthetic event → **HTTP 200 on dev + prod**. (`6d495ef`)

### Current Status (2026-06-11)
- 4 CX fixes done + verified live (customer & provider, EN+PT). **Not committed** (user reviews first). Dev servers still on :3001→:3002; prod :3000 untouched.

### Session 2026-06-11 — 4 CX fixes (verified, not committed)
1. **Miles→km (i18n mislabel)** — radius values are already km everywhere; only the labels lied. Fixed `quotes:request.search_radius` ("(miles/milhas/millas)"→"(km)") + dead `providers:distance_away` in en/pt/es. Verified: QuoteRequestDialog shows "Raio de Busca (km)", zero miles labels.
2. **"New quote received" deep-link didn't select** — `/bookings?quoteId=` auto-expanded the holding request but never scrolled to the quote. **Round-2 (user retested, still broken):** root cause was the user clicked an OLDER notification whose quote was already **accepted** → its request is `closed` and rendered as a **booking**, so the quote renders nowhere (hub drops non-`open` requests + accepted quotes). Fix in `MyBookingsPage.tsx`: `quoteBookingId` resolves a deep-linked accepted quote to `bookings.find(b=>b.quoteId===id)`; `effectiveBookingHighlight = bookingId || quoteBookingId` drives the booking-card outline; a single robust `useEffect` (deps incl. `expandedRequests`,`jobs`) does `scrollIntoView` for either `#booking-<id>` or `[data-quote-id=<id>]` — works on fresh load AND in-app nav. Removed the per-card ref-scrolls. Verified both: pending quote `55795597` → request expands + quote outlined+scrolled; accepted quote `aee30b35` → resolves to booking `40b000b8`, outlined+scrolled (`rgb(212,168,83)`, inView).
3. **Home "Popular Services" → AI placeholder** (user picked "AI mode, prefill example") — cards now `navigate('/providers?service=<slug>')`; `FindProvidersPage` reads `?service` → passes `serviceExample` to `AIAssistantTab`, which shows a service-specific example placeholder (`welcome.examples.<slug>`, Florianópolis-based, en/pt/es). 6 slugs: house_cleaning/plumbing/electrical/handyman/gardening/repairs. Also fixed the default placeholder city (São Paulo/Austin/CDMX → Florianópolis — loose-end #4 partial). Verified: Encanamento card → `?service=plumbing` → PT plumbing example; gardening differs.
4. **ProfilePage full rewrite** (user picked "full MUI/tokens rewrite" + "wire provider section") — was the last raw-inline-HTML page (hardcoded hex, no dark mode, PT header buttons overflowed on mobile). Rebuilt with MUI + Casa tokens: responsive header (Stack column→row, buttons flex on xs — no overflow), dark mode, React Query (`['profile']`,`['my-provider']`,`['service-catalog']`), edit/save. Provider section now **wired** (was dead code — `providerProfile` never loaded): loads via `getMyProviderProfile`, edits businessName/hourlyRate(R$)/serviceRadius(km)/description/services(**from DB catalog Autocomplete**), read-only rating/reviews/completedJobs. Dropped the fictional `availability_status` (not a real entity field — availability lives in the calendar). Verified live: PT mobile (no overflow), EN desktop, edit→save **persists** (rate 141→142→reload→142→reverted to 141), `completedJobs` numeric-as-string "106.00"→"106" guarded with `Math.round(Number())`.
   - **Round-2 follow-ups (user feedback on #4):**
     - **Account Actions misaligned** → now a responsive grid (`1fr` xs / `repeat(2,1fr)` sm), full-width left-aligned buttons (icon + label), consistent. Verified customer PT mobile.
     - **Notification Settings was a dead-end** ("can't come back") — `/notifications` is in the app shell but has no explicit back (and isn't in the mobile bottom nav). Added an `ArrowBack` IconButton to `NotificationsPage` header (`navigate(-1)`, falls back to `/profile`); new `notifications:back` i18n (en/pt/es). Verified: Voltar returns to /profile.
     - **Tested Change Password** — full round-trip (Demo123!→Demo123!@→back to Demo123!; the 2nd change proves the new pw was active). Password restored.
     - **Tested Delete Account** — multi-step flow works (3 acknowledgements gate Continue; type-"EXCLUIR MINHA CONTA" gates the delete button); **cancelled** — account left `isActive=t`, NOT deleted.
     - **Profile visibility was BROKEN (pre-existing)** — `PrivacySettingsDialog` Save was `onClick={onClose}` (no-op) and the toggle hardcoded `true`. Wired it: loads real `settings.privacy.showProfile` on open, Save merges full `settings` (preserves notifications) via `PUT /auth/profile`. **Backend fix:** `AuthController.getProfile` was omitting `settings`/`isVerified`/`profileImage` from the response (stale "not in BasicUser" comment — BasicUser DOES have them) → added them so the toggle reflects stored state. Verified: toggle off→save→DB `showProfile:false` (notifications intact)→reopen shows "Privado"→on→save→DB `true`. (Backend change — only matters once deployed; dev :3002 reloaded.)
   - `npm run build` green, frontend+backend tsc clean, 0 console errors throughout.

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

### ✅ GOAL 3 — Broadcast request matching (service category + radius) — deployed to prod (`5e35a63`)
**Problem found:** broadcast requests reached **ALL** active providers — no service or location scoping (stored `serviceType`/`searchRadius` ignored on the provider browse). Root taxonomy gap: provider services are specific (`Conserto Hidráulico`…) while request `serviceType` is free-form categories (`Plumbing`, `Encanamento`…) with no mapping.
**Foundation-first (user's call), audit showed provider services already catalog-clean (0 drift); only requests inconsistent (12 distinct, 8 are really categories).**
- **Taxonomy in DB:** `service_categories` table (17 categories ↔ 96 services) — `backend/src/data/serviceCatalog.ts` (seed source + pure `categorizeServiceType`/`categoriesForServices`), `models/ServiceCategory.ts`, migration `1780800000000` (creates+seeds+adds `quote_requests.category`+**backfills all legacy rows**). `ServiceCategoryService` loads it cached.
- **Source fixed:** `createQuoteRequest` resolves+stores `category` (any phrasing) → future requests matchable.
- **Matching:** `searchQuoteRequests` provider path shows a broadcast request only to providers whose services cover its category AND within radius. **Targeted requests bypass.** Safe fallbacks: uncategorised request, or missing/**(0,0)** coords → skip that filter (don't strand).
- **Admin:** `/admin/quote-requests` resolves+lists the **actual matched providers** per broadcast request (+ "reaches no one" flag).
- **Verified on prod:** #6068582C (plumbing, 0,0 coords → radius fallback) → **19 matched plumbing providers**; Demo Provider Opportunities scoped 5 (cleaning 2/plumbing 2/painting 1 — painting only because 1 is targeted at them; 5 painting *broadcasts* correctly hidden).
- **Known data-quality follow-up:** many requests have **(0,0) coords** (address never geocoded) → radius can't narrow them (falls back to category-only). Geocoding the request address at creation is the next improvement.
- **Gotcha (recurred 2×):** ts-node-dev served **stale** code after edits → `pkill -9 -f ts-node-dev` + clean restart needed before testing.

### ✅ GOAL 2 — Deploy + 5 follow-up fixes (2026-06-08, deployed to prod)
Committed to **main** (`61386f8` hub, `6821109` follow-ups) and **deployed to newtino.com twice** (deploy.sh builds working tree + PM2 restart; prod & dev share the `tino_app` DB).
1. **Deployed** the unified hub to prod (verified newtino.com/health 200, new bundle, dist has new code).
2. **Rebook reuses original address** — `BookingDialog` gained `initialLocation`; rebook passes `booking.location` (prefilled on open, editable). _Visual confirm of step-2 prefill left for user review; dialog-open verified on prod._
3. **Duplicate notifications** — reproduced quote-accept on current backend: server creates **exactly one** row (not a server dup). Root cause is **live double-delivery**: hardened `socketService.connect()` to tear down stale/connecting sockets before reconnecting, and `AuthContext` logout now `socketService.disconnect()` so room membership doesn't leak across sessions. (Historical DB dups are concentrated in 06-05 E2E test bursts + generic multi-transition titles.)
4. **Admin request-recipients view** — `GET /admin/quote-requests` (targeting broadcast/direct + target provider names + received quotes; `?search=<id-prefix>`) + `AdminQuoteRequestsPage` + nav entry (en/pt i18n; es falls back). Verified live on prod. **#6068582C = broadcast** (1 quote, Demo Provider R$148) — normal for a client request; only provider-card "Request Booking" targets.
5. **Multi-quote demo** (CX) — request **46745F66** "Limpeza Residencial" (Aguardando orçamentos) for demo customer with 3 pending quotes: Cristiane R$150/3h, Paulo R$180/3h, Sandra R$240/4h. View as `customer@demo.com` → Bookings → Aguardando orçamentos → expand → Compare.

**Dev servers still running for review:** frontend :3001 → dev backend :3002 (`VITE_PROXY_TARGET`); **prod untouched on :3000**. New env var `VITE_PROXY_TARGET` (dev-only, defaults :3000) lets a dev backend run off :3000 (which PM2/prod occupies).

### ✅ GOAL 1 COMPLETE — Unified Bookings Lifecycle Hub (all 6 phases). Deployed (see Goal 2).
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
1. ✅ **Address validation/autocomplete** — done (WS1, `ecc62f1`) + **Places suggestions live** (new Maps key with legacy Places API; verified dev + prod).
2. ✅ **Backend i18n sweep — complete**: quote + user (`d0721a7`) + payments, messages, providers, locations, memory controllers all migrated to `t(req,key)` (en/pt). ~93 client-facing strings keyed; `MESSAGING_CLOSED` sentinel preserved. Verified PT/EN on location/provider/payment endpoints.
3. ✅ **Stripe money-movement — verified** (WS2): escrow HOLD→CAPTURE→REFUND→CANCEL passes against test mode (`verifyStripeFlow`). Earlier failure was a stray trailing char on the key. Webhook signature verification also fixed + verified on prod (`6d495ef`).
4. ✅ **Goal-1 CX findings** — all done: "São Paulo"→Florianópolis (prev session); square-box radius → true Haversine circle (WS4); `/voice/*` 500 → 204 silent-skip (WS4).
5. ✅ **`VITE_MAX_PROVIDERS_PER_QUOTE`** → admin-tunable `app_settings.max_providers_per_quote` via `GET /api/v1/config` (WS4).
6. ✅ **Notification reconnect reconciliation** — done (WS5, `1de7daf`); 30s poll remains as additional fallback.
7. ✅ **Nested `<p>` warnings** — fixed in the bell dropdown (WS4). (NotificationCenter already used `component:'div'`.)
8. **Service Types display in PT when EN selected** — accepted won't-fix (domain data, no locale layer).

## 🆕 Bug logged 2026-06-16 — ✅ FIXED + deployed (`8c8ba0b`)
- **New chat message not shown on opening a conversation (needed manual refresh).** Root cause: global React Query `staleTime: 5min` served the **cached** message list on re-open, so a message that arrived while the chat was closed (its `message:new` socket event never reached the unmounted `ChatInterface`) didn't show until a manual refresh. Fix: `staleTime:0` + `refetchOnMount:'always'` on the `['messages', conversationId]` query in `ChatInterface` — opening a conversation always pulls fresh; live socket-append still handles messages arriving while it's open. Verified: inserted an inbound message while chat closed → appears on re-open with no refresh.
- **H4 (Filter by location)** — was skipped (GPS unconfigured); GPS/Maps now live → re-ran + ✅ Pass (radius narrows correctly on prod). TEST_REGISTRY updated.
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
- **pm2 env reload** — `pm2 restart` reuses the *saved* process env; `dotenv.config()` won't override an already-present var, so `.env` changes silently don't take effect. Use `pm2 delete <app> && pm2 start ecosystem.config.js --env production` (what deploy.sh does) to rebuild env from scratch.

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

**Memory architecture quick-ref:** direct implementation (no Mem0/LangGraph); provider-neutral
OpenAI/Voyage embedding chain at configured dimensions (current tested profile:
`text-embedding-3-small`, 1,024) in pgvector; per-user scope; procedural rules tiered by
confidence (≥0.85 auto-approve); PII opt-out + scrub on write. Embedding columns are not in
the TypeORM entity—all vector operations use raw `MemoryDataSource.query()`.

## Key agent files
- Coordinator `backend/src/agents/coordinator.ts`; Requirements/Analysis/Recommendation/Verification agents under `backend/src/agents/`; Review-response `review-response.agent.ts`; Memory agents under `backend/src/agents/memory/`.
