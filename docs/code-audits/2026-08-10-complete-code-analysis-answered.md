# Complete Code Analysis Report — with responses

> **This is a copy of `2026-08-10-complete-code-analysis.md` with a response added under every
> finding.** The original text is unchanged; each `**Response**` block was added on 2026-08-17
> after the remediation work. Prepared so the analysis can be re-run against the current `main`
> and the claims here checked rather than taken on trust.
>
> **Responder:** Claude (Opus 5), working in Claude Code. Every finding was independently
> re-verified against the code before being fixed, and where reality differed from the report
> the response says so.

## Disposition summary

| ID | Finding | Status | Where |
|---|---|---|---|
| C1 | Refund authorization | **Resolved** | #10 (via #15) |
| C2 | Money units / client-controlled amounts | **Resolved** — finding aimed at a dormant path; the live path had a worse bug | #11 (via #15) |
| H1 | Public message attachments | **Resolved** — content scanning still absent | #12 (via #15) |
| H2 | Production deployment cannot execute | **Resolved by deleting the dead manifests** — env completeness still unvalidated in CI | #17, #19 |
| H3 | Requirements coverage overstated | **Partial** — contract tests fixed; traceability matrix not built | #27 |
| H4 | Browser/mobile coverage not enforced | **Resolved** | #20 |
| H5 | Provenance self-labeling bypass | **Resolved** | #18 |
| H6 | Actions referenced by mutable tags | **Resolved** — no Dependabot/Renovate | #16 |
| H7 | Access/refresh token substitution | **Partial** — type claim added; `localStorage` storage and server-side sessions unchanged | #14 |
| M1 | providerId vs userId | **Resolved** | #10 |
| M2 | Fake users in conversation search | **Resolved** — feature was wholly non-functional | #22 |
| M3 | Multi-service discovery | **Resolved** — filter was ignored entirely, not truncated | #25 |
| M4 | Accessibility too shallow | **Resolved** — contrast gated on Chromium only; no manual screen-reader pass | #29 |
| M5 | "Delete account" only deactivates | **Resolved by relabelling** — no deletion/anonymisation job built | #21, #23 |
| M6 | Data export only the profile | **Resolved** — the UI was also claiming data it did not export | #28 |
| M7 | Stale approvals | **Resolved in the workflow** — ruleset settings still not enabled (owner-only) | #30 |
| M8 | Frontend dependency audit missing | **Resolved** | #24 |
| M9 | No account lockout | **Resolved** — implementation held 4 defects, 2 unreported | #26 |
| M10 | 146-warning lint baseline | **Not addressed** — deliberate | — |
| L1 | Placeholder response rate | **Not addressed** — still present | — |
| L2 | USD/BRL presentation defaults | **Resolved** | #11, #13 |

**Still open by intent:** H3 (matrix), M10, L1 — plus the sub-parts of H1, H2, H7, M4, M5 and
M7 named in their responses. Those are the honest remainder, not oversights.

## Not in this report — found while remediating

Four things the audit did not identify, listed because they change how much weight the report's
"verification performed" section can carry:

1. **The live escrow-hold path charged `usd` for BRL prices — roughly a 5.4× overcharge.** C2
   examined `POST /payments`, which no production flow reaches. The path that does run was not
   examined, and it was live with real Stripe test-mode credentials.
2. **The API contract test asserted two endpoints that do not exist** (`/quotes/requests/my`,
   `/quotes/available`) and passed on their `400`s. H3 identified the weak assertion but not
   that it was already concealing failures.
3. **The lockout warning email fired on every wrong password**, because TypeORM returns
   `[rows, rowCount]` for a bare UPDATE and the resulting `undefined` **fails open** past a
   `!== null` check.
4. **A 15-minute lockout was enforced as 7h15m**, from a `timestamp without time zone` column
   written in SQL and read in node with the two sides in different zones.

Items 3 and 4 were introduced by the M9 remediation itself and caught in review — but they are
the class of defect this audit's method (static reading plus a passing test suite) does not
surface, which is the point worth carrying into the re-run.

## Current state

- **All 21 findings addressed or explicitly deferred**, across PRs #10–#31.
- **Deployed to production 2026-08-17** and verified live on newtino.com: health 200, PM2 clean
  boot with 0 restarts, new routes serving, legacy untyped JWTs rejected (every session was
  logged out once, deliberately), data export returning 858 KB with all five memory stores
  populated, zero console errors.
- Migration `1781400000000-LockedUntilTimestamptz` applied to the shared database (0 non-null
  rows affected, session TZ UTC so no table rewrite).

**Audit date:** 2026-08-10  
**Audited commit:** `05d6ebb`  
**Branch:** `codex-work`  
**Scope:** Requirements/workflow integrity, customer experience, and security

