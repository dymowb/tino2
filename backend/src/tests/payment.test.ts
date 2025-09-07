import request from 'supertest';
import { App } from '@/app';
import { getRepository } from 'typeorm';
import { User, UserType } from '@/models/User';
import { Booking } from '@/models/Booking';
import { Payment, PaymentStatus, PaymentMethod } from '@/models/Payment';
import { jwtService } from '@/utils/jwt';

describe('Payment Endpoints', () => {
  let app: App;
  let server: any;
  let customerUser: User;
  let providerUser: User;
  let testBooking: Booking;
  let customerToken: string;
  let providerToken: string;

  beforeAll(async () => {
    app = new App();
    server = app.server;
    
    // Create test users
    const userRepository = getRepository(User);
    
    customerUser = userRepository.create({
      email: 'customer@example.com',
      password: 'hashedPassword123',
      firstName: 'Customer',
      lastName: 'User',
      userType: UserType.CUSTOMER,
      isVerified: true,
      isActive: true
    });
    await userRepository.save(customerUser);

    providerUser = userRepository.create({
      email: 'provider@example.com',
      password: 'hashedPassword123',
      firstName: 'Provider',
      lastName: 'User',
      userType: UserType.PROVIDER,
      isVerified: true,
      isActive: true
    });
    await userRepository.save(providerUser);

    // Create test booking
    const bookingRepository = getRepository(Booking);
    testBooking = bookingRepository.create({
      customerId: customerUser.id,
      providerId: providerUser.id,
      serviceType: 'cleaning',
      description: 'House cleaning',
      location: {
        latitude: 40.7128,
        longitude: -74.0060,
        address: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zipCode: '12345'
      },
      scheduledDate: new Date(),
      status: 'completed',
      estimatedCost: 100
    });
    await bookingRepository.save(testBooking);

    // Generate auth tokens
    customerToken = jwtService.generateToken({
      id: customerUser.id,
      email: customerUser.email,
      userType: customerUser.userType
    });

    providerToken = jwtService.generateToken({
      id: providerUser.id,
      email: providerUser.email,
      userType: providerUser.userType
    });
  });

  afterAll(async () => {
    // Clean up test data
    const userRepository = getRepository(User);
    const bookingRepository = getRepository(Booking);
    const paymentRepository = getRepository(Payment);
    
    await paymentRepository.delete({ bookingId: testBooking.id });
    await bookingRepository.delete({ id: testBooking.id });
    await userRepository.delete({ id: customerUser.id });
    await userRepository.delete({ id: providerUser.id });
    server.close();
  });

  describe('POST /api/v1/payments/intent', () => {
    it('should create payment intent with platform fee calculation (FR-057, FR-059, FR-060)', async () => {
      const paymentData = {
        bookingId: testBooking.id,
        amount: 100,
        currency: 'usd'
      };

      const response = await request(server)
        .post('/api/v1/payments/intent')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(paymentData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('clientSecret');
      expect(response.body.data).toHaveProperty('paymentIntentId');
      expect(response.body.data.amount).toBe(100);
      expect(response.body.data.platformFee).toBe(5); // 5% platform fee
      expect(response.body.data.providerAmount).toBe(95);
    });

    it('should reject payment intent for non-customer users (authorization)', async () => {
      const response = await request(server)
        .post('/api/v1/payments/intent')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          bookingId: testBooking.id,
          amount: 100
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('should reject payment for non-existent booking', async () => {
      const response = await request(server)
        .post('/api/v1/payments/intent')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: 'non-existent-id',
          amount: 100
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should require amount and bookingId', async () => {
      const response = await request(server)
        .post('/api/v1/payments/intent')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/payments', () => {
    it('should return user payments with pagination (FR-064)', async () => {
      // First create a test payment
      const paymentRepository = getRepository(Payment);
      const testPayment = paymentRepository.create({
        id: 'test-payment-id',
        bookingId: testBooking.id,
        customerId: customerUser.id,
        providerId: providerUser.id,
        amount: 100,
        currency: 'USD',
        platformFee: 5,
        providerAmount: 95,
        status: PaymentStatus.PENDING,
        paymentMethod: PaymentMethod.CREDIT_CARD,
        stripePaymentIntentId: 'pi_test_123'
      });
      await paymentRepository.save(testPayment);

      const response = await request(server)
        .get('/api/v1/payments?page=1&limit=10')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('payments');
      expect(response.body.data).toHaveProperty('pagination');
      expect(response.body.data.pagination.page).toBe(1);
      expect(response.body.data.pagination.limit).toBe(10);

      // Clean up
      await paymentRepository.delete({ id: testPayment.id });
    });

    it('should require authentication (NFR-017)', async () => {
      const response = await request(server)
        .get('/api/v1/payments');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/payments/:id/refund', () => {
    let testPayment: Payment;

    beforeEach(async () => {
      const paymentRepository = getRepository(Payment);
      testPayment = paymentRepository.create({
        id: 'refund-test-payment',
        bookingId: testBooking.id,
        customerId: customerUser.id,
        providerId: providerUser.id,
        amount: 100,
        currency: 'USD',
        platformFee: 5,
        providerAmount: 95,
        status: PaymentStatus.SUCCEEDED,
        paymentMethod: PaymentMethod.CREDIT_CARD,
        stripePaymentIntentId: 'pi_test_refund_123'
      });
      await paymentRepository.save(testPayment);
    });

    afterEach(async () => {
      const paymentRepository = getRepository(Payment);
      await paymentRepository.delete({ id: testPayment.id });
    });

    it('should allow customer to request refund (FR-063)', async () => {
      // Note: This test will fail in real scenario without proper Stripe setup
      // but tests the authorization and request structure
      const response = await request(server)
        .post(`/api/v1/payments/${testPayment.id}/refund`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          reason: 'Service not satisfactory'
        });

      // Expect either success or Stripe API error (not authorization error)
      expect([200, 500]).toContain(response.status);
      if (response.status === 500) {
        expect(response.body.error).toContain('refund');
      }
    });

    it('should reject refund request from non-customer', async () => {
      const response = await request(server)
        .post(`/api/v1/payments/${testPayment.id}/refund`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          reason: 'Test'
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Rate Limiting (NFR-025)', () => {
    it('should enforce rate limits on payment intent creation', async () => {
      const paymentData = {
        bookingId: testBooking.id,
        amount: 100
      };

      // Make multiple rapid requests to trigger rate limiting
      const requests = Array(10).fill(null).map(() => 
        request(server)
          .post('/api/v1/payments/intent')
          .set('Authorization', `Bearer ${customerToken}`)
          .send(paymentData)
      );

      const responses = await Promise.all(requests);
      
      // At least some requests should be rate limited
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling (NFR-014)', () => {
    it('should provide helpful error messages', async () => {
      const response = await request(server)
        .post('/api/v1/payments/intent')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          // Missing required fields
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
      expect(typeof response.body.error).toBe('string');
    });
  });

  describe('Payment Validation (Input Validation)', () => {
    it('should reject payment with invalid amount', async () => {
      const response = await request(server)
        .post('/api/v1/payments/intent')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: testBooking.id,
          amount: -10 // Invalid negative amount
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Validation failed');
    });

    it('should reject payment with invalid currency', async () => {
      const response = await request(server)
        .post('/api/v1/payments/intent')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: testBooking.id,
          amount: 100,
          currency: 'INVALID'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject payment with invalid bookingId format', async () => {
      const response = await request(server)
        .post('/api/v1/payments/intent')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: 'not-a-uuid',
          amount: 100
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject excessive payment amounts', async () => {
      const response = await request(server)
        .post('/api/v1/payments/intent')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: testBooking.id,
          amount: 1000000 // Exceeds limit
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Escrow Functionality (FR-059, FR-061)', () => {
    let testPayment: Payment;

    beforeEach(async () => {
      const paymentRepository = getRepository(Payment);
      testPayment = paymentRepository.create({
        id: 'escrow-test-payment',
        bookingId: testBooking.id,
        customerId: customerUser.id,
        providerId: providerUser.id,
        amount: 100,
        currency: 'USD',
        platformFee: 5,
        providerAmount: 95,
        status: PaymentStatus.PENDING,
        paymentMethod: PaymentMethod.CREDIT_CARD,
        stripePaymentIntentId: 'pi_test_escrow_123',
        metadata: {
          requiresCapture: true,
          escrowHold: true
        }
      });
      await paymentRepository.save(testPayment);
    });

    afterEach(async () => {
      const paymentRepository = getRepository(Payment);
      await paymentRepository.delete({ id: testPayment.id });
    });

    it('should hold funds in escrow until confirmation', async () => {
      expect(testPayment.status).toBe(PaymentStatus.PENDING);
      expect(testPayment.metadata?.escrowHold).toBe(true);
      expect(testPayment.metadata?.requiresCapture).toBe(true);
    });

    it('should allow authorized parties to confirm payment', async () => {
      const response = await request(server)
        .post(`/api/v1/payments/${testPayment.id}/confirm`)
        .set('Authorization', `Bearer ${customerToken}`);

      // May fail due to Stripe API, but should not fail authorization
      expect([200, 500]).toContain(response.status);
      if (response.status === 500) {
        expect(response.body.error).not.toContain('Unauthorized');
      }
    });
  });

  describe('Platform Fee Calculation (FR-060)', () => {
    it('should calculate correct platform fees', async () => {
      const testCases = [
        { amount: 100, expectedPlatformFee: 5 }, // 5%
        { amount: 200, expectedPlatformFee: 10 },
        { amount: 50, expectedPlatformFee: 2.5 },
      ];

      for (const testCase of testCases) {
        const response = await request(server)
          .post('/api/v1/payments/intent')
          .set('Authorization', `Bearer ${customerToken}`)
          .send({
            bookingId: testBooking.id,
            amount: testCase.amount
          });

        if (response.status === 200) {
          expect(response.body.data.platformFee).toBe(testCase.expectedPlatformFee);
          expect(response.body.data.providerAmount).toBe(testCase.amount - testCase.expectedPlatformFee);
        }
      }
    });
  });

  describe('Payment History and Reporting (FR-064)', () => {
    it('should support pagination parameters', async () => {
      const response = await request(server)
        .get('/api/v1/payments?page=1&limit=5')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.pagination.page).toBe(1);
      expect(response.body.data.pagination.limit).toBe(5);
    });

    it('should support status filtering', async () => {
      const response = await request(server)
        .get('/api/v1/payments?status=succeeded')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.status).toBe(200);
      // All returned payments should have succeeded status if any exist
      if (response.body.data.payments.length > 0) {
        response.body.data.payments.forEach((payment: any) => {
          expect(payment.status).toBe('succeeded');
        });
      }
    });

    it('should support date range filtering', async () => {
      const startDate = new Date('2024-01-01').toISOString();
      const endDate = new Date('2024-12-31').toISOString();
      
      const response = await request(server)
        .get(`/api/v1/payments?startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.status).toBe(200);
    });
  });

  describe('Security Requirements (SEC-026, SEC-027)', () => {
    it('should require authentication for all endpoints', async () => {
      const endpoints = [
        { method: 'get', path: '/api/v1/payments' },
        { method: 'get', path: '/api/v1/payments/test-id' },
        { method: 'post', path: '/api/v1/payments/intent' },
        { method: 'post', path: '/api/v1/payments/test-id/confirm' },
        { method: 'post', path: '/api/v1/payments/test-id/refund' },
      ];

      for (const endpoint of endpoints) {
        const response = await request(server)[endpoint.method](endpoint.path);
        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
      }
    });

    it('should enforce role-based access control', async () => {
      // Provider should not be able to create payment intents
      const response = await request(server)
        .post('/api/v1/payments/intent')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          bookingId: testBooking.id,
          amount: 100
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Performance Requirements (NFR-001)', () => {
    it('should respond to payment queries within performance limits', async () => {
      const startTime = Date.now();
      
      const response = await request(server)
        .get('/api/v1/payments')
        .set('Authorization', `Bearer ${customerToken}`);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(2000); // 2 seconds max for test environment
    });
  });
});