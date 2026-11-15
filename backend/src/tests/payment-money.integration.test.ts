import request from 'supertest';
import Stripe from 'stripe';
import App from '@/app';
import { AppDataSource } from '@/config/database';
import { BasicUser } from '@/models/BasicUser';
import { Provider } from '@/models/Provider';
import { Booking, BookingStatus } from '@/models/Booking';
import { User } from '@/models/User';
import { Payment, PaymentMethod, PaymentStatus } from '@/models/Payment';
import { RefundOperation, RefundOperationStatus } from '@/models/RefundOperation';
import PaymentService from '@/services/PaymentService';

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
  const paymentServiceInternals = PaymentService as unknown as {
    getStripe(): { refunds: { create: jest.Mock } };
    finalizeRefund(operationId: string, refund: Stripe.Refund): Promise<Payment>;
  };

  /** The shared mock instance every `new Stripe()` returns (see tests/setup.ts). */
  function stripeMock() {
    return (Stripe as unknown as jest.Mock).mock.results.at(-1)?.value;
  }

  /** PaymentService owns a lazy Stripe client distinct from the booking controller's. */
  function refundStripeMock() {
    return paymentServiceInternals.getStripe();
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

  /**
   * A succeeded payment row to refund against.
   *
   * These used to be created by POSTing `/payments/intent`, which no longer exists:
   * that path authorised funds nothing could capture, so it was retired. Refunds
   * still operate on payment rows, so the fixture builds one directly rather than
   * through a payment flow.
   */
  async function succeededPayment(
    bookingId: string,
    customerId: string,
    providerId: string,
    amount: number
  ) {
    const repo = AppDataSource.getRepository(Payment);
    return repo.save(
      repo.create({
        bookingId,
        customerId,
        providerId,
        amount,
        currency: 'BRL',
        platformFee: 13.75,
        processingFee: 8.28,
        providerAmount: amount - 13.75 - 8.28,
        status: PaymentStatus.SUCCEEDED,
        paymentMethod: PaymentMethod.CREDIT_CARD,
        stripePaymentIntentId: 'pi_test_refundable',
      } as Partial<Payment>)
    );
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

  it('rejects a partial refund larger than the refundable balance', async () => {
    const customer = await account('money4-customer@example.com', 'customer');
    const providerAccount = await account('money4-provider@example.com', 'provider');
    const provider = await providerProfile(providerAccount.user.id);
    const booking = await confirmedBooking(customer.user.id, provider.id, 275);
    await withStripeCustomer(customer.user.id);

    const payment = await succeededPayment(booking.id, customer.user.id, provider.id, 275);

    await request(server)
      .post(`/api/v1/payments/${payment.id}/refund`)
      .set('Idempotency-Key', '00000000-0000-4000-8000-000000000401')
      .set('Authorization', `Bearer ${providerAccount.token}`)
      .send({ amount: 300, reason: 'requested_by_customer' })
      .expect(400);
  });

  it('requires the client operation identity before reserving a refund', async () => {
    const customer = await account('money-key-customer@example.com', 'customer');
    const providerAccount = await account('money-key-provider@example.com', 'provider');
    const provider = await providerProfile(providerAccount.user.id);
    const booking = await confirmedBooking(customer.user.id, provider.id, 100);
    const payment = await succeededPayment(booking.id, customer.user.id, provider.id, 100);

    await request(server)
      .post(`/api/v1/payments/${payment.id}/refund`)
      .set('Authorization', `Bearer ${providerAccount.token}`)
      .send({ amount: 50, reason: 'customer request' })
      .expect(400);

    expect(
      await AppDataSource.getRepository(RefundOperation).countBy({ paymentId: payment.id })
    ).toBe(0);
  });

  it('does not lose a refund when two partial refunds race', async () => {
    const customer = await account('money5-customer@example.com', 'customer');
    const providerAccount = await account('money5-provider@example.com', 'provider');
    const provider = await providerProfile(providerAccount.user.id);
    const booking = await confirmedBooking(customer.user.id, provider.id, 275);
    await withStripeCustomer(customer.user.id);

    const payment = await succeededPayment(booking.id, customer.user.id, provider.id, 275);

    refundStripeMock()
      .refunds.create.mockResolvedValueOnce({ id: 're_race_1', amount: 10000, status: 'succeeded' })
      .mockResolvedValueOnce({ id: 're_race_2', amount: 10000, status: 'succeeded' });

    // Two R$100 refunds issued concurrently against a R$275 payment. Without a row
    // lock both read refundAmount=0 and each writes 100, losing one of them.
    const [first, second] = await Promise.all([
      request(server)
        .post(`/api/v1/payments/${payment.id}/refund`)
        .set('Idempotency-Key', '00000000-0000-4000-8000-000000000501')
        .set('Authorization', `Bearer ${providerAccount.token}`)
        .send({ amount: 100, reason: 'requested_by_customer' }),
      request(server)
        .post(`/api/v1/payments/${payment.id}/refund`)
        .set('Idempotency-Key', '00000000-0000-4000-8000-000000000502')
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

  it('replays an indeterminate refund with the same Stripe key and applies it once', async () => {
    const customer = await account('money6-customer@example.com', 'customer');
    const providerAccount = await account('money6-provider@example.com', 'provider');
    const provider = await providerProfile(providerAccount.user.id);
    const booking = await confirmedBooking(customer.user.id, provider.id, 275);
    const payment = await succeededPayment(booking.id, customer.user.id, provider.id, 275);
    const key = '00000000-0000-4000-8000-000000000701';
    const connectionError = Object.assign(new Error('connection dropped after send'), {
      type: 'StripeConnectionError',
    });
    refundStripeMock()
      .refunds.create.mockRejectedValueOnce(connectionError)
      .mockResolvedValueOnce({ id: 're_replayed', amount: 10000, status: 'succeeded' });

    await request(server)
      .post(`/api/v1/payments/${payment.id}/refund`)
      .set('Idempotency-Key', key)
      .set('Authorization', `Bearer ${providerAccount.token}`)
      .send({ amount: 100, reason: 'customer request' })
      .expect(503);

    const unresolved = await AppDataSource.getRepository(RefundOperation).findOneByOrFail({
      idempotencyKey: key,
    });
    expect(unresolved.status).toBe(RefundOperationStatus.INDETERMINATE);
    expect(Number(unresolved.amount)).toBe(100);

    expect(await PaymentService.reconcileRefundOperations(0)).toBe(1);

    const calls = refundStripeMock().refunds.create.mock.calls.slice(-2);
    expect(calls[0][1].idempotencyKey).toBe(calls[1][1].idempotencyKey);
    expect(calls[1][1].idempotencyKey).toBe(`refund:${unresolved.id}`);
    const settled = await AppDataSource.getRepository(Payment).findOneByOrFail({ id: payment.id });
    expect(Number(settled.refundAmount)).toBe(100);
  });

  it('retains expired reservations without contacting Stripe from either retry path', async () => {
    const customer = await account('money-expired-customer@example.com', 'customer');
    const providerAccount = await account('money-expired-provider@example.com', 'provider');
    const provider = await providerProfile(providerAccount.user.id);
    const booking = await confirmedBooking(customer.user.id, provider.id, 275);
    const payment = await succeededPayment(booking.id, customer.user.id, provider.id, 275);
    const key = '00000000-0000-4000-8000-000000000708';
    const repo = AppDataSource.getRepository(RefundOperation);
    const operation = await repo.save(
      repo.create({
        paymentId: payment.id,
        requestedBy: providerAccount.user.id,
        idempotencyKey: key,
        amount: 200,
        currency: 'BRL',
        status: RefundOperationStatus.INDETERMINATE,
        createdAt: new Date(Date.now() - 23 * 60 * 60_000),
        lastAttemptAt: new Date(),
      })
    );
    const callsBefore = refundStripeMock().refunds.create.mock.calls.length;
    await request(server)
      .post(`/api/v1/payments/${payment.id}/refund`)
      .set('Idempotency-Key', key)
      .set('Authorization', `Bearer ${providerAccount.token}`)
      .send({ amount: 200 })
      .expect(503);
    expect(await PaymentService.reconcileRefundOperations(0)).toBe(0);
    await request(server)
      .post(`/api/v1/payments/${payment.id}/refund`)
      .set('Idempotency-Key', '00000000-0000-4000-8000-000000000709')
      .set('Authorization', `Bearer ${providerAccount.token}`)
      .send({ amount: 100 })
      .expect(400);
    expect(refundStripeMock().refunds.create.mock.calls.length).toBe(callsBefore);
    const retained = await repo.findOneByOrFail({ id: operation.id });
    expect(retained.status).toBe(RefundOperationStatus.INDETERMINATE);
    expect(retained.errorMessage).toContain('manual reconciliation');
    expect(retained.attemptCount).toBe(0);
  });

  it('collapses concurrent retries of one operation into one applied refund', async () => {
    const customer = await account('money-concurrent-key-customer@example.com', 'customer');
    const providerAccount = await account('money-concurrent-key-provider@example.com', 'provider');
    const provider = await providerProfile(providerAccount.user.id);
    const booking = await confirmedBooking(customer.user.id, provider.id, 275);
    const payment = await succeededPayment(booking.id, customer.user.id, provider.id, 275);
    const key = '00000000-0000-4000-8000-000000000706';
    let calls = 0;
    let release!: () => void;
    const bothSubmitted = new Promise<void>((resolve) => {
      release = resolve;
    });
    refundStripeMock().refunds.create.mockImplementation(async () => {
      calls += 1;
      if (calls === 2) release();
      await bothSubmitted;
      return { id: 're_concurrent_replay', amount: 10000, status: 'succeeded' };
    });

    const responses = await Promise.all([
      request(server)
        .post(`/api/v1/payments/${payment.id}/refund`)
        .set('Idempotency-Key', key)
        .set('Authorization', `Bearer ${providerAccount.token}`)
        .send({ amount: 100, reason: 'customer request' }),
      request(server)
        .post(`/api/v1/payments/${payment.id}/refund`)
        .set('Idempotency-Key', key)
        .set('Authorization', `Bearer ${providerAccount.token}`)
        .send({ amount: 100, reason: 'customer request' }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const operation = await AppDataSource.getRepository(RefundOperation).findOneByOrFail({
      idempotencyKey: key,
    });
    expect(operation.attemptCount).toBe(2);
    expect(operation.status).toBe(RefundOperationStatus.SUCCEEDED);
    const stripeCalls = refundStripeMock().refunds.create.mock.calls.slice(-2);
    expect(stripeCalls[0][1].idempotencyKey).toBe(stripeCalls[1][1].idempotencyKey);
    const settled = await AppDataSource.getRepository(Payment).findOneByOrFail({ id: payment.id });
    expect(Number(settled.refundAmount)).toBe(100);
  });

  it('recovers a Stripe success after local finalization fails without double-refunding', async () => {
    const customer = await account('money7-customer@example.com', 'customer');
    const providerAccount = await account('money7-provider@example.com', 'provider');
    const provider = await providerProfile(providerAccount.user.id);
    const booking = await confirmedBooking(customer.user.id, provider.id, 275);
    const payment = await succeededPayment(booking.id, customer.user.id, provider.id, 275);
    const key = '00000000-0000-4000-8000-000000000702';
    refundStripeMock().refunds.create.mockResolvedValue({
      id: 're_commit_recovery',
      amount: 10000,
      status: 'succeeded',
    });
    const originalFinalize = paymentServiceInternals.finalizeRefund.bind(PaymentService);
    const finalize = jest
      .spyOn(paymentServiceInternals, 'finalizeRefund')
      .mockRejectedValueOnce(new Error('database commit failed'))
      .mockImplementation(originalFinalize);

    await request(server)
      .post(`/api/v1/payments/${payment.id}/refund`)
      .set('Idempotency-Key', key)
      .set('Authorization', `Bearer ${providerAccount.token}`)
      .send({ amount: 100, reason: 'customer request' })
      .expect(503);
    await request(server)
      .post(`/api/v1/payments/${payment.id}/refund`)
      .set('Idempotency-Key', key)
      .set('Authorization', `Bearer ${providerAccount.token}`)
      .send({ amount: 100, reason: 'customer request' })
      .expect(200);
    finalize.mockRestore();

    const calls = refundStripeMock().refunds.create.mock.calls.slice(-2);
    expect(calls[0][1].idempotencyKey).toBe(calls[1][1].idempotencyKey);
    const settled = await AppDataSource.getRepository(Payment).findOneByOrFail({ id: payment.id });
    expect(Number(settled.refundAmount)).toBe(100);
    const operation = await AppDataSource.getRepository(RefundOperation).findOneByOrFail({
      idempotencyKey: key,
    });
    expect(operation.status).toBe(RefundOperationStatus.SUCCEEDED);
    expect(operation.attemptCount).toBe(2);
  });

  it('reserves indeterminate amounts against distinct refund requests', async () => {
    const customer = await account('money8-customer@example.com', 'customer');
    const providerAccount = await account('money8-provider@example.com', 'provider');
    const provider = await providerProfile(providerAccount.user.id);
    const booking = await confirmedBooking(customer.user.id, provider.id, 150);
    const payment = await succeededPayment(booking.id, customer.user.id, provider.id, 150);
    const callsBefore = refundStripeMock().refunds.create.mock.calls.length;
    refundStripeMock().refunds.create.mockRejectedValueOnce(
      Object.assign(new Error('timeout'), { type: 'StripeConnectionError' })
    );

    await request(server)
      .post(`/api/v1/payments/${payment.id}/refund`)
      .set('Idempotency-Key', '00000000-0000-4000-8000-000000000703')
      .set('Authorization', `Bearer ${providerAccount.token}`)
      .send({ amount: 100, reason: 'first request' })
      .expect(503);
    await request(server)
      .post(`/api/v1/payments/${payment.id}/refund`)
      .set('Idempotency-Key', '00000000-0000-4000-8000-000000000704')
      .set('Authorization', `Bearer ${providerAccount.token}`)
      .send({ amount: 100, reason: 'second request' })
      .expect(400);

    expect(refundStripeMock().refunds.create.mock.calls).toHaveLength(callsBefore + 1);
  });

  it('rejects reuse of an idempotency key with changed refund inputs', async () => {
    const customer = await account('money9-customer@example.com', 'customer');
    const providerAccount = await account('money9-provider@example.com', 'provider');
    const provider = await providerProfile(providerAccount.user.id);
    const booking = await confirmedBooking(customer.user.id, provider.id, 275);
    const payment = await succeededPayment(booking.id, customer.user.id, provider.id, 275);
    const key = '00000000-0000-4000-8000-000000000705';
    refundStripeMock().refunds.create.mockResolvedValueOnce({
      id: 're_idempotency_collision',
      amount: 10000,
      status: 'succeeded',
    });

    await request(server)
      .post(`/api/v1/payments/${payment.id}/refund`)
      .set('Idempotency-Key', key)
      .set('Authorization', `Bearer ${providerAccount.token}`)
      .send({ amount: 100, reason: 'first request' })
      .expect(200);
    await request(server)
      .post(`/api/v1/payments/${payment.id}/refund`)
      .set('Idempotency-Key', key)
      .set('Authorization', `Bearer ${providerAccount.token}`)
      .send({ amount: 50, reason: 'changed request' })
      .expect(409);
  });
});
