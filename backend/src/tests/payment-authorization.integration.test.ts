import request from 'supertest';
import App from '@/app';
import { AppDataSource } from '@/config/database';
import { BasicUser, UserType } from '@/models/BasicUser';
import { Provider } from '@/models/Provider';
import { Booking, BookingStatus } from '@/models/Booking';
import { Payment, PaymentStatus, PaymentMethod } from '@/models/Payment';

/**
 * Authorization matrix for the money-moving payment endpoints.
 *
 * The refund endpoint previously had no ownership check at all: any authenticated
 * user holding a valid payment UUID could reverse someone else's captured payment.
 * These tests pin the policy — provider or admin may refund, the paying customer
 * may not (their route is the dispute flow), outsiders cannot even confirm the
 * payment exists.
 */
describe('payment authorization', () => {
  const server = new App().app;
  const password = 'TestPassword123!';

  async function account(email: string, userType: 'customer' | 'provider') {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password, firstName: 'Authz', lastName: userType, userType })
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

  /** Admin cannot be self-registered, so promote then re-login to mint an admin token. */
  async function adminAccount(email: string) {
    const created = await account(email, 'customer');
    await AppDataSource.getRepository(BasicUser).update(created.user.id, {
      userType: UserType.ADMIN,
    });
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return { user: created.user, token: login.body.data.accessToken as string };
  }

  async function providerProfile(userId: string, businessName: string) {
    return AppDataSource.getRepository(Provider).save({
      userId,
      businessName,
      description: 'Authorization test provider',
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
   * A captured payment ready to be refunded. Built through the repositories rather
   * than the HTTP flow so the authorization assertions stay independent of the
   * payment-intent creation path.
   */
  async function capturedPayment(customerId: string, providerId: string) {
    const booking = await AppDataSource.getRepository(Booking).save({
      customerId,
      providerId,
      serviceType: 'plumbing',
      description: 'Authorization test booking',
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
      // 100.00 so a full refund matches the shared Stripe mock's fixed 10000-minor-unit
      // refund response; otherwise a "full" refund correctly reports as partial.
      totalAmount: 100,
      status: BookingStatus.COMPLETED,
    });

    return AppDataSource.getRepository(Payment).save({
      bookingId: booking.id,
      customerId,
      providerId,
      amount: 100,
      currency: 'BRL',
      platformFee: 0,
      processingFee: 0,
      providerAmount: 100,
      status: PaymentStatus.SUCCEEDED,
      paymentMethod: PaymentMethod.CREDIT_CARD,
      stripePaymentIntentId: 'pi_authz_test',
    });
  }

  describe('POST /payments/:id/refund', () => {
    it('rejects an unrelated customer with 404 and does not leak existence', async () => {
      const owner = await account('authz-owner@example.com', 'customer');
      const providerAccount = await account('authz-provider@example.com', 'provider');
      const provider = await providerProfile(providerAccount.user.id, 'Authz Services');
      const payment = await capturedPayment(owner.user.id, provider.id);

      const outsider = await account('authz-outsider@example.com', 'customer');

      const response = await request(server)
        .post(`/api/v1/payments/${payment.id}/refund`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ reason: 'requested_by_customer' })
        .expect(404);

      expect(response.body.success).toBe(false);

      const untouched = await AppDataSource.getRepository(Payment).findOneByOrFail({
        id: payment.id,
      });
      expect(untouched.status).toBe(PaymentStatus.SUCCEEDED);
      expect(untouched.stripeRefundId).toBeNull();
    });

    it('rejects an unrelated provider with 404', async () => {
      const owner = await account('authz2-owner@example.com', 'customer');
      const providerAccount = await account('authz2-provider@example.com', 'provider');
      const provider = await providerProfile(providerAccount.user.id, 'Authz Services');
      const payment = await capturedPayment(owner.user.id, provider.id);

      const otherProviderAccount = await account('authz2-other@example.com', 'provider');
      await providerProfile(otherProviderAccount.user.id, 'Unrelated Services');

      await request(server)
        .post(`/api/v1/payments/${payment.id}/refund`)
        .set('Authorization', `Bearer ${otherProviderAccount.token}`)
        .send({ reason: 'requested_by_customer' })
        .expect(404);

      const untouched = await AppDataSource.getRepository(Payment).findOneByOrFail({
        id: payment.id,
      });
      expect(untouched.status).toBe(PaymentStatus.SUCCEEDED);
    });

    it('rejects the paying customer with 403 — their route is the dispute flow', async () => {
      const owner = await account('authz3-owner@example.com', 'customer');
      const providerAccount = await account('authz3-provider@example.com', 'provider');
      const provider = await providerProfile(providerAccount.user.id, 'Authz Services');
      const payment = await capturedPayment(owner.user.id, provider.id);

      await request(server)
        .post(`/api/v1/payments/${payment.id}/refund`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ reason: 'requested_by_customer' })
        .expect(403);

      const untouched = await AppDataSource.getRepository(Payment).findOneByOrFail({
        id: payment.id,
      });
      expect(untouched.status).toBe(PaymentStatus.SUCCEEDED);
    });

    it('allows the assigned provider', async () => {
      const owner = await account('authz4-owner@example.com', 'customer');
      const providerAccount = await account('authz4-provider@example.com', 'provider');
      const provider = await providerProfile(providerAccount.user.id, 'Authz Services');
      const payment = await capturedPayment(owner.user.id, provider.id);

      await request(server)
        .post(`/api/v1/payments/${payment.id}/refund`)
        .set('Authorization', `Bearer ${providerAccount.token}`)
        .send({ reason: 'requested_by_customer' })
        .expect(200);

      const refunded = await AppDataSource.getRepository(Payment).findOneByOrFail({
        id: payment.id,
      });
      expect(refunded.status).toBe(PaymentStatus.REFUNDED);
      expect(refunded.stripeRefundId).toBe('re_test_123');
    });

    it('allows an admin', async () => {
      const owner = await account('authz5-owner@example.com', 'customer');
      const providerAccount = await account('authz5-provider@example.com', 'provider');
      const provider = await providerProfile(providerAccount.user.id, 'Authz Services');
      const payment = await capturedPayment(owner.user.id, provider.id);

      const admin = await adminAccount('authz5-admin@example.com');

      await request(server)
        .post(`/api/v1/payments/${payment.id}/refund`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ reason: 'requested_by_customer' })
        .expect(200);

      const refunded = await AppDataSource.getRepository(Payment).findOneByOrFail({
        id: payment.id,
      });
      expect(refunded.status).toBe(PaymentStatus.REFUNDED);
    });

    it('rejects an unauthenticated caller with 401', async () => {
      const owner = await account('authz6-owner@example.com', 'customer');
      const providerAccount = await account('authz6-provider@example.com', 'provider');
      const provider = await providerProfile(providerAccount.user.id, 'Authz Services');
      const payment = await capturedPayment(owner.user.id, provider.id);

      await request(server)
        .post(`/api/v1/payments/${payment.id}/refund`)
        .send({ reason: 'requested_by_customer' })
        .expect(401);
    });
  });

  describe('provider ownership resolution', () => {
    it('lets a provider read a payment addressed to their Provider entity id', async () => {
      const owner = await account('authz7-owner@example.com', 'customer');
      const providerAccount = await account('authz7-provider@example.com', 'provider');
      const provider = await providerProfile(providerAccount.user.id, 'Authz Services');
      const payment = await capturedPayment(owner.user.id, provider.id);

      const response = await request(server)
        .get(`/api/v1/payments/${payment.id}`)
        .set('Authorization', `Bearer ${providerAccount.token}`)
        .expect(200);

      expect(response.body.data.id).toBe(payment.id);
    });

    it('lets a provider list their own earnings by Provider entity id', async () => {
      const owner = await account('authz8-owner@example.com', 'customer');
      const providerAccount = await account('authz8-provider@example.com', 'provider');
      const provider = await providerProfile(providerAccount.user.id, 'Authz Services');
      await capturedPayment(owner.user.id, provider.id);

      const response = await request(server)
        .get(`/api/v1/payments/provider/${provider.id}`)
        .set('Authorization', `Bearer ${providerAccount.token}`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
    });

    it('stops one provider reading another provider earnings', async () => {
      const owner = await account('authz9-owner@example.com', 'customer');
      const providerAccount = await account('authz9-provider@example.com', 'provider');
      const provider = await providerProfile(providerAccount.user.id, 'Authz Services');
      await capturedPayment(owner.user.id, provider.id);

      const otherProviderAccount = await account('authz9-other@example.com', 'provider');
      await providerProfile(otherProviderAccount.user.id, 'Unrelated Services');

      await request(server)
        .get(`/api/v1/payments/provider/${provider.id}`)
        .set('Authorization', `Bearer ${otherProviderAccount.token}`)
        .expect(403);
    });

    it('stops a customer reading a payment they did not make', async () => {
      const owner = await account('authz10-owner@example.com', 'customer');
      const providerAccount = await account('authz10-provider@example.com', 'provider');
      const provider = await providerProfile(providerAccount.user.id, 'Authz Services');
      const payment = await capturedPayment(owner.user.id, provider.id);

      const outsider = await account('authz10-outsider@example.com', 'customer');

      await request(server)
        .get(`/api/v1/payments/${payment.id}`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .expect(404);
    });
  });
});
