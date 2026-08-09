import request from 'supertest';
import App from '@/app';
import { AppDataSource } from '@/config/database';
import { BasicUser } from '@/models/BasicUser';
import { Provider } from '@/models/Provider';
import { Booking, BookingStatus, PaymentStatus } from '@/models/Booking';
import { QuoteRequest } from '@/models/QuoteRequest';

describe('favorites and rebooking', () => {
  const server = new App().app;

  async function account(email: string, userType: 'customer' | 'provider') {
    const password = 'TestPassword123!';
    await request(server)
      .post('/api/v1/auth/register')
      .send({
        email,
        password,
        firstName: 'Repeat',
        lastName: userType,
        userType,
      })
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

  test('saves a provider idempotently and creates an attributed repeat request', async () => {
    const customer = await account('repeat-customer@example.com', 'customer');
    const providerAccount = await account('repeat-provider@example.com', 'provider');
    const provider = await AppDataSource.getRepository(Provider).save({
      userId: providerAccount.user.id,
      businessName: 'Repeat Services',
      description: 'Known provider',
      services: ['Limpeza Residencial'],
      location: {
        latitude: -27.59,
        longitude: -48.55,
        address: 'Rua A',
        city: 'Florianópolis',
        state: 'SC',
        zipCode: '88000-000',
        country: 'BR',
      },
      serviceRadius: 25,
      rating: 5,
      totalReviews: 1,
      portfolioImages: [],
      isBackgroundChecked: true,
      isInsured: true,
      isActive: true,
      availableHours: {},
      pricing: { baseRate: 100, currency: 'BRL', rateType: 'hourly' },
      completedJobs: 1,
      responseRate: 100,
      averageResponseTime: 10,
    });

    await request(server)
      .post(`/api/v1/providers/${provider.id}/favorite`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    await request(server)
      .post(`/api/v1/providers/${provider.id}/favorite`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    const favorites = await request(server)
      .get('/api/v1/providers/favorites')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(favorites.body.data.favorites).toHaveLength(1);

    const booking = await AppDataSource.getRepository(Booking).save({
      customerId: customer.user.id,
      providerId: provider.id,
      quoteId: null,
      requestId: null,
      serviceType: 'Limpeza Residencial',
      description: 'Clean apartment',
      location: {
        latitude: -27.59,
        longitude: -48.55,
        address: 'Rua A',
        city: 'Florianópolis',
        state: 'SC',
        zipCode: '88000-000',
      },
      scheduledDate: new Date(Date.now() - 86400000),
      estimatedDuration: 120,
      status: BookingStatus.COMPLETED,
      totalAmount: 240,
      paymentStatus: PaymentStatus.PAID,
      specialInstructions: 'Bring pet-safe products',
      completedAt: new Date(),
    });

    const prefill = await request(server)
      .get(`/api/v1/bookings/${booking.id}/rebook-prefill`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(prefill.body.data).toMatchObject({ eligible: true, sourceBookingId: booking.id });
    expect(prefill.body.data.draft.proposedBudget).toBe(240);

    const created = await request(server)
      .post(`/api/v1/bookings/${booking.id}/rebook-request`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        serviceType: 'Limpeza Residencial',
        description: 'Clean apartment and balcony',
        specialInstructions: '',
        location: booking.location,
        preferredDate: new Date(Date.now() + 86400000).toISOString(),
        estimatedDurationHours: 3,
        proposedBudget: 280,
        requirements: [],
      })
      .expect(201);
    const repeat = await AppDataSource.getRepository(QuoteRequest).findOneByOrFail({
      id: created.body.data.quoteRequest.id,
    });
    expect(repeat.sourceBookingId).toBe(booking.id);
    expect(repeat.targetProviderIds).toEqual([provider.id]);
    expect(Number(repeat.budget.max)).toBe(280);

    await request(server)
      .delete(`/api/v1/providers/${provider.id}/favorite`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(204);
  });
});
