import {
  validateChecklist,
  validateFindings,
} from '@/agents/workflows/booking-readiness/verification';
import {
  localDateTime,
  renderOutputConventions,
  renderSnapshotForPrompt,
} from '@/agents/workflows/booking-readiness/prompt';
import {
  planFreshness,
  planLanguage,
  recordsFingerprint,
  snapshotFingerprint,
} from '@/agents/workflows/booking-readiness/snapshot.service';
import { runScopeAgent } from '@/agents/workflows/booking-readiness/agents/scope.agent';
import { runLogisticsAgent } from '@/agents/workflows/booking-readiness/agents/logistics.agent';
import { runRiskAgent } from '@/agents/workflows/booking-readiness/agents/risk.agent';
import { draftMessage } from '@/agents/workflows/booking-readiness/agents/communication.agent';
import { aiGateway } from '@/agents/services/ai-gateway.service';
import { RawFinding, SnapshotMessage } from '@/agents/workflows/booking-readiness/types';
import {
  BOOKING_ID,
  MESSAGE_ID,
  cleanSnapshot,
  heldEscrowSnapshot,
  maliciousMessageSnapshot,
} from './fixtures/readinessFixtures';

/**
 * What a real run on a seeded booking showed that the suite had not: the plan
 * was unusable in ways no assertion covered, because every fixture cited
 * evidence the way the code wanted rather than the way a model writes it.
 */

const finding = (over: Partial<RawFinding> = {}): RawFinding => ({
  category: 'safety',
  severity: 'attention',
  visibility: 'shared',
  statement: 'The customer mentions a dog that can be aggressive in the back yard',
  evidence: [{ source: 'message', recordId: MESSAGE_ID, field: 'text' }],
  ...over,
});

describe('a finding based on a chat message', () => {
  // Across twelve stored live runs, 0 of 159 evidence references cited a
  // message. The prompt printed <message recordId=…> with no field name, the
  // index accepted only `text`, and the models wrote everything but.
  it.each(['message', 'content', 'body', 'at', ''])(
    'survives whatever the model called the field (%p)',
    (field) => {
      const { findings, dropReasons } = validateFindings(
        [finding({ evidence: [{ source: 'message', recordId: MESSAGE_ID, field }] })],
        maliciousMessageSnapshot()
      );

      expect(dropReasons).toEqual([]);
      expect(findings).toHaveLength(1);
      expect(findings[0].evidence[0].field).toBe('text');
    }
  );

  it('quotes the message and says who wrote it', () => {
    const snapshot = maliciousMessageSnapshot();
    const { findings } = validateFindings([finding()], snapshot);

    const [ref] = findings[0].evidence;
    expect(ref.excerpt).toBeTruthy();
    expect(ref.from).toBe(snapshot.messages[0].senderRole);
    expect(ref.at).toBe(snapshot.messages[0].sentAt);
  });

  it('still drops a message id that is not in this conversation', () => {
    const { findings } = validateFindings(
      [
        finding({
          evidence: [
            { source: 'message', recordId: '99999999-9999-4999-8999-999999999999', field: 'text' },
          ],
        }),
      ],
      maliciousMessageSnapshot()
    );

    expect(findings).toEqual([]);
  });

  it('keeps a checklist item cited the same way', () => {
    const { items } = validateChecklist(
      [
        {
          category: 'safety',
          label: 'Keep the dog out of the work area',
          evidence: [{ source: 'message', recordId: MESSAGE_ID, field: 'message' }],
        },
      ],
      maliciousMessageSnapshot()
    );

    expect(items).toHaveLength(1);
  });

  it('tells the agents how to cite one', () => {
    expect(renderSnapshotForPrompt(maliciousMessageSnapshot())).toMatch(
      /"source":"message","recordId":"[^"]+","field":"text"/
    );
  });
});

