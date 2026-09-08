import { AppDataSource } from '@/config/database';
import { Booking, BookingStatus, PaymentStatus } from '@/models/Booking';
import { Provider } from '@/models/Provider';
import { User, UserType } from '@/models/User';
import { AgentWorkflowRun, WorkflowRunStatus } from '@/models/AgentWorkflowRun';
import { workflowRepository } from '@/agents/workflows/shared/WorkflowRepository';
import { runBookingReadiness } from '@/agents/workflows/booking-readiness/coordinator';
import * as scopeAgent from '@/agents/workflows/booking-readiness/agents/scope.agent';
import * as logisticsAgent from '@/agents/workflows/booking-readiness/agents/logistics.agent';
import * as verification from '@/agents/workflows/booking-readiness/verification';
import {
  READINESS_SCHEMA_VERSION,
  READINESS_SUBJECT_TYPE,
  READINESS_WORKFLOW_TYPE,
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
    const providerUser = await users.save(
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
});
