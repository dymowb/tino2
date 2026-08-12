import request from 'supertest';
import App from '@/app';
import { AppDataSource } from '@/config/database';
import { BasicUser } from '@/models/BasicUser';
import jwtService from '@/utils/jwt';

/**
 * Access and refresh tokens are signed with the same secret and carry the same
 * claims. Without a token-type claim the two are interchangeable, so an access
 * token could be presented to /auth/refresh and exchanged for a fresh pair —
 * which defeats the point of giving access tokens a short lifetime.
 */
describe('access and refresh token separation', () => {
  const server = new App().app;
  const password = 'TestPassword123!';

  async function account(email: string) {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password, firstName: 'Token', lastName: 'Test', userType: 'customer' })
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
    return {
      user,
      accessToken: login.body.data.accessToken as string,
      refreshToken: login.body.data.refreshToken as string,
    };
  }

  it('refuses an access token presented as a refresh token', async () => {
    const { accessToken } = await account('token-sub@example.com');

    await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: accessToken })
      .expect(401);
  });

  it('refuses a refresh token used as a bearer credential', async () => {
    const { refreshToken } = await account('token-sub2@example.com');

    await request(server)
      .get('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${refreshToken}`)
      .expect(401);
  });

  it('still accepts each token for its own purpose', async () => {
    const { accessToken, refreshToken } = await account('token-sub3@example.com');

    await request(server)
      .get('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const refreshed = await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    expect(refreshed.body.data.accessToken).toBeTruthy();
  });

  it('stamps the type claim on issued tokens', async () => {
    const { accessToken, refreshToken } = await account('token-sub4@example.com');

    expect(jwtService.decodeToken(accessToken)).toMatchObject({ type: 'access' });
    expect(jwtService.decodeToken(refreshToken)).toMatchObject({ type: 'refresh' });
  });

  it('still accepts a legacy token issued before the claim existed', async () => {
    const { user } = await account('token-legacy@example.com');

    // Signed without a `type`, as tokens in circulation during the deploy will be.
    const legacy = require('jsonwebtoken').sign(
      { userId: user.id, id: user.id, email: user.email, userType: 'customer' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    await request(server)
      .get('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${legacy}`)
      .expect(200);
  });

  it('no longer authenticates from a query-string token', async () => {
    const { accessToken } = await account('token-query@example.com');

    // Query strings reach server logs, proxy logs, history and Referer headers.
    await request(server).get('/api/v1/auth/profile').query({ token: accessToken }).expect(401);
  });
});
