export const READINESS_WORKFLOW_TYPE = 'booking_readiness';
export const READINESS_SUBJECT_TYPE = 'booking';
export const READINESS_SCHEMA_VERSION = 1;

export type EvidenceSource =
  | 'booking'
  | 'quote'
  | 'request'
  | 'provider'
  | 'availability'
  | 'message';

export interface EvidenceRef {
  source: EvidenceSource;
  recordId: string;
  field: string;
  /** Short, scrubbed, safe to display. Populated by app code, never the model. */
  excerpt?: string;
}

export type FindingCategory =
  | 'scope'
  | 'access'
  | 'materials'
  | 'schedule'
  | 'safety'
  | 'payment'
  | 'communication';

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

export interface ReadinessVerification {
  /** Findings the model produced but validation removed, with the reason. */
  droppedCount: number;
  dropReasons: string[];
  /** False when the semantic pass could not run; findings are then unreviewed. */
  semanticReviewRan: boolean;
}

export interface ReadinessPlan {
  bookingId: string;
  sourceFingerprint: string;
  readiness: ReadinessLevel;
  agreedScope: string[];
  exclusions: string[];
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

/** A message as the agents see it — scrubbed, delimited, attributed by role only. */
export interface SnapshotMessage {
  id: string;
  senderRole: 'customer' | 'provider' | 'other';
  sentAt: string;
  text: string;
}

export interface ReadinessSnapshot {
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
    location: {
      address: string;
      city: string;
      state: string;
      zipCode: string;
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
  payment: {
    status: string;
    escrowHeld: boolean;
  };
  messages: SnapshotMessage[];
  /** Set when the message window was truncated, so agents don't assume completeness. */
  messagesTruncated: boolean;
}

export interface ReadinessWorkflowState {
  snapshot: ReadinessSnapshot;
  scope?: ScopeAgentOutput;
  verifiedFindings?: ReadinessFinding[];
  verification?: ReadinessVerification;
}
