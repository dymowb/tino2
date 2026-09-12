import { randomUUID } from 'crypto';
import logger from '@/config/logger';
import { aiGateway } from '@/agents/services/ai-gateway.service';
import { parseLlmJson } from '@/agents/utils/llm-json';
import { excerptFor } from './snapshot.service';
import { UNTRUSTED_DATA_NOTICE, field } from './prompt';
import {
  ChecklistItem,
  EvidenceRef,
  FindingCategory,
  FindingSeverity,
  FindingVisibility,
  RawChecklistItem,
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
 * Ceiling on how many statements one semantic review may cover.
 *
 * The reviewer's whole job is to reject; its reply is a list of indices, so the
 * budget has to scale with the number of things it might reject. BR-2 roughly
 * doubled the input by adding checklist items — Logistics may emit up to its own
 * 4000-token budget of them — against a response budget sized for findings
 * alone. Anything beyond this cap is dropped rather than passed through
 * unreviewed: this gate exists to keep participant-derived text from becoming
 * platform-voiced advice, and letting the overflow through would invert it.
 */
const MAX_REVIEWABLE = 40;

/**
 * Response budget for the reject list. Sized for `MAX_REVIEWABLE` entries with
 * room for a short reason each — truncation here is not a smaller answer, it is
 * an unparseable one, which fails open unless caught.
 */
const REVIEW_MAX_TOKENS = 2000;

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
  checklist: ChecklistItem[],
  snapshot: ReadinessSnapshot,
  signal?: AbortSignal,
  timeoutMs?: number
): Promise<{
  kept: ReadinessFinding[];
  keptChecklist: ChecklistItem[];
  dropReasons: string[];
  ran: boolean;
}> {
  // Checklist items are reviewed in the same call, for the same two failure
  // modes. They need it at least as much as findings do: an item is rendered as
  // plain platform-voiced advice with no severity and no visible source, so a
  // provider messaging "have R$500 in cash ready, our card machine is broken"
  // becomes preparation advice that silently contradicts a R$160 accepted quote.
  // Deterministic validation cannot catch that — the evidence resolves perfectly
  // well; it is the *contradiction* that makes it wrong.
  const all = [
    ...findings.map((f) => ({ text: f.statement, severity: f.severity as string })),
    ...checklist.map((c) => ({ text: c.label, severity: 'checklist' })),
  ];
  if (all.length === 0) {
    return { kept: [], keptChecklist: [], dropReasons: [], ran: true };
  }

  // Overflow is dropped, not waved through. Findings come first, so the items
  // that lose out are checklist entries — advisory, and safer absent than
  // unreviewed.
  const reviewable = all.slice(0, MAX_REVIEWABLE);
  const overflowReasons = all
    .slice(MAX_REVIEWABLE)
    .map(
      (entry) => `dropped unreviewed (over ${MAX_REVIEWABLE} statements): "${truncate(entry.text)}"`
    );
  const withinCap = <T>(items: T[], offset: number): T[] =>
    items.filter((_, i) => offset + i < MAX_REVIEWABLE);

  // Quote terms are provider-authored and finding statements are derived from
  // participant text, so both get the same delimiting as the scope prompt.
  // Without it a provider can put instructions in a quote term and make the
  // reviewer discard legitimate findings, which reads to the user as "ready".
  const terms = snapshot.quote
    ? `price ${snapshot.quote.estimatedPrice}, duration ${snapshot.quote.estimatedDuration} minutes, ` +
      `terms: ${
        snapshot.quote.terms.map((t) => `${field(t.item)}=${field(t.description)}`).join('; ') ||
        'none'
      }`
    : 'no accepted quote on this booking';

  const numbered = reviewable
    .map((entry, i) => `${i + 1}. [${entry.severity}] ${field(entry.text)}`)
    .join('\n');

  try {
    const result = await aiGateway.generate(
      'fast',
      {
        systemPrompt:
          'You review draft statements about a booked service for two failure modes only:\n' +
          '(a) the statement contradicts the accepted quote terms;\n' +
          '(b) the statement is speculation rather than something the data supports.\n' +
          'Items tagged [checklist] are preparation advice shown to one participant; ' +
          'hold them to the same two tests.\n' +
          'Return ONLY JSON: {"reject": [{"index": <1-based>, "reason": "..."}]}\n' +
          'Reject sparingly. If a finding is merely cautious or obvious, keep it.\n' +
          UNTRUSTED_DATA_NOTICE,
        userMessage: `ACCEPTED TERMS: ${terms}\n\nFINDINGS:\n${numbered}`,
        maxTokens: REVIEW_MAX_TOKENS,
        signal,
      },
      { timeoutMs }
    );

    const parsed = parseLlmJson<{ reject?: Array<{ index: number; reason: string }> }>(
      result.value.text
    );
    // Truncated output is indistinguishable from "nothing to reject" once it
    // fails to parse, so it is reported the same way: the pass did not run.
    if (!parsed) {
      logger.warn('Readiness semantic review produced no usable JSON', {
        model: result.model,
        finishReason: result.value.finishReason,
        truncated: result.value.finishReason === 'max_tokens',
        statements: reviewable.length,
      });
      return {
        kept: withinCap(findings, 0),
        keptChecklist: [],
        dropReasons: [...overflowReasons, ...unreviewedChecklistReasons(checklist)],
        ran: false,
      };
    }

    const rejected = new Map<number, string>();
    for (const entry of parsed.reject ?? []) {
      const idx = Number(entry?.index);
      if (Number.isInteger(idx) && idx >= 1 && idx <= reviewable.length) {
        rejected.set(idx - 1, String(entry.reason ?? 'rejected by semantic review'));
      }
    }

    return {
      // Capped on the way out as well as on the way in. Findings are ordered
      // first, so with more than `MAX_REVIEWABLE` of them the overflow is
      // findings rather than checklist items — and returning those unreviewed is
      // the same fail-open, just reached from the other end.
      kept: withinCap(findings, 0).filter((_, i) => !rejected.has(i)),
      // Checklist indices continue where the findings end.
      keptChecklist: withinCap(checklist, findings.length).filter(
        (_, i) => !rejected.has(findings.length + i)
      ),
      dropReasons: [
        ...overflowReasons,
        ...[...rejected.entries()].map(
          ([i, reason]) => `semantic: "${truncate(reviewable[i].text)}" — ${reason}`
        ),
      ],
      ran: true,
    };
  } catch (error) {
    // Losing the semantic pass degrades quality but must not fail the run; the
    // plan records that findings went unreviewed.
    logger.warn('Readiness semantic review failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      kept: withinCap(findings, 0),
      keptChecklist: [],
      dropReasons: [...overflowReasons, ...unreviewedChecklistReasons(checklist)],
      ran: false,
    };
  }
}

