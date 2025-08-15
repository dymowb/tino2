import request from 'supertest';
import App from '@/app';
import { UserType } from '@/models/User';

describe('Authentication', () => {
  let app: App;
  let server: any;

  beforeAll(() => {
    app = new App();
    server = app.app;
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new customer', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'TestPassword123!',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        userType: UserType.CUSTOMER,
      };

      const response = await request(server)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(userData.email);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
    });

    it('should register a new provider', async () => {
      const userData = {
        email: 'provider@example.com',
        password: 'TestPassword123!',
        firstName: 'Jane',
        lastName: 'Smith',
        phone: '+1987654321',
        userType: UserType.PROVIDER,
      };

      const response = await request(server)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(userData.email);
      expect(response.body.data.user.userType).toBe(UserType.PROVIDER);
    });

    it('should not register user with invalid email', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'TestPassword123!',
        firstName: 'John',
        lastName: 'Doe',
        userType: UserType.CUSTOMER,
      };

      const response = await request(server)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors.email).toBeDefined();
    });

    it('should not register user with weak password', async () => {
      const userData = {
        email: 'test@example.com',
        password: '123',
        firstName: 'John',
        lastName: 'Doe',
        userType: UserType.CUSTOMER,
      };

      const response = await request(server)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors.password).toBeDefined();
    });
  });

  describe('POST /api/v1/auth/login', () => {
    let testUser = {
      email: 'login-test@example.com',
      password: 'TestPassword123!',
      firstName: 'Login',
      lastName: 'Test',
      userType: UserType.CUSTOMER,
    };

    beforeEach(async () => {
      await request(server)
        .post('/api/v1/auth/register')
        .send(testUser);
    });

    it('should login with valid credentials', async () => {
      const response = await request(server)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(testUser.email);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
    });

    it('should not login with invalid password', async () => {
      const response = await request(server)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: 'wrongpassword',
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should not login with non-existent email', async () => {
      const response = await request(server)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: testUser.password,
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/auth/profile', () => {
    let accessToken: string;

    beforeEach(async () => {
      const userData = {
        email: 'profile-test@example.com',
        password: 'TestPassword123!',
        firstName: 'Profile',
        lastName: 'Test',
        userType: UserType.CUSTOMER,
      };

      const registerResponse = await request(server)
        .post('/api/v1/auth/register')
        .send(userData);

      accessToken = registerResponse.body.data.accessToken;
    });

    it('should get user profile with valid token', async () => {
      const response = await request(server)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe('profile-test@example.com');
    });

    it('should not get profile without token', async () => {
      const response = await request(server)
        .get('/api/v1/auth/profile')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });
});