describe('evidence is shown under the name the prompt gave it', () => {
  it('does not show the payment status as the booking status', () => {
    // The index spread the payment facts over the booking's, so `status`
    // resolved to "pending" (payment) on a confirmed booking.
    const snapshot = heldEscrowSnapshot();
    snapshot.booking.status = 'in_progress';
    snapshot.payment.status = 'pending';

    const { findings } = validateFindings(
      [finding({ evidence: [{ source: 'booking', recordId: BOOKING_ID, field: 'status' }] })],
      snapshot
    );

    expect(findings[0].evidence[0].excerpt).toBe('in_progress');
  });

  it.each(['paymentStatus', 'escrowHoldPlaced', 'fundsCaptured'])(
    'resolves the payment field the prompt prints as %s',
    (field) => {
      const snapshot = heldEscrowSnapshot();
      expect(renderSnapshotForPrompt(snapshot)).toContain(`${field}:`);

      const { findings } = validateFindings(
        [finding({ evidence: [{ source: 'booking', recordId: BOOKING_ID, field }] })],
        snapshot
      );

      expect(findings).toHaveLength(1);
    }
  );
});

describe('times reach the agents in the appointment’s own zone', () => {
  it('renders the booking time locally, with its weekday', () => {
    // 13:00Z is 10:00 in Florianópolis. Handed the ISO string, a model wrote
    // "arrive at 16:00" into a provider's checklist for a 13:00 appointment.
    const snapshot = cleanSnapshot();
    snapshot.booking.scheduledDate = '2026-09-01T13:00:00.000Z';
    snapshot.timezone = 'America/Sao_Paulo';

    const rendered = renderSnapshotForPrompt(snapshot);

    expect(rendered).toContain('scheduledDate: 2026-09-01 10:00 (Tuesday)');
    expect(rendered).not.toContain('2026-09-01T13:00:00.000Z');
    expect(rendered).toContain('America/Sao_Paulo');
  });

  it('renders message times the same way', () => {
    const snapshot = maliciousMessageSnapshot();
    snapshot.messages[0].sentAt = '2026-08-30T02:30:00.000Z';

    // Late evening on the 29th locally — a different calendar day from the UTC one.
    expect(renderSnapshotForPrompt(snapshot)).toContain('at="2026-08-29 23:30 (Saturday)"');
  });

  it('follows the configured zone', () => {
    expect(localDateTime('2026-09-01T13:00:00.000Z', 'America/Manaus')).toBe(
      '2026-09-01 09:00 (Tuesday)'
    );
  });

  it('stales stored plans when the zone changes', () => {
    const here = cleanSnapshot();
    const there = cleanSnapshot();
    there.timezone = 'America/Manaus';

    expect(snapshotFingerprint(here)).not.toBe(snapshotFingerprint(there));
    expect(recordsFingerprint(here)).not.toBe(recordsFingerprint(there));
  });
});

describe('one plan, one language', () => {
  const messages = (texts: string[]): SnapshotMessage[] =>
    texts.map((text, i) => ({
      id: `m${i}`,
      senderRole: 'customer',
      sentAt: '2026-08-30T12:00:00.000Z',
      text,
    }));

  it('follows the conversation', () => {
    expect(
      planLanguage(
        messages(['Hi, can you confirm the time?', 'Sure, that is fine with the key']),
        ['Limpeza completa de apartamento'],
        'pt-BR'
      )
    ).toBe('English');
  });

  it('falls back to the booking’s own text when nobody has written yet', () => {
    expect(planLanguage([], ['Please clean the windows and the kitchen, thanks'], 'pt-BR')).toBe(
      'English'
    );
  });

  it('falls back to the platform, never to whoever pressed the button', () => {
    expect(planLanguage([], ['Florianópolis'], 'pt-BR')).toBe('Portuguese');
    expect(planLanguage([], [null, undefined], 'en-US')).toBe('English');
  });

  describe('every agent that writes part of the plan', () => {
    const reply = (text: string) =>
      ({ model: 'test', value: { text, finishReason: 'stop' } }) as never;

    afterEach(() => jest.restoreAllMocks());

    it.each([
      ['scope', runScopeAgent, '{"agreedScope":[],"exclusions":[],"findings":[]}'],
      [
        'logistics',
        runLogisticsAgent,
        '{"customerChecklist":[],"providerChecklist":[],"findings":[]}',
      ],
      ['risk', runRiskAgent, '{"findings":[]}'],
    ] as const)('%s is told the plan’s language', async (_name, run, json) => {
      const generate = jest.spyOn(aiGateway, 'generate').mockResolvedValue(reply(json));
      const snapshot = cleanSnapshot();
      snapshot.outputLanguage = 'English';

      await run(snapshot);

      expect(generate.mock.calls[0][1].userMessage).toMatch(
        /Write every piece of text.*in English/
      );
    });

    it('leaves the drafter to its own choice of language', async () => {
      // A draft follows the thread and then the sender's locale; a plan-language
      // instruction in the same prompt would contradict the one it is given.
      const generate = jest.spyOn(aiGateway, 'generate').mockResolvedValue(reply('{"body":"Oi"}'));
      const snapshot = cleanSnapshot();
      snapshot.outputLanguage = 'English';

      await draftMessage(
        snapshot,
        {
          id: 'f',
          category: 'access',
          severity: 'attention',
          visibility: 'shared',
          statement: 's',
          evidence: [],
        },
        'customer',
        'pt'
      );

      expect(generate.mock.calls[0][1].userMessage).not.toContain(
        renderOutputConventions(snapshot)
      );
      expect(generate.mock.calls[0][1].userMessage).toContain('LANGUAGE: Portuguese');
    });
  });
});

