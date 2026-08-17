import request from 'supertest';
import App from '@/app';
import { AppDataSource } from '@/config/database';
import { BasicUser } from '@/models/BasicUser';
import { Provider } from '@/models/Provider';
import { Booking, BookingStatus, PaymentStatus } from '@/models/Booking';
import { Payment, PaymentMethod, PaymentStatus as PaymentRowStatus } from '@/models/Payment';

/**
 * Escrow exists so the customer's money moves when the customer says the work is
 * done, and not before. Capture must therefore be reachable exactly one way: by
 * the paying customer, on a booking sitting at `pending_completion`.
 *
 * A second capture route used to exist at `POST /payments/:id/confirm`. It
 * checked only that the payment was not already succeeded — not who was asking
 * and not what state the booking was in — so the assigned provider could take
 * the money before the customer confirmed anything, and the write-back to
 * `confirmed` could drag a finished booking backwards. It had no caller in the
 * product. These pin both halves: the way in that must work, and the ways in
 * that must not.
 */
describe('escrow capture authorization', () => {
  const server = new App().app;
  const password = 'TestPassword123!';

  async function account(email: string, userType: 'customer' | 'provider') {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password, firstName: 'Escrow', lastName: userType, userType })
      .expect(201);
    const user = await AppDataSource.getRepository(BasicUser).findOneByOrFail({ email });
    await request(server)
      .get('/api/v1/auth/verify-email')
      .query({ token: user.emailVerificationToken })
      .expect(200);
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return { user, token: login.body.data.accessToken as string };
  }

  async function scenario(email: string, status: BookingStatus) {
    const customer = await account(`${email}-customer@example.com`, 'customer');
    const providerAccount = await account(`${email}-provider@example.com`, 'provider');
    const providerRepo = AppDataSource.getRepository(Provider);
    const provider = await providerRepo.save(
      providerRepo.create({
        userId: providerAccount.user.id,
        businessName: 'Escrow Services',
        description: 'Integration test provider',
        services: ['plumbing'],
        location: {
          latitude: -27.59,
          longitude: -48.55,
          address: 'Test street',
          city: 'Florianópolis',
          state: 'SC',
          zipCode: '88000-000',
          country: 'BR',
        },
        serviceRadius: 25,
        availableHours: {},
        pricing: { baseRate: 100, currency: 'BRL', rateType: 'quote' },
      } as Partial<Provider>)
    );

    const bookingRepo = AppDataSource.getRepository(Booking);
    const booking = await bookingRepo.save(
      bookingRepo.create({
        customerId: customer.user.id,
        providerId: provider.id,
        serviceType: 'plumbing',
        description: 'Escrow capture scenario',
        location: {
          latitude: -27.59,
          longitude: -48.55,
          address: 'Test street',
          city: 'Florianópolis',
          state: 'SC',
          zipCode: '88000-000',
        },
        scheduledDate: new Date(Date.now() + 86_400_000),
        estimatedDuration: 120,
        totalAmount: 275,
        status,
        paymentStatus: PaymentStatus.PENDING,
        stripePaymentIntentId: 'pi_test_escrow',
      } as Partial<Booking>)
    );

    // A real payment row for that booking, so the removed route can be probed the
    // way an attacker would rather than with an id it would reject anyway.
    const paymentRepo = AppDataSource.getRepository(Payment);
    const payment = await paymentRepo.save(
      paymentRepo.create({
        bookingId: booking.id,
        customerId: customer.user.id,
        providerId: provider.id,
        amount: 275,
        platformFee: 27.5,
        processingFee: 0,
        providerAmount: 247.5,
        currency: 'BRL',
        paymentMethod: PaymentMethod.CREDIT_CARD,
        status: PaymentRowStatus.PENDING,
        stripePaymentIntentId: 'pi_test_escrow',
      } as Partial<Payment>)
    );

    return { customer, providerAccount, booking, payment };
  }

  function capture(bookingId: string, token: string) {
    return request(server)
      .post(`/api/v1/bookings/${bookingId}/confirm-completion`)
      .set('Authorization', `Bearer ${token}`);
  }

  async function statusOf(bookingId: string) {
    return (await AppDataSource.getRepository(Booking).findOneByOrFail({ id: bookingId })).status;
  }

  it('lets the paying customer capture once the work is awaiting confirmation', async () => {
    const { customer, booking } = await scenario('escrow-happy', BookingStatus.PENDING_COMPLETION);

    await capture(booking.id, customer.token).expect(200);

    const after = await AppDataSource.getRepository(Booking).findOneByOrFail({ id: booking.id });
    expect(after.status).toBe(BookingStatus.COMPLETED);
    expect(after.paymentStatus).toBe(PaymentStatus.PAID);
  });

  it('does not let the provider capture their own booking', async () => {
    const { providerAccount, booking } = await scenario(
      'escrow-provider',
      BookingStatus.PENDING_COMPLETION
    );

    // The provider is the one party with an incentive to capture early, and the
    // one the removed route allowed. 404 rather than 403: the booking is not
    // theirs to act on through this route, and saying so would confirm it exists.
    await capture(booking.id, providerAccount.token).expect(404);

    expect(await statusOf(booking.id)).toBe(BookingStatus.PENDING_COMPLETION);
  });

  it('does not capture before the work is awaiting confirmation', async () => {
    for (const status of [
      BookingStatus.CONFIRMED,
      BookingStatus.IN_PROGRESS,
      BookingStatus.CANCELLED,
    ]) {
      const { customer, booking } = await scenario(`escrow-early-${status}`, status);

      await capture(booking.id, customer.token).expect(400);

      expect(await statusOf(booking.id)).toBe(status);
    }
  });

  it('does not capture twice', async () => {
    const { customer, booking } = await scenario('escrow-twice', BookingStatus.PENDING_COMPLETION);

    await capture(booking.id, customer.token).expect(200);
    // The second attempt finds the booking already completed, so there is no
    // state left that permits a capture.
    await capture(booking.id, customer.token).expect(400);

    expect(await statusOf(booking.id)).toBe(BookingStatus.COMPLETED);
  });

  it('cannot drag a finished booking backwards', async () => {
    const { customer, booking } = await scenario('escrow-regress', BookingStatus.COMPLETED);

    await capture(booking.id, customer.token).expect(400);

    // The removed route wrote `confirmed` unconditionally after capturing, which
    // turned a finished job back into one awaiting work.
    expect(await statusOf(booking.id)).toBe(BookingStatus.COMPLETED);
  });

  it('no longer exposes a second capture route on payments', async () => {
    const { providerAccount, booking, payment } = await scenario(
      'escrow-legacy',
      BookingStatus.PENDING_COMPLETION
    );

    // Exactly the exploit: the assigned provider posts the *payment* id to the
    // old route while the customer has confirmed nothing. It used to answer 200,
    // capture the funds, and write the booking back to `confirmed`. The id has to
    // be a real payment, or a 404 would only mean "no such payment" and the test
    // would pass with the route still in place — which is how the first version
    // of this test fooled itself.
    const response = await request(server)
      .post(`/api/v1/payments/${payment.id}/confirm`)
      .set('Authorization', `Bearer ${providerAccount.token}`);

    expect(response.status).toBe(404);

    const after = await AppDataSource.getRepository(Booking).findOneByOrFail({ id: booking.id });
    expect(after.status).toBe(BookingStatus.PENDING_COMPLETION);
    expect(after.paymentStatus).toBe(PaymentStatus.PENDING);

    const paymentAfter = await AppDataSource.getRepository(Payment).findOneByOrFail({
      id: payment.id,
    });
    expect(paymentAfter.status).toBe(PaymentRowStatus.PENDING);
  });
});