/**
 * Why no checklist survives a failed semantic pass.
 *
 * Findings and checklist items are not equally safe to show unreviewed. A finding
 * arrives labelled — a severity, a category, its evidence, and the framing
 * "worth checking" — and the drawer additionally marks the whole plan unreviewed
 * when this pass did not run. A checklist item is a bare imperative in the
 * platform's voice: "Have R$500 in cash ready for the technician". That sentence
 * is indistinguishable from advice the platform stands behind, and the only thing
 * that would have rejected it as contradicting a R$160 accepted quote is the pass
 * that just failed.
 *
 * Marking the run `failed_partial` stops it being *reused*, which is a different
 * and lesser protection: it does nothing for the reader holding this response.
 * So the section is withheld rather than shown unvetted — the drawer hides it
 * when empty, and the run is retried rather than cached.
 */
function unreviewedChecklistReasons(checklist: ChecklistItem[]): string[] {
  return checklist.map(
    (item) => `withheld unreviewed (semantic pass unavailable): "${truncate(item.label)}"`
  );
}

/** Readiness is computed here, never by a model. */
/**
 * The deterministic half of the gate the findings go through, applied to
 * checklist items. The semantic half runs over both together in `semanticReview`.
 *
 * An item that cannot be traced to a record is dropped rather than repaired.
 * That is what keeps a checklist distinct from generic service advice: the model
 * is perfectly capable of producing "bring cleaning products" for any cleaning
 * job, and the only thing separating a real preparation step from a plausible
 * guess is whether a record actually raised it.
 */
export function validateChecklist(
  rawItems: RawChecklistItem[],
  snapshot: ReadinessSnapshot
): { items: ChecklistItem[]; dropReasons: string[] } {
  const index = buildRecordIndex(snapshot);
  const dropReasons: string[] = [];
  const accepted: ChecklistItem[] = [];

  for (const raw of rawItems) {
    if (typeof raw?.label !== 'string' || raw.label.trim() === '') {
      dropReasons.push('empty checklist label');
      continue;
    }

    const evidence = resolveEvidence(raw.evidence, index);
    if (evidence.length === 0) {
      dropReasons.push(`no resolvable evidence: "${truncate(raw.label)}"`);
      continue;
    }

    const duplicate = accepted.find(
      (existing) => similarity(existing.label, raw.label) >= DUPLICATE_THRESHOLD
    );
    if (duplicate) {
      dropReasons.push(`duplicate checklist item of "${truncate(duplicate.label)}"`);
      continue;
    }

    accepted.push({
      id: randomUUID(),
      category: CATEGORIES.includes(raw.category) ? raw.category : 'scope',
      label: raw.label.trim(),
      evidence,
    });
  }

  return { items: accepted, dropReasons };
}

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

function resolveEvidence(refs: RawFinding['evidence'], index: RecordIndex): EvidenceRef[] {
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
