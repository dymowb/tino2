import request from 'supertest';
import { App } from '@/app';
import { getRepository } from 'typeorm';
import { User, UserType } from '@/models/User';
import { jwtService } from '@/utils/jwt';

describe('User Endpoints', () => {
  let app: App;
  let server: any;
  let testUser: User;
  let authToken: string;

  beforeAll(async () => {
    app = new App();
    server = app.server;
    
    // Create test user
    const userRepository = getRepository(User);
    testUser = userRepository.create({
      email: 'test@example.com',
      password: 'hashedPassword123',
      firstName: 'John',
      lastName: 'Doe',
      userType: UserType.CUSTOMER,
      isVerified: true,
      isActive: true
    });
    await userRepository.save(testUser);

    // Generate auth token
    authToken = jwtService.generateToken({
      id: testUser.id,
      email: testUser.email,
      userType: testUser.userType
    });
  });

  afterAll(async () => {
    // Clean up test data
    const userRepository = getRepository(User);
    await userRepository.delete({ id: testUser.id });
    server.close();
  });

  describe('GET /api/v1/users/profile', () => {
    it('should return user profile when authenticated (FR-006)', async () => {
      const response = await request(server)
        .get('/api/v1/users/profile')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: testUser.id,
        email: testUser.email,
        firstName: testUser.firstName,
        lastName: testUser.lastName,
        userType: testUser.userType
      });
      expect(response.body.data.password).toBeUndefined();
    });

    it('should return 401 when not authenticated (NFR-017)', async () => {
      const response = await request(server)
        .get('/api/v1/users/profile');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/v1/users/profile', () => {
    it('should update user profile successfully (FR-006)', async () => {
      const updateData = {
        firstName: 'Jane',
        lastName: 'Smith',
        phone: '+1234567890'
      };

      const response = await request(server)
        .put('/api/v1/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.firstName).toBe(updateData.firstName);
      expect(response.body.data.lastName).toBe(updateData.lastName);
      expect(response.body.data.phone).toBe(updateData.phone);
    });

    it('should validate phone number format (FR-008)', async () => {
      const response = await request(server)
        .put('/api/v1/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          phone: 'invalid-phone'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('PUT /api/v1/users/settings', () => {
    it('should update user settings (FR-010, FR-011)', async () => {
      const settingsData = {
        notifications: {
          email: false,
          sms: true,
          push: true
        },
        privacy: {
          showProfile: false,
          showLocation: true
        }
      };

      const response = await request(server)
        .put('/api/v1/users/settings')
        .set('Authorization', `Bearer ${authToken}`)
        .send(settingsData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.settings).toMatchObject(settingsData);
    });
  });

  describe('POST /api/v1/users/profile/image', () => {
    it('should reject non-image files (FR-007)', async () => {
      const response = await request(server)
        .post('/api/v1/users/profile/image')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('profileImage', Buffer.from('not an image'), 'test.txt');

      expect(response.status).toBe(500); // Multer error handling
    });

    it('should reject files over 10MB (NFR-004)', async () => {
      // Create a buffer larger than 10MB
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024);
      
      const response = await request(server)
        .post('/api/v1/users/profile/image')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('profileImage', largeBuffer, 'large.jpg');

      expect(response.status).toBe(500); // File too large error
    });
  });

  describe('DELETE /api/v1/users/profile', () => {
    it('should deactivate user account (SEC-018)', async () => {
      // Create a separate test user for deletion
      const userRepository = getRepository(User);
      const deleteUser = userRepository.create({
        email: 'delete@example.com',
        password: 'hashedPassword123',
        firstName: 'Delete',
        lastName: 'User',
        userType: UserType.CUSTOMER,
        isVerified: true,
        isActive: true
      });
      await userRepository.save(deleteUser);

      const deleteToken = jwtService.generateToken({
        id: deleteUser.id,
        email: deleteUser.email,
        userType: deleteUser.userType
      });

      const response = await request(server)
        .delete('/api/v1/users/profile')
        .set('Authorization', `Bearer ${deleteToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deactivated');

      // Verify user is deactivated, not deleted (data retention)
      const updatedUser = await userRepository.findOne({ where: { id: deleteUser.id } });
      expect(updatedUser).toBeDefined();
      expect(updatedUser?.isActive).toBe(false);

      // Clean up
      await userRepository.delete({ id: deleteUser.id });
    });
  });

  describe('GET /api/v1/users/:id', () => {
    it('should return public user profile', async () => {
      const response = await request(server)
        .get(`/api/v1/users/${testUser.id}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: testUser.id,
        firstName: testUser.firstName,
        lastName: testUser.lastName,
        userType: testUser.userType
      });
      expect(response.body.data.email).toBeUndefined();
      expect(response.body.data.password).toBeUndefined();
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(server)
        .get('/api/v1/users/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });
});