import {
  semanticReview,
  validateChecklist,
  validateFindings,
} from '@/agents/workflows/booking-readiness/verification';
import { applyRoleFilter, buildStages } from '@/agents/workflows/booking-readiness/coordinator';
import { renderSnapshotForPrompt } from '@/agents/workflows/booking-readiness/prompt';
import { snapshotFingerprint } from '@/agents/workflows/booking-readiness/snapshot.service';
import { aiGateway } from '@/agents/services/ai-gateway.service';
import {
  ChecklistItem,
  RawChecklistItem,
  ReadinessPlan,
} from '@/agents/workflows/booking-readiness/types';
import {
  BOOKING_ID,
  MESSAGE_ID,
  cleanSnapshot,
  maliciousMessageSnapshot,
} from './fixtures/readinessFixtures';

/**
 * BR-2: role-scoped preparation checklists, produced by the Logistics agent.
 *
 * The thing that separates a checklist from generic service advice is evidence.
 * A model will happily produce "bring cleaning products" for any cleaning job;
 * the item is only worth showing when a record actually raised the question.
 */
describe('checklist validation', () => {
  const item = (over: Partial<RawChecklistItem> = {}): RawChecklistItem => ({
    category: 'access',
    label: 'Confirm someone can answer the intercom at 07:00',
    evidence: [{ source: 'booking', recordId: BOOKING_ID, field: 'specialInstructions' }],
    ...over,
  });

  it('keeps an item whose evidence resolves, and attaches a display excerpt', () => {
    const { items, dropReasons } = validateChecklist([item()], cleanSnapshot());

    expect(items).toHaveLength(1);
    expect(dropReasons).toHaveLength(0);
    expect(items[0].id).toEqual(expect.any(String));
    expect(items[0].evidence[0].excerpt).toEqual(expect.any(String));
  });

  it('drops an item citing a record id that does not exist', () => {
    // The fabrication guard. An invented id is the model asserting a fact about
    // a record nobody can check.
    const { items, dropReasons } = validateChecklist(
      [
        item({
          evidence: [{ source: 'booking', recordId: 'not-a-real-id', field: 'description' }],
        }),
      ],
      cleanSnapshot()
    );

    expect(items).toHaveLength(0);
    expect(dropReasons[0]).toMatch(/no resolvable evidence/);
  });

  it('drops an item with no evidence at all', () => {
    // "Bring cleaning products" — plausible, generic, unsupported.
    const { items, dropReasons } = validateChecklist([item({ evidence: [] })], cleanSnapshot());

    expect(items).toHaveLength(0);
    expect(dropReasons[0]).toMatch(/no resolvable evidence/);
  });

  it('drops an empty label before it reaches a reader', () => {
    const { items, dropReasons } = validateChecklist([item({ label: '   ' })], cleanSnapshot());

    expect(items).toHaveLength(0);
    expect(dropReasons[0]).toMatch(/empty checklist label/);
  });

  it('collapses two items that say the same thing in different words', () => {
    const { items, dropReasons } = validateChecklist(
      [item(), item({ label: 'Confirm someone can answer the intercom at 07:00.' })],
      cleanSnapshot()
    );

    expect(items).toHaveLength(1);
    expect(dropReasons[0]).toMatch(/duplicate checklist item/);
  });

  it('assigns every item a distinct id the model did not choose', () => {
    // Ids are the application's to hand out; a model-supplied one would be an
    // identifier for a record it never saw.
    const { items } = validateChecklist(
      [item(), item({ label: 'Clear parking space for the van', category: 'access' })],
      cleanSnapshot()
    );

    expect(items).toHaveLength(2);
    expect(new Set(items.map((i) => i.id)).size).toBe(2);
  });

  it('falls back to a known category rather than inventing one', () => {
    const { items } = validateChecklist(
      [item({ category: 'nonsense' as RawChecklistItem['category'] })],
      cleanSnapshot()
    );

    expect(items[0].category).toBe('scope');
  });

  it('accepts an item supported only by a message', () => {
    // Unlike findings, a checklist item has no severity to cap — a message is a
    // perfectly good reason to prepare for something.
    const { items } = validateChecklist(
      [item({ evidence: [{ source: 'message', recordId: MESSAGE_ID, field: 'text' }] })],
      maliciousMessageSnapshot()
    );

    expect(items).toHaveLength(1);
  });
});

