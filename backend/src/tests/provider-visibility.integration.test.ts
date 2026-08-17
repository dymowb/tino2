import request from 'supertest';
import App from '@/app';
import { AppDataSource } from '@/config/database';
import { BasicUser } from '@/models/BasicUser';
import { Provider } from '@/models/Provider';

/**
 * Search and listing already excluded deactivated providers, but the by-id lookup
 * did not — so a provider hidden from every list stayed fetchable by direct id.
 * Deactivating an account therefore did not take its public profile down, which is
 * what the deactivation dialog now tells users it does.
 */
describe('provider visibility after deactivation', () => {
  const server = new App().app;
  const password = 'TestPassword123!';

  async function account(email: string, userType: 'customer' | 'provider') {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password, firstName: 'Vis', lastName: userType, userType })
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
      businessName: 'Visibility Services',
      description: 'Visibility test provider',
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
      totalReviews: 1,
      portfolioImages: [],
      isBackgroundChecked: true,
      isInsured: true,
      isActive: true,
      availableHours: {},
      pricing: { baseRate: 100, currency: 'BRL', rateType: 'quote' },
      completedJobs: 1,
      responseRate: 95,
      averageResponseTime: 30,
    });
  }

  it('serves an active provider by id', async () => {
    const providerAccount = await account('vis-active@example.com', 'provider');
    const provider = await providerProfile(providerAccount.user.id);

    await request(server).get(`/api/v1/providers/${provider.id}`).expect(200);
  });

  it('hides a provider whose account was deactivated', async () => {
    const providerAccount = await account('vis-deactivated@example.com', 'provider');
    const provider = await providerProfile(providerAccount.user.id);

    // What DELETE /users/profile does: users.isActive = false.
    await AppDataSource.getRepository(BasicUser).update(providerAccount.user.id, {
      isActive: false,
    });

    await request(server).get(`/api/v1/providers/${provider.id}`).expect(404);
  });

  it('hides a provider whose profile was switched inactive', async () => {
    const providerAccount = await account('vis-inactive-profile@example.com', 'provider');
    const provider = await providerProfile(providerAccount.user.id);

    await AppDataSource.getRepository(Provider).update(provider.id, { isActive: false });

    await request(server).get(`/api/v1/providers/${provider.id}`).expect(404);
  });

  it('keeps a deactivated provider able to load their own record', async () => {
    const providerAccount = await account('vis-owner@example.com', 'provider');
    const provider = await providerProfile(providerAccount.user.id);

    await AppDataSource.getRepository(Provider).update(provider.id, { isActive: false });

    // The owner-facing paths opt into includeInactive. Filtering them too would
    // lock a provider out of reactivating their own profile.
    await request(server)
      .put(`/api/v1/providers/${provider.id}`)
      .set('Authorization', `Bearer ${providerAccount.token}`)
      .send({ description: 'Still mine to edit' })
      .expect((response) => {
        if (response.status === 404) {
          throw new Error('Owner lost access to their own deactivated provider record');
        }
      });
  });
});
