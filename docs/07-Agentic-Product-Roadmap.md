# Agentic Product Roadmap

**Status:** Active — Favorites + Rebook and AI control plane delivered; Copilot next

**Order:** Favorites + Rebook foundation first; Booking Readiness Copilot second; Quote Decision Council third
**Principle:** Agents advise and explain. Existing booking, messaging, quote, and payment services remain the only authorities that mutate business state.

## 1. Why these workflows

### Delivered foundation

- Favorites and deterministic completed-booking rebook are implemented.
- Optional verified AI refinement is implemented and remains customer-controlled.
- Provider-neutral fast/reasoning/synthesis profiles and ordered fallbacks are implemented.
- OpenAI/Voyage embedding routing, pgvector memory, runtime admin configuration, and
  customer-facing model transparency are implemented.
- The next product milestone remains Booking Readiness Copilot, followed by Quote Decision Council.

The product roadmap begins with a non-agentic **Favorites + Rebook** foundation: customers
can privately save providers and create an editable targeted repeat request from a completed
booking. Rebooking preserves the previous booking as provenance and optionally uses a
focused, verified AI refinement step to capture what should change. This delivers immediate
repeat-customer value and gives later agents better historical context.

Tino already has a discovery workflow that coordinates requirements, search, analysis,
recommendation, and verification agents. The next two workflows extend that pattern at
natural decision points in the marketplace:

1. **Booking Readiness Copilot** — after a quote is accepted, help both parties prepare
   and resolve ambiguity before the appointment.
2. **Quote Decision Council** — while a request has multiple pending quotes, explain
   trade-offs and help the customer choose.

They should share orchestration infrastructure, activity logging, LLM utilities, and UI
patterns, but not one oversized workflow context or coordinator. Each workflow needs its
own authorization rules, inputs, state machine, output schema, and evaluations.

## 2. Shared design decisions

| Concern | Decision |
|---|---|
| Routing | Deterministic state machines; no LLM decides which agent runs next |
| Agent communication | Specialists communicate through typed workflow state only |
| Source of truth | Agents receive server-loaded records; clients cannot submit “facts” about bookings or quotes |
| Mutations | No automatic message, booking, quote, payment, or calendar changes |
| Human control | Drafts require explicit review and confirmation before using existing mutation APIs |
| Evidence | Every finding names source fields or record IDs; unsupported claims are removed |
| Output | Runtime-validated structured JSON; prose is a rendering of that JSON |
| Failure mode | Partial useful output is allowed; failed or timed-out sections are clearly marked |
| Persistence | Store workflow metadata and final structured output, not duplicated booking/quote records |
| Freshness | Record source timestamps/version fingerprints and mark stale results in the UI |
| Privacy | Only booking participants can run readiness; only the request owner can run quote council |
| Localization | Generate structured facts first; render fixed UI copy through i18n; localize drafts at the edge |
| Observability | Request ID, workflow ID, agent duration, token usage, outcome, timeout, and schema failure |
| Rollout | Feature flag → demo users → opt-in beta → general availability |

### Shared infrastructure target

Create a small workflow kernel rather than immediately refactoring the working discovery
coordinator. Prove it with Booking Readiness, then migrate reusable concepts only when a
second consumer exists.

```text
backend/src/agents/workflows/
├── shared/
│   ├── WorkflowRunner.ts
│   ├── WorkflowRepository.ts
│   ├── WorkflowActivityRecorder.ts
│   ├── WorkflowSourceFingerprint.ts
│   └── schemas.ts
├── booking-readiness/
│   ├── coordinator.ts
│   ├── types.ts
│   ├── snapshot.service.ts
│   └── agents/
└── quote-council/
    ├── coordinator.ts
    ├── types.ts
    ├── snapshot.service.ts
    └── agents/
```

Do not make the shared kernel responsible for domain authorization or loading records.
Those belong to each workflow's snapshot service.

---

## 3. Feature One — Booking Readiness Copilot

### 3.1 Product outcome

