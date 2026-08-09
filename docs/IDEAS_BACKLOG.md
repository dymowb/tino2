# Product and Agentic Ideas Backlog

This file holds promising ideas that are **not committed roadmap work**. An item moves into
the roadmap only after its user problem, safety boundary, smallest useful slice, and success
metric are agreed.

## How ideas are evaluated

Score each candidate from 1–5 on:

- user value;
- frequency of the problem;
- benefit from agent specialization rather than ordinary code;
- availability and quality of evidence;
- reversibility and human control;
- implementation and operational cost.

An idea should not become multi-agent merely because it contains several steps. Prefer
deterministic services when rules and calculations can solve the problem reliably.

## Agentic candidates

### Dispute Triage Assistant

**Problem:** Admins must reconstruct timelines and evaluate evidence across bookings,
payments, messages, and attachments.

Potential agents:

- Timeline Agent reconstructs authoritative events.
- Evidence Agent inventories relevant records and gaps.
- Policy Agent maps facts to platform rules.
- Resolution Agent proposes options.
- Fairness Agent challenges the proposal.
- Verification Agent checks citations and payment calculations.

**Safety boundary:** Advisory only. It cannot capture, refund, cancel, sanction, or message.
Every conclusion must cite platform evidence; the admin makes the decision through existing
services.

**Why deferred:** High value, but financial consequences require formal policies, stronger
audit retention, adversarial evaluations, and human-review UX first.

### Provider Job Coach

**Problem:** Providers may under-scope work or submit unclear quotes.

Potential agents:

- Scope Estimator identifies tasks and missing facts.
- Effort Agent estimates complexity and duration ranges.
- Pricing Agent structures provider-supplied rates and costs.
- Risk Agent identifies assumptions.
- Quote Writer creates a clear draft.
- Verification Agent checks grounding and math.

**Safety boundary:** Draft only. The provider owns price, duration, terms, and submission.
The system must not coordinate prices across providers or imply a market-mandated rate.

**Why deferred:** Build the customer-side Quote Decision Council first to establish fair,
evidence-backed quote interpretation and avoid conflicting scoring models.

### Rebooking Concierge — foundation delivered; broader orchestration deferred

**Problem:** Repeat customers should not reconstruct the same service request from scratch.

Potential agents:

- History Agent summarizes the prior booking.
- Change Detection Agent asks what differs this time.
- Requirements Agent creates updated structured requirements.
- Provider Fit Agent checks whether the prior provider remains eligible.
- Request Builder prepares a targeted quote request.
- Verification Agent shows copied and changed fields.

**Safety boundary:** Never submit automatically. The customer reviews all copied personal,
address, schedule, scope, and budget data.

**Status:** Favorites + Rebook and focused optional refinement are delivered. Keep broader
autonomous orchestration deferred until usage data shows that it is valuable.

### Marketplace Quality Monitor

**Problem:** Operations needs early signals for recurring cancellations, stale profiles,
unanswered requests, and abnormal lifecycle patterns.

Potential approach: deterministic metrics first; an agent summarizes clusters and proposes
investigations only after alerts cross explicit thresholds.

**Safety boundary:** No automatic provider penalties or customer restrictions.

**Why deferred:** Requires reliable analytics events and baselines before LLM interpretation
adds value.

## Non-agentic product ideas

### Favorites + Book Again — delivered

Customers can save providers, view favorites, and prefill a targeted request from a genuinely
completed booking. Cancelled bookings remain separate. Future work here is optimization and
analytics, not rebuilding the foundation.

### Product Analytics Foundation

Capture privacy-conscious events for request creation, quote receipt/comparison/acceptance,
readiness use, cancellation, dispute, and repeat booking. Define funnels before building an
AI analytics layer.

### Cross-browser CI Reliability

Install Firefox/WebKit host dependencies in CI, isolate rate limits per test project, and
use authenticated storage states to avoid repeated login bursts. This is engineering
backlog work discovered during the frontend review.

### Responsive Data Presentation

Audit remaining desktop tables and choose explicit mobile patterns: internal scrolling for
dense administrative data, cards for customer-facing data, and tested document-level
overflow constraints.

## Parking lot

- External market-price benchmarking — evidence, regional accuracy, and fairness unclear.
- Automatic scheduling negotiation — requires calendar conflict semantics and consent.
- Autonomous provider/customer messaging — too much agency without a mature approval model.
- Automated dispute resolution — explicitly excluded until policy and regulatory review.
- Provider portfolio visual analysis — value uncertain relative to privacy and compute cost.
