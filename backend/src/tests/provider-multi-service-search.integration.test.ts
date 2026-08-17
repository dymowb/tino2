import request from 'supertest';
import App from '@/app';
import { AppDataSource } from '@/config/database';
import { BasicUser } from '@/models/BasicUser';
import { Provider } from '@/models/Provider';

/**
 * Selecting several services used to search for exactly one of them: the client
 * sent `serviceTypes[0]` and dropped the rest, and the search layer never read the
 * `services` array the controller was already parsing. The filter silently
 * narrowed instead of widening, which is invisible from the results alone.
 */
describe('multi-service provider search', () => {
  const server = new App().app;
  const password = 'TestPassword123!';
  const HERE = { latitude: -27.59, longitude: -48.55 };

  async function providerOffering(email: string, services: string[], businessName: string) {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password, firstName: 'Multi', lastName: 'provider', userType: 'provider' })
      .expect(201);
    const user = await AppDataSource.getRepository(BasicUser).findOneByOrFail({ email });
    await request(server)
      .get('/api/v1/auth/verify-email')
      .query({ token: user.emailVerificationToken })
      .expect(200);

    return AppDataSource.getRepository(Provider).save({
      userId: user.id,
      businessName,
      description: 'Multi-service search test provider',
      services,
      location: {
        ...HERE,
        address: 'Test street',
        city: 'Florianópolis',
        state: 'SC',
        zipCode: '88000-000',
        country: 'BR',
      },
      serviceRadius: 25,
      rating: 4.5,
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

  async function search(query: Record<string, unknown>) {
    const response = await request(server)
      .get('/api/v1/providers')
      .query({ ...HERE, radius: 25, ...query })
      .expect(200);
    const providers = response.body.data?.providers ?? response.body.data ?? [];
    return (providers as Array<{ businessName: string }>).map((p) => p.businessName).sort();
  }

  beforeEach(async () => {
    await providerOffering('multi-plumb@example.com', ['Conserto Hidráulico'], 'Plumbing Co');
    await providerOffering('multi-elec@example.com', ['Conserto Elétrico'], 'Electric Co');
    await providerOffering('multi-clean@example.com', ['Limpeza Residencial'], 'Cleaning Co');
  });

  it('returns providers offering any of several services, as a repeated parameter', async () => {
    const names = await search({ serviceTypes: ['Conserto Hidráulico', 'Conserto Elétrico'] });

    // The point of the fix: two services must widen the result, not narrow it.
    expect(names).toEqual(['Electric Co', 'Plumbing Co']);
  });

  it('accepts the same list comma-separated', async () => {
    const names = await search({ serviceTypes: 'Conserto Hidráulico,Conserto Elétrico' });

    expect(names).toEqual(['Electric Co', 'Plumbing Co']);
  });

  it('still supports a single serviceType for deep links into this page', async () => {
    const names = await search({ serviceType: 'Conserto Hidráulico' });

    expect(names).toEqual(['Plumbing Co']);
  });

  it('excludes providers offering none of the requested services', async () => {
    const names = await search({ serviceTypes: ['Conserto Hidráulico'] });

    expect(names).not.toContain('Cleaning Co');
    expect(names).not.toContain('Electric Co');
  });

  it('returns everyone when no service filter is supplied', async () => {
    const names = await search({});

    expect(names).toEqual(['Cleaning Co', 'Electric Co', 'Plumbing Co']);
  });
});
