# Complete Code Analysis Report

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

### H4. Browser and mobile compatibility requirements are not enforced

**Area:** Adaptability, release workflow  
**Severity:** High

`playwright.config.ts:47` defines Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari, but `.github/workflows/quality.yml` runs only Chromium. This conflicts with the latest-two-version and mobile-browser requirements.

**Potential correction:**

- Run Chromium, Firefox, WebKit, and at least one mobile project on protected PRs.
- If runtime is a concern, keep Chromium on every PR and require a cross-browser workflow through a merge queue.
- Exercise responsive behavior across primary pages rather than only `/payments`.

### H5. AI review provenance can be bypassed by self-labeling

**Area:** Review workflow integrity  
**Severity:** High

A PR author can select `generated:human-or-mixed`, which immediately skips cross-agent review in `.github/workflows/cross-agent-review.yml:138`. There is no independent provenance signal or authorization restricting who may set or change the label.

**Potential correction:**

- Set provenance automatically from trusted branch prefixes, commit trailers, bot identity, or a trusted workflow.
- Restrict provenance-label changes to maintainers or validate label-change actors.
- Treat unknown provenance conservatively when AI contribution exceeds an agreed threshold.
- Audit provenance-label changes.

### H6. GitHub Actions with secrets are referenced by mutable tags

**Area:** Supply-chain security  
**Severity:** High

Workflows reference actions such as `openai/codex-action@v1`, `anthropics/claude-code-action@v1`, and `actions/github-script@v9` through mutable tags. The AI actions receive API secrets and the workflow runs through `pull_request_target`.

**Potential correction:**

- Pin every third-party action to a reviewed full commit SHA.
- Use Dependabot or Renovate for controlled action updates.
- Keep the trusted-base checkout and inert-diff design.
- Document secret boundaries and rotate keys after any suspected action compromise.

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

## Medium-severity findings

### M1. Providers cannot reliably retrieve or confirm their payments

Payment rows store a Provider entity UUID, while some ownership checks compare it to the authenticated user's UUID:

- `backend/src/controllers/PaymentController.ts:73`
- `backend/src/services/PaymentService.ts:192`

**Potential correction:** Centralize payment ownership resolution and compare provider payments through `payment.provider.userId`.

### M2. New-conversation search uses hard-coded fake users

`frontend/src/components/messaging/NewConversationDialog.tsx:67` exposes three fake users and submits IDs `"1"`, `"2"`, and `"3"` to a UUID-backed API.

**Potential correction:** Replace this with a permission-aware provider/user search endpoint, preferably scoped to existing quote or booking relationships.

### M3. Multi-service discovery silently uses only the first service

The discovery API accepts `serviceTypes[]`, but `frontend/src/services/api.ts:746` sends only `serviceTypes[0]`.

**Potential correction:** Support repeated parameters or a documented array format and test combined-service filtering.

### M4. Accessibility testing and implementation are too shallow

The CI accessibility test checks landmarks, one heading, and image alt attributes. It does not cover focus order, dialogs, errors, contrast, keyboard behavior, or screen-reader semantics.

For example, conversation rows in `frontend/src/components/pages/MessagingPage.tsx:207` are clickable `Box` elements without button semantics or keyboard handlers.

**Potential correction:** Use semantic interactive elements, visible focus, keyboard selection, automated axe checks, and manual screen-reader testing of primary flows.

### M5. “Delete account” only deactivates the user

`backend/src/controllers/UserController.ts:155` and `backend/src/services/UserService.ts:228` set `isActive = false` but retain personal data, tokens, uploads, messages, memory, and payment identifiers.

**Potential correction:** Clearly call this deactivation or implement a retention-aware deletion/anonymization job with audit records and legal holds.

### M6. Data export contains only the profile

`frontend/src/components/profile/PrivacySettingsDialog.tsx:65` exports only the response from `getProfile()`. It omits bookings, messages, quotes, payments, reviews, notifications, and memory.

**Potential correction:** Add a server-side portable-data export endpoint or background job covering all user-associated data.

### M7. Review approvals remain valid after new commits

`.github/workflows/review-policy.yml:29` identifies the latest review per user but does not verify that approval applies to the current head SHA. The ruleset does not dismiss stale approvals.

**Potential correction:** Require approval after the latest push or enable stale-review dismissal and last-push approval for non-owner PRs.

### M8. Frontend production dependencies are omitted from the required audit

The quality workflow audits root and backend production dependencies but not frontend dependencies.

**Potential correction:** Add:

```bash
npm audit --prefix frontend --omit=dev --omit=optional --audit-level=high
```

The manual audit performed for this report found zero known production vulnerabilities in all three lockfiles.

### M9. Login brute-force protection does not meet the specified lockout behavior

Rate limiting exists, but the requirement calls for temporary account lockout after five incorrect attempts. Authentication does not track per-account failures.

**Potential correction:** Add normalized-email/IP attempt tracking, progressive delays, bounded lockouts, security notifications, and tests.

### M10. Release quality permits an excessive warning baseline

Backend lint passes with 146 warnings, including pervasive `any`, unused code, and dormant mock-agent paths.

**Potential correction:** Establish a warning budget, fail on new warnings, and reduce the baseline incrementally. Prioritize payment, AI, controller, and persisted-JSON boundaries.

## Low-severity findings

### L1. Provider response-rate statistics contain a placeholder

`backend/src/controllers/ProviderController.ts:566` reports a placeholder response rate.

**Potential correction:** Derive the value from quote-response history or display it as unavailable.

### L2. Payment presentation defaults conflict between USD and BRL

Payment screens use inconsistent default currencies and locales, contributing to the larger amount/currency ambiguity.

**Potential correction:** Make currency part of the accepted quote and booking contract and render it consistently from server data.

## Verification performed

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

This was a static and locally verified code audit. It did not include penetration testing against a deployed environment, real payment execution, external email/SMS delivery, production infrastructure validation, or destructive exploit attempts.
