import { randomUUID } from 'crypto';
import logger from '@/config/logger';
import { aiGateway } from '@/agents/services/ai-gateway.service';
import { parseLlmJson } from '@/agents/utils/llm-json';
import { excerptFor } from './snapshot.service';
import { UNTRUSTED_DATA_NOTICE, field } from './prompt';
import {
  ChecklistItem,
  EvidenceRef,
  FindingAnswerFrom,
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
const ANSWER_FROM: FindingAnswerFrom[] = ['customer', 'provider', 'both'];

/** A headline, not a sentence: longer than this and it is the statement again. */
const TITLE_MAX_LENGTH = 80;

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
      (existing) =>
        coversAudience(existing.visibility, visibility) &&
        similarity(existing.statement, raw.statement) >= DUPLICATE_THRESHOLD
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
      title: cleanTitle(raw.title),
      statement: raw.statement.trim(),
      // Unrecognised or absent reads as `both`: the one value that never tells a
      // reader, wrongly, that the next move is the other person's.
      answerFrom: ANSWER_FROM.includes(raw.answerFrom as FindingAnswerFrom)
        ? (raw.answerFrom as FindingAnswerFrom)
        : 'both',
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
/**
 * Whether everyone who sees `later` also sees `earlier` — the only case in which
 * dropping `later` as a repeat loses nothing. A `customer_only` finding does not
 * stand in for a `shared` one: drop the shared copy and the provider is left
 * with no such finding at all, and a readiness headline computed without it.
 */
export function coversAudience(
  earlier: ReadinessFinding['visibility'],
  later: ReadinessFinding['visibility']
): boolean {
  return earlier === 'shared' || earlier === later;
}

/** `[checklist:customer]` / `[checklist:provider]`, so (c) can be scoped. */
function checklistAudience(item: ChecklistItem, customerIds: Set<string>): string {
  return customerIds.has(item.id) ? 'checklist:customer' : 'checklist:provider';
}

export async function semanticReview(
  findings: ReadinessFinding[],
  checklist: ChecklistItem[],
  snapshot: ReadinessSnapshot,
  signal?: AbortSignal,
  timeoutMs?: number,
  /** Which of `checklist` belong to the customer; the rest are the provider's. */
  customerChecklistIds?: string[]
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
  const customerIds = new Set(customerChecklistIds ?? []);
  const all = [
    // Tagged with who can see it, so a repeat is judged against its audience —
    // see `coversAudience`.
    ...findings.map((f) => ({
      // With its headline: the title is rendered as the card's heading, in the
      // platform's voice, so it is reviewed as part of the same claim. Left
      // out, a harmless statement could carry "Bring R$500 in cash" above it.
      text: f.title ? `${f.title}. ${f.statement}` : f.statement,
      severity: `finding:${f.visibility}`,
    })),
    // Tagged by audience, not just as "checklist": without the role the reviewer
    // sees the customer's and the provider's copy of one shared step as the same
    // statement twice and rejects the later one, silently costing whichever
    // participant happens to come second.
    ...checklist.map((c) => ({
      text: c.label,
      severity: checklistAudience(c, customerIds),
    })),
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
          'You check draft statements about a booked service for two specific faults.\n' +
          '\n' +
          'KEEP is the default. Reject a statement ONLY if:\n' +
          '(a) it asserts something the accepted quote terms directly contradict — it ' +
          'says the opposite of what was agreed; or\n' +
          '(b) it asserts a fact the records do not support — it was invented; or\n' +
          '(c) an EARLIER [finding:...] already makes the same point in different words. ' +
          "Reject the later one, keep the earlier, and give the earlier one's number as " +
          '"duplicateOf". Several reviewers read the same records independently, so the ' +
          'same concern arrives more than once. The tag after "finding:" says who sees ' +
          'it: a [finding:shared] is never a duplicate of a [finding:customer_only] or ' +
          '[finding:provider_only], because the other person would then see neither.\n' +
          'Criterion (c) applies to [finding:...] entries ONLY. Never reject a ' +
          '[checklist] entry as a duplicate: the two checklists are for two ' +
          'different people, and the same step legitimately appears on both — the ' +
          'customer confirming a gate code and the provider confirming it are two ' +
          'reminders, not one repeated. Each list is already deduplicated on its own.\n' +
          '\n' +
          'NOT grounds for rejection, and this is the common mistake: a statement that ' +
          'simply does not contradict anything. Most statements will not. Keep a ' +
          'statement that notes a gap, asks a question, restates an agreed term, ' +
          'repeats a detail from the records, states the obvious, or gives ordinary ' +
          'preparation advice — none of those are faults. "This does not contradict ' +
          'the accepted terms" is a reason to KEEP, never to reject.\n' +
          '\n' +
          'Items tagged [checklist] are preparation reminders for one person. They are ' +
          'expected to restate agreed details; reject one only if it tells someone to ' +
          'do something the agreement rules out, or something no record supports.\n' +
          '\n' +
          'Two statements about different facts are not duplicates, however similar ' +
          'they sound: if you cannot name the single fact both assert, keep both.\n' +
          'Apart from (c), rejecting more than a couple out of a long list means you ' +
          'have misread the task.\n' +
          'Return ONLY JSON: {"reject": [{"index": <1-based>, "reason": "...", ' +
          '"duplicateOf": <1-based, only for (c)>}]}\n' +
          UNTRUSTED_DATA_NOTICE,
        userMessage: `ACCEPTED TERMS: ${terms}\n\nFINDINGS:\n${numbered}`,
        maxTokens: REVIEW_MAX_TOKENS,
        signal,
      },
      { timeoutMs }
    );

    const parsed = parseLlmJson<{
      reject?: Array<{ index: number; reason: string; duplicateOf?: number }>;
    }>(result.value.text);
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

    const isReviewable = (n: number) => Number.isInteger(n) && n >= 1 && n <= reviewable.length;
    const entries = (parsed.reject ?? []).filter((entry) => isReviewable(Number(entry?.index)));
    // A (c) rejection is recognised only by a well-formed `duplicateOf`: an
    // integer naming an EARLIER statement. Anything else — absent, 0, "none",
    // a later index — is read as (a)/(b) and honoured outright. Reading a
    // placeholder as "duplicate" would route a contradicting checklist item
    // down the path that keeps it, which is the fail-open BR-2 closed.
    //
    // The converse cannot be closed in code: a reviewer that calls something a
    // repeat but omits `duplicateOf` is honoured as (a)/(b), without the
    // audience check. The prompt requires the field; this is the residual risk.
    const duplicateOf = (entry: { index: number; duplicateOf?: unknown }): number | null => {
      const earlier = entry.duplicateOf;
      return typeof earlier === 'number' &&
        Number.isInteger(earlier) &&
        earlier >= 1 &&
        earlier < Number(entry.index)
        ? earlier - 1
        : null;
    };

    // A duplicate verdict is only ever acted on between two findings, or kept
    // between two checklist entries (the two lists are for two people). A
    // checklist entry "repeating" a finding is not a repeat of anything the
    // reader sees in that list — "Have cash ready" beside a finding saying the
    // cash request contradicts the quote is the contradiction itself — so that
    // verdict is honoured as a plain rejection.
    const isChecklist = (i: number) => i >= findings.length;
    const asDuplicate = (entry: { index: number; duplicateOf?: unknown }): number | null => {
      const earlier = duplicateOf(entry);
      if (earlier === null) return null;
      const later = Number(entry.index) - 1;
      return isChecklist(later) && !isChecklist(earlier) ? null : earlier;
    };

    const rejected = new Map<number, string>();
    // Contradiction and invention first: a "duplicate of #3" only counts if #3
    // survives, or the point is lost from both.
    for (const entry of entries) {
      if (asDuplicate(entry) === null) {
        rejected.set(
          Number(entry.index) - 1,
          String(entry.reason ?? 'rejected by semantic review')
        );
      }
    }
    for (const entry of entries) {
      const earlier = asDuplicate(entry);
      if (earlier === null) continue;
      const later = Number(entry.index) - 1;
      // The reviewer's judgement that two statements say the same thing is
      // trusted; its judgement of who would still see it is not. That part is
      // a property of the plan, so code decides it.
      if (isChecklist(later)) {
        // Between two checklist entries a "repeat" is never grounds to drop
        // one (the prompt's (c)). But a repeat of an entry rejected for
        // contradicting the terms says the same wrong thing to the other
        // person, so it inherits that verdict.
        if (rejected.has(earlier)) rejected.set(later, rejected.get(earlier) as string);
        continue;
      }
      if (
        rejected.has(earlier) ||
        !coversAudience(findings[earlier].visibility, findings[later].visibility)
      ) {
        continue;
      }
      rejected.set(later, String(entry.reason ?? 'duplicate'));
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

  // Under the names the prompt shows them by. Spreading `snapshot.payment` in
  // used to overwrite the booking's own `status` with the payment's, and left
  // `escrowHoldPlaced`/`fundsCaptured` — the names the prompt prints — unknown
  // here, so evidence citing them was dropped as invented.
  add('booking', snapshot.booking.id, {
    ...snapshot.booking,
    paymentStatus: snapshot.payment.status,
    escrowHoldPlaced: snapshot.payment.holdPlaced,
    fundsCaptured: snapshot.payment.captured,
  });
  add('availability', snapshot.booking.id, snapshot.availability);
  if (snapshot.quote) add('quote', snapshot.quote.id, snapshot.quote);
  if (snapshot.request) add('request', snapshot.request.id, snapshot.request);
  add('provider', snapshot.provider.id, snapshot.provider);
  for (const message of snapshot.messages) {
    add('message', message.id, {
      text: message.text,
      senderRole: message.senderRole,
      sentAt: message.sentAt,
    });
  }

  return index;
}

function resolveEvidence(refs: RawFinding['evidence'], index: RecordIndex): EvidenceRef[] {
  if (!Array.isArray(refs)) return [];
  const resolved: EvidenceRef[] = [];

  for (const ref of refs) {
    const record = index.get(`${ref?.source}:${ref?.recordId}`);
    if (!record) continue; // invented or mismatched id

    // A message has exactly one citable thing: what it says. The id resolving
    // is the whole check — it proves the message exists in this booking's own
    // conversation. Requiring the model to also guess the field name ("text",
    // where it reasonably wrote "message", "content" or "body") dropped every
    // message-based finding there has ever been: 0 of 159 evidence refs across
    // the stored runs cited a message.
    if (ref.source === 'message') {
      resolved.push({
        source: 'message',
        recordId: ref.recordId,
        field: 'text',
        excerpt: excerptFor(record.get('text')),
        from: record.get('senderRole') as EvidenceRef['from'],
        at: record.get('sentAt') as string,
      });
      continue;
    }

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

/** Optional by design — a finding without a usable headline is shown without one. */
function cleanTitle(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const title = value.replace(/\s+/g, ' ').trim().replace(/\.$/, '');
  if (title === '') return undefined;
  return title.length > TITLE_MAX_LENGTH ? `${title.slice(0, TITLE_MAX_LENGTH - 1)}…` : title;
}

function truncate(value: string): string {
  return value.length > 60 ? `${value.slice(0, 60)}…` : value;
}
