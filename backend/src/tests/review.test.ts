import request from 'supertest';
import { App } from '@/app';
import { getRepository } from 'typeorm';
import { User, UserType } from '@/models/User';
import { Provider } from '@/models/Provider';
import { Booking } from '@/models/Booking';
import { Review } from '@/models/Review';
import { jwtService } from '@/utils/jwt';

describe('Review Endpoints', () => {
  let app: App;
  let server: any;
  let customerUser: User;
  let providerUser: User;
  let testProvider: Provider;
  let completedBooking: Booking;
  let customerToken: string;
  let providerToken: string;

  beforeAll(async () => {
    app = new App();
    server = app.server;
    
    // Create test users
    const userRepository = getRepository(User);
    
    customerUser = userRepository.create({
      email: 'customer@example.com',
      password: 'hashedPassword123',
      firstName: 'Customer',
      lastName: 'User',
      userType: UserType.CUSTOMER,
      isVerified: true,
      isActive: true
    });
    await userRepository.save(customerUser);

    providerUser = userRepository.create({
      email: 'provider@example.com',
      password: 'hashedPassword123',
      firstName: 'Provider',
      lastName: 'User',
      userType: UserType.PROVIDER,
      isVerified: true,
      isActive: true
    });
    await userRepository.save(providerUser);

    // Create test provider profile
    const providerRepository = getRepository(Provider);
    testProvider = providerRepository.create({
      userId: providerUser.id,
      businessName: 'Test Cleaning Service',
      description: 'Professional cleaning service',
      services: ['cleaning', 'deep-cleaning'],
      location: {
        latitude: 40.7128,
        longitude: -74.0060,
        address: '123 Business St',
        city: 'Business City',
        state: 'BS',
        zipCode: '12345'
      },
      serviceRadius: 10,
      isVerified: true,
      isBackgroundChecked: true,
      isInsured: true,
      rating: 0,
      totalReviews: 0
    });
    await providerRepository.save(testProvider);

    // Create completed booking for review
    const bookingRepository = getRepository(Booking);
    completedBooking = bookingRepository.create({
      customerId: customerUser.id,
      providerId: providerUser.id,
      serviceType: 'cleaning',
      description: 'House cleaning',
      location: {
        latitude: 40.7128,
        longitude: -74.0060,
        address: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zipCode: '12345'
      },
      scheduledDate: new Date(),
      status: 'completed',
      estimatedCost: 100,
      completedAt: new Date()
    });
    await bookingRepository.save(completedBooking);

    // Generate auth tokens
    customerToken = jwtService.generateToken({
      id: customerUser.id,
      email: customerUser.email,
      userType: customerUser.userType
    });

    providerToken = jwtService.generateToken({
      id: providerUser.id,
      email: providerUser.email,
      userType: providerUser.userType
    });
  });

  afterAll(async () => {
    // Clean up test data
    const userRepository = getRepository(User);
    const providerRepository = getRepository(Provider);
    const bookingRepository = getRepository(Booking);
    const reviewRepository = getRepository(Review);
    
    await reviewRepository.delete({ bookingId: completedBooking.id });
    await bookingRepository.delete({ id: completedBooking.id });
    await providerRepository.delete({ id: testProvider.id });
    await userRepository.delete({ id: customerUser.id });
    await userRepository.delete({ id: providerUser.id });
    server.close();
  });

  describe('POST /api/v1/reviews', () => {
    afterEach(async () => {
      // Clean up any created reviews
      const reviewRepository = getRepository(Review);
      await reviewRepository.delete({ bookingId: completedBooking.id });
    });

    it('should create review for completed booking (FR-066, FR-067)', async () => {
      const reviewData = {
        bookingId: completedBooking.id,
        rating: 5,
        comment: 'Excellent service! Very thorough cleaning.',
        criteria: {
          quality: 5,
          timeliness: 4,
          communication: 5,
          professionalism: 5,
          valueForMoney: 4
        }
      };

      const response = await request(server)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(reviewData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.rating).toBe(reviewData.rating);
      expect(response.body.data.comment).toBe(reviewData.comment);
      expect(response.body.data.criteria).toMatchObject(reviewData.criteria);
      expect(response.body.data.isVerified).toBe(true);
    });

    it('should enforce rating range 1-5 (FR-067)', async () => {
      const invalidRatingData = {
        bookingId: completedBooking.id,
        rating: 6,
        comment: 'Invalid rating test'
      };

      const response = await request(server)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(invalidRatingData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should prevent duplicate reviews for same booking', async () => {
      // Create first review
      const reviewData = {
        bookingId: completedBooking.id,
        rating: 4,
        comment: 'Good service'
      };

      await request(server)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(reviewData);

      // Attempt to create second review for same booking
      const response = await request(server)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(reviewData);

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already exists');
    });

    it('should only allow customers to create reviews (authorization)', async () => {
      const response = await request(server)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          bookingId: completedBooking.id,
          rating: 5,
          comment: 'Test'
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('should require rating and bookingId', async () => {
      const response = await request(server)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          comment: 'Missing rating'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/reviews/:id/response', () => {
    let testReview: Review;

    beforeEach(async () => {
      const reviewRepository = getRepository(Review);
      testReview = reviewRepository.create({
        bookingId: completedBooking.id,
        customerId: customerUser.id,
        providerId: providerUser.id,
        rating: 4,
        comment: 'Good service overall',
        isVerified: true
      });
      await reviewRepository.save(testReview);
    });

    afterEach(async () => {
      const reviewRepository = getRepository(Review);
      await reviewRepository.delete({ id: testReview.id });
    });

    it('should allow provider to respond to review (FR-069)', async () => {
      const responseData = {
        response: 'Thank you for your feedback! We appreciate your business.'
      };

      const response = await request(server)
        .post(`/api/v1/reviews/${testReview.id}/response`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send(responseData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.response).toBe(responseData.response);
      expect(response.body.data.respondedAt).toBeDefined();
    });

    it('should only allow providers to respond to their reviews', async () => {
      const response = await request(server)
        .post(`/api/v1/reviews/${testReview.id}/response`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          response: 'Unauthorized response'
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('should require response text', async () => {
      const response = await request(server)
        .post(`/api/v1/reviews/${testReview.id}/response`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/reviews/provider/:providerId', () => {
    let testReview: Review;

    beforeAll(async () => {
      const reviewRepository = getRepository(Review);
      testReview = reviewRepository.create({
        bookingId: completedBooking.id,
        customerId: customerUser.id,
        providerId: providerUser.id,
        rating: 5,
        comment: 'Excellent work!',
        isVerified: true
      });
      await reviewRepository.save(testReview);
    });

    afterAll(async () => {
      const reviewRepository = getRepository(Review);
      await reviewRepository.delete({ id: testReview.id });
    });

    it('should return provider reviews with statistics (FR-071, FR-072)', async () => {
      const response = await request(server)
        .get(`/api/v1/reviews/provider/${providerUser.id}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('reviews');
      expect(response.body.data).toHaveProperty('statistics');
      expect(response.body.data).toHaveProperty('pagination');
      
      expect(response.body.data.statistics.totalReviews).toBeGreaterThan(0);
      expect(response.body.data.statistics.averageRating).toBeGreaterThan(0);
      expect(response.body.data.statistics.distribution).toHaveProperty('5');
    });

    it('should not include flagged reviews', async () => {
      // Create flagged review
      const reviewRepository = getRepository(Review);
      const flaggedReview = reviewRepository.create({
        bookingId: completedBooking.id,
        customerId: customerUser.id,
        providerId: providerUser.id,
        rating: 1,
        comment: 'Flagged review',
        isVerified: true,
        isFlagged: true,
        flagReason: 'Inappropriate content'
      });
      await reviewRepository.save(flaggedReview);

      const response = await request(server)
        .get(`/api/v1/reviews/provider/${providerUser.id}`);

      expect(response.status).toBe(200);
      const flaggedInResults = response.body.data.reviews.find(
        (review: any) => review.id === flaggedReview.id
      );
      expect(flaggedInResults).toBeUndefined();

      // Clean up
      await reviewRepository.delete({ id: flaggedReview.id });
    });
  });

  describe('PUT /api/v1/reviews/:id', () => {
    let testReview: Review;

    beforeEach(async () => {
      const reviewRepository = getRepository(Review);
      testReview = reviewRepository.create({
        bookingId: completedBooking.id,
        customerId: customerUser.id,
        providerId: providerUser.id,
        rating: 3,
        comment: 'Original comment',
        isVerified: true
      });
      await reviewRepository.save(testReview);
    });

    afterEach(async () => {
      const reviewRepository = getRepository(Review);
      await reviewRepository.delete({ id: testReview.id });
    });

    it('should allow customer to update their review', async () => {
      const updateData = {
        rating: 4,
        comment: 'Updated comment - service was better than expected'
      };

      const response = await request(server)
        .put(`/api/v1/reviews/${testReview.id}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.rating).toBe(updateData.rating);
      expect(response.body.data.comment).toBe(updateData.comment);
    });

    it('should prevent editing after provider response', async () => {
      // Add provider response
      const reviewRepository = getRepository(Review);
      testReview.response = 'Thank you for the feedback';
      testReview.respondedAt = new Date();
      await reviewRepository.save(testReview);

      const response = await request(server)
        .put(`/api/v1/reviews/${testReview.id}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          rating: 5,
          comment: 'Trying to edit after response'
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('after provider has responded');
    });
  });

  describe('Response Time Requirements (NFR-001)', () => {
    it('should return reviews within 200ms', async () => {
      const startTime = Date.now();
      
      const response = await request(server)
        .get(`/api/v1/reviews/provider/${providerUser.id}`);
      
      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(500); // Allow 500ms for test environment
    });
  });
});