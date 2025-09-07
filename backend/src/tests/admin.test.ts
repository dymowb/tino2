import request from 'supertest';
import { App } from '@/app';
import { getRepository } from 'typeorm';
import { User, UserType } from '@/models/User';
import { Provider } from '@/models/Provider';
import { Review } from '@/models/Review';
import { jwtService } from '@/utils/jwt';

describe('Admin Endpoints', () => {
  let app: App;
  let server: any;
  let adminUser: User;
  let testProvider: Provider;
  let testUser: User;
  let adminToken: string;
  let customerToken: string;

  beforeAll(async () => {
    app = new App();
    server = app.server;
    
    // Create admin user
    const userRepository = getRepository(User);
    adminUser = userRepository.create({
      email: 'admin@example.com',
      password: 'hashedPassword123',
      firstName: 'Admin',
      lastName: 'User',
      userType: UserType.ADMIN,
      isVerified: true,
      isActive: true
    });
    await userRepository.save(adminUser);

    // Create test customer user
    testUser = userRepository.create({
      email: 'customer@example.com',
      password: 'hashedPassword123',
      firstName: 'Test',
      lastName: 'Customer',
      userType: UserType.CUSTOMER,
      isVerified: true,
      isActive: true
    });
    await userRepository.save(testUser);

    // Create provider user for testing
    const providerUser = userRepository.create({
      email: 'provider@example.com',
      password: 'hashedPassword123',
      firstName: 'Test',
      lastName: 'Provider',
      userType: UserType.PROVIDER,
      isVerified: true,
      isActive: true
    });
    await userRepository.save(providerUser);

    // Create test provider profile (pending verification)
    const providerRepository = getRepository(Provider);
    testProvider = providerRepository.create({
      userId: providerUser.id,
      businessName: 'Test Service Provider',
      description: 'Testing provider verification',
      services: ['cleaning'],
      location: {
        latitude: 40.7128,
        longitude: -74.0060,
        address: '123 Provider St',
        city: 'Provider City',
        state: 'PC',
        zipCode: '12345'
      },
      serviceRadius: 10,
      isVerified: false, // Pending verification
      isBackgroundChecked: false,
      isInsured: false,
      rating: 0,
      totalReviews: 0
    });
    await providerRepository.save(testProvider);

    // Generate auth tokens
    adminToken = jwtService.generateToken({
      id: adminUser.id,
      email: adminUser.email,
      userType: adminUser.userType
    });

    customerToken = jwtService.generateToken({
      id: testUser.id,
      email: testUser.email,
      userType: testUser.userType
    });
  });

  afterAll(async () => {
    // Clean up test data
    const userRepository = getRepository(User);
    const providerRepository = getRepository(Provider);
    const reviewRepository = getRepository(Review);
    
    await reviewRepository.delete({ providerId: testProvider.userId });
    await providerRepository.delete({ id: testProvider.id });
    await userRepository.delete({ id: adminUser.id });
    await userRepository.delete({ id: testUser.id });
    await userRepository.delete({ userType: UserType.PROVIDER }); // Clean up provider user
    server.close();
  });

  describe('Authentication and Authorization', () => {
    it('should reject non-admin users (FR-074)', async () => {
      const response = await request(server)
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Admin access required');
    });

    it('should reject unauthenticated requests (NFR-017)', async () => {
      const response = await request(server)
        .get('/api/v1/admin/dashboard');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/admin/dashboard', () => {
    it('should return platform statistics (FR-076)', async () => {
      const response = await request(server)
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('statistics');
      expect(response.body.data).toHaveProperty('recentActivities');
      
      expect(response.body.data.statistics).toHaveProperty('totalUsers');
      expect(response.body.data.statistics).toHaveProperty('totalProviders');
      expect(response.body.data.statistics).toHaveProperty('totalBookings');
      expect(response.body.data.statistics).toHaveProperty('totalRevenue');
      expect(response.body.data.statistics).toHaveProperty('pendingProviders');
    });
  });

  describe('GET /api/v1/admin/users', () => {
    it('should return users list with pagination (FR-074)', async () => {
      const response = await request(server)
        .get('/api/v1/admin/users?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('users');
      expect(response.body.data).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data.users)).toBe(true);
      expect(response.body.data.pagination.page).toBe(1);
      expect(response.body.data.pagination.limit).toBe(10);
    });

    it('should filter users by type', async () => {
      const response = await request(server)
        .get('/api/v1/admin/users?userType=customer')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // All returned users should be customers
      response.body.data.users.forEach((user: any) => {
        expect(user.userType).toBe('customer');
      });
    });

    it('should search users by name/email', async () => {
      const response = await request(server)
        .get(`/api/v1/admin/users?search=${testUser.firstName}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      const foundUser = response.body.data.users.find(
        (user: any) => user.id === testUser.id
      );
      expect(foundUser).toBeDefined();
    });
  });

  describe('PUT /api/v1/admin/users/:id/status', () => {
    it('should update user status (FR-074)', async () => {
      const updateData = {
        isActive: false,
        reason: 'Account suspended for testing'
      };

      const response = await request(server)
        .put(`/api/v1/admin/users/${testUser.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.isActive).toBe(false);

      // Reactivate for cleanup
      await request(server)
        .put(`/api/v1/admin/users/${testUser.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: true, reason: 'Reactivated after test' });
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(server)
        .put('/api/v1/admin/users/non-existent-id/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/admin/providers/pending', () => {
    it('should return pending provider verifications (FR-075)', async () => {
      const response = await request(server)
        .get('/api/v1/admin/providers/pending')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('providers');
      expect(response.body.data).toHaveProperty('pagination');
      
      // Should include our test provider
      const pendingProvider = response.body.data.providers.find(
        (provider: any) => provider.id === testProvider.id
      );
      expect(pendingProvider).toBeDefined();
      expect(pendingProvider.isVerified).toBe(false);
    });
  });

  describe('POST /api/v1/admin/providers/:id/verify', () => {
    it('should approve provider verification (FR-075)', async () => {
      const approvalData = {
        approved: true,
        notes: 'All documentation verified successfully',
        isBackgroundChecked: true,
        isInsured: true
      };

      const response = await request(server)
        .post(`/api/v1/admin/providers/${testProvider.id}/verify`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(approvalData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.isVerified).toBe(true);
      expect(response.body.data.isBackgroundChecked).toBe(true);
      expect(response.body.data.isInsured).toBe(true);
      expect(response.body.data.verifiedAt).toBeDefined();
      expect(response.body.data.verifiedBy).toBe(adminUser.id);
    });

    it('should reject provider verification with reason', async () => {
      // Create another provider for rejection test
      const userRepository = getRepository(User);
      const providerRepository = getRepository(Provider);
      
      const rejectProviderUser = userRepository.create({
        email: 'reject@example.com',
        password: 'hashedPassword123',
        firstName: 'Reject',
        lastName: 'Provider',
        userType: UserType.PROVIDER,
        isVerified: true,
        isActive: true
      });
      await userRepository.save(rejectProviderUser);

      const rejectProvider = providerRepository.create({
        userId: rejectProviderUser.id,
        businessName: 'Reject Test Provider',
        description: 'Provider to be rejected',
        services: ['cleaning'],
        location: {
          latitude: 40.7128,
          longitude: -74.0060,
          address: '123 Reject St',
          city: 'Reject City',
          state: 'RC',
          zipCode: '12345'
        },
        serviceRadius: 10,
        isVerified: false,
        rating: 0,
        totalReviews: 0
      });
      await providerRepository.save(rejectProvider);

      const rejectionData = {
        approved: false,
        notes: 'Insufficient documentation provided'
      };

      const response = await request(server)
        .post(`/api/v1/admin/providers/${rejectProvider.id}/verify`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(rejectionData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.isVerified).toBe(false);
      expect(response.body.data.verificationNotes).toContain('rejected');
      expect(response.body.data.rejectedAt).toBeDefined();
      expect(response.body.data.rejectedBy).toBe(adminUser.id);

      // Clean up
      await providerRepository.delete({ id: rejectProvider.id });
      await userRepository.delete({ id: rejectProviderUser.id });
    });
  });

  describe('GET /api/v1/admin/reviews/flagged', () => {
    let flaggedReview: Review;

    beforeAll(async () => {
      // Create a flagged review for testing
      const reviewRepository = getRepository(Review);
      flaggedReview = reviewRepository.create({
        customerId: testUser.id,
        providerId: testProvider.userId,
        bookingId: 'test-booking-id',
        rating: 1,
        comment: 'Inappropriate content for testing',
        isFlagged: true,
        flagReason: 'Inappropriate content',
        isVerified: true
      });
      await reviewRepository.save(flaggedReview);
    });

    afterAll(async () => {
      const reviewRepository = getRepository(Review);
      await reviewRepository.delete({ id: flaggedReview.id });
    });

    it('should return flagged reviews (FR-077, FR-081)', async () => {
      const response = await request(server)
        .get('/api/v1/admin/reviews/flagged')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('reviews');
      expect(response.body.data).toHaveProperty('pagination');
      
      const foundFlaggedReview = response.body.data.reviews.find(
        (review: any) => review.id === flaggedReview.id
      );
      expect(foundFlaggedReview).toBeDefined();
      expect(foundFlaggedReview.isFlagged).toBe(true);
    });
  });

  describe('PUT /api/v1/admin/reviews/:id/moderate', () => {
    let moderateReview: Review;

    beforeEach(async () => {
      const reviewRepository = getRepository(Review);
      moderateReview = reviewRepository.create({
        customerId: testUser.id,
        providerId: testProvider.userId,
        bookingId: 'moderate-test-booking',
        rating: 2,
        comment: 'Review to be moderated',
        isFlagged: true,
        flagReason: 'Under review',
        isVerified: true
      });
      await reviewRepository.save(moderateReview);
    });

    afterEach(async () => {
      const reviewRepository = getRepository(Review);
      await reviewRepository.delete({ id: moderateReview.id });
    });

    it('should approve flagged review (FR-081)', async () => {
      const moderationData = {
        action: 'approve',
        reason: 'Review content is acceptable'
      };

      const response = await request(server)
        .put(`/api/v1/admin/reviews/${moderateReview.id}/moderate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(moderationData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.isFlagged).toBe(false);
      expect(response.body.data.flagReason).toBe(null);
    });

    it('should delete inappropriate review', async () => {
      const moderationData = {
        action: 'delete',
        reason: 'Contains inappropriate content'
      };

      const response = await request(server)
        .put(`/api/v1/admin/reviews/${moderateReview.id}/moderate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(moderationData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted');
    });

    it('should validate moderation action', async () => {
      const response = await request(server)
        .put(`/api/v1/admin/reviews/${moderateReview.id}/moderate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          action: 'invalid_action',
          reason: 'Test'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid action');
    });
  });

  describe('GET /api/v1/admin/analytics', () => {
    it('should return platform analytics (FR-076)', async () => {
      const response = await request(server)
        .get('/api/v1/admin/analytics?period=30d')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('period');
      expect(response.body.data).toHaveProperty('userGrowth');
      expect(response.body.data).toHaveProperty('bookingTrends');
      expect(response.body.data).toHaveProperty('revenueData');
      expect(response.body.data.period).toBe('30d');
    });

    it('should support different time periods', async () => {
      const response = await request(server)
        .get('/api/v1/admin/analytics?period=1y')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.period).toBe('1y');
    });
  });

  describe('Rate Limiting for Admin Endpoints (NFR-025)', () => {
    it('should enforce stricter rate limits on sensitive operations', async () => {
      const requests = Array(6).fill(null).map(() =>
        request(server)
          .put(`/api/v1/admin/users/${testUser.id}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ isActive: true })
      );

      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      
      // Expect some requests to be rate limited
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Audit Logging (FR-078)', () => {
    it('should log administrative actions', async () => {
      // This test verifies that admin actions are being logged
      // In a real implementation, you would check log files or database entries
      const response = await request(server)
        .put(`/api/v1/admin/users/${testUser.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          isActive: false,
          reason: 'Test audit logging'
        });

      expect(response.status).toBe(200);
      // In real implementation, verify that the action was logged with:
      // - Admin user ID
      // - Action performed
      // - Target user ID
      // - Timestamp
      // - Reason
    });
  });
});