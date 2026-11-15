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
  ReadinessFinding,
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

  it('drops findings past the cap too, not just checklist items', async () => {
    // Findings are ordered first, so with more than the cap of them the overflow
    // is findings — and returning those unreviewed is the same fail-open reached
    // from the other end. Covers all three return paths via the mocked reply.
    const finding = (n: number): ReadinessFinding => ({
      id: `f-${n}`,
      category: 'scope',
      severity: 'attention',
      visibility: 'shared',
      statement: `Concern number ${n} about the agreed work`,
      evidence: [{ source: 'booking', recordId: BOOKING_ID, field: 'description' }],
    });

    jest.spyOn(aiGateway, 'generate').mockResolvedValue({
      model: 'test',
      value: { text: '{"reject":[]}', finishReason: 'stop', usage: undefined },
    } as never);

    const many = Array.from({ length: 55 }, (_, i) => finding(i));
    const review = await semanticReview(many, [], cleanSnapshot(), undefined, 50);

    expect(review.kept.length).toBeLessThanOrEqual(40);
    expect(review.dropReasons.some((r) => /dropped unreviewed/.test(r))).toBe(true);

    jest.restoreAllMocks();
  });

  it('withholds every checklist item when the pass could not run', async () => {
    // No AI gateway is configured in tests, so the call throws — the real failure
    // mode. Findings survive unreviewed because they arrive labelled (severity,
    // category, evidence) and the drawer marks the plan unreviewed. A checklist
    // item is a bare imperative in the platform's voice, so it is withheld: the
    // pass that just failed is the only thing that would have rejected
    // "have R$500 in cash ready" against a R$160 accepted quote.
    //
    // Storing the run `failed_partial` only stops it being *reused*; it does
    // nothing for the reader holding this response.
    const review = await semanticReview([], [item(1), item(2)], cleanSnapshot(), undefined, 50);

    expect(review.ran).toBe(false);
    expect(review.keptChecklist).toEqual([]);
    expect(review.dropReasons.some((r) => /withheld unreviewed/.test(r))).toBe(true);
  });

  it('withholds them on a malformed reply too, not only on a thrown error', async () => {
    jest.spyOn(aiGateway, 'generate').mockResolvedValue({
      model: 'test',
      value: { text: '{"reject": [', finishReason: 'max_tokens', usage: undefined },
    } as never);

    const review = await semanticReview([], [item(1)], cleanSnapshot(), undefined, 50);

    expect(review.ran).toBe(false);
    expect(review.keptChecklist).toEqual([]);

    jest.restoreAllMocks();
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

describe('the coordinator wires the specialist agents together', () => {
  // Bound to `buildStages`, not to a hand-built WorkflowRunner. Synthetic stages
  // prove the runner can run things concurrently; they say nothing about whether
  // *this workflow* asks it to. Both of the behaviours BR-2 rests on — one group,
  // logistics optional — live in the coordinator, so that is what gets asserted.
  const stages = () => buildStages(cleanSnapshot());

  it('puts every specialist in a single group so they run concurrently', () => {
    const groups = stages();
    const names = groups.map((group) => group.map((stage) => stage.name));

    // Risk joined in BR-3. Reading the others' output would have made it serial
    // and pushed a run from ~30s to ~55s; it does not need to, because the one
    // validation pass already collapses a concern two agents raise.
    expect(names[0]).toEqual(['scope', 'logistics', 'risk']);
    // Verification is its own group: it consumes what the first two produce.
    expect(names[1]).toEqual(['verification']);
  });

  it('marks the optional specialists optional and scope required', () => {
    const [first] = stages();

    expect(first.find((s) => s.name === 'scope')?.required).toBe(true);
    // Losing logistics costs the reader their checklists, losing risk costs a
    // class of finding; losing scope would leave nothing worth showing at all.
    expect(first.find((s) => s.name === 'logistics')?.required).toBe(false);
    expect(first.find((s) => s.name === 'risk')?.required).toBe(false);
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

/**
 * A repeat is only a repeat for the people who would still see the original.
 * Findings reach the reviewer in agent order — scope, logistics, risk — and a
 * later `shared` finding dropped as a "duplicate" of an earlier `customer_only`
 * one leaves the provider with no such finding at all, and a readiness headline
 * computed without it: "ready" for one participant, "blocked" for the other.
 */
describe('a duplicate is judged against who can see it', () => {
  const finding = (
    id: string,
    visibility: ReadinessFinding['visibility'],
    statement = 'No access arrangement exists for the appointment'
  ): ReadinessFinding => ({
    id,
    category: 'access',
    severity: 'blocking',
    visibility,
    statement,
    evidence: [{ source: 'booking', recordId: BOOKING_ID, field: 'specialInstructions' }],
  });

  const reviewerReplies = (reject: unknown[]) =>
    jest.spyOn(aiGateway, 'generate').mockResolvedValue({
      model: 'test',
      value: { text: JSON.stringify({ reject }), finishReason: 'stop', usage: undefined },
    } as never);

  afterEach(() => jest.restoreAllMocks());

  it('keeps a shared finding the reviewer called a repeat of a customer-only one', async () => {
    reviewerReplies([{ index: 2, reason: 'same point', duplicateOf: 1 }]);
    const review = await semanticReview(
      [finding('scope-1', 'customer_only'), finding('risk-1', 'shared')],
      [],
      cleanSnapshot(),
      undefined,
      50
    );

    expect(review.kept.map((f) => f.id)).toEqual(['scope-1', 'risk-1']);
    const provider = applyRoleFilter(
      {
        bookingId: BOOKING_ID,
        sourceFingerprint: 'fp',
        readiness: 'blocked',
        agreedScope: [],
        exclusions: [],
        findings: review.kept,
        customerChecklist: [],
        providerChecklist: [],
        verification: { droppedCount: 0, semanticReviewRan: true },
        generatedAt: new Date().toISOString(),
        unavailableSections: [],
      } as ReadinessPlan,
      'provider'
    );
    expect(provider.findings.map((f) => f.id)).toEqual(['risk-1']);
    expect(provider.readiness).toBe('blocked');
  });

  it('still drops a repeat whose audience the earlier finding covers', async () => {
    // The control: without it, the case above passes against a reviewer whose
    // duplicate rejections are never honoured at all.
    reviewerReplies([{ index: 2, reason: 'same point', duplicateOf: 1 }]);
    const review = await semanticReview(
      [finding('scope-1', 'shared'), finding('risk-1', 'provider_only')],
      [],
      cleanSnapshot(),
      undefined,
      50
    );

    expect(review.kept.map((f) => f.id)).toEqual(['scope-1']);
  });

  it('keeps a repeat whose original was itself rejected', async () => {
    // Otherwise the point is lost from both: #1 for contradicting the terms,
    // #2 for repeating #1.
    reviewerReplies([
      { index: 1, reason: 'contradicts the accepted quote' },
      { index: 2, reason: 'same point', duplicateOf: 1 },
    ]);
    const review = await semanticReview(
      [finding('scope-1', 'shared'), finding('risk-1', 'shared')],
      [],
      cleanSnapshot(),
      undefined,
      50
    );

    expect(review.kept.map((f) => f.id)).toEqual(['risk-1']);
  });

  it('tells the reviewer who sees each finding', async () => {
    const spy = reviewerReplies([]);
    await semanticReview(
      [finding('scope-1', 'customer_only'), finding('risk-1', 'shared')],
      [],
      cleanSnapshot(),
      undefined,
      50
    );

    const sent = (spy.mock.calls[0][1] as { userMessage: string }).userMessage;
    expect(sent).toMatch(/1\. \[finding:customer_only\]/);
    expect(sent).toMatch(/2\. \[finding:shared\]/);
  });

  it('does not collapse a shared finding into a near-identical role-only one', () => {
    // The deterministic lexical pass has the same rule, for the same reason.
    const raw = (visibility: ReadinessFinding['visibility']) => ({
      category: 'access' as const,
      severity: 'attention' as const,
      visibility,
      statement: 'No backup access method is recorded for the appointment',
      evidence: [
        { source: 'booking' as const, recordId: BOOKING_ID, field: 'specialInstructions' },
      ],
    });

    const { findings } = validateFindings([raw('customer_only'), raw('shared')], cleanSnapshot());
    expect(findings.map((f) => f.visibility)).toEqual(['customer_only', 'shared']);
  });
});

describe('a malformed duplicateOf is not a licence to keep', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([0, 'none', '', 5])(
    'still withholds a contradicting checklist item whose duplicateOf is %p',
    async (placeholder) => {
      // Read as a (c) duplicate, the rejection would hit "only findings are
      // dropped as repeats" and keep the item: platform-voiced advice that
      // contradicts the accepted quote.
      jest.spyOn(aiGateway, 'generate').mockResolvedValue({
        model: 'test',
        value: {
          text: JSON.stringify({
            reject: [
              { index: 1, reason: 'contradicts platform-only payment', duplicateOf: placeholder },
            ],
          }),
          finishReason: 'stop',
          usage: undefined,
        },
      } as never);
      const cash: ChecklistItem = {
        id: 'c-1',
        category: 'payment',
        label: 'Have R$500 in cash ready',
        evidence: [{ source: 'message', recordId: MESSAGE_ID, field: 'text' }],
      } as ChecklistItem;

      const review = await semanticReview([], [cash], cleanSnapshot(), undefined, 50, ['c-1']);

      expect(review.keptChecklist).toEqual([]);
    }
  );
});

describe('a checklist item called a repeat of a finding', () => {
  afterEach(() => jest.restoreAllMocks());

  const reply = (reject: unknown[]) =>
    jest.spyOn(aiGateway, 'generate').mockResolvedValue({
      model: 'test',
      value: { text: JSON.stringify({ reject }), finishReason: 'stop', usage: undefined },
    } as never);

  const cashFinding: ReadinessFinding = {
    id: 'f-1',
    category: 'payment',
    severity: 'attention',
    visibility: 'shared',
    statement: 'The provider asked for cash, contradicting platform-only payment',
    evidence: [{ source: 'message', recordId: MESSAGE_ID, field: 'text' }],
  };
  const item = (id: string, label: string): ChecklistItem => ({
    id,
    category: 'payment',
    label,
    evidence: [{ source: 'message', recordId: MESSAGE_ID, field: 'text' }],
  });

  it('is withheld: the item is the contradiction the finding describes', async () => {
    // Exactly what the manual-test scenario plants. Kept, it would be platform-
    // voiced advice to pay off-platform, beside a finding saying not to.
    reply([{ index: 2, reason: 'contradicts payment terms; same point as #1', duplicateOf: 1 }]);
    const review = await semanticReview(
      [cashFinding],
      [item('c-1', 'Have cash ready for the provider')],
      cleanSnapshot(),
      undefined,
      50,
      ['c-1']
    );

    expect(review.keptChecklist).toEqual([]);
  });

  it('is kept when it repeats the other participant checklist', async () => {
    // The control, and the case the exemption exists for.
    reply([{ index: 3, reason: 'same step', duplicateOf: 2 }]);
    const review = await semanticReview(
      [cashFinding],
      [item('c-1', 'Confirm the gate code'), item('p-1', 'Confirm the gate code')],
      cleanSnapshot(),
      undefined,
      50,
      ['c-1']
    );

    expect(review.keptChecklist.map((c) => c.id)).toEqual(['c-1', 'p-1']);
  });

  it('is withheld when it repeats a checklist item rejected for contradiction', async () => {
    // "Collect R$500 in cash" is the provider's copy of the customer's rejected
    // "Have R$500 in cash ready": the same wrong advice, to the other person.
    reply([
      { index: 2, reason: 'contradicts platform-only payment' },
      { index: 3, reason: 'same point as #2', duplicateOf: 2 },
    ]);
    const review = await semanticReview(
      [cashFinding],
      [item('c-1', 'Have R$500 in cash ready'), item('p-1', 'Collect R$500 in cash on arrival')],
      cleanSnapshot(),
      undefined,
      50,
      ['c-1']
    );

    expect(review.keptChecklist).toEqual([]);
  });
});
