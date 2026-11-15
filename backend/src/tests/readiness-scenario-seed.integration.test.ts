import { AppDataSource } from '@/config/database';
import { Booking, BookingStatus, PaymentStatus } from '@/models/Booking';
import { Conversation, ConversationType } from '@/models/Conversation';
import { Provider } from '@/models/Provider';
import { User, UserType } from '@/models/User';
import { QuoteRequest, QuoteRequestStatus } from '@/models/QuoteRequest';
import {
  Parties,
  createScenario,
  removeScenario,
  resolveParties,
} from '@/scripts/seedReadinessScenario';

/**
 * The manual-test seed deletes what it finds tagged `scenario: readiness-demo`.
 * Conversation metadata is client-supplied and this database is shared with
 * production, so the tag alone must never be enough to delete anything: any
 * user can put it on their own booking conversation.
 */
describe('removing the readiness test scenario', () => {
  let parties: Parties;
  let outsider: User;

  const user = (email: string, userType: UserType) =>
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

  const bookingBetween = (customerId: string, specialInstructions: string) =>
    AppDataSource.getRepository(Booking).save(
      AppDataSource.getRepository(Booking).create({
        customerId,
        providerId: parties.provider.id,
        serviceType: 'Limpeza Residencial',
        description: 'a real booking',
        location: {
          latitude: -27.6,
          longitude: -48.5,
          address: 'a',
          city: 'Floripa',
          state: 'SC',
          zipCode: '1',
        },
        scheduledDate: new Date(Date.now() + 3 * 86_400_000),
        estimatedDuration: 120,
        totalAmount: 220,
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PENDING,
        specialInstructions,
      })
    );

  const taggedConversation = (participants: User[], bookingId: string) =>
    AppDataSource.getRepository(Conversation).save(
      AppDataSource.getRepository(Conversation).create({
        type: ConversationType.DIRECT,
        title: 'tagged by a user',
        participants,
        isActive: true,
        metadata: { bookingId, scenario: 'readiness-demo' },
      })
    );

  const remove = () => AppDataSource.transaction((m) => removeScenario(m, parties));

  beforeEach(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    await user('customer@demo.com', UserType.CUSTOMER);
    const providerUser = await user('provider@demo.com', UserType.PROVIDER);
    await AppDataSource.getRepository(Provider).save(
      AppDataSource.getRepository(Provider).create({
        userId: providerUser.id,
        businessName: 'Demo',
        description: 'demo',
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
    outsider = await user(`someone-${Date.now()}@test.local`, UserType.CUSTOMER);
    parties = await AppDataSource.transaction((m) => resolveParties(m));
  });

  it('removes a scenario it created, and everything hanging off it', async () => {
    const bookingId = await AppDataSource.transaction((m) => createScenario(m, parties));

    expect(await remove()).toBe(1);
    expect(await AppDataSource.getRepository(Booking).findOneBy({ id: bookingId })).toBeNull();
    const left = await AppDataSource.query(
      `SELECT count(*)::int c FROM conversations WHERE metadata ->> 'scenario' = 'readiness-demo'`
    );
    expect(left[0].c).toBe(0);
  });

  it("leaves another customer's booking alone, though its conversation carries the tag", async () => {
    const booking = await bookingBetween(outsider.id, 'Interfone 302. Código do portão 4471.');
    const conversation = await taggedConversation([outsider, parties.providerUser], booking.id);

    expect(await remove()).toBe(0);
    expect(await AppDataSource.getRepository(Booking).findOneBy({ id: booking.id })).not.toBeNull();
    expect(
      await AppDataSource.getRepository(Conversation).findOneBy({ id: conversation.id })
    ).not.toBeNull();
  });

  it('leaves a demo booking alone unless it carries the seeded fingerprint', async () => {
    // The demo accounts also hold ordinary bookings; one tagged by hand is not ours.
    const booking = await bookingBetween(parties.customer.id, 'Ring twice');
    await taggedConversation([parties.customer, parties.providerUser], booking.id);

    expect(await remove()).toBe(0);
    expect(await AppDataSource.getRepository(Booking).findOneBy({ id: booking.id })).not.toBeNull();
  });

  it("follows neither of the booking's pointers to somebody else's quote or request", async () => {
    // A customer can rewrite `quoteId`/`requestId` on their booking. Pointed at
    // another customer's request, a removal that trusted the pointer deleted it.
    const bookingId = await AppDataSource.transaction((m) => createScenario(m, parties));
    const theirs = await AppDataSource.getRepository(QuoteRequest).save(
      AppDataSource.getRepository(QuoteRequest).create({
        customerId: outsider.id,
        serviceType: 'Encanamento',
        description: 'a real request',
        location: {
          latitude: -27.6,
          longitude: -48.5,
          address: 'a',
          city: 'Floripa',
          state: 'SC',
          zipCode: '1',
        },
        budget: { min: 100, max: 200, currency: 'BRL' },
        status: QuoteRequestStatus.OPEN,
      })
    );
    await AppDataSource.getRepository(Booking).update(bookingId, { requestId: theirs.id });

    expect(await remove()).toBe(0);
    expect(
      await AppDataSource.getRepository(QuoteRequest).findOneBy({ id: theirs.id })
    ).not.toBeNull();
  });
});