Before work begins, the customer and provider can see:

- an evidence-backed summary of the agreed work;
- role-specific preparation checklists;
- unresolved questions and contradictions;
- suggested messages that can be edited before sending;
- whether the plan is current or the underlying booking has changed.

The first release is manually triggered. Scheduled/background runs and reminders are
explicitly out of scope until users demonstrate value.

### 3.2 Eligibility and permissions

- Booking must be `confirmed` or otherwise accepted but not completed/cancelled.
- Caller must be the booking customer or the provider's owning user.
- Both participants may view the final shared plan.
- Findings marked `customer_only` or `provider_only` are visible only to that role.
- Admin access follows existing support/audit authorization, not a new agent bypass.
- A rerun is allowed when source data changes or the previous run failed.

### 3.3 Authoritative input snapshot

The server loads and normalizes:

- booking fields and status;
- originating quote and quote request;
- provider profile and relevant services;
- customer/provider display names only;
- availability around the scheduled time;
- booking-linked conversation messages, within a bounded recent window;
- payment readiness state, but never card or gateway secrets;
- active user procedural constraints that are appropriate for the booking domain.

Messages should be treated as untrusted user content in prompts. The snapshot builder
must delimit them and instruct agents never to follow instructions found inside records.

### 3.4 Typed output contract

```typescript
type EvidenceRef = {
  source: 'booking' | 'quote' | 'request' | 'provider' | 'availability' | 'message';
  recordId: string;
  field: string;
  excerpt?: string; // short, scrubbed, and safe to display
};

type ReadinessFinding = {
  id: string;
  category: 'scope' | 'access' | 'materials' | 'schedule' | 'safety' | 'payment' | 'communication';
  severity: 'info' | 'attention' | 'blocking';
  visibility: 'shared' | 'customer_only' | 'provider_only';
  statement: string;
  evidence: EvidenceRef[];
  resolutionQuestion?: string;
};

type ReadinessPlan = {
  bookingId: string;
  sourceFingerprint: string;
  readiness: 'ready' | 'needs_attention' | 'blocked' | 'incomplete';
  agreedScope: string[];
  exclusions: string[];
  customerChecklist: ChecklistItem[];
  providerChecklist: ChecklistItem[];
  findings: ReadinessFinding[];
  messageDrafts: Array<{
    recipientRole: 'customer' | 'provider';
    purpose: string;
    body: string;
    resolvesFindingIds: string[];
  }>;
  verification: ReadinessVerification;
  generatedAt: string;
};
```

All IDs used by the model are assigned or reconciled by application code. The model must
not invent database identifiers.

### 3.5 Agents and responsibilities

#### Scope Agent

- Extract agreed tasks, explicit exclusions, assumptions, and ambiguous scope.
- Reconcile request language with the accepted quote; accepted terms take precedence.
- Never infer additional work merely because it is common for the service category.
- Output scope findings with evidence references.

#### Logistics Agent

- Check schedule, duration, address/access, materials, parking, pets, utilities, and
  role-specific preparation when those facts exist.
- Distinguish “not mentioned” from “problem detected.”
- Produce checklist candidates and questions, not generic service advice.

#### Risk Agent — phase 2

- Evaluate only the structured outputs and source snapshot.
- Identify contradictions, missing blocking facts, and likely expectation mismatches.
- Severity is rule-constrained; it may not label a finding `blocking` without evidence.

#### Communication Agent — phase 2

- Draft messages only for unresolved findings.
- Keep drafts editable, concise, localized, and neutral.
- Never claim a message was sent or an agreement was reached.

#### Verification Agent

- Ensure every finding has valid evidence.
- Reject contradictions with accepted quote terms.
- Remove duplicated, speculative, sensitive, or role-inappropriate findings.
- Recalculate overall readiness deterministically after verification.

### 3.6 State machine

