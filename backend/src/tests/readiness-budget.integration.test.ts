import { AppDataSource } from '@/config/database';
import { AppSettings } from '@/models/AppSettings';
import { Booking, BookingStatus, PaymentStatus } from '@/models/Booking';
import { Provider } from '@/models/Provider';
import { User, UserType } from '@/models/User';
import { AgentWorkflowRun, WorkflowRunStatus } from '@/models/AgentWorkflowRun';
import {
  WorkflowBudgetExceededError,
  workflowRepository,
} from '@/agents/workflows/shared/WorkflowRepository';
import * as snapshotService from '@/agents/workflows/booking-readiness/snapshot.service';
import * as coordinator from '@/agents/workflows/booking-readiness/coordinator';
import {
  READINESS_SCHEMA_VERSION,
  READINESS_SUBJECT_TYPE,
  READINESS_WORKFLOW_TYPE,
  ReadinessPlan,
} from '@/agents/workflows/booking-readiness/types';
import readinessController from '@/controllers/ReadinessController';
import { AuthenticatedRequest } from '@/types';

/**
 * A readiness run is a multi-agent Opus call. Before this, the only ceiling on
 * it was the general 100-requests-per-15-minutes API limiter, which counts
 * request volume rather than cost — one authenticated account could spend
 * against it all day, and a completed plan could be regenerated indefinitely for
 * a booking that had not changed.
 */
