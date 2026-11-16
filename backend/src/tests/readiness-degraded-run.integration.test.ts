import { randomUUID } from 'crypto';
import { AppDataSource } from '@/config/database';
import { AppSettings } from '@/models/AppSettings';
import { Booking, BookingStatus, PaymentStatus } from '@/models/Booking';
import { Provider } from '@/models/Provider';
import { User, UserType } from '@/models/User';
import { AgentWorkflowRun, WorkflowRunStatus } from '@/models/AgentWorkflowRun';
import { Conversation, ConversationType } from '@/models/Conversation';
import { Message } from '@/models/Message';
import { workflowRepository } from '@/agents/workflows/shared/WorkflowRepository';
import readinessController from '@/controllers/ReadinessController';
import { AuthenticatedRequest } from '@/types';
import { aiGateway } from '@/agents/services/ai-gateway.service';
import { runBookingReadiness } from '@/agents/workflows/booking-readiness/coordinator';
import * as scopeAgent from '@/agents/workflows/booking-readiness/agents/scope.agent';
import * as logisticsAgent from '@/agents/workflows/booking-readiness/agents/logistics.agent';
import * as riskAgent from '@/agents/workflows/booking-readiness/agents/risk.agent';
import * as verification from '@/agents/workflows/booking-readiness/verification';
import { draftBudget } from '@/agents/workflows/booking-readiness/draftBudget';
import * as snapshotService from '@/agents/workflows/booking-readiness/snapshot.service';
import {
  READINESS_SCHEMA_VERSION,
  READINESS_SUBJECT_TYPE,
  READINESS_WORKFLOW_TYPE,
  ReadinessFinding,
} from '@/agents/workflows/booking-readiness/types';

/**
 * What a run is *stored as* when an optional stage fails, and whether MN5 will
 * then serve it forever.
 *
 * `WorkflowRunner.degraded` counts only required stages — correct for the
 * readiness rollup, since an optional failure should not force `incomplete`.
 * Keying the stored status off it was not: `logistics` is the first optional
 * stage in this workflow, and a run that lost its checklists was written as
 * `completed`, which is exactly what `findReusable` matches on. Every later
 * request for an unchanged booking was then answered with that checklist-less
 * plan as `reused`, and no amount of pressing Re-run could produce checklists
 * again until somebody edited the booking.
 */