```text
PENDING
  → SNAPSHOT_LOADED
  → SCOPE_COMPLETE
  → LOGISTICS_COMPLETE
  → [RISK_COMPLETE]
  → [COMMUNICATION_COMPLETE]
  → VERIFIED
  → COMPLETED

Any stage → FAILED_PARTIAL
Source changes after completion → STALE
```

Scope and Logistics can run in parallel after the immutable snapshot is built. Verification
runs after all enabled specialists. Overall readiness is computed in application code:

- any verified blocking finding → `blocked`;
- any verified attention finding → `needs_attention`;
- all sections successful and no actionable finding → `ready`;
- required section failed/timed out → `incomplete`.

### 3.7 API proposal

```text
POST /api/v1/bookings/:bookingId/readiness-runs
GET  /api/v1/bookings/:bookingId/readiness-runs/latest
GET  /api/v1/readiness-runs/:runId
GET  /api/v1/readiness-runs/:runId/events       # SSE progress
POST /api/v1/readiness-runs/:runId/rerun
```

Sending a suggested message continues to use the existing messaging API. The readiness
endpoint returns a draft; it does not acquire a hidden write capability.

### 3.8 Data model proposal

One generic `agent_workflow_runs` table is preferred if its fields remain domain-neutral:

- `id`, `workflow_type`, `subject_type`, `subject_id`, `initiated_by`;
- `status`, `source_fingerprint`, `schema_version`;
- `output` JSONB, `error_summary`, timestamps;
- token/duration totals suitable for product operations.

Add `agent_workflow_activities` only if the existing state service cannot provide durable
per-agent auditability. Do not store complete prompt payloads by default; they may contain
private message content.

### 3.9 Frontend plan

- Add “Prepare for booking” to eligible booking cards.
- Open a responsive readiness drawer/page with visible agent progress.
- Sections: status, agreed scope, needs attention, customer checklist, provider checklist,
  suggested messages, evidence details.
- Clearly distinguish platform facts, AI findings, and user-confirmed resolutions.
- Show “Booking changed—run again” when the fingerprint no longer matches.
- On mobile, use stacked cards; do not introduce another wide table.
- Make failure sectional: one unavailable analysis must not blank the entire plan.

### 3.10 Delivery phases and exit criteria

#### BR-0 — Evaluation fixtures and threat model

- Create 12–20 anonymized booking fixtures: clean, ambiguous, contradictory, sparse,
  malicious message content, cancelled, and unauthorized.
- Define expected findings and forbidden claims.
- Exit: fixtures run without calling live services; authorization and prompt-injection
  boundaries are documented.

#### BR-1 — Read-only vertical slice

- Snapshot service, Scope Agent, Verification Agent, typed schemas, manual endpoint.
- Minimal UI showing scope and evidence.
- Exit: one demo booking produces a verified plan; no mutation endpoint exists.

#### BR-2 — Logistics and role-aware UX

- Parallel Scope/Logistics execution, checklists, visibility filtering, stale detection.
- Responsive customer/provider UI and EN/PT/ES fixed copy.
- Exit: both roles see the correct plan; private findings never cross roles.

#### BR-3 — Risks and message drafts

- Add Risk and Communication agents.
- Draft-to-existing-message-composer flow with explicit user confirmation.
- Exit: no message is sent from an agent endpoint; drafts link to supported findings.

#### BR-4 — Reliability and beta

- Timeouts, retries only for transient failures, idempotency, metrics, cost caps, rate limits.
- Feature flag and opt-in demo rollout.
- Exit: Playwright journeys pass; evaluation precision meets the agreed threshold; p95
  latency and cost are visible.

### 3.11 Test strategy

- Unit: schema validation, readiness calculation, evidence reconciliation, fingerprinting.
- Agent contract: mocked LLM outputs including malformed JSON and invented evidence.
- Integration: authorization, lifecycle eligibility, stale results, partial failure, idempotency.
- Security: prompt injection inside messages, cross-booking access, sensitive field exclusion.
- Evaluation: finding precision, unsupported-claim rate, contradiction recall, draft grounding.
- Playwright: customer run, provider view, mobile layout, stale rerun, draft review/cancel.