## Executive summary

The core marketplace slice builds and its existing automated tests pass, but it is not production-ready. The most urgent risks are payment authorization and amount handling, production deployment integrity, and exposure of private message attachments.

| Area | Critical | High | Medium | Low |
|---|---:|---:|---:|---:|
| Requirements/workflow integrity | 0 | 3 | 3 | 1 |
| Customer experience | 1 | 1 | 4 | 1 |
| Security | 1 | 3 | 3 | 0 |
| **Total distinct findings** | **2** | **7** | **10** | **2** |

Some findings span more than one area, so area totals overlap.

## Critical findings

### C1. Any authenticated user can refund another user's payment

**Area:** Security, payment correctness  
**Severity:** Critical

The refund endpoint requires authentication, but it does not restrict the caller to the payment's customer, provider, or an administrator:

- `backend/src/routes/payments.ts:50`
- `backend/src/controllers/PaymentController.ts:255`
- `backend/src/services/PaymentService.ts:257`

`requestedBy` is written into Stripe metadata but is never used for authorization. Anyone who obtains a valid payment UUID can initiate a full or partial refund.

**Potential correction:**

- Load the payment and associated booking before contacting Stripe.
- Permit refunds only under an explicit policy for the owning customer, assigned provider under defined conditions, or an administrator.
- Resolve provider-user ownership through `Provider.userId`; never compare a user UUID directly to a provider entity UUID.
- Enforce refund windows, allowed booking states, and the remaining refundable amount.
- Add integration tests for unrelated customers, unrelated providers, owners, and administrators.

