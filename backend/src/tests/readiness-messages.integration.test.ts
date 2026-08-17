import { AppDataSource } from '@/config/database';
import { Booking, BookingStatus, PaymentStatus } from '@/models/Booking';
import { Conversation, ConversationType } from '@/models/Conversation';
import { Message } from '@/models/Message';
import { Provider } from '@/models/Provider';
import { User, UserType } from '@/models/User';
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
});