describe('amounts carry their currency into the prompt', () => {
  it('states the currency beside every amount', () => {
    // A live run produced "£160" for a R$ 320 booking. The amounts are bare
    // numbers, so a model asked to mention a price just picks a symbol — and a
    // wrong currency discredits the whole plan for the reader who spots it.
    const snapshot = cleanSnapshot();
    snapshot.currency = 'BRL';

    const rendered = renderSnapshotForPrompt(snapshot);

    expect(rendered).toMatch(new RegExp(`totalAmount: ${snapshot.booking.totalAmount} BRL`));
    // And no amount is left standing on its own.
    expect(rendered).not.toMatch(/totalAmount: \d+(\.\d+)?\s*$/m);
  });

  it('changes the fingerprint, so switching currency stales stored plans', () => {
    // It is a prompt input like any other. Left out of the fingerprint, an admin
    // switching the platform currency would leave every stored plan hashing
    // identically — reported `current`, and handed back by `findReusable` as
    // `reused` — while its reasoning is still anchored on the old currency.
    const brl = cleanSnapshot();
    brl.currency = 'BRL';
    const eur = cleanSnapshot();
    eur.currency = 'EUR';

    expect(snapshotFingerprint(brl)).not.toBe(snapshotFingerprint(eur));
  });

  it('follows the configured currency rather than assuming one', () => {
    const snapshot = cleanSnapshot();
    snapshot.currency = 'USD';

    expect(renderSnapshotForPrompt(snapshot)).toContain('USD');
  });
});