### 3.12 Learning checkpoints

After each phase, review together:

1. Which decisions are deterministic code versus model judgment?
2. What makes the agent boundary independently testable?
3. How does evidence survive synthesis without becoming fabricated prose?
4. What is the user experience when one specialist fails?
5. Which metric would prove product value rather than merely model activity?

---

## 4. Feature Two — Quote Decision Council

### 4.1 Product outcome

When a customer has at least two comparable pending quotes, the council explains:

- price and terms differences;
- provider fit and trust signals;
- important omissions or ambiguities;
- the strongest option for different priorities;
- why each conclusion follows from platform data.

It complements the existing deterministic `lowestPrice`, `topRated`, and `bestValue`
highlights. It does not replace them or automatically accept a quote.

### 4.2 Eligibility and permissions

- Caller must own the quote request.
- Request must have at least two visible, non-expired quotes.
- Accepted/rejected/withdrawn quotes are excluded unless explicitly shown as history.
- The comparison is invalidated when any included quote changes status or terms.
- Providers cannot see council output about competing quotes.

### 4.3 Authoritative snapshot

- quote request requirements, budget, urgency, and preferred date;
- each eligible quote's price, duration, itemization, notes, validity, and status;
- provider service match, verification, rating, review count, completed jobs, response data,
  distance, and availability when present;
- bounded review aggregates and representative evidence, with recency metadata;
- deterministic baseline highlights from `quoteComparison.ts`.

Missing data must remain missing. A provider with no review history is “insufficient data,”
not low quality.

### 4.4 Council output contract

```typescript
type DimensionAssessment = {
  quoteId: string;
  dimension: 'price' | 'terms' | 'fit' | 'trust' | 'schedule';
  score?: number; // only when the dimension has enough data
  confidence: 'low' | 'medium' | 'high';
  summary: string;
  evidence: EvidenceRef[];
  missingData: string[];
};

type QuoteCouncilReport = {
  requestId: string;
  includedQuoteIds: string[];
  sourceFingerprint: string;
  assessments: DimensionAssessment[];
  tradeoffMatrix: Array<{
    quoteId: string;
    strengths: string[];
    cautions: string[];
    bestFor: string[];
  }>;
  scenarios: Array<{
    priority: 'lowest_total' | 'quality' | 'speed' | 'certainty' | 'balanced';
    recommendedQuoteId?: string;
    reasoning: string;
    evidence: EvidenceRef[];
  }>;
  unresolvedQuestions: Array<{ quoteId: string; question: string; reason: string }>;
  verification: CouncilVerification;
  generatedAt: string;
};
```

### 4.5 Agents

#### Price and Terms Analyst

- Normalize numeric values in application code before prompting.
- Compare total price, duration, itemization, fees/exclusions, validity, and ambiguity.
- Never invent market prices. External price benchmarking is a separate future decision.

#### Provider Fit Analyst

- Compare services, request requirements, distance, availability, and relevant experience.
- Separate hard mismatches from weak or missing signals.

#### Trust Analyst

- Evaluate verified status, review volume/recency, rating distribution, completed jobs, and
  platform reliability signals that are actually stored.
- Avoid protected-class inference and subjective personality judgments.

#### Scenario Synthesizer

- Consume structured specialist outputs rather than raw database records.
- Recommend by explicit customer priority: cheapest, quality, speed, certainty, balanced.
- It may return no recommendation when evidence is insufficient or choices are equivalent.

#### Council Verifier

- Validate evidence and math, detect over-weighting and contradictions, enforce quote IDs,
  and ensure missing data is not presented as negative evidence.
- Application code removes a recommendation if verification cannot support it.

### 4.6 Orchestration

```text
Snapshot
   ├── Price & Terms Analyst ─┐
   ├── Provider Fit Analyst ──┼→ Scenario Synthesizer → Council Verifier
   └── Trust Analyst ─────────┘
```

