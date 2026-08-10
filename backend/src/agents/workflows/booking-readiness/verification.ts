import { randomUUID } from 'crypto';
import logger from '@/config/logger';
import { aiGateway } from '@/agents/services/ai-gateway.service';
import { parseLlmJson } from '@/agents/utils/llm-json';
import { excerptFor } from './snapshot.service';
import {
  EvidenceRef,
  FindingCategory,
  FindingSeverity,
  FindingVisibility,
  RawFinding,
  ReadinessFinding,
  ReadinessLevel,
  ReadinessSnapshot,
  ReadinessVerification,
} from './types';

const CATEGORIES: FindingCategory[] = [
  'scope',
  'access',
  'materials',
  'schedule',
  'safety',
  'payment',
  'communication',
];
const SEVERITIES: FindingSeverity[] = ['info', 'attention', 'blocking'];
const VISIBILITIES: FindingVisibility[] = ['shared', 'customer_only', 'provider_only'];

const DUPLICATE_THRESHOLD = 0.85;

/**
 * Deterministic validation.
 *
 * Everything here is a lookup or a rule, so it is unit-testable without mocking a
 * model — which matters because the role-visibility filter and the invented-id
 * rejection are security properties, not quality heuristics.
 */
export function validateFindings(
  rawFindings: RawFinding[],
  snapshot: ReadinessSnapshot
): { findings: ReadinessFinding[]; dropReasons: string[] } {
  const index = buildRecordIndex(snapshot);
  const dropReasons: string[] = [];
  const accepted: ReadinessFinding[] = [];

  for (const raw of rawFindings) {
    if (typeof raw?.statement !== 'string' || raw.statement.trim() === '') {
      dropReasons.push('empty statement');
      continue;
    }

    const evidence = resolveEvidence(raw.evidence, index);
    if (evidence.length === 0) {
      // Unsupported claims are removed, never repaired — a finding we cannot
      // trace back to a record is exactly the fabrication risk we are guarding.
      dropReasons.push(`no resolvable evidence: "${truncate(raw.statement)}"`);
      continue;
    }

    const category = CATEGORIES.includes(raw.category) ? raw.category : 'scope';
    const visibility = VISIBILITIES.includes(raw.visibility) ? raw.visibility : 'shared';
    let severity = SEVERITIES.includes(raw.severity) ? raw.severity : 'info';

    // A chat message can raise a question, but it cannot on its own outrank the
    // accepted quote — so message-only findings are capped below "blocking".
    const messageOnly = evidence.every((ref) => ref.source === 'message');
    if (messageOnly && severity === 'blocking') {
      severity = 'attention';
      dropReasons.push(`severity capped to attention (message-only evidence)`);
    }

    const duplicate = accepted.find(
      (existing) => similarity(existing.statement, raw.statement) >= DUPLICATE_THRESHOLD
    );
    if (duplicate) {
      dropReasons.push(`duplicate of "${truncate(duplicate.statement)}"`);
      continue;
    }

    accepted.push({
      id: randomUUID(),
      category,
      severity,
      visibility,
      statement: raw.statement.trim(),
      evidence,
      resolutionQuestion:
        typeof raw.resolutionQuestion === 'string' && raw.resolutionQuestion.trim() !== ''
          ? raw.resolutionQuestion.trim()
          : undefined,
    });
  }

  return { findings: accepted, dropReasons };
}

/**
 * Semantic pass — the part that genuinely needs judgment: does a finding
 * contradict the accepted terms, or is it speculation dressed as a fact?
 * Runs on the cheap profile because it only reviews text we already validated.
 */
