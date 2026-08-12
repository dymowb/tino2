import request from 'supertest';
import Stripe from 'stripe';
import App from '@/app';
import { AppDataSource } from '@/config/database';
import { BasicUser } from '@/models/BasicUser';
import { Provider } from '@/models/Provider';
import { Booking, BookingStatus } from '@/models/Booking';
import { User } from '@/models/User';
import { Payment, PaymentStatus } from '@/models/Payment';

/**
 * What actually reaches Stripe.
 *
 * Two defects motivated these: the escrow hold sent `currency: 'usd'` for prices
 * quoted in BRL, and the /payments path multiplied an already-converted amount by
 * 100 a second time. Both are invisible to a test that only asserts HTTP 200, so
 * these assert on the exact arguments handed to the Stripe client.
 */
describe('payment money handling', () => {
  const server = new App().app;
  const password = 'TestPassword123!';

  /** The shared mock instance every `new Stripe()` returns (see tests/setup.ts). */
  function stripeMock() {
    return (Stripe as unknown as jest.Mock).mock.results.at(-1)?.value;
  }

  async function account(email: string, userType: 'customer' | 'provider') {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password, firstName: 'Money', lastName: userType, userType })
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

  async function providerProfile(userId: string) {
    return AppDataSource.getRepository(Provider).save({
      userId,
      businessName: 'Money Services',
      description: 'Money test provider',
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
      rating: 4.8,
      totalReviews: 10,
      portfolioImages: [],
      isBackgroundChecked: true,
      isInsured: true,
      isActive: true,
      availableHours: {},
      pricing: { baseRate: 100, currency: 'BRL', rateType: 'quote' },
      completedJobs: 25,
      responseRate: 95,
      averageResponseTime: 30,
    });
  }

  /**
   * Give the customer a saved Stripe customer/payment method. Without this,
   * createPaymentIntent takes the `customers.create` branch, which the shared test
   * mock does not stub.
   */
  async function withStripeCustomer(userId: string) {
    await AppDataSource.getRepository(User).update(userId, {
      stripeCustomerId: 'cus_test_money',
      stripePaymentMethodId: 'pm_test_money',
    });
  }

  async function confirmedBooking(customerId: string, providerId: string, totalAmount: number) {
    return AppDataSource.getRepository(Booking).save({
      customerId,
      providerId,
      serviceType: 'plumbing',
      description: 'Money test booking',
      scheduledDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      estimatedDuration: 60,
      location: {
        latitude: -27.59,
        longitude: -48.55,
        address: 'Test street',
        city: 'Florianópolis',
        state: 'SC',
        zipCode: '88000-000',
      },
      totalAmount,
      status: BookingStatus.CONFIRMED,
    });
  }

  it('holds escrow in BRL at the booking amount, not USD', async () => {
    const customer = await account('money-customer@example.com', 'customer');
    const providerAccount = await account('money-provider@example.com', 'provider');
    const provider = await providerProfile(providerAccount.user.id);
    const booking = await confirmedBooking(customer.user.id, provider.id, 148);

    await AppDataSource.getRepository(User).update(customer.user.id, {
      stripeCustomerId: 'cus_test_money',
      stripePaymentMethodId: 'pm_test_money',
    });

    await request(server)
      .post(`/api/v1/bookings/${booking.id}/start`)
      .set('Authorization', `Bearer ${providerAccount.token}`)
      .expect(200);

    const createCall = stripeMock().paymentIntents.create.mock.calls.at(-1)[0];

    // R$148.00 -> 14800 centavos, denominated in BRL. Previously this charged
    // 14800 *US cents*, i.e. $148 for a R$148 booking.
    expect(createCall.amount).toBe(14800);
    expect(createCall.currency).toBe('brl');
  });

  it('derives the intent amount from the booking and ignores a client-supplied amount', async () => {
    const customer = await account('money2-customer@example.com', 'customer');
    const providerAccount = await account('money2-provider@example.com', 'provider');
    const provider = await providerProfile(providerAccount.user.id);
    const booking = await confirmedBooking(customer.user.id, provider.id, 275);
    await withStripeCustomer(customer.user.id);

    await request(server)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${customer.token}`)
      // A hostile client asking to be charged one cent for a R$275 booking.
      .send({ bookingId: booking.id, amount: 0.01, currency: 'usd' })
      .expect(200);

    const createCall = stripeMock().paymentIntents.create.mock.calls.at(-1)[0];

    expect(createCall.amount).toBe(27500);
    expect(createCall.currency).toBe('brl');
  });

  it('persists the payment in major units so the stored amount matches the booking', async () => {
    const customer = await account('money3-customer@example.com', 'customer');
    const providerAccount = await account('money3-provider@example.com', 'provider');
    const provider = await providerProfile(providerAccount.user.id);
    const booking = await confirmedBooking(customer.user.id, provider.id, 275);
    await withStripeCustomer(customer.user.id);

    const response = await request(server)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ bookingId: booking.id })
      .expect(200);

    // Stored as 275.00, not 27500 and not 2.75.
    expect(Number(response.body.data.amount)).toBe(275);
  });

  it('rejects a partial refund larger than the refundable balance', async () => {
    const customer = await account('money4-customer@example.com', 'customer');
    const providerAccount = await account('money4-provider@example.com', 'provider');
    const provider = await providerProfile(providerAccount.user.id);
    const booking = await confirmedBooking(customer.user.id, provider.id, 275);
    await withStripeCustomer(customer.user.id);

    const intent = await request(server)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ bookingId: booking.id })
      .expect(200);

    expect(intent.body.success).toBe(true);

    const payment = await AppDataSource.getRepository(Payment).findOneByOrFail({
      bookingId: booking.id,
    });
    await AppDataSource.getRepository(Payment).update(payment.id, {
      status: PaymentStatus.SUCCEEDED,
    });

    await request(server)
      .post(`/api/v1/payments/${payment.id}/refund`)
      .set('Authorization', `Bearer ${providerAccount.token}`)
      .send({ amount: 300, reason: 'requested_by_customer' })
      .expect(400);
  });

  it('does not lose a refund when two partial refunds race', async () => {
    const customer = await account('money5-customer@example.com', 'customer');
    const providerAccount = await account('money5-provider@example.com', 'provider');
    const provider = await providerProfile(providerAccount.user.id);
    const booking = await confirmedBooking(customer.user.id, provider.id, 275);
    await withStripeCustomer(customer.user.id);

    await request(server)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ bookingId: booking.id })
      .expect(200);

    const payment = await AppDataSource.getRepository(Payment).findOneByOrFail({
      bookingId: booking.id,
    });
    await AppDataSource.getRepository(Payment).update(payment.id, {
      status: PaymentStatus.SUCCEEDED,
    });

    // The shared Stripe mock reports a fixed 10000 minor units (R$100) per refund,
    // which is exactly the amount requested below — so no override is needed. (An
    // override here would be unreliable: PaymentService caches its own Stripe
    // instance, which is not necessarily the most recently constructed one.)

    // Two R$100 refunds issued concurrently against a R$275 payment. Without a row
    // lock both read refundAmount=0 and each writes 100, losing one of them.
    const [first, second] = await Promise.all([
      request(server)
        .post(`/api/v1/payments/${payment.id}/refund`)
        .set('Authorization', `Bearer ${providerAccount.token}`)
        .send({ amount: 100, reason: 'requested_by_customer' }),
      request(server)
        .post(`/api/v1/payments/${payment.id}/refund`)
        .set('Authorization', `Bearer ${providerAccount.token}`)
        .send({ amount: 100, reason: 'requested_by_customer' }),
    ]);

    expect([first.status, second.status].filter((s) => s === 200)).toHaveLength(2);

    const settled = await AppDataSource.getRepository(Payment).findOneByOrFail({
      id: payment.id,
    });
    // Both refunds must be reflected: 200, not 100.
    expect(Number(settled.refundAmount)).toBe(200);
    expect(settled.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);
  });
});