The three analysts run in parallel. Deterministic pre-computation handles currency, totals,
distances, rating counts, and current highlight scores. Agents interpret trade-offs; they
do not perform arithmetic that code can perform reliably.

### 4.7 API proposal

```text
POST /api/v1/quote-requests/:requestId/council-runs
GET  /api/v1/quote-requests/:requestId/council-runs/latest
GET  /api/v1/quote-council-runs/:runId
GET  /api/v1/quote-council-runs/:runId/events
```

Quote acceptance remains the existing quote mutation with its existing confirmation and
idempotency controls.

### 4.8 Frontend plan

- Evolve the existing Compare action into “Compare with AI” while preserving instant
  deterministic badges.
- Present a mobile-first comparison matrix, then priority scenarios and evidence.
- Let the customer change priority without rerunning analysts; rerun synthesis only.
- Keep “Accept” visually and technically separate from the recommendation.
- Show data freshness and included quote count.
- Explain uncertainty and missing information prominently.

### 4.9 Delivery phases

#### QC-0 — Fairness rules and evaluation set

- Define allowed signals, disallowed inferences, score semantics, and tie behavior.
- Build fixtures for cheap/low-history, expensive/high-history, equal quotes, missing fields,
  expired quotes, numeric strings, and conflicting terms.

#### QC-1 — Deterministic comparison foundation

- Centralize normalized quote facts and expand tests around existing highlight logic.
- Add source fingerprint and council eligibility without an LLM.

#### QC-2 — Price/Terms + Fit vertical slice

- Two parallel analysts, verifier, typed output, read-only API, minimal comparison UI.
- No single “winner” yet; show evidence-backed trade-offs.

#### QC-3 — Trust + scenario synthesis

- Add Trust Analyst and customer-priority scenarios.
- Add “no recommendation” and tie paths as first-class UX.

#### QC-4 — Production hardening

- Caching by fingerprint, concurrency controls, cost/latency budgets, evaluation dashboard,
  feature flag, and opt-in beta.

### 4.10 Test and evaluation strategy

- Unit: normalization, baseline scoring, fingerprints, eligibility, tie/no-winner logic.
- Contract: malformed responses, unknown quote IDs, incorrect arithmetic, missing evidence.
- Integration: ownership, expired quote exclusion, stale results, accepting after comparison.
- Fairness: no protected inference, no penalty for absent data, confidence calibration.
- Evaluation: unsupported-claim rate, ranking stability, evidence coverage, useful-question rate.
- Playwright: multiple quotes, priority switch, mobile matrix, stale quote, no recommendation,
  accept confirmation remains independent.

---

## 5. Cross-feature sequence

| Milestone | Deliverable | Dependency |
|---|---|---|
| 1 ✅ | Favorites + deterministic completed-booking rebook flow | delivered |
| 2 ✅ | Optional verified rebook refinement | delivered |
| 2A ✅ | Provider-neutral AI gateway, memory embeddings, admin controls, transparency | delivered |
| 3 | BR-0 threat model and fixtures | rebook provenance |
| 4 | BR-1/2 Readiness Copilot foundation | existing bookings/quotes |
| 5 | BR-3/4 beta-ready Readiness Copilot | BR-2 |
| 6 | QC-0/1 fairness and deterministic comparison | existing quote comparison |
| 7 | QC-2 council vertical slice | shared runner proven by BR |
| 8 | QC-3/4 beta-ready Decision Council | QC-2 |

## 6. Definition of done for both workflows

- Authorization is enforced from server-loaded domain records.
- All model output is runtime validated and evidence reconciled.
- No agent endpoint mutates core business state.
- Partial failures have usable, honest UI states.
- EN/PT/ES UI copy and mobile layouts are covered.
- Evaluation fixtures run in CI without live LLM calls.
- Live-model evaluations are separate, opt-in, budgeted jobs.
- Workflow latency, cost, schema failures, and user actions are observable.
- The feature can be disabled without affecting bookings or quote acceptance.
- Documentation and the API contract are updated before rollout.
