import request from 'supertest';
import App from '@/app';
import { AppDataSource } from '@/config/database';
import { BasicUser } from '@/models/BasicUser';
import { Provider } from '@/models/Provider';
import { Booking, BookingStatus, PaymentStatus } from '@/models/Booking';
import { User } from '@/models/User';

describe('quote to booking lifecycle', () => {
  const server = new App().app;

  async function account(email: string, userType: 'customer' | 'provider') {
    const password = 'TestPassword123!';
    await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password, firstName: 'Lifecycle', lastName: userType, userType })
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

  test('materializes the negotiated terms and origin links when a quote is accepted', async () => {
    const customer = await account('lifecycle-customer@example.com', 'customer');
    const providerAccount = await account('lifecycle-provider@example.com', 'provider');
    const provider = await AppDataSource.getRepository(Provider).save({
      userId: providerAccount.user.id,
      businessName: 'Lifecycle Services',
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

    const quoteRequest = await request(server)
      .post('/api/v1/quotes/requests')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        serviceType: 'plumbing',
        description: 'Repair a leaking tap',
        location: {
          latitude: -27.59,
          longitude: -48.55,
          address: 'Test street',
          city: 'Florianópolis',
          state: 'SC',
          zipCode: '88000-000',
        },
        preferredDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        targetProviderIds: [provider.id],
      })
      .expect(201);

    const quote = await request(server)
      .post('/api/v1/quotes')
      .set('Authorization', `Bearer ${providerAccount.token}`)
      .send({
        requestId: quoteRequest.body.data.quoteRequest.id,
        serviceType: 'plumbing',
        description: 'Parts and labor included',
        estimatedPrice: 275,
        estimatedDuration: 120,
        validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .expect((response) => {
        if (response.status !== 201) {
          throw new Error(`Quote creation failed: ${JSON.stringify(response.body)}`);
        }
      })
      .expect(201);

    await request(server)
      .put(`/api/v1/quotes/${quote.body.data.quote.id}/status`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ status: 'accepted' })
      .expect(200);

    const booking = await AppDataSource.getRepository(Booking).findOneByOrFail({
      quoteId: quote.body.data.quote.id,
    });
    expect(booking).toMatchObject({
      requestId: quoteRequest.body.data.quoteRequest.id,
      providerId: provider.id,
      customerId: customer.user.id,
      status: BookingStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PENDING,
    });
    expect(Number(booking.totalAmount)).toBe(275);

    await AppDataSource.getRepository(User).update(customer.user.id, {
      stripeCustomerId: 'cus_test_lifecycle',
      stripePaymentMethodId: 'pm_test_lifecycle',
    });
    await request(server)
      .post(`/api/v1/bookings/${booking.id}/start`)
      .set('Authorization', `Bearer ${providerAccount.token}`)
      .expect(200);
    await request(server)
      .post(`/api/v1/bookings/${booking.id}/complete`)
      .set('Authorization', `Bearer ${providerAccount.token}`)
      .expect(200);
    await request(server)
      .post(`/api/v1/bookings/${booking.id}/confirm-completion`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);

    const completed = await AppDataSource.getRepository(Booking).findOneByOrFail({
      id: booking.id,
    });
    expect(completed.status).toBe(BookingStatus.COMPLETED);
    expect(completed.paymentStatus).toBe(PaymentStatus.PAID);
  });
});