**Response — RESOLVED (PR #10, landed on `main` via #15).**

Confirmed exactly as written. `processRefund` had no ownership check of any kind; `requestedBy`
went into Stripe metadata and was never read back for authorization.

Refunds are now restricted to the assigned provider and administrators, resolved through
`Provider.userId` rather than by comparing a user UUID to a provider UUID. Integration tests
cover the unrelated customer, the unrelated provider, the owning provider, and an administrator.

Two things the finding did not anticipate, both found while fixing it:

- The refund total was a read-modify-write race: two concurrent partial refunds could each
  read the same prior total and together exceed the captured amount. A row lock is now held
  across the Stripe call.
- **A policy decision was required and is worth re-reviewing.** The audit suggests permitting
  the owning customer to refund. `processRefund` requires a `SUCCEEDED` payment — money already
  captured — so a customer self-refund after delivery is fraud, not a remedy. Refunds are
  therefore provider/admin only, and the customer's route is the existing dispute flow. Easy to
  loosen if you disagree with the reasoning.

### C2. Payment amounts use conflicting units and remain client-controlled

**Area:** Customer correctness, financial integrity  
**Severity:** Critical

The frontend converts the booking total into cents in `frontend/src/components/payments/PaymentDialog.tsx:89`. The backend multiplies the received value by 100 again before sending it to Stripe in `backend/src/services/PaymentService.ts:121`.

A `$100` booking therefore becomes `10,000` in the request and then `1,000,000` Stripe minor units—a `$10,000` charge.

The frontend also sends lowercase `usd`, while backend validation accepts only uppercase currency codes:

- `frontend/src/components/payments/PaymentDialog.tsx:94`
- `backend/src/services/PaymentService.ts:536`

That likely causes the normal payment flow to fail before reaching the overcharge. Fixing only currency validation would expose the 100× amount error.

The server also trusts `data.amount` from the browser instead of deriving it from `booking.totalAmount`, allowing a custom client to request an intent for a nominal amount. Refunds contain the same unit mismatch between `RefundDialog.tsx:111` and `PaymentService.ts:278`.

**Potential correction:**

- Establish one money representation, preferably integer minor units throughout.
- Ignore client-supplied amount and currency; derive both from the accepted quote or booking.
- Add database constraints and a shared money utility.
- Add exact-value contract tests for `$0.50`, `$100.00`, full refunds, and partial refunds.
- Do not enable real Stripe credentials until this is corrected.

**Response — RESOLVED, but the finding was aimed at the wrong code path (PR #11, landed via #15).**

The double-conversion described here is real, but `PaymentDialog.tsx` → `POST /payments` is a
**dormant path**: no production booking flow reaches it. The live money path is the escrow hold
created from an accepted quote, and the audit did not examine it.

**That live path had a worse bug, which this report missed entirely:** it charged `usd` while
prices are denominated in BRL. Stripe was being asked for the booking's numeric total in US
dollars — roughly a **5.4× overcharge** at prevailing rates, on the only path that actually
runs. It was live with real Stripe test-mode credentials at the time of the audit.

Both are fixed. There is now one money representation (integer minor units via a shared
`backend/src/utils/money.ts`), amount and currency are derived server-side from the booking and
the platform currency setting rather than trusted from the browser, and currency is resolved
through a single `PlatformSettingsService` so `/config` and the payment path cannot disagree.
Exact-value contract tests cover 0.50, 100.00, full and partial refunds, and BRL/USD exponents.

The recommendation to hold off real Stripe credentials arrived after they were already live in
test mode. Worth noting for the re-audit.

## High-severity findings

### H1. Private message attachments are publicly accessible

**Area:** Security, privacy  
**Severity:** High

Message uploads require authentication, but resulting files are served from unrestricted `/uploads` paths:

- `backend/src/controllers/MessageController.ts:328`
- `backend/src/app.ts:111`
- `nginx/tino.conf:37`

Anyone possessing the URL can retrieve a private attachment without authenticating or belonging to its conversation. Upload validation also relies on the filename extension instead of verified file contents.

**Potential correction:**

- Store private attachments outside the public web root or in private object storage.
- Serve files through an authenticated endpoint that checks conversation membership.
- Use unguessable keys and short-lived signed URLs.
- Verify file signatures, normalize filenames, scan uploads, and force a safe `Content-Disposition`.
- Do not allow archives unless required.

**Response — RESOLVED (PR #12, landed via #15).**

Confirmed. Attachments were static files under a public path; the URL was the only secret.

They are now stored outside the web root and served through an authenticated endpoint that
checks conversation membership, keyed by an unguessable id. Legacy attachments were migrated
(6 rows, 0 stale URLs remaining).

Three additional defects surfaced during review of the fix, all corrected:

- A **self-grant bypass**: the read path trusted a record the attacker could create. Ownership
  is now checked at write time and the read is anchored to the uploader.
- **Attachment URL token exfiltration** — an attacker-controlled string could be rendered as a
  URL the client fetched with credentials attached. Both ends now allowlist a canonical path
  shape (`MESSAGE_ATTACHMENT_URL` in `frontend/src/services/api.ts`).
- Unicode filenames returned HTTP 500 (non-Latin-1 in a header throws in Node; busboy also
  hands filenames back as latin1). Now RFC 5987 encoded.

Not done: content-signature verification and malware scanning. Extension-based validation
remains, so that part of the finding stands.

### H2. The supplied production deployment cannot execute successfully

**Area:** Workflow integrity, availability  
**Severity:** High

`deployment/docker-compose.yml` references missing assets:

- `backend/Dockerfile`
- `frontend/Dockerfile`
- `deployment/redis.conf`
- `deployment/nginx.conf`
- `deployment/nginx/sites-available`
- `database/init-scripts`
- `database/backup-scripts`
- `monitoring/Dockerfile.healthcheck`

The deployment script invokes `npm run db:migrate`, but that script does not exist. The closest declared script, `migrate`, points to another missing file.

Environment names also disagree:

- Compose supplies `CORS_ORIGIN`, but application startup requires `ALLOWED_ORIGINS`.
- Production startup requires `ANTHROPIC_API_KEY`, but compose does not supply it.
- Compose supplies `RATE_LIMIT_MAX_REQUESTS`, but code reads `RATE_LIMIT_MAX`.

**Potential correction:**

- Choose one canonical deployment path and archive obsolete manifests.
- Add all referenced build and configuration files.
- Align environment variables through a validated schema.
- Run production image builds, migrations, startup, readiness, and rollback smoke tests in CI.
- Stop exposing PostgreSQL and Redis host ports unless explicitly required.

**Response — RESOLVED, by deletion rather than repair (PRs #17 and #19).**

Confirmed. Every listed asset was missing and the scripts pointed at files that do not exist.

The judgement call: `deployment/docker-compose.yml` described an infrastructure that has never
existed. Production is a PM2 process behind a Cloudflare tunnel, deployed by `deploy.sh`. So
the dead manifests were **removed** rather than completed — building out a second, unused
deployment path would have created a maintenance burden with no consumer, and a manifest that
cannot work is worse than no manifest.

`npm run migrate` now points at the real script (`migration:run`). The environment-name
mismatches went away with the manifests; the canonical path reads a single `.env.production`.

**Related gap this finding did not name, found during the deploy on 2026-08-17:**
`.env.production` was missing all `AI_*_MODEL_CHAIN` variables, and `App`'s constructor calls
`validateAiConfiguration()`, which throws without them. A deploy would have killed the running
process and then crash-looped — the site down with no rollback. Verified by booting the
production build with the chain blanked (`exit=1`, `fast AI model chain is required`). The
chains are now present in `.env.production`. **The underlying weakness remains: production
environment completeness is not validated anywhere in CI**, which is the generalisation of this
finding and is not yet addressed.

### H3. Requirements coverage is materially overstated

**Area:** Requirements integrity  
**Severity:** High

The original requirements describe a comprehensive marketplace, while the release gate exercises only 12 Chromium tests. Important areas receive little or no end-to-end behavioral coverage:

- real payment and refund lifecycle;
- password recovery;
- registration and email verification;
- file-upload privacy;
- conversation creation;
- account deletion and export;
- provider availability conflicts;
- Stripe webhook idempotency;
- Firefox, Safari/WebKit, and mobile browsers.

The API domain-contract test in `Tests/test-suites/current-product.test.ts:244` merely checks that responses are below 500 and not 401, permitting incorrect 400, 403, or 404 responses.

**Potential correction:**

- Mark requirements as delivered, partial, deferred, or unimplemented.
- Map every release requirement to an acceptance test or explicit waiver.
- Require exact response codes and state transitions.
- Define a smaller production MVP baseline instead of treating the draft specification as implemented.

**Response — PARTIALLY RESOLVED (PR #27). The traceability matrix was deliberately not built.**

The contract-test half is fixed, and it was worse than described. The assertion was
`status < 500 && status !== 401`, which is weak enough that it concealed **two of its own
cases**: `/quotes/requests/my` and `/quotes/available` are not routes at all. They were being
swallowed by the `:requestId` and `:quoteId` patterns and answering `400 Valid request ID
required`, and the test had been green throughout. Neither path appears anywhere in the
frontend either — the test was asserting fiction.

Those cases now point at the routes the product actually serves, and each asserts an exact
`200`, `success: true`, the documented envelope shape, and — where the caller owns records by
user id — that **every returned row belongs to the caller**. A 200 carrying someone else's
bookings is the failure worth catching and no status-code assertion can see it.

Coverage has also grown since the audit: 12 Chromium tests became **15 tests across 5 browsers
(75 runs)**, and the backend suite went from 32 tests to **176**.

**Not done:** marking each requirement delivered/partial/deferred and mapping it to a test or
an explicit waiver. That is a documentation exercise across `REQUIREMENTS.md` and
`TEST_REGISTRY.md`, and the honest position is that the requirements set is still a draft
specification treated as implemented. **This finding should remain open.**

### H4. Browser and mobile compatibility requirements are not enforced

**Area:** Adaptability, release workflow  
**Severity:** High

`playwright.config.ts:47` defines Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari, but `.github/workflows/quality.yml` runs only Chromium. This conflicts with the latest-two-version and mobile-browser requirements.

**Potential correction:**

- Run Chromium, Firefox, WebKit, and at least one mobile project on protected PRs.
- If runtime is a concern, keep Chromium on every PR and require a cross-browser workflow through a merge queue.
- Exercise responsive behavior across primary pages rather than only `/payments`.

**Response — RESOLVED (PR #20).**

Confirmed. The config declared five projects and CI ran one.

All five now run on protected PRs: Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari —
12 tests × 5 became **75 runs**. Responsive behaviour is exercised across the primary customer
pages (`/`, `/providers`, `/bookings`, `/messages`, `/profile`, `/payments`) rather than only
`/payments`, asserting no horizontal overflow at 390px.

This immediately earned its keep: the mobile projects caught a keyboard test that assumed the
conversation list survives selection (on narrow viewports the list is replaced by the thread),
and WebKit surfaced an axe disagreement described under M4.

Runtime is roughly 10–12 minutes for `validate`, which is acceptable without a merge queue.

### H5. AI review provenance can be bypassed by self-labeling

**Area:** Review workflow integrity  
**Severity:** High

A PR author can select `generated:human-or-mixed`, which immediately skips cross-agent review in `.github/workflows/cross-agent-review.yml:138`. There is no independent provenance signal or authorization restricting who may set or change the label.

**Potential correction:**

- Set provenance automatically from trusted branch prefixes, commit trailers, bot identity, or a trusted workflow.
- Restrict provenance-label changes to maintainers or validate label-change actors.
- Treat unknown provenance conservatively when AI contribution exceeds an agreed threshold.
- Audit provenance-label changes.

**Response — RESOLVED (PR #18).**

Confirmed. Any author could set `generated:human-or-mixed` and skip cross-agent review.

The label no longer exempts a PR from review. Provenance is not treated as an authorization
signal, which removes the bypass without needing to solve trusted provenance detection.

Not done: automatic provenance from branch prefixes or bot identity, and auditing of label
changes. Those are refinements; the bypass itself is closed.

### H6. GitHub Actions with secrets are referenced by mutable tags

**Area:** Supply-chain security  
**Severity:** High

Workflows reference actions such as `openai/codex-action@v1`, `anthropics/claude-code-action@v1`, and `actions/github-script@v9` through mutable tags. The AI actions receive API secrets and the workflow runs through `pull_request_target`.

**Potential correction:**

- Pin every third-party action to a reviewed full commit SHA.
- Use Dependabot or Renovate for controlled action updates.
- Keep the trusted-base checkout and inert-diff design.
- Document secret boundaries and rotate keys after any suspected action compromise.

**Response — RESOLVED (PR #16).**

Confirmed. Every third-party action is now pinned to a full commit SHA, including those
receiving API secrets under `pull_request_target`, and the Codex CLI is pinned to a version.
The trusted-base checkout and inert-diff design are unchanged.

Not done: Dependabot/Renovate for controlled action updates. Pins will therefore go stale
silently — worth adding.

### H7. Token design permits access/refresh-token substitution

**Area:** Authentication security  
**Severity:** High

Access and refresh tokens are signed with the same secret and contain the same claims. The refresh middleware accepts any valid JWT without checking a token type:

- `backend/src/utils/jwt.ts:14`
- `backend/src/middleware/auth.ts:156`

An access token can therefore be submitted as a refresh token to receive a fresh token pair. The frontend stores tokens in `localStorage`, increasing the impact of XSS, and the backend accepts access tokens from query strings, which can leak through history and logs.

**Potential correction:**

- Add a signed token-type claim and reject the wrong type.
- Use independently rotated refresh-token identifiers and server-side session records.
- Store refresh tokens in `HttpOnly`, `Secure`, `SameSite` cookies.
- Keep short-lived access tokens in memory where practical.
- Remove general query-string token authentication.

**Response — RESOLVED in part; two sub-findings remain open (PR #14).**

Confirmed. Access and refresh tokens carried identical claims and the refresh path accepted any
valid JWT.

Tokens now carry a signed type claim and the wrong type is rejected. Untyped legacy tokens are
also rejected, which is why the 2026-08-17 deploy logged every session out once — deliberate,
and timed accordingly.

**Not done, and these should remain open:**

- Refresh tokens are still in `localStorage` rather than `HttpOnly; Secure; SameSite` cookies,
  so the XSS impact described in the finding is unchanged.
- There are no server-side session records or independently rotated refresh identifiers, so a
  stolen refresh token cannot be revoked short of rotating the signing secret.

Query-string token authentication was reviewed; the remaining use is the Socket.IO handshake.

## Medium-severity findings

### M1. Providers cannot reliably retrieve or confirm their payments

Payment rows store a Provider entity UUID, while some ownership checks compare it to the authenticated user's UUID:

- `backend/src/controllers/PaymentController.ts:73`
- `backend/src/services/PaymentService.ts:192`

**Potential correction:** Centralize payment ownership resolution and compare provider payments through `payment.provider.userId`.

**Response — RESOLVED (PR #10).**

Confirmed on three endpoints, not two. `providerId` stores the Provider entity id, and
provider-scoped authorization now resolves `provider.id` from `userId` before comparing.

This confusion has recurred often enough in this codebase that it is recorded as a standing
trap in `SESSION_CONTEXT.md`, and the same resolution is applied deliberately in the new data
export (`DataExportService`).

### M2. New-conversation search uses hard-coded fake users

`frontend/src/components/messaging/NewConversationDialog.tsx:67` exposes three fake users and submits IDs `"1"`, `"2"`, and `"3"` to a UUID-backed API.

**Potential correction:** Replace this with a permission-aware provider/user search endpoint, preferably scoped to existing quote or booking relationships.

**Response — RESOLVED (PR #22), and the feature was entirely non-functional.**

Worse than "hard-coded fake users": the dialog submitted `"1"`, `"2"`, `"3"` to a UUID-backed
API, so **starting a conversation from that dialog could never succeed** for anyone. It was not
a placeholder pending real data; it was a broken feature.

Replaced with a permission-aware search scoped to existing quote and booking relationships, so
it cannot be used to enumerate users.

### M3. Multi-service discovery silently uses only the first service

The discovery API accepts `serviceTypes[]`, but `frontend/src/services/api.ts:746` sends only `serviceTypes[0]`.

**Potential correction:** Support repeated parameters or a documented array format and test combined-service filtering.

**Response — RESOLVED (PR #25), and the filter was ignored entirely.**

The finding says only the first service was sent. In fact the backend **ignored the parameter
altogether** — sending `serviceTypes[0]` had no effect, so multi-service discovery was not
truncated, it was absent. Repeated parameters are now supported and applied, with tests for
combined-service filtering.

### M4. Accessibility testing and implementation are too shallow

The CI accessibility test checks landmarks, one heading, and image alt attributes. It does not cover focus order, dialogs, errors, contrast, keyboard behavior, or screen-reader semantics.

For example, conversation rows in `frontend/src/components/pages/MessagingPage.tsx:207` are clickable `Box` elements without button semantics or keyboard handlers.

**Potential correction:** Use semantic interactive elements, visible focus, keyboard selection, automated axe checks, and manual screen-reader testing of primary flows.

**Response — RESOLVED (PR #29), with one deliberate limitation.**

Confirmed, and the example given was one of **eight**. Parsing the JSX for clickable elements
without button semantics found: the conversation row, the lifecycle filter chips, the dashboard
period selector, a notification row, a booking selection card, two expanders, and an
edit-field trigger. All are now real buttons — browser-provided role, tab order and
Enter/Space — restyled by one shared helper rather than eight copies of a reset, with a visible
`:focus-visible` ring. Selection state is announced (`aria-pressed`, `aria-expanded`,
`aria-current`) rather than conveyed only by colour.

The CI test named "has keyboard-reachable landmarks and labelled controls" **never pressed a
key**. It now tabs from the top and requires focus to land on something operable, and a second
test opens a conversation with Enter alone.

axe (`@axe-core/playwright`) now gates `/providers`, `/bookings`, `/messages`, `/profile` on
serious and critical violations. It found four real defects immediately: every lazily-loaded
route rendered an **unnamed progressbar** (the shared Suspense fallback), the provider-list
spinners were unnamed, the profile role chip was ~3.8:1, and the voice button had no accessible
name while its tooltip put `aria-label` on a plain span. Also fixed: conversation accents
measured **1.9:1** (gold) and 3.9:1 (terra) as text, and the header avatar was 4.3:1 on every
page. Worst case is now 4.55:1.

**Limitation, stated plainly:** `color-contrast` is enforced on **Chromium only**. WebKit
reported the conversation titles as failures — `text.primary` on cream, about **15:1** — along
with outlined buttons and most bookings-card text, while Chromium reported no violation on the
same DOM. axe derives contrast from rendered colour and guesses when it cannot resolve a
background. A gate that fails on 15:1 contrast gets switched off by the first person it
inconveniences. Every other rule runs on all five engines. The cost: a contrast regression
visible only under WebKit rendering would not be caught.

**Also not done:** manual screen-reader testing of primary flows, and focus-order/focus-trap
review of dialogs. axe catches what is mechanical; it cannot tell you whether a flow makes
sense when heard. Nothing here should be read as a claim that these screens are pleasant with a
screen reader — only that they are operable and correctly labelled.

**Known remaining gap:** the Browse & Filter tab has pre-existing `aria-label` on plain spans
and divs (the favourite button, the verified/insured badges) — the same class of defect,
outside the four pages the gate scans.

### M5. “Delete account” only deactivates the user

`backend/src/controllers/UserController.ts:155` and `backend/src/services/UserService.ts:228` set `isActive = false` but retain personal data, tokens, uploads, messages, memory, and payment identifiers.

**Potential correction:** Clearly call this deactivation or implement a retention-aware deletion/anonymization job with audit records and legal holds.

**Response — RESOLVED by relabelling, not by implementing deletion (PR #21, plus #23).**

The audit offered two options; the first was taken deliberately. The feature is now described
honestly as **deactivation** throughout the UI and API, rather than implying erasure it does
not perform.

A related gap found while doing it: deactivated providers were still returned by the public
by-id lookup, so a deactivated account remained publicly reachable. Fixed in #23.

**A retention-aware deletion/anonymisation job with audit records and legal holds was not
built.** If the requirement is genuine data deletion rather than honest labelling, this finding
should remain open.

### M6. Data export contains only the profile

`frontend/src/components/profile/PrivacySettingsDialog.tsx:65` exports only the response from `getProfile()`. It omits bookings, messages, quotes, payments, reviews, notifications, and memory.

**Potential correction:** Add a server-side portable-data export endpoint or background job covering all user-associated data.

**Response — RESOLVED (PR #28), and the UI was also making a false claim.**

Confirmed, with an aggravating detail the finding did not mention: the button's own description
already promised "all your account data including profile, bookings, and reviews". The product
was not merely exporting too little — it was **stating** it exported data it did not. That copy
now says what the file contains and what it leaves out, in EN and PT.

Export is now assembled server-side and covers bookings, quote requests, quotes, payments,
reviews written and received, conversations, notifications, saved providers, the provider
profile, and all five assistant-memory stores. For the demo customer in production it is
**858 KB** against a few hundred bytes before.

Design decisions worth reviewing:

- **Fields are chosen by allowlist, never by trimming a serialized entity.** The models carry a
  bcrypt hash, three token types, Stripe identifiers and staff-only dispute notes; a blocklist
  silently widens the export whenever a column is added.
- **Conversations contain your own messages only.** The requester gets their own writing in
  full, plus who the thread was with, which booking, when, and how many messages the other
  person sent — but not the counterpart's message bodies. Their side is not the requester's to
  take away. This was checked with the product owner before building.
- Excluded deliberately: payment gateway identifiers, `adminNotes` and the dispute resolution
  trail, `verifiedBy`/`rejectedBy` staff identities, and embedding vectors.
- **The completeness test enumerates columns from `information_schema`**, not from entity
  metadata, and requires every column to be either exported or explicitly excluded — so adding
  a column to `users` or `providers` fails the test until somebody decides which it is. This
  matters: `BasicUser` does not map `lastLogin`, so an entity-based check was structurally
  blind to it.

Export is synchronous. At current sizes it assembles in well under a second; if accounts grow
much larger this wants to become a background job with a download link.

### M7. Review approvals remain valid after new commits

`.github/workflows/review-policy.yml:29` identifies the latest review per user but does not verify that approval applies to the current head SHA. The ruleset does not dismiss stale approvals.

**Potential correction:** Require approval after the latest push or enable stale-review dismissal and last-push approval for non-owner PRs.

**Response — RESOLVED in the workflow; the ruleset half is outstanding (PR #30).**

Confirmed. The policy took each reviewer's latest review and accepted `APPROVED` without
checking which commit it applied to. Approvals are now matched against the head SHA, and a
stale approval reports itself specifically rather than as a generic "requires one approval".

Two constraints worth knowing for the re-audit:

- It **cannot be exercised by its own PR** — `pull_request_target` runs the base branch's copy.
- The logic stays inline in the YAML rather than moving to a testable file, because that job
  runs with write-capable credentials against untrusted PR content; having it load its own
  logic from the checkout is how that pattern becomes an exploit. It was verified instead by
  extracting the script block from the workflow file and running it against eight fixtures.

**Impact today is nil** — every PR here is opened by the owner and the policy short-circuits
for those before it reads reviews. It matters the first time somebody else opens one.

**Outstanding, and owner-only:** the repository ruleset still does not dismiss stale reviews on
push or require approval of the most recent push. That is the layer a future workflow edit
cannot weaken, and it has not been enabled.

### M8. Frontend production dependencies are omitted from the required audit

The quality workflow audits root and backend production dependencies but not frontend dependencies.

**Potential correction:** Add:

```bash
npm audit --prefix frontend --omit=dev --omit=optional --audit-level=high
```

The manual audit performed for this report found zero known production vulnerabilities in all three lockfiles.

**Response — RESOLVED (PR #24).**

The suggested command is in the quality workflow. Frontend production dependencies are audited
at `--audit-level=high` alongside root and backend. Still zero known vulnerabilities across all
three lockfiles.

### M9. Login brute-force protection does not meet the specified lockout behavior

Rate limiting exists, but the requirement calls for temporary account lockout after five incorrect attempts. Authentication does not track per-account failures.

**Potential correction:** Add normalized-email/IP attempt tracking, progressive delays, bounded lockouts, security notifications, and tests.

**Response — RESOLVED (PR #26). The implementation contained four defects, two of which
no reviewer reported.**

Confirmed: rate limiting existed, per-account tracking did not. Accounts now lock for 15
minutes after five consecutive failures, the response is identical whether it is the first
failure or the fourth (the remaining count is not probeable), and an unknown address returns a
plain 401 rather than a 423 that would confirm it exists.

Getting there took three review rounds, and the two defects found last are the interesting ones:

1. **The lockout warning email fired on every wrong password.** `repository.query()` returns
   `[rows, rowCount]` for a bare UPDATE, so `rows[0].lockedUntil` read a property off the row
   *array* — always `undefined`, never `null`, so a `!== null` check passed every time. It
   **fails open**. Both statements are now CTE-wrapped so the command tag stays `SELECT`.
2. **A fifteen-minute lockout was enforced as seven hours and fifteen minutes.** `lockedUntil`
   was `timestamp without time zone`, written from SQL but read back in node, which parses a
   naive timestamp in the process' zone. With the database on UTC and the process on UTC-7 the
   two guards on the login path disagreed, and the `Retry-After` sent to the user was wrong by
   the offset. Now `timestamptz` (migration `1781400000000`, applied to the shared database on
   2026-08-17).

Also fixed from review: a TOCTOU on the success path, where a correct password in flight during
bcrypt could clear a lock applied by concurrent failures and issue tokens anyway.

**A design point the finding did not raise:** a bounded lockout does not stop an attacker who
knows an address from spending five wrong passwords after every expiry and keeping the account
shut indefinitely. Any per-account lockout trades online guessing for denial of service. What
bounds it is a recovery route failed sign-ins cannot reach — password reset now clears the
lock, as does an authenticated password change. **Not done:** per-IP or progressive-delay
controls, so an attacker can still re-lock an account between resets.

### M10. Release quality permits an excessive warning baseline

Backend lint passes with 146 warnings, including pervasive `any`, unused code, and dormant mock-agent paths.

**Potential correction:** Establish a warning budget, fail on new warnings, and reduce the baseline incrementally. Prioritize payment, AI, controller, and persisted-JSON boundaries.

**Response — NOT ADDRESSED. Deliberate, and this finding should remain open.**

The baseline is still exactly **146 warnings**, and every PR in this remediation was held to
it — no new warnings were added. But no warning budget was established, CI does not fail on new
warnings, and the baseline was not reduced.

The reasoning: a 146-warning sweep touching payment, AI, controller and persisted-JSON
boundaries is a large diff of mechanical changes landing in the same window as security fixes,
which makes both harder to review. It is worth doing as its own piece of work.

The recommendation to fail on *new* warnings is the cheap half and could be adopted
independently of reducing the baseline.

## Low-severity findings

### L1. Provider response-rate statistics contain a placeholder

`backend/src/controllers/ProviderController.ts:566` reports a placeholder response rate.

**Potential correction:** Derive the value from quote-response history or display it as unavailable.

**Response — NOT ADDRESSED. Still present.**

`backend/src/controllers/ProviderController.ts:589` still reads `responseRate: 95, //
Placeholder`. Providers are shown a fabricated statistic about themselves.

It was not prioritised against the security and correctness work, but nothing about it is hard,
and displaying an invented number is a small honesty problem of the same family as M5 and M6.
**This finding should remain open.**

### L2. Payment presentation defaults conflict between USD and BRL

Payment screens use inconsistent default currencies and locales, contributing to the larger amount/currency ambiguity.

**Potential correction:** Make currency part of the accepted quote and booking contract and render it consistently from server data.

**Response — RESOLVED (PR #11, with #13).**

Currency is now part of the platform contract rather than a per-screen default: a single
`PlatformSettingsService` resolves it, `/config` exposes it, and payment screens render from
server data. Currency and locale are configurable per deployment via `app_settings`
(`platform_currency`, `platform_locale`) rather than hardcoded.

A live symptom this finding was adjacent to is described under C2: the escrow hold was charging
`usd` for BRL prices.

## Verification performed

**Response — figures at the time of the audit. Current equivalents on `main` (2026-08-17):**

| Check | At audit | Now |
|---|---|---|
| Backend tests | 9 suites, 32 tests | **23 suites, 176 tests** |
| Frontend tests | 2 files, 4 tests | 2 files, 4 tests |
| Protected E2E | 12 Chromium tests | **15 tests × 5 browsers = 75 runs** |
| Backend lint | 146 warnings | 146 warnings (baseline held, none added) |
| Dependency audits | root + backend | **root + backend + frontend**, all zero |

The note that no live Stripe charge or production deployment was exercised is worth carrying
forward: it is precisely why the `usd`-for-BRL overcharge on the escrow path went unseen.

- Backend typecheck: passed.
- Backend formatting: passed.
- Backend lint: passed with 146 warnings.
- Backend tests: 9 suites and 32 tests passed.
- Frontend tests: 2 files and 4 tests passed.
- Frontend production build: passed.
- Root production dependency audit: zero known vulnerabilities.
- Backend production dependency audit: zero known vulnerabilities.
- Frontend production dependency audit: zero known vulnerabilities.
- Existing protected E2E workflow inspected: 12 Chromium tests.
- No live Stripe charge, production deployment, email delivery, external AI call, or destructive exploit was executed.

## Recommended remediation order

**Response — followed, with two deviations.** Payment operations were not disabled or
feature-flagged first (step 1); the money fixes landed directly instead, since the overcharge
was on a path already live and flagging it off would have taken booking payments down. And the
traceability matrix (step 9) was not built. Everything else was done in roughly this order.

1. Disable or feature-flag real payment and refund operations.
2. Fix server-derived money values, units, currency, and refund authorization.
3. Protect message attachments and harden uploads.
4. Repair and test the canonical production deployment.
5. Harden access/refresh-token separation.
6. Expand protected CI to cover payment authorization and browser/mobile compatibility.
7. Close reciprocal-review provenance and stale-approval bypasses.
8. Replace mock customer-facing functionality and complete privacy workflows.
9. Build a requirements-to-tests traceability matrix.

## Audit limitations

**Response — accurate, and the most useful section of the report.** The limitations named here
map exactly onto what was missed: no deployed-environment testing, no real payment execution,
no production infrastructure validation. The escrow overcharge, the boot-time environment gap
that would have taken the site down on deploy, and the timezone defect in a live column are all
in that shadow. A re-run would gain the most from exercising a deployed instance rather than
reading more source.

This was a static and locally verified code audit. It did not include penetration testing against a deployed environment, real payment execution, external email/SMS delivery, production infrastructure validation, or destructive exploit attempts.