describe('readiness cost budget', () => {
  let customer: User;
  let otherCustomer: User;
  let providerUser: User;
  let provider: Provider;
  let booking: Booking;

  const runsRepo = () => AppDataSource.getRepository(AgentWorkflowRun);

  /**
   * Backdates a run the way the column is actually written.
   *
   * `createdAt` is `timestamp without time zone` and the *database* writes it,
   * from the DDL's `DEFAULT now()`. A JavaScript `Date` sent as a parameter —
   * which is what `repository.update({ createdAt })` does — is rendered in the
   * node process' zone instead, seven hours from the database's on this machine.
   * A fixture written that way ages rows against a clock the production code
   * never uses, so this backdates in SQL against the same `now()::timestamp` the
   * column was written with.
   */
  const backdate = async (runId: string, ms: number): Promise<void> => {
    await AppDataSource.query(
      `UPDATE agent_workflow_runs
          SET "createdAt" = now()::timestamp - make_interval(secs => $2)
        WHERE id = $1`,
      [runId, ms / 1000]
    );
  };

  const makeUser = async (email: string, userType: UserType): Promise<User> =>
    AppDataSource.getRepository(User).save(
      AppDataSource.getRepository(User).create({
        email,
        password: 'hashed',
        firstName: 'Test',
        lastName: 'User',
        userType,
        isVerified: true,
        isActive: true,
      })
    );

  const plan = (fingerprint: string): ReadinessPlan => ({
    bookingId: booking.id,
    sourceFingerprint: fingerprint,
    readiness: 'ready',
    agreedScope: ['Deep clean of a 2-bedroom apartment'],
    exclusions: [],
    findings: [],
    verification: { droppedCount: 0, semanticReviewRan: true },
    generatedAt: new Date().toISOString(),
    unavailableSections: [],
  });

  const currentFingerprint = async (): Promise<string> =>
    snapshotService.snapshotFingerprint(await snapshotService.buildSnapshot(booking));

  /** A finished run, as the coordinator would leave it. */
  const storeRun = async (options: {
    fingerprint: string;
    status?: WorkflowRunStatus;
    schemaVersion?: number;
    initiatedBy?: string;
  }): Promise<AgentWorkflowRun> => {
    const run = await runsRepo().save(
      runsRepo().create({
        workflowType: READINESS_WORKFLOW_TYPE,
        subjectType: READINESS_SUBJECT_TYPE,
        subjectId: booking.id,
        initiatedBy: options.initiatedBy ?? customer.id,
        schemaVersion: options.schemaVersion ?? READINESS_SCHEMA_VERSION,
        status: options.status ?? WorkflowRunStatus.COMPLETED,
        sourceFingerprint: options.fingerprint,
        output: plan(options.fingerprint),
        stageOutcomes: [],
      })
    );
    return run;
  };

  /** Stands in for the ~25s agent run, storing a plan the way the real one does. */
  const stubWorkflow = (): jest.SpyInstance =>
    jest
      .spyOn(coordinator, 'runBookingReadiness')
      .mockImplementation(async (target, initiatedBy, _role, prebuilt) => {
        const fingerprint = snapshotService.snapshotFingerprint(
          prebuilt ?? (await snapshotService.buildSnapshot(target))
        );
        const claimed = await workflowRepository.createRunning({
          workflowType: READINESS_WORKFLOW_TYPE,
          subjectType: READINESS_SUBJECT_TYPE,
          subjectId: target.id,
          initiatedBy,
          schemaVersion: READINESS_SCHEMA_VERSION,
          budget: coordinator.READINESS_BUDGET,
        });
        const output = plan(fingerprint);
        await workflowRepository.complete(claimed.id, {
          status: WorkflowRunStatus.COMPLETED,
          sourceFingerprint: fingerprint,
          output,
          stageOutcomes: [],
        });
        return { runId: claimed.id, plan: output, status: WorkflowRunStatus.COMPLETED };
      });

  const createRun = async (
    asUser: User = customer
  ): Promise<{ status: number; body: Record<string, unknown> }> => {
    const req = {
      params: { bookingId: booking.id },
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

    await readinessController.createRun(req, res);
    expect(json).toHaveBeenCalledTimes(1);
    return { status, body: json.mock.calls[0][0] };
  };

  // setup.ts truncates every table in a global beforeEach, so fixtures are
  // rebuilt per test rather than once in beforeAll.
  beforeEach(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    await AppDataSource.getRepository(AppSettings).save(
      AppDataSource.getRepository(AppSettings).create({
        key: 'booking_readiness_enabled',
        value: 'true',
      })
    );

    const suffix = Date.now();
    customer = await makeUser(`budget-customer-${suffix}@test.local`, UserType.CUSTOMER);
    otherCustomer = await makeUser(`budget-other-${suffix}@test.local`, UserType.CUSTOMER);
    providerUser = await makeUser(`budget-provider-${suffix}@test.local`, UserType.PROVIDER);

    provider = await AppDataSource.getRepository(Provider).save(
      AppDataSource.getRepository(Provider).create({
        userId: providerUser.id,
        businessName: 'Budget Test Co',
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
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('reuse instead of re-running', () => {
    it('serves the existing plan for an unchanged booking without a new run', async () => {
      const existing = await storeRun({ fingerprint: await currentFingerprint() });
      const spy = stubWorkflow();

      const { status, body } = await createRun();

      expect(status).toBe(200);
      expect(spy).not.toHaveBeenCalled();
      expect((body.data as { runId: string }).runId).toBe(existing.id);
      expect((body.data as { reused: boolean }).reused).toBe(true);
      expect(await runsRepo().count()).toBe(1);
    });

    it('runs again once the booking has actually changed', async () => {
      await storeRun({ fingerprint: await currentFingerprint() });
      await AppDataSource.getRepository(Booking).update(booking.id, {
        scheduledDate: new Date(Date.now() + 5 * 86_400_000),
      });
      booking = await AppDataSource.getRepository(Booking).findOneByOrFail({ id: booking.id });
      const spy = stubWorkflow();

      const { status, body } = await createRun();

      expect(status).toBe(201);
      expect(spy).toHaveBeenCalledTimes(1);
      expect((body.data as { reused: boolean }).reused).toBe(false);
      expect(await runsRepo().count()).toBe(2);
    });

    it('does not reuse a run that never completed', async () => {
      // A degraded or failed run produced a partial plan. Serving it forever
      // would mean one bad run permanently blocks any retry for this booking.
      const fingerprint = await currentFingerprint();
      await storeRun({ fingerprint, status: WorkflowRunStatus.FAILED_PARTIAL });
      const spy = stubWorkflow();

      const { status } = await createRun();

      expect(status).toBe(201);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('does not reuse a run stored under an older output contract', async () => {
      const fingerprint = await currentFingerprint();
      await storeRun({ fingerprint, schemaVersion: READINESS_SCHEMA_VERSION - 1 });
      const spy = stubWorkflow();

      const { status } = await createRun();

      expect(status).toBe(201);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('reuses a run started by the other participant', async () => {
      // One plan serves both roles — it is stored unfiltered and filtered per
      // reader — so the provider must not pay to rebuild the customer's.
      const existing = await storeRun({
        fingerprint: await currentFingerprint(),
        initiatedBy: customer.id,
      });
      const spy = stubWorkflow();

      const { status, body } = await createRun(providerUser);

      expect(status).toBe(200);
      expect(spy).not.toHaveBeenCalled();
      expect((body.data as { runId: string }).runId).toBe(existing.id);
    });
  });

  describe('per-user ceiling', () => {
    const budget = {
      perUserMaxRuns: 3,
      perUserWindowMs: 24 * 60 * 60 * 1000,
      globalMaxRuns: 1000,
      globalWindowMs: 24 * 60 * 60 * 1000,
    };

    const claim = (subjectId: string, initiatedBy: string) =>
      workflowRepository.createRunning({
        workflowType: 'budget_test',
        subjectType: READINESS_SUBJECT_TYPE,
        subjectId,
        initiatedBy,
        schemaVersion: 1,
        budget,
      });

    /** Distinct subjects, so the per-subject in-flight index is never the thing
     * doing the rejecting. */
    const subject = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

    it('refuses the run that would exceed the ceiling', async () => {
      for (let i = 0; i < 3; i += 1) await claim(subject(i), customer.id);

      await expect(claim(subject(99), customer.id)).rejects.toBeInstanceOf(
        WorkflowBudgetExceededError
      );
      expect(await runsRepo().countBy({ initiatedBy: customer.id })).toBe(3);
    });

    it('counts failed runs, which cost the same as successful ones', async () => {
      for (let i = 0; i < 3; i += 1) {
        const run = await claim(subject(i), customer.id);
        await workflowRepository.fail(run.id, 'model call failed');
      }

      await expect(claim(subject(99), customer.id)).rejects.toBeInstanceOf(
        WorkflowBudgetExceededError
      );
    });

    it('is per account, not shared across accounts', async () => {
      for (let i = 0; i < 3; i += 1) await claim(subject(i), customer.id);

      await expect(claim(subject(99), otherCustomer.id)).resolves.toBeDefined();
    });

    it('still counts a run from inside the window', async () => {
      // 23 hours old, so it is inside a 24-hour window by an hour. This pins the
      // window's inner edge; the 25-hour case below is the one that discriminates
      // on the timestamp basis, because the node/database offset here widens the
      // window rather than narrowing it.
      const runs = [];
      for (let i = 0; i < 3; i += 1) runs.push(await claim(subject(i), customer.id));

      await backdate(runs[0].id, 23 * 60 * 60 * 1000);

      await expect(claim(subject(99), customer.id)).rejects.toBeInstanceOf(
        WorkflowBudgetExceededError
      );
    });

    it('releases a slot once a run ages out of the window', async () => {
      const runs = [];
      for (let i = 0; i < 3; i += 1) runs.push(await claim(subject(i), customer.id));

      await backdate(runs[0].id, 25 * 60 * 60 * 1000);

      await expect(claim(subject(99), customer.id)).resolves.toBeDefined();
    });

    it('reports how long until a slot frees up', async () => {
      for (let i = 0; i < 3; i += 1) await claim(subject(i), customer.id);

      const error = await claim(subject(99), customer.id).catch((e) => e);
      expect(error).toBeInstanceOf(WorkflowBudgetExceededError);
      expect(error.scope).toBe('user');
      // The oldest run was created moments ago, so nearly the whole window remains.
      expect(error.retryAfterSeconds).toBeGreaterThan(23 * 60 * 60);
      expect(error.retryAfterSeconds).toBeLessThanOrEqual(24 * 60 * 60);
    });

    it('does not let concurrent claims for different subjects overshoot', async () => {
      // The ceiling cannot be enforced by a unique index, and without
      // serialization every one of these would read the same "0 used" and pass.
      const results = await Promise.allSettled(
        [0, 1, 2, 3, 4, 5].map((n) => claim(subject(n), customer.id))
      );

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
      expect(
        results.filter(
          (r) => r.status === 'rejected' && r.reason instanceof WorkflowBudgetExceededError
        )
      ).toHaveLength(3);
      expect(await runsRepo().countBy({ initiatedBy: customer.id })).toBe(3);
    });
  });

  describe('platform ceiling', () => {
    it('refuses everyone once the platform window is spent', async () => {
      const budget = {
        perUserMaxRuns: 1000,
        perUserWindowMs: 24 * 60 * 60 * 1000,
        globalMaxRuns: 2,
        globalWindowMs: 24 * 60 * 60 * 1000,
      };
      const subject = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
      const claim = (n: number, initiatedBy: string) =>
        workflowRepository.createRunning({
          workflowType: 'budget_test_global',
          subjectType: READINESS_SUBJECT_TYPE,
          subjectId: subject(n),
          initiatedBy,
          schemaVersion: 1,
          budget,
        });

      await claim(0, customer.id);
      await claim(1, otherCustomer.id);

      const error = await claim(2, otherCustomer.id).catch((e) => e);
      expect(error).toBeInstanceOf(WorkflowBudgetExceededError);
      expect(error.scope).toBe('global');
    });

    it('does not count another workflow type against this one', async () => {
      const budget = {
        perUserMaxRuns: 1000,
        perUserWindowMs: 24 * 60 * 60 * 1000,
        globalMaxRuns: 1,
        globalWindowMs: 24 * 60 * 60 * 1000,
      };
      await workflowRepository.createRunning({
        workflowType: 'some_other_workflow',
        subjectType: READINESS_SUBJECT_TYPE,
        subjectId: '00000000-0000-4000-8000-00000000aaaa',
        initiatedBy: customer.id,
        schemaVersion: 1,
      });

      await expect(
        workflowRepository.createRunning({
          workflowType: 'budget_test_isolated',
          subjectType: READINESS_SUBJECT_TYPE,
          subjectId: '00000000-0000-4000-8000-00000000bbbb',
          initiatedBy: customer.id,
          schemaVersion: 1,
          budget,
        })
      ).resolves.toBeDefined();
    });
  });

  describe('the endpoint', () => {
    it('answers a spent budget with 429 and a Retry-After, not a 500', async () => {
      jest
        .spyOn(coordinator, 'runBookingReadiness')
        .mockRejectedValue(new WorkflowBudgetExceededError('user', 3600));

      const req = {
        params: { bookingId: booking.id },
        user: { userId: customer.id },
        headers: {},
      } as unknown as AuthenticatedRequest;
      const json = jest.fn();
      const setHeader = jest.fn();
      let status = 200;
      const res = {
        json,
        setHeader,
        status: jest.fn((code: number) => {
          status = code;
          return { json };
        }),
      } as never;

      await readinessController.createRun(req, res);

      expect(status).toBe(429);
      expect(setHeader).toHaveBeenCalledWith('Retry-After', '3600');
      expect(json.mock.calls[0][0]).toMatchObject({ success: false, retryAfterSeconds: 3600 });
      // Both fields carry the localized text: the drawer reads `message`, and
      // the client's response interceptor toasts `error`.
      const body = json.mock.calls[0][0];
      expect(body.message).toEqual(expect.any(String));
      expect(body.error).toBe(body.message);
    });
  });

  describe('failing closed', () => {
    it('does not reach the agents when the claim cannot be made', async () => {
      // "I could not check the budget" must not be answered with "go ahead and
      // spend" — the same fail-open shape as a plan reported current because its
      // freshness could not be evaluated. The claim is taken before any model
      // call precisely so that its failure stops the run.
      const before = await runsRepo().count();
      const spy = jest
        .spyOn(workflowRepository, 'createRunning')
        .mockRejectedValue(new Error('could not count agent workflow runs'));

      const { status, body } = await createRun();

      expect(status).toBe(500);
      expect(body.success).toBe(false);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(await runsRepo().count()).toBe(before);
    });

    it('writes nothing when a claim is refused', async () => {
      const subject = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
      const budget = {
        perUserMaxRuns: 1,
        perUserWindowMs: 24 * 60 * 60 * 1000,
        globalMaxRuns: 1000,
        globalWindowMs: 24 * 60 * 60 * 1000,
      };
      await workflowRepository.createRunning({
        workflowType: 'budget_test_rollback',
        subjectType: READINESS_SUBJECT_TYPE,
        subjectId: subject(1),
        initiatedBy: customer.id,
        schemaVersion: 1,
        budget,
      });

      await expect(
        workflowRepository.createRunning({
          workflowType: 'budget_test_rollback',
          subjectType: READINESS_SUBJECT_TYPE,
          subjectId: subject(2),
          initiatedBy: customer.id,
          schemaVersion: 1,
          budget,
        })
      ).rejects.toBeInstanceOf(WorkflowBudgetExceededError);

      expect(await runsRepo().countBy({ workflowType: 'budget_test_rollback' })).toBe(1);
    });
  });
});