describe('the semantic gate does not fail open under load', () => {
  const item = (n: number): ChecklistItem => ({
    id: `id-${n}`,
    category: 'access',
    label: `Preparation step number ${n}`,
    evidence: [{ source: 'booking', recordId: BOOKING_ID, field: 'description' }],
  });

  it('never sends the reviewer more statements than its response budget covers', async () => {
    // The reviewer answers with a list of indices, so its response budget scales
    // with how many statements it is given. BR-2 roughly doubled that input by
    // adding checklist items. Overflow the budget and the reply truncates,
    // fails to parse, and every statement is kept unreviewed — the gate inverts.
    //
    // Asserted on what actually reaches the model, because capping only the
    // *returned* list would still let the prompt grow without limit.
    const sent: string[] = [];
    jest.spyOn(aiGateway, 'generate').mockImplementation(async (_profile, request) => {
      sent.push(request.userMessage);
      return {
        model: 'test',
        value: { text: '{"reject":[]}', finishReason: 'stop', usage: undefined },
      } as never;
    });

    const many = Array.from({ length: 60 }, (_, i) => item(i));
    const review = await semanticReview([], many, cleanSnapshot(), undefined, 50);

    const numbered = (sent[0].match(/^\d+\. \[/gm) ?? []).length;
    expect(numbered).toBeLessThanOrEqual(40);

    // And the excess is dropped rather than returned unreviewed.
    expect(review.keptChecklist.length).toBeLessThanOrEqual(40);
    expect(review.dropReasons.some((r) => /dropped unreviewed/.test(r))).toBe(true);

    jest.restoreAllMocks();
  });

  it('reports that it did not run rather than silently keeping everything', async () => {
    // No AI gateway is configured in tests, so the call throws — which is the
    // real failure mode. `ran: false` is what marks the plan unreviewed and, in
    // the coordinator, stops it being stored as reusable.
    const review = await semanticReview([], [item(1)], cleanSnapshot(), undefined, 50);

    expect(review.ran).toBe(false);
  });
});

describe('checklist role boundary', () => {
  const checklistItem = (label: string): ChecklistItem => ({
    id: `id-${label}`,
    category: 'access',
    label,
    evidence: [{ source: 'booking', recordId: BOOKING_ID, field: 'specialInstructions' }],
  });

  const plan = (): ReadinessPlan => ({
    bookingId: BOOKING_ID,
    sourceFingerprint: 'fp',
    readiness: 'ready',
    agreedScope: [],
    exclusions: [],
    customerChecklist: [checklistItem('Unlock the side gate')],
    providerChecklist: [checklistItem('Bring a 10m hose')],
    findings: [],
    verification: { droppedCount: 0, semanticReviewRan: true },
    generatedAt: new Date().toISOString(),
    unavailableSections: [],
  });

  it('gives a customer only the customer list', () => {
    const filtered = applyRoleFilter(plan(), 'customer');

    expect(filtered.customerChecklist.map((i) => i.label)).toEqual(['Unlock the side gate']);
    // Emptied server-side, not merely hidden by whoever renders it: one plan is
    // stored and served to both participants, and a provider's preparation step
    // can quote a customer_only instruction.
    expect(filtered.providerChecklist).toEqual([]);
  });

  it('gives a provider only the provider list', () => {
    const filtered = applyRoleFilter(plan(), 'provider');

    expect(filtered.providerChecklist.map((i) => i.label)).toEqual(['Bring a 10m hose']);
    expect(filtered.customerChecklist).toEqual([]);
  });

  it('leaves the stored plan untouched so the other participant still gets theirs', () => {
    const stored = plan();
    applyRoleFilter(stored, 'customer');

    expect(stored.providerChecklist).toHaveLength(1);
  });
});

describe('the coordinator wires scope and logistics together', () => {
  // Bound to `buildStages`, not to a hand-built WorkflowRunner. Synthetic stages
  // prove the runner can run things concurrently; they say nothing about whether
  // *this workflow* asks it to. Both of the behaviours BR-2 rests on — one group,
  // logistics optional — live in the coordinator, so that is what gets asserted.
  const stages = () => buildStages(cleanSnapshot());

  it('puts both agents in a single group so they run concurrently', () => {
    const groups = stages();
    const names = groups.map((group) => group.map((stage) => stage.name));

    expect(names[0]).toEqual(['scope', 'logistics']);
    // Verification is its own group: it consumes what the first two produce.
    expect(names[1]).toEqual(['verification']);
  });

  it('marks logistics optional and scope required', () => {
    const [first] = stages();

    expect(first.find((s) => s.name === 'scope')?.required).toBe(true);
    // Losing logistics costs the reader their checklists; losing scope would
    // leave nothing worth showing at all.
    expect(first.find((s) => s.name === 'logistics')?.required).toBe(false);
  });
});

describe('near-identical findings collapse', () => {
  // Scoped to `validateFindings` itself. That the coordinator actually feeds it
  // *both* agents' findings is covered by the integration test, which mocks
  // logistics and asserts its finding reaches the plan — a claim this unit test
  // cannot make, because it passes a pre-merged array.
  it('does not show one concern twice because two agents raised it', () => {
    const raw = (statement: string) => ({
      category: 'access' as const,
      severity: 'attention' as const,
      visibility: 'shared' as const,
      statement,
      evidence: [
        { source: 'booking' as const, recordId: BOOKING_ID, field: 'specialInstructions' },
      ],
    });

    const { findings, dropReasons } = validateFindings(
      [
        raw('No backup access method is recorded for the appointment'),
        raw('No backup access method is recorded for the appointment.'),
      ],
      cleanSnapshot()
    );

    expect(findings).toHaveLength(1);
    expect(dropReasons.some((r) => /duplicate/.test(r))).toBe(true);
  });
});