describe('a readiness run that lost an optional stage', () => {
  let customer: User;
  let provider: Provider;
  let providerUser: User;
  let booking: Booking;

  beforeEach(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const users = AppDataSource.getRepository(User);
    const suffix = Date.now();
    customer = await users.save(
      users.create({
        email: `degraded-customer-${suffix}@test.local`,
        password: 'hashed',
        firstName: 'Test',
        lastName: 'User',
        userType: UserType.CUSTOMER,
        isVerified: true,
        isActive: true,
      })
    );
    providerUser = await users.save(
      users.create({
        email: `degraded-provider-${suffix}@test.local`,
        password: 'hashed',
        firstName: 'Test',
        lastName: 'Provider',
        userType: UserType.PROVIDER,
        isVerified: true,
        isActive: true,
      })
    );

    provider = await AppDataSource.getRepository(Provider).save(
      AppDataSource.getRepository(Provider).create({
        userId: providerUser.id,
        businessName: 'Degraded Test Co',
        description: 'test',
        services: ['Limpeza Residencial'],
        location: {
          latitude: -27.6,
          longitude: -48.5,
          address: 'a',
          city: 'Floripa',
          state: 'SC',
          zipCode: '1',
          country: 'BR',
        },
        availableHours: {
          monday: { start: '09:00', end: '18:00', available: true },
          tuesday: { start: '09:00', end: '18:00', available: true },
          wednesday: { start: '09:00', end: '18:00', available: true },
          thursday: { start: '09:00', end: '18:00', available: true },
          friday: { start: '09:00', end: '18:00', available: true },
          saturday: { start: '09:00', end: '18:00', available: true },
          sunday: { start: '09:00', end: '18:00', available: true },
        },
      })
    );

    booking = await AppDataSource.getRepository(Booking).save(
      AppDataSource.getRepository(Booking).create({
        customerId: customer.id,
        providerId: provider.id,
        serviceType: 'Limpeza Residencial',
        description: 'test booking',
        location: {
          latitude: -27.6,
          longitude: -48.5,
          address: 'a',
          city: 'Floripa',
          state: 'SC',
          zipCode: '1',
        },
        scheduledDate: new Date(Date.now() + 86_400_000),
        estimatedDuration: 120,
        status: BookingStatus.CONFIRMED,
        totalAmount: 100,
        paymentStatus: PaymentStatus.PAID,
      })
    );

    // No live model calls: scope succeeds, the semantic pass is a no-op.
    jest.spyOn(scopeAgent, 'runScopeAgent').mockResolvedValue({
      output: { agreedScope: ['Deep clean'], exclusions: [], findings: [] },
      inputTokens: 0,
      outputTokens: 0,
    });
    // Risk joined the parallel group in BR-3; without a stub it fails for want
    // of a gateway and lands in `unavailableSections`, which is a real signal
    // these tests are not about.
    jest.spyOn(riskAgent, 'runRiskAgent').mockResolvedValue({
      output: { findings: [] },
      inputTokens: 0,
      outputTokens: 0,
    });
    // Passes everything through rather than returning empty lists: a mock that
    // swallows its input cannot distinguish correct wiring from no wiring.
    jest.spyOn(verification, 'semanticReview').mockImplementation(async (findings, checklist) => ({
      kept: findings,
      keptChecklist: checklist,
      dropReasons: [],
      ran: true,
    }));
  });

  afterEach(() => jest.restoreAllMocks());

  const storedRun = async (): Promise<AgentWorkflowRun> =>
    AppDataSource.getRepository(AgentWorkflowRun).findOneOrFail({
      where: { subjectId: booking.id },
      order: { createdAt: 'DESC' },
    });

  it('is stored as failed_partial, and is never served as a reusable plan', async () => {
    jest
      .spyOn(logisticsAgent, 'runLogisticsAgent')
      .mockRejectedValue(new Error('Logistics agent output truncated at 4000 tokens'));

    const result = await runBookingReadiness(booking, customer.id, 'customer');
    const run = await storedRun();

    // The plan is still worth showing — scope succeeded — and readiness is not
    // forced to `incomplete` by an optional stage.
    expect(result.plan.readiness).not.toBe('incomplete');
    expect(run.output).not.toBeNull();
    expect(run.errorSummary).toMatch(/truncated/i);

    // But it does not claim to be complete, and it says which part is missing.
    expect(run.status).toBe(WorkflowRunStatus.FAILED_PARTIAL);
    expect((run.output as { unavailableSections: string[] }).unavailableSections).toEqual([
      'logistics',
    ]);
    expect((run.output as { customerChecklist: unknown[] }).customerChecklist).toEqual([]);

    // The property that matters: MN5 will not hand this back forever.
    const candidate = await workflowRepository.findReusable(
      READINESS_WORKFLOW_TYPE,
      READINESS_SUBJECT_TYPE,
      booking.id,
      run.sourceFingerprint ?? '',
      READINESS_SCHEMA_VERSION
    );
    expect(candidate).toBeNull();
  });

  it('is stored as completed, and reusable, when every stage succeeded', async () => {
    jest.spyOn(logisticsAgent, 'runLogisticsAgent').mockResolvedValue({
      output: { customerChecklist: [], providerChecklist: [], findings: [] },
      inputTokens: 0,
      outputTokens: 0,
    });

    await runBookingReadiness(booking, customer.id, 'customer');
    const run = await storedRun();

    expect(run.status).toBe(WorkflowRunStatus.COMPLETED);
    expect((run.output as { unavailableSections: string[] }).unavailableSections).toEqual([]);

    const candidate = await workflowRepository.findReusable(
      READINESS_WORKFLOW_TYPE,
      READINESS_SUBJECT_TYPE,
      booking.id,
      run.sourceFingerprint ?? '',
      READINESS_SCHEMA_VERSION
    );
    expect(candidate?.id).toBe(run.id);
  });

  describe('the coordinator keeps the two checklists apart', () => {
    // The one place the lists could be crossed. Every other checklist test works
    // on a hand-built plan, so assigning `provider.items` to `customerChecklist`
    // here would leak a provider's preparation steps to the customer and leave
    // the whole suite green.
    const logisticsReturning = () =>
      jest.spyOn(logisticsAgent, 'runLogisticsAgent').mockResolvedValue({
        output: {
          customerChecklist: [
            {
              category: 'access',
              label: 'CUSTOMER unlocks the side gate',
              evidence: [{ source: 'booking', recordId: booking.id, field: 'description' }],
            },
          ],
          providerChecklist: [
            {
              category: 'materials',
              label: 'PROVIDER brings a 10m hose',
              evidence: [{ source: 'booking', recordId: booking.id, field: 'description' }],
            },
          ],
          findings: [],
        },
        inputTokens: 0,
        outputTokens: 0,
      });

    it('gives the customer their own items and none of the provider’s', async () => {
      logisticsReturning();

      const { plan } = await runBookingReadiness(booking, customer.id, 'customer');

      expect(plan.customerChecklist.map((i) => i.label)).toEqual([
        'CUSTOMER unlocks the side gate',
      ]);
      expect(plan.providerChecklist).toEqual([]);
    });

    it('gives the provider their own items and none of the customer’s', async () => {
      logisticsReturning();

      const { plan } = await runBookingReadiness(booking, customer.id, 'provider');

      expect(plan.providerChecklist.map((i) => i.label)).toEqual(['PROVIDER brings a 10m hose']);
      expect(plan.customerChecklist).toEqual([]);
    });

    it('stores both lists, so each participant can still be served from one run', async () => {
      logisticsReturning();
      await runBookingReadiness(booking, customer.id, 'customer');

      const output = (await storedRun()).output as {
        customerChecklist: unknown[];
        providerChecklist: unknown[];
      };
      expect(output.customerChecklist).toHaveLength(1);
      expect(output.providerChecklist).toHaveLength(1);
    });

    it('carries findings raised by logistics into the plan', async () => {
      // The coordinator merges both agents' findings before validation. Dropping
      // the logistics half is invisible to every other test.
      jest.spyOn(logisticsAgent, 'runLogisticsAgent').mockResolvedValue({
        output: {
          customerChecklist: [],
          providerChecklist: [],
          findings: [
            {
              category: 'access',
              severity: 'attention',
              visibility: 'shared',
              statement: 'No backup access method is recorded',
              evidence: [{ source: 'booking', recordId: booking.id, field: 'description' }],
            },
          ],
        },
        inputTokens: 0,
        outputTokens: 0,
      });

      const { plan } = await runBookingReadiness(booking, customer.id, 'customer');

      expect(plan.findings.map((f) => f.statement)).toContain(
        'No backup access method is recorded'
      );
    });
  });

  it('stores a plan whose semantic pass did not run as failed_partial, not reusable', async () => {
    // That pass is the only thing standing between participant-derived text and
    // platform-voiced advice. When it fails the deterministic layer has still
    // done its work, so the plan is worth showing with the "unreviewed" marker
    // the UI already renders — but it must not become permanent. Stored as
    // `completed` it would match MN5's reuse, and every later request for an
    // unchanged booking would be answered with the same unreviewed advice
    // instead of the review being retried.
    jest.spyOn(logisticsAgent, 'runLogisticsAgent').mockResolvedValue({
      output: { customerChecklist: [], providerChecklist: [], findings: [] },
      inputTokens: 0,
      outputTokens: 0,
    });
    jest.spyOn(verification, 'semanticReview').mockResolvedValue({
      kept: [],
      keptChecklist: [],
      dropReasons: [],
      ran: false,
    });

    const { plan } = await runBookingReadiness(booking, customer.id, 'customer');
    const run = await storedRun();

    expect(plan.verification.semanticReviewRan).toBe(false);
    expect(run.output).not.toBeNull();
    expect(run.status).toBe(WorkflowRunStatus.FAILED_PARTIAL);

    await expect(
      workflowRepository.findReusable(
        READINESS_WORKFLOW_TYPE,
        READINESS_SUBJECT_TYPE,
        booking.id,
        run.sourceFingerprint ?? '',
        READINESS_SCHEMA_VERSION
      )
    ).resolves.toBeNull();
  });

  describe('drafting a message for a finding', () => {
    beforeEach(async () => {
      // These go through the controller, which gates on the feature flag. Without
      // it every case 404s — including the two that *expect* 404, which would
      // then pass without exercising authorization at all.
      const settings = AppDataSource.getRepository(AppSettings);
      await settings.save(settings.create({ key: 'booking_readiness_enabled', value: 'true' }));
    });

    const call = async (runId: string, findingId: string, asUser: User) => {
      const req = {
        params: { runId, findingId },
        user: { userId: asUser.id },
        headers: {},
      } as unknown as AuthenticatedRequest;

      const json = jest.fn();
      let status = 200;
      const res = {
        json,
        setHeader: jest.fn(),
        status: jest.fn((code: number) => {
          status = code;
          return { json };
        }),
      } as never;

      await readinessController.draftMessageForFinding(req, res);
      return { status, body: json.mock.calls[0]?.[0] };
    };

    const storeRunWith = async (findings: ReadinessFinding[]) => {
      jest.spyOn(logisticsAgent, 'runLogisticsAgent').mockResolvedValue({
        output: { customerChecklist: [], providerChecklist: [], findings: [] },
        inputTokens: 0,
        outputTokens: 0,
      });
      jest.spyOn(riskAgent, 'runRiskAgent').mockResolvedValue({
        output: { findings: [] },
        inputTokens: 0,
        outputTokens: 0,
      });
      jest.spyOn(verification, 'semanticReview').mockImplementation(async (f, c) => ({
        kept: f,
        keptChecklist: c,
        dropReasons: [],
        ran: true,
      }));
      jest.spyOn(scopeAgent, 'runScopeAgent').mockResolvedValue({
        output: {
          agreedScope: [],
          exclusions: [],
          findings: findings.map((f) => ({
            category: f.category,
            severity: f.severity,
            visibility: f.visibility,
            statement: f.statement,
            evidence: [{ source: 'booking' as const, recordId: booking.id, field: 'description' }],
          })),
        },
        inputTokens: 0,
        outputTokens: 0,
      });

      await runBookingReadiness(booking, customer.id, 'customer');
      return storedRun();
    };

    const sharedFinding = {
      id: 'ignored',
      category: 'access' as const,
      severity: 'attention' as const,
      visibility: 'shared' as const,
      statement: 'No backup access method is recorded',
      evidence: [],
    };

    it('returns a draft without creating a conversation or sending anything', async () => {
      const run = await storeRunWith([sharedFinding]);
      const stored = run.output as { findings: Array<{ id: string }> };
      jest.spyOn(aiGateway, 'generate').mockResolvedValue({
        model: 'test',
        value: { text: '{"body":"Alguém poderá atender o interfone?"}', finishReason: 'stop' },
      } as never);

      const conversationsBefore = await AppDataSource.query(
        'SELECT count(*)::int c FROM conversations'
      );
      const messagesBefore = await AppDataSource.query('SELECT count(*)::int c FROM messages');

      const { status, body } = await call(run.id, stored.findings[0].id, customer);

      expect(status).toBe(200);
      expect(body.data.body).toEqual(expect.any(String));
      expect(body.data.recipientRole).toBe('provider');

      // The exit criterion for this phase, asserted rather than assumed: the
      // endpoint returns text and writes nothing. Sending stays the user's act,
      // through the messaging API, under their own authority.
      expect(await AppDataSource.query('SELECT count(*)::int c FROM conversations')).toEqual(
        conversationsBefore
      );
      expect(await AppDataSource.query('SELECT count(*)::int c FROM messages')).toEqual(
        messagesBefore
      );
    });

    it('refuses a finding the reader is not allowed to see', async () => {
      // Drafting must not become a way to read back a finding the role filter
      // hid: the customer asks for the provider-only one by id.
      const run = await storeRunWith([{ ...sharedFinding, visibility: 'provider_only' as const }]);
      const stored = run.output as { findings: Array<{ id: string; visibility: string }> };
      const hidden = stored.findings.find((f) => f.visibility === 'provider_only');
      expect(hidden).toBeDefined();

      const { status } = await call(run.id, hidden!.id, customer);

      expect(status).toBe(404);
    });

    it('refuses a booking that is no longer eligible, before any model call', async () => {
      // Messaging is closed once a booking completes, so a draft would bill a
      // model call for text the user cannot send.
      const run = await storeRunWith([sharedFinding]);
      const stored = run.output as { findings: Array<{ id: string }> };
      await AppDataSource.getRepository(Booking).update(booking.id, {
        status: BookingStatus.COMPLETED,
      });
      const generate = jest.spyOn(aiGateway, 'generate');
      const claim = jest.spyOn(draftBudget, 'claim');

      const { status } = await call(run.id, stored.findings[0].id, customer);

      expect(status).toBe(409);
      expect(generate).not.toHaveBeenCalled();
      expect(claim).not.toHaveBeenCalled();
    });

    it('does not charge the draft budget for a request it refuses', async () => {
      // Charged on the route, a refusal still counted — so one account could
      // drain the platform allowance with requests that never cost anything.
      const run = await storeRunWith([sharedFinding]);
      const claim = jest.spyOn(draftBudget, 'claim');

      const { status } = await call(run.id, randomUUID(), customer);

      expect(status).toBe(404);
      expect(claim).not.toHaveBeenCalled();
    });

    it('refuses to draft from a plan the booking has changed since', async () => {
      // The finding describes the booking as it was; paired with today's records
      // it makes a misleading draft, and a paid one.
      const run = await storeRunWith([sharedFinding]);
      const stored = run.output as { findings: Array<{ id: string }> };
      await AppDataSource.getRepository(Booking).update(booking.id, {
        scheduledDate: new Date(Date.now() + 9 * 86_400_000),
      });
      const generate = jest.spyOn(aiGateway, 'generate');
      const claim = jest.spyOn(draftBudget, 'claim');

      const { status } = await call(run.id, stored.findings[0].id, customer);

      expect(status).toBe(409);
      expect(generate).not.toHaveBeenCalled();
      expect(claim).not.toHaveBeenCalled();
    });

    it('still drafts after a new message, because the agreed terms have not moved', async () => {
      // Sending any message — including a draft this endpoint wrote — changes the
      // full fingerprint. Refusing on that hid every other draft until a paid
      // re-run, so the second question a user wanted to ask cost them a run.
      const run = await storeRunWith([sharedFinding]);
      const stored = run.output as { findings: Array<{ id: string }> };
      const conversation = await AppDataSource.getRepository(Conversation).save(
        AppDataSource.getRepository(Conversation).create({
          type: ConversationType.DIRECT,
          participants: [customer, providerUser],
          isActive: true,
          metadata: { bookingId: booking.id },
        })
      );
      await AppDataSource.getRepository(Message).save(
        AppDataSource.getRepository(Message).create({
          conversationId: conversation.id,
          senderId: customer.id,
          message: 'Alguém poderá atender o interfone?',
        })
      );
      // The premise: the message really did change what the plan was built from.
      expect(
        snapshotService.snapshotFingerprint(await snapshotService.buildSnapshot(booking))
      ).not.toBe(run.sourceFingerprint);
      const generate = jest.spyOn(aiGateway, 'generate').mockResolvedValue({
        model: 'test',
        value: { text: '{"body":"E o portão, como abre?"}', finishReason: 'stop' },
      } as never);

      const { status, body } = await call(run.id, stored.findings[0].id, customer);

      expect(status).toBe(200);
      expect(body.data.body).toEqual(expect.any(String));
      // And the drafter is told the thread may already hold the answer.
      expect(generate.mock.calls[0][1].userMessage).toContain('Alguém poderá atender o interfone?');
      expect(generate.mock.calls[0][1].userMessage).toMatch(/written before the latest messages/);
    });

    it('still refuses when the booking changed as well as the conversation', async () => {
      const run = await storeRunWith([sharedFinding]);
      const stored = run.output as { findings: Array<{ id: string }> };
      const conversation = await AppDataSource.getRepository(Conversation).save(
        AppDataSource.getRepository(Conversation).create({
          type: ConversationType.DIRECT,
          participants: [customer, providerUser],
          isActive: true,
          metadata: { bookingId: booking.id },
        })
      );
      await AppDataSource.getRepository(Message).save(
        AppDataSource.getRepository(Message).create({
          conversationId: conversation.id,
          senderId: customer.id,
          message: 'Mudei o horário, tudo bem?',
        })
      );
      await AppDataSource.getRepository(Booking).update(booking.id, { estimatedDuration: 300 });
      const generate = jest.spyOn(aiGateway, 'generate');

      const { status } = await call(run.id, stored.findings[0].id, customer);

      expect(status).toBe(409);
      expect(generate).not.toHaveBeenCalled();
    });

    it('refuses to draft from a plan whose freshness cannot be checked', async () => {
      const run = await storeRunWith([sharedFinding]);
      const stored = run.output as { findings: Array<{ id: string }> };
      await AppDataSource.getRepository(AgentWorkflowRun).update(run.id, {
        sourceFingerprint: null,
      });
      const generate = jest.spyOn(aiGateway, 'generate');

      const { status } = await call(run.id, stored.findings[0].id, customer);

      expect(status).toBe(409);
      expect(generate).not.toHaveBeenCalled();
    });

    it('does not charge the budget when the snapshot cannot be built', async () => {
      // A database failure there is no model call; it must not cost a draft.
      const run = await storeRunWith([sharedFinding]);
      const stored = run.output as { findings: Array<{ id: string }> };
      jest.spyOn(snapshotService, 'buildSnapshot').mockRejectedValue(new Error('db down'));
      const claim = jest.spyOn(draftBudget, 'claim');

      const { status } = await call(run.id, stored.findings[0].id, customer);

      expect(status).toBe(500);
      expect(claim).not.toHaveBeenCalled();
    });

    it('answers 429 without a model call once the budget refuses', async () => {
      const run = await storeRunWith([sharedFinding]);
      const stored = run.output as { findings: Array<{ id: string }> };
      jest.spyOn(draftBudget, 'claim').mockReturnValue({ scope: 'user', retryAfterSeconds: 60 });
      const generate = jest.spyOn(aiGateway, 'generate');

      const { status, body } = await call(run.id, stored.findings[0].id, customer);

      expect(status).toBe(429);
      expect(body.message).toEqual(expect.any(String));
      expect(generate).not.toHaveBeenCalled();
    });

    it('refuses an outsider holding a valid run id', async () => {
      const run = await storeRunWith([sharedFinding]);
      const stored = run.output as { findings: Array<{ id: string }> };
      const outsider = await AppDataSource.getRepository(User).save(
        AppDataSource.getRepository(User).create({
          email: `outsider-${Date.now()}@test.local`,
          password: 'hashed',
          firstName: 'Out',
          lastName: 'Sider',
          userType: UserType.CUSTOMER,
          isVerified: true,
          isActive: true,
        })
      );

      const { status } = await call(run.id, stored.findings[0].id, outsider);

      // A run id is not a capability — authorization is against the booking.
      expect(status).toBe(404);
    });
  });
});
