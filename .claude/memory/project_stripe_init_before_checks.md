---
name: project-stripe-init-before-checks
description: "Recurring bug — controllers call getStripeInstance() before authz/state checks, hanging or mis-erroring in dev (no STRIPE_SECRET_KEY)."
metadata: 
  node_type: memory
  type: project
  originSessionId: aeee8df3-ab2e-451f-b633-70b940e7c89c
---

Recurring defect pattern in this codebase: a controller calls `getStripeInstance()` (from `config/stripe.ts`) at the TOP of the handler, before validating the request / checking ownership / checking state. `getStripeInstance()` **throws** when `STRIPE_SECRET_KEY` is empty (the dev default). Consequences depend on placement:
- Inside the try block but before checks → returns 500 instead of the correct 404/400 (and makes the endpoint untestable in dev). This was **DEF-A1** (`BookingController.startBooking` + `confirmCompletion`).
- **Outside** the try block → unhandled promise rejection → Express never responds → **request hangs forever**. This was **DEF-B1** (`AdminController.resolveDispute`).

**Why:** dev has no Stripe key, so any Stripe-dependent endpoint that inits the SDK eagerly breaks before reaching its real logic.

**How to apply:** always init the payment SDK *last* — after input validation, 404/ownership, and state checks, and only on the branch that actually moves money. When auditing any payment/escrow/dispute controller, grep for `getStripeInstance()` and confirm it sits after all guard clauses, inside try/catch. Related: [[project-providerid-vs-userid]] (the other recurring id-type bug).