describe('a finding’s headline and who settles it', () => {
  it('keeps a short title and drops its full stop', () => {
    const { findings } = validateFindings(
      [finding({ title: '  Dog in the  back yard. ' })],
      maliciousMessageSnapshot()
    );

    expect(findings[0].title).toBe('Dog in the back yard');
  });

  it('shows no title rather than an empty or overlong one', () => {
    const { findings } = validateFindings(
      [
        finding({ title: '   ' }),
        finding({ statement: 'Another point entirely about parking', title: 'x'.repeat(200) }),
      ],
      maliciousMessageSnapshot()
    );

    expect(findings[0].title).toBeUndefined();
    expect(findings[1].title?.length).toBeLessThanOrEqual(80);
  });

  it.each([undefined, 'nobody', 'CUSTOMER'])(
    'reads an unusable answerFrom (%p) as both, never as the other person’s move',
    (answerFrom) => {
      const { findings } = validateFindings(
        [finding({ answerFrom: answerFrom as never })],
        maliciousMessageSnapshot()
      );

      expect(findings[0].answerFrom).toBe('both');
    }
  );

  it('keeps a valid one', () => {
    const { findings } = validateFindings(
      [finding({ answerFrom: 'provider' })],
      maliciousMessageSnapshot()
    );

    expect(findings[0].answerFrom).toBe('provider');
  });
});

describe('telling a moved conversation from changed terms', () => {
  const stored = (snapshot = cleanSnapshot()) => ({
    sourceFingerprint: snapshotFingerprint(snapshot),
    output: { recordsFingerprint: recordsFingerprint(snapshot) },
  });
  const withMessage = () => {
    const snapshot = cleanSnapshot();
    snapshot.messages = [
      { id: 'm1', senderRole: 'provider', sentAt: '2026-08-30T12:00:00.000Z', text: 'Combinado!' },
    ];
    return snapshot;
  };

  it('is current while nothing has changed', () => {
    expect(planFreshness(stored(), cleanSnapshot())).toBe('current');
  });

  it('is messages_changed when only a message arrived', () => {
    expect(planFreshness(stored(), withMessage())).toBe('messages_changed');
  });

  it('is stale when a term changed, with or without new messages', () => {
    const changed = withMessage();
    changed.booking.totalAmount += 50;

    expect(planFreshness(stored(), changed)).toBe('stale');
  });

  it.each([
    ['no fingerprint at all', { sourceFingerprint: null, output: {} }],
    ['no records fingerprint', { sourceFingerprint: 'x', output: {} }],
    [
      'an empty records fingerprint',
      { sourceFingerprint: 'x', output: { recordsFingerprint: '' } },
    ],
    ['no output', { sourceFingerprint: 'x', output: null }],
  ])('is stale with %s: could not compare is not unchanged', (_label, run) => {
    expect(planFreshness(run, withMessage())).toBe('stale');
  });
});
