import request from 'supertest';
import App from '@/app';
import { AppDataSource } from '@/config/database';
import { BasicUser } from '@/models/BasicUser';
import { Provider } from '@/models/Provider';
import { Booking, BookingStatus } from '@/models/Booking';

/**
 * The new-conversation dialog used to offer three hardcoded fake users whose ids
 * were "1", "2" and "3", submitted to a UUID-backed API. Its replacement must
 * return real people, and only people the caller actually deals with — a
 * directory of every account would hand any provider the whole customer base.
 */
describe('conversation contacts', () => {
  const server = new App().app;
  const password = 'TestPassword123!';

  async function account(email: string, userType: 'customer' | 'provider', firstName = 'Contact') {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password, firstName, lastName: userType, userType })
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

  async function providerProfile(userId: string, businessName: string) {
    return AppDataSource.getRepository(Provider).save({
      userId,
      businessName,
      description: 'Contacts test provider',
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

  async function bookingBetween(customerId: string, providerId: string) {
    return AppDataSource.getRepository(Booking).save({
      customerId,
      providerId,
      serviceType: 'plumbing',
      description: 'Contacts test booking',
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
      totalAmount: 100,
      status: BookingStatus.CONFIRMED,
    });
  }

  async function contacts(token: string, search?: string) {
    const response = await request(server)
      .get('/api/v1/messages/contacts')
      .query(search ? { search } : {})
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return response.body.data as Array<Record<string, unknown>>;
  }

  it('returns the counterparty a customer shares a booking with', async () => {
    const customer = await account('contacts-c1@example.com', 'customer', 'Carla');
    const providerAccount = await account('contacts-p1@example.com', 'provider', 'Pedro');
    const provider = await providerProfile(providerAccount.user.id, 'Contacts Services');
    await bookingBetween(customer.user.id, provider.id);

    const result = await contacts(customer.token);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: providerAccount.user.id, firstName: 'Pedro' });
  });

  it('works in the provider direction, resolving through Provider.userId', async () => {
    const customer = await account('contacts-c2@example.com', 'customer', 'Carla');
    const providerAccount = await account('contacts-p2@example.com', 'provider', 'Pedro');
    const provider = await providerProfile(providerAccount.user.id, 'Contacts Services');
    await bookingBetween(customer.user.id, provider.id);

    // booking.providerId holds a Provider entity id. Comparing it to a user id —
    // the recurring bug in this codebase — would return nobody here.
    const result = await contacts(providerAccount.token);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: customer.user.id, firstName: 'Carla' });
  });

  it('does not expose users the caller has no relationship with', async () => {
    const customer = await account('contacts-c3@example.com', 'customer');
    const providerAccount = await account('contacts-p3@example.com', 'provider');
    const provider = await providerProfile(providerAccount.user.id, 'Contacts Services');
    await bookingBetween(customer.user.id, provider.id);

    // A stranger with their own provider profile and no shared work.
    const stranger = await account('contacts-stranger@example.com', 'provider');
    await providerProfile(stranger.user.id, 'Unrelated Services');

    const result = await contacts(stranger.token);

    expect(result).toEqual([]);
  });

  it('never returns email addresses', async () => {
    const customer = await account('contacts-c4@example.com', 'customer');
    const providerAccount = await account('contacts-p4@example.com', 'provider');
    const provider = await providerProfile(providerAccount.user.id, 'Contacts Services');
    await bookingBetween(customer.user.id, provider.id);

    const result = await contacts(customer.token);

    expect(result[0]).not.toHaveProperty('email');
    expect(result[0]).not.toHaveProperty('password');
  });

  it('filters by name, and by email without disclosing it', async () => {
    const customer = await account('contacts-c5@example.com', 'customer');
    const providerAccount = await account('contacts-p5@example.com', 'provider', 'Zenaide');
    const provider = await providerProfile(providerAccount.user.id, 'Contacts Services');
    await bookingBetween(customer.user.id, provider.id);

    expect(await contacts(customer.token, 'Zena')).toHaveLength(1);
    // Searchable by the address even though the response omits it.
    expect(await contacts(customer.token, 'contacts-p5@example.com')).toHaveLength(1);
    expect(await contacts(customer.token, 'nobody-by-this-name')).toEqual([]);
  });

  it('requires authentication', async () => {
    await request(server).get('/api/v1/messages/contacts').expect(401);
  });
});
