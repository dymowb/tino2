import request from 'supertest';
import App from '@/app';
import { AppDataSource } from '@/config/database';
import { BasicUser } from '@/models/BasicUser';

const validUser = (suffix: string, userType: 'customer' | 'provider' = 'customer') => ({
  email: `${suffix}@example.com`,
  password: 'TestPassword123!',
  firstName: 'Test',
  lastName: 'User',
  phone: '+15555550123',
  userType,
});

describe('authentication integration', () => {
  const server = new App().app;

  async function registerAndVerify(suffix: string, userType: 'customer' | 'provider' = 'customer') {
    const user = validUser(suffix, userType);
    await request(server).post('/api/v1/auth/register').send(user).expect(201);

    const repository = AppDataSource.getRepository(BasicUser);
    const stored = await repository.findOneByOrFail({ email: user.email });
    expect(stored.emailVerificationToken).toBeTruthy();

    await request(server)
      .get('/api/v1/auth/verify-email')
      .query({ token: stored.emailVerificationToken })
      .expect(200);

    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);

    return { user, stored, token: login.body.data.accessToken as string };
  }

  test('registers without issuing credentials before email verification', async () => {
    const user = validUser('register');
    const response = await request(server).post('/api/v1/auth/register').send(user).expect(201);

    expect(response.body).toMatchObject({
      success: true,
      data: { email: user.email, firstName: user.firstName },
    });
    expect(response.body.data.accessToken).toBeUndefined();
  });

  test('rejects invalid registration and duplicate email', async () => {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ ...validUser('weak'), password: '123' })
      .expect(400);

    const user = validUser('duplicate');
    await request(server).post('/api/v1/auth/register').send(user).expect(201);
    await request(server).post('/api/v1/auth/register').send(user).expect(400);
  });

  test('blocks login until email is verified', async () => {
    const user = validUser('unverified');
    await request(server).post('/api/v1/auth/register').send(user).expect(201);
    const response = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(403);

    expect(response.body.error).toBe('EMAIL_NOT_VERIFIED');
  });

  test('verifies, logs in, and returns the authenticated profile', async () => {
    const { user, token } = await registerAndVerify('verified');
    const response = await request(server)
      .get('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toMatchObject({ email: user.email, isVerified: true });
  });

  test('rejects invalid credentials and missing tokens', async () => {
    await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'missing@example.com', password: 'WrongPassword123!' })
      .expect(401);
    await request(server).get('/api/v1/auth/profile').expect(401);
  });

  test('enforces admin RBAC for authenticated customers', async () => {
    const { token } = await registerAndVerify('customer-rbac');
    await request(server)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
});