export async function semanticReview(
  findings: ReadinessFinding[],
  snapshot: ReadinessSnapshot
): Promise<{ kept: ReadinessFinding[]; dropReasons: string[]; ran: boolean }> {
  if (findings.length === 0) return { kept: [], dropReasons: [], ran: true };

  const terms = snapshot.quote
    ? `price ${snapshot.quote.estimatedPrice}, duration ${snapshot.quote.estimatedDuration}h, ` +
      `terms: ${snapshot.quote.terms.map((t) => `${t.item}=${t.description}`).join('; ') || 'none'}`
    : 'no accepted quote on this booking';

  const numbered = findings
    .map((finding, i) => `${i + 1}. [${finding.severity}] ${finding.statement}`)
    .join('\n');

  try {
    const result = await aiGateway.generate('fast', {
      systemPrompt:
        'You review draft findings about a booked service for two failure modes only:\n' +
        '(a) the finding contradicts the accepted quote terms;\n' +
        '(b) the finding is speculation rather than something the data supports.\n' +
        'Return ONLY JSON: {"reject": [{"index": <1-based>, "reason": "..."}]}\n' +
        'Reject sparingly. If a finding is merely cautious or obvious, keep it.',
      userMessage: `ACCEPTED TERMS: ${terms}\n\nFINDINGS:\n${numbered}`,
      maxTokens: 600,
    });

    const parsed = parseLlmJson<{ reject?: Array<{ index: number; reason: string }> }>(
      result.value.text
    );
    if (!parsed) return { kept: findings, dropReasons: [], ran: false };

    const rejected = new Map<number, string>();
    for (const entry of parsed.reject ?? []) {
      const idx = Number(entry?.index);
      if (Number.isInteger(idx) && idx >= 1 && idx <= findings.length) {
        rejected.set(idx - 1, String(entry.reason ?? 'rejected by semantic review'));
      }
    }

    return {
      kept: findings.filter((_, i) => !rejected.has(i)),
      dropReasons: [...rejected.entries()].map(
        ([i, reason]) => `semantic: "${truncate(findings[i].statement)}" — ${reason}`
      ),
      ran: true,
    };
  } catch (error) {
    // Losing the semantic pass degrades quality but must not fail the run; the
    // plan records that findings went unreviewed.
    logger.warn('Readiness semantic review failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { kept: findings, dropReasons: [], ran: false };
  }
}

/** Readiness is computed here, never by a model. */
export function computeReadiness(
  findings: ReadinessFinding[],
  hasFailedRequiredSection: boolean
): ReadinessLevel {
  if (hasFailedRequiredSection) return 'incomplete';
  if (findings.some((f) => f.severity === 'blocking')) return 'blocked';
  if (findings.some((f) => f.severity === 'attention')) return 'needs_attention';
  return 'ready';
}

/** Role-appropriate view. Security-relevant, so it is code, not a prompt. */
export function filterForRole(
  findings: ReadinessFinding[],
  role: 'customer' | 'provider'
): ReadinessFinding[] {
  const allowed = role === 'customer' ? 'customer_only' : 'provider_only';
  return findings.filter(
    (finding) => finding.visibility === 'shared' || finding.visibility === allowed
  );
}

export function buildVerification(
  dropReasons: string[],
  semanticReviewRan: boolean
): ReadinessVerification {
  return {
    droppedCount: dropReasons.length,
    dropReasons: dropReasons.slice(0, 20),
    semanticReviewRan,
  };
}

type RecordIndex = Map<string, Map<string, unknown>>;

/** `${source}:${recordId}` → field → value, for evidence resolution. */
function buildRecordIndex(snapshot: ReadinessSnapshot): RecordIndex {
  const index: RecordIndex = new Map();
  const add = (source: string, recordId: string, fields: Record<string, unknown>) => {
    index.set(`${source}:${recordId}`, new Map(Object.entries(fields)));
  };

  add('booking', snapshot.booking.id, { ...snapshot.booking, ...snapshot.payment });
  add('availability', snapshot.booking.id, snapshot.availability);
  if (snapshot.quote) add('quote', snapshot.quote.id, snapshot.quote);
  if (snapshot.request) add('request', snapshot.request.id, snapshot.request);
  add('provider', snapshot.provider.id, snapshot.provider);
  for (const message of snapshot.messages) {
    add('message', message.id, { text: message.text, senderRole: message.senderRole });
  }

  return index;
}

function resolveEvidence(
  refs: RawFinding['evidence'],
  index: RecordIndex
): EvidenceRef[] {
  if (!Array.isArray(refs)) return [];
  const resolved: EvidenceRef[] = [];

  for (const ref of refs) {
    const record = index.get(`${ref?.source}:${ref?.recordId}`);
    if (!record) continue; // invented or mismatched id
    if (!record.has(ref.field)) continue; // field the model imagined

    resolved.push({
      source: ref.source,
      recordId: ref.recordId,
      field: ref.field,
      excerpt: excerptFor(record.get(ref.field)),
    });
  }

  return resolved;
}

/** Token-overlap similarity — enough to catch restatements of the same finding. */
function similarity(a: string, b: string): number {
  const tokenise = (value: string) =>
    new Set(
      value
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((token) => token.length > 2)
    );
  const left = tokenise(a);
  const right = tokenise(b);
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

function truncate(value: string): string {
  return value.length > 60 ? `${value.slice(0, 60)}…` : value;
}
