export const READINESS_WORKFLOW_TYPE = 'booking_readiness';
export const READINESS_SUBJECT_TYPE = 'booking';
/**
 * Bumped to 2 for BR-2: `ReadinessPlan` gained the two checklists.
 *
 * MN5 reuses a stored run only when its `schemaVersion` matches, so every plan
 * written by BR-1 stops being served the moment this ships and the next request
 * per booking pays for a fresh run. That is the intended behaviour — a v1 plan
 * has no checklists, and serving it would silently show a reader an empty
 * section rather than the one the feature promises.
 */
export const READINESS_SCHEMA_VERSION = 2;

export type EvidenceSource =
  'booking' | 'quote' | 'request' | 'provider' | 'availability' | 'message';

export interface EvidenceRef {
  source: EvidenceSource;
  recordId: string;
  field: string;
  /** Short, scrubbed, safe to display. Populated by app code, never the model. */
  excerpt?: string;
}

export type FindingCategory =
  'scope' | 'access' | 'materials' | 'schedule' | 'safety' | 'payment' | 'communication';

export type FindingSeverity = 'info' | 'attention' | 'blocking';
export type FindingVisibility = 'shared' | 'customer_only' | 'provider_only';

export interface ReadinessFinding {
  /** Assigned by app code. The model never emits an id. */
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  visibility: FindingVisibility;
  statement: string;
  evidence: EvidenceRef[];
  resolutionQuestion?: string;
}

export type ReadinessLevel = 'ready' | 'needs_attention' | 'blocked' | 'incomplete';

/**
 * One preparation item for a single role, before the appointment.
 *
 * Advisory only, by deliberate decision: nothing records whether an item was
 * done. The Copilot's invariant is that agents advise and the existing booking,
 * messaging, quote and payment services stay the only authorities that mutate
 * business state, and a tick-box is the first thing that would breach it. It
 * also avoids a genuinely hard problem — an item's identity across re-runs,
 * since every run regenerates the list from scratch.
 *
 * `evidence` is what separates this from generic service advice: an item may
 * only be produced from something actually in the records.
 */
export interface ChecklistItem {
  /** Assigned by app code. The model never emits an id. */
  id: string;
  category: FindingCategory;
  /** Imperative and specific, e.g. "Confirm someone can answer the intercom at 07:00". */
  label: string;
  evidence: EvidenceRef[];
}

/** What the model may return for a checklist item: no ids. */
export interface RawChecklistItem {
  category: FindingCategory;
  label: string;
  evidence: Array<{ source: EvidenceSource; recordId: string; field: string }>;
}

/**
 * How a stored plan relates to the booking as it stands now.
 *
 * `unknown` exists so that failing to *check* freshness is never reported as
 * `current`: if the booking cannot be reloaded or its snapshot cannot be rebuilt,
 * the plan may describe scope, schedule or payment terms that have since changed,
 * and the reader has to be told that rather than reassured.
 */
export type ReadinessFreshness = 'current' | 'stale' | 'unknown';

export interface ReadinessVerification {
  /** How many findings the model produced that validation removed. */
  droppedCount: number;
  /**
   * Why each was dropped. These strings quote the rejected finding's text, so a
   * `customer_only` or `provider_only` statement can appear here — they are kept
   * in the stored run for audit and **stripped per reader** by `applyRoleFilter`.
   * Never return them to a participant.
   */
  dropReasons?: string[];
  /** False when the semantic pass could not run; findings are then unreviewed. */
  semanticReviewRan: boolean;
}

export interface ReadinessPlan {
  bookingId: string;
  sourceFingerprint: string;
  readiness: ReadinessLevel;
  agreedScope: string[];
  exclusions: string[];
  /**
   * Role-scoped preparation. Stored unfiltered like `findings`, and narrowed per
   * reader on the way out — a customer is never shown the provider's list.
   */
  customerChecklist: ChecklistItem[];
  providerChecklist: ChecklistItem[];
  findings: ReadinessFinding[];
  verification: ReadinessVerification;
  generatedAt: string;
  /** Sections that failed or timed out, so the UI can mark them rather than lie. */
  unavailableSections: string[];
}

/** What the model is allowed to return: no ids, no invented records. */
export interface RawFinding {
  category: FindingCategory;
  severity: FindingSeverity;
  visibility: FindingVisibility;
  statement: string;
  evidence: Array<{ source: EvidenceSource; recordId: string; field: string }>;
  resolutionQuestion?: string;
}

export interface ScopeAgentOutput {
  agreedScope: string[];
  exclusions: string[];
  findings: RawFinding[];
}

/**
 * The Logistics agent's raw output: the practical side of the appointment —
 * schedule, access, materials, parking, pets — as opposed to what was agreed.
 */
export interface LogisticsAgentOutput {
  customerChecklist: RawChecklistItem[];
  providerChecklist: RawChecklistItem[];
  findings: RawFinding[];
}

/** A message as the agents see it — scrubbed, delimited, attributed by role only. */
export interface SnapshotMessage {
  id: string;
  senderRole: 'customer' | 'provider' | 'other';
  sentAt: string;
  text: string;
}

export interface ReadinessSnapshot {
  /**
   * The platform's currency code, e.g. 'BRL'.
   *
   * Carried explicitly because the amounts below are bare numbers. Without it a
   * model asked to mention a price simply picks a symbol — a live run produced
   * "£160" for a R$ 320 booking, which is wrong in a way a Brazilian customer
   * would notice immediately and which quietly discredits the rest of the plan.
   */
  currency: string;
  booking: {
    id: string;
    status: string;
    serviceType: string;
    description: string;
    scheduledDate: string;
    estimatedDuration: number;
    totalAmount: number;
    paymentStatus: string;
    specialInstructions: string | null;
    /**
     * Deliberately no street line. The agent only needs to know whether an
     * address exists and roughly where it is; shipping the exact address to a
     * third-party model adds identifying data without improving a finding.
     */
    location: {
      city: string;
      state: string;
      zipCode: string;
      hasStreetAddress: boolean;
      hasCoordinates: boolean;
    };
  };
  quote: {
    id: string;
    estimatedPrice: number;
    estimatedDuration: number;
    description: string;
    terms: Array<{ item: string; description: string }>;
    notes: string | null;
  } | null;
  request: {
    id: string;
    serviceType: string;
    description: string;
    preferredDate: string | null;
    requirements: Array<{ category: string; requirement: string }>;
  } | null;
  provider: {
    id: string;
    businessName: string;
    services: string[];
  };
  availability: {
    conflictingBookingCount: number;
    checkedWindowHours: number;
  };
  /**
   * Escrow is a two-step lifecycle: the hold is placed when the service starts
   * and the funds are captured only on completion. `paymentStatus` stays
   * `pending` for the whole held period, so it cannot stand in for "is the money
   * secured" — an eligible in_progress booking would read as unpaid.
   */
  payment: {
    status: string;
    holdPlaced: boolean;
    captured: boolean;
  };
  messages: SnapshotMessage[];
  /** Set when the message window was truncated, so agents don't assume completeness. */
  messagesTruncated: boolean;
}

export interface ReadinessWorkflowState {
  snapshot: ReadinessSnapshot;
  scope?: ScopeAgentOutput;
  logistics?: LogisticsAgentOutput;
  verifiedFindings?: ReadinessFinding[];
  customerChecklist?: ChecklistItem[];
  providerChecklist?: ChecklistItem[];
  verification?: ReadinessVerification;
}
