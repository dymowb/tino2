import { AppDataSource } from '@/config/database';
import { AppSettings } from '@/models/AppSettings';
import { Booking, BookingStatus, PaymentStatus } from '@/models/Booking';
import { Provider } from '@/models/Provider';
import { User, UserType } from '@/models/User';
import { AgentWorkflowRun, WorkflowRunStatus } from '@/models/AgentWorkflowRun';
import { workflowRepository } from '@/agents/workflows/shared/WorkflowRepository';
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
 * A stored readiness plan is only safe to act on while it still describes the
 * booking. The controller used to initialise `stale = false` and keep it that way
 * when the booking could not be reloaded or its snapshot could not be rebuilt, so
 * a dependency failure presented an outdated plan as current. Freshness is now
 * three-state and failure reports `unknown`.
 */
describe('readiness freshness', () => {
  let customer: User;
  let providerUser: User;
  let provider: Provider;
  let booking: Booking;

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

  /** Stores a completed run whose fingerprint matches the booking as it is now. */
  const storeCurrentRun = async (): Promise<{ run: AgentWorkflowRun; plan: ReadinessPlan }> => {
    const fingerprint = snapshotService.snapshotFingerprint(
      await snapshotService.buildSnapshot(booking)
    );
    const run = await workflowRepository.createRunning({
      workflowType: READINESS_WORKFLOW_TYPE,
      subjectType: READINESS_SUBJECT_TYPE,
      subjectId: booking.id,
      initiatedBy: customer.id,
      schemaVersion: READINESS_SCHEMA_VERSION,
    });
    const stored = plan(fingerprint);
    await workflowRepository.complete(run.id, {
      status: WorkflowRunStatus.COMPLETED,
      sourceFingerprint: fingerprint,
      output: stored,
      stageOutcomes: [],
    });
    return { run, plan: stored };
  };

  const getLatest = async (): Promise<{
    freshness: string;
    stale: boolean;
    plan: ReadinessPlan | null;
  }> => {
    const req = {
      params: { bookingId: booking.id },
      user: { userId: customer.id },
      headers: {},
    } as unknown as AuthenticatedRequest;

    const json = jest.fn();
    const res = { json, status: jest.fn().mockReturnValue({ json }) } as never;

    await readinessController.getLatest(req, res);
    expect(json).toHaveBeenCalledTimes(1);
    return json.mock.calls[0][0].data;
  };

  const createRun = async (): Promise<{
    status: number;
    data: { freshness: string; stale: boolean; plan: ReadinessPlan | null };
  }> => {
    const req = {
      params: { bookingId: booking.id },
      user: { userId: customer.id },
      headers: {},
    } as unknown as AuthenticatedRequest;

    const json = jest.fn();
    let status = 200;
    const res = {
      json,
      status: jest.fn((code: number) => {
        status = code;
        return { json };
      }),
    } as never;

    await readinessController.createRun(req, res);
    expect(json).toHaveBeenCalledTimes(1);
    return { status, data: json.mock.calls[0][0].data };
  };

  /**
   * Stands in for the real workflow: it stores a completed run fingerprinted from
   * the booking as it was when the run began, which is what the coordinator does
   * before spending ~25s in the agents.
   */
  const stubWorkflow = (options: { changeBookingDuringRun: boolean }): void => {
    jest.spyOn(coordinator, 'runBookingReadiness').mockImplementation(async () => {
      const { run, plan: stored } = await storeCurrentRun();

      if (options.changeBookingDuringRun) {
        await AppDataSource.getRepository(Booking).update(booking.id, {
          scheduledDate: new Date(Date.now() + 9 * 86_400_000),
        });
      }

      return { runId: run.id, plan: stored, status: WorkflowRunStatus.COMPLETED };
    });
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
    customer = await makeUser(`freshness-customer-${suffix}@test.local`, UserType.CUSTOMER);
    providerUser = await makeUser(`freshness-provider-${suffix}@test.local`, UserType.PROVIDER);

    provider = await AppDataSource.getRepository(Provider).save(
      AppDataSource.getRepository(Provider).create({
        userId: providerUser.id,
        businessName: 'Freshness Test Co',
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

  it('reports current while the booking still matches the fingerprint', async () => {
    await storeCurrentRun();

    const data = await getLatest();
    expect(data.freshness).toBe('current');
    expect(data.stale).toBe(false);
    expect(data.plan).not.toBeNull();
  });

  it('reports stale once the booking changes', async () => {
    await storeCurrentRun();
    await AppDataSource.getRepository(Booking).update(booking.id, {
      scheduledDate: new Date(Date.now() + 5 * 86_400_000),
    });

    const data = await getLatest();
    expect(data.freshness).toBe('stale');
    expect(data.stale).toBe(true);
  });

  it('reports unknown when the snapshot cannot be rebuilt', async () => {
    await storeCurrentRun();
    jest
      .spyOn(snapshotService, 'buildSnapshot')
      .mockRejectedValue(new Error('messages query failed'));

    const data = await getLatest();
    // The failure says nothing about whether the booking changed, so it must not
    // be answered with `current` — that is the fail-open this test exists for.
    expect(data.freshness).toBe('unknown');
    expect(data.stale).toBe(true);
  });

  it('does not call a freshly generated plan current without checking', async () => {
    // The fingerprint is taken before the agents run. A booking edited while the
    // plan was being built leaves it already out of date on arrival, and saying
    // "just generated, so current" would report a fingerprint nobody compared.
    stubWorkflow({ changeBookingDuringRun: true });

    const { status, data } = await createRun();
    expect(status).toBe(201);
    expect(data.freshness).toBe('stale');
    expect(data.stale).toBe(true);
  });

  it('reports current from the create endpoint when nothing changed during the run', async () => {
    stubWorkflow({ changeBookingDuringRun: false });

    const { status, data } = await createRun();
    expect(status).toBe(201);
    expect(data.freshness).toBe('current');
    expect(data.stale).toBe(false);
  });

  it('does not fail a completed run when it cannot be read back', async () => {
    stubWorkflow({ changeBookingDuringRun: false });
    // Fails only the read-back; the run itself was already stored by the stub.
    jest
      .spyOn(workflowRepository, 'findById')
      .mockRejectedValue(new Error('db read failed after the run completed'));

    // The expensive part already succeeded and is persisted. Failing the request
    // here would invite a retry that pays for a second agent run.
    const { status, data } = await createRun();
    expect(status).toBe(201);
    expect(data.freshness).toBe('unknown');
    expect(data.stale).toBe(true);
    expect(data.plan).not.toBeNull();
  });

  it('reports unknown when the booking cannot be reloaded', async () => {
    await storeCurrentRun();

    const repo = AppDataSource.getRepository(Booking);
    const realFindOne = repo.findOne.bind(repo);
    let calls = 0;
    jest.spyOn(repo, 'findOne').mockImplementation((...args) => {
      calls += 1;
      // The first read is the authorization check, which must still succeed; the
      // freshness reload right after it is the one that fails.
      return calls === 1 ? realFindOne(...args) : Promise.reject(new Error('db down'));
    });

    const data = await getLatest();
    expect(data.freshness).toBe('unknown');
    expect(data.stale).toBe(true);
  });
});
