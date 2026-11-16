import { AppDataSource } from '@/config/database';
import { Booking, BookingStatus, PaymentStatus } from '@/models/Booking';
import { Conversation, ConversationType } from '@/models/Conversation';
import { Message } from '@/models/Message';
import { Provider } from '@/models/Provider';
import { User, UserType } from '@/models/User';
import { Quote, QuoteStatus } from '@/models/Quote';
import { QuoteRequest, QuoteRequestStatus } from '@/models/QuoteRequest';
import { buildSnapshot } from '@/agents/workflows/booking-readiness/snapshot.service';

/**
 * The snapshot must only read a booking conversation that the messaging service
 * would itself consider valid: active, and with exactly the two booking parties.
 * `metadata.bookingId` is not proof — MessageService deactivates squatted or
 * mis-scoped booking conversations, and reading by metadata alone resurrects them.
 */
describe('readiness message scoping', () => {
  let customer: User;
  let outsider: User;
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

  const addConversation = async (
    participants: User[],
    isActive: boolean
  ): Promise<Conversation> => {
    const conversation = await AppDataSource.getRepository(Conversation).save(
      AppDataSource.getRepository(Conversation).create({
        type: ConversationType.DIRECT,
        participants,
        isActive,
        metadata: { bookingId: booking.id },
      })
    );
    await AppDataSource.getRepository(Message).save(
      AppDataSource.getRepository(Message).create({
        conversationId: conversation.id,
        senderId: participants[0].id,
        message: `msg-from-${conversation.id}`,
      })
    );
    return conversation;
  };

  // setup.ts truncates every table in a global beforeEach, so fixtures are
  // rebuilt per test rather than once in beforeAll.
  beforeEach(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const suffix = Date.now();
    customer = await makeUser(`readiness-customer-${suffix}@test.local`, UserType.CUSTOMER);
    outsider = await makeUser(`readiness-outsider-${suffix}@test.local`, UserType.CUSTOMER);
    providerUser = await makeUser(`readiness-provider-${suffix}@test.local`, UserType.PROVIDER);

    provider = await AppDataSource.getRepository(Provider).save(
      AppDataSource.getRepository(Provider).create({
        userId: providerUser.id,
        businessName: 'Scoping Test Co',
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

  it('reads the active conversation between exactly the booking parties', async () => {
    await addConversation([customer, providerUser], true);
    const snapshot = await buildSnapshot(booking);
    expect(snapshot.messages).toHaveLength(1);
  });

  it('reports when a message was really sent, whatever zone the server runs in', async () => {
    // `messages."createdAt"` is zoneless and written by the database's `now()`;
    // read back through the driver it is re-interpreted in the node process's
    // zone, so on a host that is not on UTC every message was hours off — and
    // the prompt now prints a weekday from it and the drawer shows it.
    await addConversation([customer, providerUser], true);
    const [{ now }] = await AppDataSource.query('SELECT now() AS now');

    const snapshot = await buildSnapshot(booking);

    const skewMs = Math.abs(
      new Date(snapshot.messages[0].sentAt).getTime() - new Date(now).getTime()
    );
    expect(skewMs).toBeLessThan(60_000);
  });

  it('ignores a deactivated conversation carrying the same bookingId', async () => {
    const poisoned = await addConversation([customer, providerUser], false);
    const snapshot = await buildSnapshot(booking);

    expect(snapshot.messages.map((m) => m.text)).not.toContain(`msg-from-${poisoned.id}`);
  });

  it('ignores a conversation whose participants are not the booking parties', async () => {
    // Exactly the squatting case MessageService guards against.
    const squatted = await addConversation([customer, outsider], true);
    const snapshot = await buildSnapshot(booking);

    expect(snapshot.messages.map((m) => m.text)).not.toContain(`msg-from-${squatted.id}`);
  });

  describe("the booking's quote and request", () => {
    const requestOf = (customerId: string) =>
      AppDataSource.getRepository(QuoteRequest).save(
        AppDataSource.getRepository(QuoteRequest).create({
          customerId,
          serviceType: 'Limpeza Residencial',
          description: `request of ${customerId}`,
          location: {
            latitude: -27.6,
            longitude: -48.5,
            address: 'a',
            city: 'Floripa',
            state: 'SC',
            zipCode: '1',
          },
          budget: { min: 100, max: 200, currency: 'BRL' },
          status: QuoteRequestStatus.CLOSED,
        })
      );
    const quoteFor = (request: QuoteRequest) =>
      AppDataSource.getRepository(Quote).save(
        AppDataSource.getRepository(Quote).create({
          requestId: request.id,
          providerId: provider.id,
          customerId: request.customerId,
          serviceType: 'Limpeza Residencial',
          description: `quote for ${request.customerId}`,
          estimatedPrice: 150,
          estimatedDuration: 120,
          validUntil: new Date(Date.now() + 86_400_000),
          status: QuoteStatus.ACCEPTED,
        })
      );
    const pointBookingAt = (quote: Quote, request: QuoteRequest) =>
      AppDataSource.getRepository(Booking).update(booking.id, {
        quoteId: quote.id,
        requestId: request.id,
      });

    it('reads its own accepted quote and request', async () => {
      // The control: without it, the case below passes against a snapshot that
      // never loads a quote at all.
      const request = await requestOf(customer.id);
      await pointBookingAt(await quoteFor(request), request);

      const snapshot = await buildSnapshot(
        await AppDataSource.getRepository(Booking).findOneByOrFail({ id: booking.id })
      );
      expect(snapshot.quote?.description).toBe(`quote for ${customer.id}`);
      expect(snapshot.request?.description).toBe(`request of ${customer.id}`);
    });

    it("never reads another customer's, though the booking points at them", async () => {
      // A customer can rewrite these pointers on their own booking; whatever
      // they reach is rendered into the prompt and can come back in findings
      // and drafts.
      const theirs = await requestOf(outsider.id);
      await pointBookingAt(await quoteFor(theirs), theirs);

      const snapshot = await buildSnapshot(
        await AppDataSource.getRepository(Booking).findOneByOrFail({ id: booking.id })
      );
      expect(snapshot.quote).toBeNull();
      expect(snapshot.request).toBeNull();
    });
  });
});
