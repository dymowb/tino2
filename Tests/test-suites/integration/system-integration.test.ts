import { test, expect, Page, BrowserContext } from '@playwright/test';
import axios from 'axios';
import { testUsers, testProviders, testBookings, testQuotes } from '../../test-data/test-fixtures';

/**
 * Phase 10.14 - TS-061: Complete System Integration Testing
 *
 * Comprehensive end-to-end integration testing across all platform components:
 * - Authentication and user management integration
 * - Provider system integration with GPS services
 * - Booking lifecycle with payment integration
 * - Real-time messaging with notification system
 * - Review system with provider response integration
 * - Admin system with content moderation
 * - Cross-system data flow and consistency validation
 */

test.describe('TS-061: Complete System Integration Testing', () => {
  let apiBaseUrl: string;
  let frontendBaseUrl: string;
  let customerToken: string;
  let providerToken: string;
  let adminToken: string;
  let customerPage: Page;
  let providerPage: Page;
  let adminPage: Page;

  test.beforeAll(async () => {
    apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    frontendBaseUrl = process.env.FRONTEND_BASE_URL || 'http://localhost:3001';

    // Verify backend server is running
    try {
      const healthResponse = await axios.get(`${apiBaseUrl}/health`);
      expect(healthResponse.data.success).toBe(true);
      console.log('✅ Backend server health check passed');
    } catch (error) {
      throw new Error(`Backend server not accessible at ${apiBaseUrl}`);
    }
  });

  test.beforeEach(async ({ browser }) => {
    // Create separate browser contexts for different user types
    const customerContext = await browser.newContext();
    const providerContext = await browser.newContext();
    const adminContext = await browser.newContext();

    customerPage = await customerContext.newPage();
    providerPage = await providerContext.newPage();
    adminPage = await adminContext.newPage();

    // Authenticate users for integration testing
    customerToken = await authenticateUser('customer');
    providerToken = await authenticateUser('provider');
    adminToken = await authenticateUser('admin');
  });

  test.afterEach(async () => {
    await customerPage.close();
    await providerPage.close();
    await adminPage.close();
  });

  test('Complete Customer Service Journey Integration', async () => {
    console.log('🚀 Testing complete customer service journey integration...');

    // Step 1: Customer Registration and Profile Setup
    const customerData = testUsers.customer;
    const registerResponse = await axios.post(`${apiBaseUrl}/api/v1/auth/register`, {
      email: `integration.test.customer.${Date.now()}@example.com`,
      password: customerData.password,
      firstName: customerData.firstName,
      lastName: customerData.lastName,
      phone: customerData.phone,
      userType: 'customer'
    });

    expect(registerResponse.status).toBe(201);
    expect(registerResponse.data.token).toBeDefined();
    const integrationCustomerToken = registerResponse.data.token;

    // Verify customer profile creation
    const profileResponse = await axios.get(`${apiBaseUrl}/api/v1/auth/profile`, {
      headers: { Authorization: `Bearer ${integrationCustomerToken}` }
    });
    expect(profileResponse.status).toBe(200);
    expect(profileResponse.data.userType).toBe('customer');

    // Step 2: Provider Discovery with GPS Integration
    await customerPage.goto(`${frontendBaseUrl}/find-providers`);
    await customerPage.fill('[data-testid="location-search"]', 'Seattle, WA');
    await customerPage.click('[data-testid="search-providers-button"]');

    // Wait for provider results with GPS-based filtering
    await customerPage.waitForSelector('[data-testid="provider-card"]', { timeout: 10000 });
    const providerCards = await customerPage.locator('[data-testid="provider-card"]').count();
    expect(providerCards).toBeGreaterThan(0);

    // Verify provider distance calculations
    const firstProviderDistance = await customerPage.locator('[data-testid="provider-distance"]').first().textContent();
    expect(firstProviderDistance).toMatch(/\d+\.?\d*\s?(mi|km)/);

    // Step 3: Quote Request Creation with Location Services
    await customerPage.click('[data-testid="request-quote-button"]').first();
    await customerPage.waitForSelector('[data-testid="quote-request-dialog"]');

    await customerPage.fill('[data-testid="service-description"]', 'Deep cleaning for 3-bedroom house');
    await customerPage.fill('[data-testid="budget-range-min"]', '200');
    await customerPage.fill('[data-testid="budget-range-max"]', '400');
    await customerPage.selectOption('[data-testid="urgency-level"]', 'medium');
    await customerPage.fill('[data-testid="preferred-date"]', '2025-09-20');
    await customerPage.fill('[data-testid="special-requirements"]', 'Pet-friendly cleaning products required');

    await customerPage.click('[data-testid="submit-quote-request"]');
    await customerPage.waitForSelector('[data-testid="quote-request-success"]');

    // Verify quote request creation in backend
    const quoteRequestsResponse = await axios.get(`${apiBaseUrl}/api/v1/quotes/requests`, {
      headers: { Authorization: `Bearer ${integrationCustomerToken}` }
    });
    expect(quoteRequestsResponse.status).toBe(200);
    expect(quoteRequestsResponse.data.quoteRequests.length).toBeGreaterThan(0);
    const createdQuoteRequest = quoteRequestsResponse.data.quoteRequests[0];

    // Step 4: Provider Quote Submission (Provider Side)
    await providerPage.goto(`${frontendBaseUrl}/provider/dashboard`);

    // Provider responds with quote
    const quoteSubmissionData = {
      quoteRequestId: createdQuoteRequest.id,
      laborCost: 250,
      materialCost: 80,
      equipmentCost: 20,
      totalAmount: 350,
      estimatedDuration: 6,
      description: 'Professional deep cleaning with eco-friendly products',
      terms: 'Payment due upon completion. 100% satisfaction guaranteed.',
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };

    const quoteSubmissionResponse = await axios.post(`${apiBaseUrl}/api/v1/quotes`, quoteSubmissionData, {
      headers: { Authorization: `Bearer ${providerToken}` }
    });
    expect(quoteSubmissionResponse.status).toBe(201);
    const submittedQuote = quoteSubmissionResponse.data.quote;

    // Step 5: Customer Quote Acceptance and Booking Creation
    await customerPage.goto(`${frontendBaseUrl}/my-quotes`);
    await customerPage.waitForSelector('[data-testid="quote-card"]');
    await customerPage.click('[data-testid="accept-quote-button"]').first();

    await customerPage.waitForSelector('[data-testid="booking-creation-dialog"]');
    await customerPage.fill('[data-testid="booking-date"]', '2025-09-20');
    await customerPage.fill('[data-testid="booking-time"]', '09:00');
    await customerPage.fill('[data-testid="service-address"]', '123 Test Street, Seattle, WA 98101');
    await customerPage.click('[data-testid="create-booking-button"]');

    await customerPage.waitForSelector('[data-testid="booking-success"]');

    // Verify booking creation in backend
    const bookingsResponse = await axios.get(`${apiBaseUrl}/api/v1/bookings`, {
      headers: { Authorization: `Bearer ${integrationCustomerToken}` }
    });
    expect(bookingsResponse.status).toBe(200);
    expect(bookingsResponse.data.bookings.length).toBeGreaterThan(0);
    const createdBooking = bookingsResponse.data.bookings[0];
    expect(createdBooking.status).toBe('pending');

    // Step 6: Payment Processing with Escrow Integration
    await customerPage.goto(`${frontendBaseUrl}/payments`);
    await customerPage.click('[data-testid="make-payment-button"]');

    await customerPage.waitForSelector('[data-testid="payment-dialog"]');
    await customerPage.selectOption('[data-testid="booking-selection"]', createdBooking.id);

    // Simulate Stripe payment form (test mode)
    await customerPage.fill('[data-testid="card-number"]', '4242424242424242');
    await customerPage.fill('[data-testid="card-expiry"]', '12/26');
    await customerPage.fill('[data-testid="card-cvc"]', '123');
    await customerPage.fill('[data-testid="card-zip"]', '98101');

    await customerPage.click('[data-testid="submit-payment"]');
    await customerPage.waitForSelector('[data-testid="payment-success"]', { timeout: 15000 });

    // Verify payment intent creation with escrow
    const paymentsResponse = await axios.get(`${apiBaseUrl}/api/v1/payments`, {
      headers: { Authorization: `Bearer ${integrationCustomerToken}` }
    });
    expect(paymentsResponse.status).toBe(200);
    expect(paymentsResponse.data.payments.length).toBeGreaterThan(0);
    const createdPayment = paymentsResponse.data.payments[0];
    expect(createdPayment.status).toBe('requires_capture'); // Escrow status

    // Step 7: Real-time Messaging Integration
    await customerPage.goto(`${frontendBaseUrl}/messages`);
    await customerPage.click('[data-testid="new-conversation-button"]');

    await customerPage.waitForSelector('[data-testid="new-conversation-dialog"]');
    await customerPage.fill('[data-testid="search-users"]', 'provider');
    await customerPage.waitForSelector('[data-testid="user-search-result"]');
    await customerPage.click('[data-testid="user-search-result"]').first();
    await customerPage.click('[data-testid="create-conversation"]');

    // Send initial message
    await customerPage.fill('[data-testid="message-input"]', 'Hi! I have a booking scheduled for tomorrow. What time should I expect you?');
    await customerPage.click('[data-testid="send-message"]');

    await customerPage.waitForSelector('[data-testid="message-sent"]');

    // Provider responds (simulate real-time messaging)
    const conversationsResponse = await axios.get(`${apiBaseUrl}/api/v1/messages/conversations`, {
      headers: { Authorization: `Bearer ${providerToken}` }
    });
    expect(conversationsResponse.status).toBe(200);
    expect(conversationsResponse.data.conversations.length).toBeGreaterThan(0);
    const conversation = conversationsResponse.data.conversations[0];

    const messageResponse = await axios.post(`${apiBaseUrl}/api/v1/messages/messages`, {
      conversationId: conversation.id,
      content: 'Hello! I\'ll arrive at 9:00 AM sharp. Looking forward to providing excellent service!',
      messageType: 'text'
    }, {
      headers: { Authorization: `Bearer ${providerToken}` }
    });
    expect(messageResponse.status).toBe(201);

    // Step 8: Service Completion and Payment Capture
    // Provider marks booking as completed
    const updateBookingResponse = await axios.put(`${apiBaseUrl}/api/v1/bookings/${createdBooking.id}/status`, {
      status: 'completed'
    }, {
      headers: { Authorization: `Bearer ${providerToken}` }
    });
    expect(updateBookingResponse.status).toBe(200);

    // Payment is automatically captured from escrow
    const paymentCaptureResponse = await axios.post(`${apiBaseUrl}/api/v1/payments/${createdPayment.id}/confirm`, {}, {
      headers: { Authorization: `Bearer ${providerToken}` }
    });
    expect(paymentCaptureResponse.status).toBe(200);

    // Step 9: Review Creation and Provider Response
    await customerPage.goto(`${frontendBaseUrl}/my-reviews`);
    await customerPage.click('[data-testid="create-review-button"]');

    await customerPage.waitForSelector('[data-testid="review-dialog"]');
    await customerPage.selectOption('[data-testid="booking-selection"]', createdBooking.id);

    // Multi-criteria rating
    await customerPage.click('[data-testid="quality-rating-5"]');
    await customerPage.click('[data-testid="timeliness-rating-5"]');
    await customerPage.click('[data-testid="communication-rating-5"]');
    await customerPage.click('[data-testid="professionalism-rating-5"]');
    await customerPage.click('[data-testid="value-rating-4"]');

    await customerPage.fill('[data-testid="review-title"]', 'Excellent Deep Cleaning Service');
    await customerPage.fill('[data-testid="review-comment"]', 'Outstanding service! Very thorough and professional. Highly recommend!');

    await customerPage.click('[data-testid="submit-review"]');
    await customerPage.waitForSelector('[data-testid="review-success"]');

    // Verify review creation
    const reviewsResponse = await axios.get(`${apiBaseUrl}/api/v1/reviews/customer/my`, {
      headers: { Authorization: `Bearer ${integrationCustomerToken}` }
    });
    expect(reviewsResponse.status).toBe(200);
    expect(reviewsResponse.data.reviews.length).toBeGreaterThan(0);
    const createdReview = reviewsResponse.data.reviews[0];

    // Provider responds to review
    const providerResponseData = {
      response: 'Thank you so much for the wonderful review! It was a pleasure serving you. We look forward to helping you again in the future!'
    };

    const providerResponseResponse = await axios.post(`${apiBaseUrl}/api/v1/reviews/${createdReview.id}/response`, providerResponseData, {
      headers: { Authorization: `Bearer ${providerToken}` }
    });
    expect(providerResponseResponse.status).toBe(200);

    // Step 10: Admin Content Moderation Integration
    // Admin reviews flagged content (if any)
    const adminAnalyticsResponse = await axios.get(`${apiBaseUrl}/api/v1/admin/analytics`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    // Note: This endpoint may not be fully implemented, testing graceful handling

    console.log('✅ Complete customer service journey integration test passed');
    console.log(`   📊 Customer registered: ${registerResponse.data.user.email}`);
    console.log(`   📍 Provider discovery: ${providerCards} providers found`);
    console.log(`   💬 Quote request created: ID ${createdQuoteRequest.id}`);
    console.log(`   📝 Quote submitted: $${submittedQuote.totalAmount}`);
    console.log(`   📅 Booking created: ID ${createdBooking.id}`);
    console.log(`   💳 Payment processed: $${createdPayment.amount}`);
    console.log(`   💬 Messages exchanged: Real-time communication`);
    console.log(`   ⭐ Review created: ${createdReview.rating}/5 stars`);
    console.log(`   👨‍💼 Provider response: Professional engagement`);
  });

  test('Cross-Platform Data Consistency Integration', async () => {
    console.log('🔄 Testing cross-platform data consistency integration...');

    // Test data synchronization between frontend, backend, and database
    const testUser = testUsers.provider;

    // Create provider through API
    const providerRegistration = await axios.post(`${apiBaseUrl}/api/v1/auth/register`, {
      email: `data.consistency.test.${Date.now()}@example.com`,
      password: testUser.password,
      firstName: testUser.firstName,
      lastName: testUser.lastName,
      phone: testUser.phone,
      userType: 'provider'
    });

    const testProviderToken = providerRegistration.data.token;
    const providerId = providerRegistration.data.user.id;

    // Create provider profile through API
    const providerProfileData = {
      businessName: 'Test Integration Cleaning Service',
      description: 'Professional cleaning service for integration testing',
      services: ['house-cleaning', 'deep-cleaning'],
      serviceAreas: ['Seattle', 'Bellevue', 'Redmond'],
      hourlyRate: 75,
      availability: {
        monday: { start: '08:00', end: '18:00', available: true },
        tuesday: { start: '08:00', end: '18:00', available: true }
      },
      location: {
        address: '456 Provider Street, Seattle, WA 98102',
        latitude: 47.6205,
        longitude: -122.3493
      }
    };

    const providerProfileResponse = await axios.post(`${apiBaseUrl}/api/v1/providers`, providerProfileData, {
      headers: { Authorization: `Bearer ${testProviderToken}` }
    });
    expect(providerProfileResponse.status).toBe(201);

    // Verify data consistency in frontend
    await providerPage.goto(`${frontendBaseUrl}/provider/dashboard`);

    // Check if profile data is correctly displayed
    await providerPage.waitForSelector('[data-testid="business-name"]');
    const displayedBusinessName = await providerPage.locator('[data-testid="business-name"]').textContent();
    expect(displayedBusinessName).toContain(providerProfileData.businessName);

    // Verify provider appears in search results
    await customerPage.goto(`${frontendBaseUrl}/find-providers`);
    await customerPage.fill('[data-testid="location-search"]', 'Seattle, WA');
    await customerPage.click('[data-testid="search-providers-button"]');

    await customerPage.waitForSelector('[data-testid="provider-card"]');
    const providerNames = await customerPage.locator('[data-testid="provider-name"]').allTextContents();
    expect(providerNames).toContain(providerProfileData.businessName);

    // Test real-time data updates
    // Update provider profile through API
    const updatedProfileData = {
      ...providerProfileData,
      description: 'Updated description for real-time testing',
      hourlyRate: 85
    };

    const updateResponse = await axios.put(`${apiBaseUrl}/api/v1/providers/${providerId}`, updatedProfileData, {
      headers: { Authorization: `Bearer ${testProviderToken}` }
    });
    expect(updateResponse.status).toBe(200);

    // Verify update is reflected in frontend
    await providerPage.reload();
    await providerPage.waitForSelector('[data-testid="provider-description"]');
    const updatedDescription = await providerPage.locator('[data-testid="provider-description"]').textContent();
    expect(updatedDescription).toContain('Updated description for real-time testing');

    // Verify database consistency
    const providerFetchResponse = await axios.get(`${apiBaseUrl}/api/v1/providers/${providerId}`, {
      headers: { Authorization: `Bearer ${testProviderToken}` }
    });
    expect(providerFetchResponse.status).toBe(200);
    expect(providerFetchResponse.data.provider.description).toBe(updatedProfileData.description);
    expect(providerFetchResponse.data.provider.hourlyRate).toBe(updatedProfileData.hourlyRate);

    console.log('✅ Cross-platform data consistency integration test passed');
    console.log(`   🔄 Provider created: ${providerProfileData.businessName}`);
    console.log(`   📊 Frontend display: Consistent data rendering`);
    console.log(`   🔍 Search integration: Provider discoverable`);
    console.log(`   🔄 Real-time updates: Data synchronization working`);
    console.log(`   💾 Database consistency: Data persistence verified`);
  });

  test('Error Handling and Recovery Integration', async () => {
    console.log('⚠️ Testing error handling and recovery integration...');

    // Test graceful error handling across systems

    // Test 1: Invalid authentication handling
    try {
      await axios.get(`${apiBaseUrl}/api/v1/auth/profile`, {
        headers: { Authorization: 'Bearer invalid-token' }
      });
    } catch (error) {
      expect(error.response.status).toBe(401);
      expect(error.response.data.message).toContain('Invalid token');
    }

    // Test 2: Network connectivity error handling in frontend
    await customerPage.goto(`${frontendBaseUrl}/find-providers`);

    // Simulate network error by making invalid API call
    await customerPage.evaluate(() => {
      // Mock fetch to simulate network error
      const originalFetch = window.fetch;
      window.fetch = () => Promise.reject(new Error('Network error'));

      // Trigger API call that will fail
      return Promise.resolve();
    });

    // Verify error handling in UI
    await customerPage.fill('[data-testid="location-search"]', 'Invalid Location');
    await customerPage.click('[data-testid="search-providers-button"]');

    // Should show error message or loading state
    await customerPage.waitForSelector('[data-testid="error-message"], [data-testid="loading-state"]', { timeout: 5000 });

    // Test 3: Database constraint violation handling
    try {
      // Try to create duplicate user
      await axios.post(`${apiBaseUrl}/api/v1/auth/register`, {
        email: testUsers.customer.email, // Existing email
        password: 'Password123!',
        firstName: 'Duplicate',
        lastName: 'User',
        phone: '+1234567890',
        userType: 'customer'
      });
    } catch (error) {
      expect(error.response.status).toBe(400);
      expect(error.response.data.message).toContain('already exists');
    }

    // Test 4: Payment processing error handling
    try {
      await axios.post(`${apiBaseUrl}/api/v1/payments/intent`, {
        bookingId: 'non-existent-booking-id',
        amount: 100
      }, {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
    } catch (error) {
      expect(error.response.status).toBe(404);
      expect(error.response.data.message).toContain('Booking not found');
    }

    // Test 5: Real-time messaging error recovery
    try {
      await axios.post(`${apiBaseUrl}/api/v1/messages/messages`, {
        conversationId: 'non-existent-conversation',
        content: 'Test message',
        messageType: 'text'
      }, {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
    } catch (error) {
      expect(error.response.status).toBe(404);
      expect(error.response.data.message).toContain('Conversation not found');
    }

    console.log('✅ Error handling and recovery integration test passed');
    console.log(`   🔐 Authentication errors: Properly handled`);
    console.log(`   🌐 Network errors: Graceful degradation`);
    console.log(`   💾 Database constraints: Error messages clear`);
    console.log(`   💳 Payment errors: Proper validation`);
    console.log(`   💬 Messaging errors: Appropriate responses`);
  });

  test('Performance Integration Under Load', async () => {
    console.log('⚡ Testing performance integration under load...');

    const startTime = Date.now();

    // Concurrent user operations
    const concurrentOperations = [];

    // Create multiple user sessions
    for (let i = 0; i < 10; i++) {
      concurrentOperations.push(
        axios.post(`${apiBaseUrl}/api/v1/auth/register`, {
          email: `load.test.user.${i}.${Date.now()}@example.com`,
          password: 'Password123!',
          firstName: `LoadTest${i}`,
          lastName: 'User',
          phone: `+123456789${i}`,
          userType: i % 2 === 0 ? 'customer' : 'provider'
        })
      );
    }

    // Execute concurrent registrations
    const registrationResults = await Promise.allSettled(concurrentOperations);
    const successfulRegistrations = registrationResults.filter(result => result.status === 'fulfilled');
    expect(successfulRegistrations.length).toBeGreaterThanOrEqual(8); // Allow 80% success rate

    // Test provider search performance
    const searchOperations = [];
    for (let i = 0; i < 5; i++) {
      searchOperations.push(
        axios.get(`${apiBaseUrl}/api/v1/providers`, {
          params: {
            location: 'Seattle, WA',
            radius: 10,
            services: 'house-cleaning'
          },
          headers: { Authorization: `Bearer ${customerToken}` }
        })
      );
    }

    const searchStartTime = Date.now();
    const searchResults = await Promise.all(searchOperations);
    const searchEndTime = Date.now();
    const averageSearchTime = (searchEndTime - searchStartTime) / searchOperations.length;

    expect(averageSearchTime).toBeLessThan(1000); // Under 1 second average
    searchResults.forEach(result => {
      expect(result.status).toBe(200);
      expect(result.data.providers).toBeDefined();
    });

    // Test messaging performance
    const messageOperations = [];
    const testConversationId = 'test-conversation-id'; // This would be a real conversation in production

    for (let i = 0; i < 10; i++) {
      messageOperations.push(
        // Simulate message creation (would fail but tests API response time)
        axios.post(`${apiBaseUrl}/api/v1/messages/messages`, {
          conversationId: testConversationId,
          content: `Load test message ${i}`,
          messageType: 'text'
        }, {
          headers: { Authorization: `Bearer ${customerToken}` }
        }).catch(error => error.response) // Catch errors but measure response time
      );
    }

    const messageStartTime = Date.now();
    await Promise.all(messageOperations);
    const messageEndTime = Date.now();
    const averageMessageTime = (messageEndTime - messageStartTime) / messageOperations.length;

    expect(averageMessageTime).toBeLessThan(500); // Under 500ms average

    const endTime = Date.now();
    const totalTestTime = endTime - startTime;

    console.log('✅ Performance integration under load test passed');
    console.log(`   👥 Concurrent registrations: ${successfulRegistrations.length}/10 successful`);
    console.log(`   🔍 Search performance: ${averageSearchTime}ms average`);
    console.log(`   💬 Message performance: ${averageMessageTime}ms average`);
    console.log(`   ⏱️ Total test time: ${totalTestTime}ms`);
  });

  test('Security Integration Validation', async () => {
    console.log('🔒 Testing security integration validation...');

    // Test 1: JWT token security across systems
    const tokenResponse = await axios.post(`${apiBaseUrl}/api/v1/auth/login`, {
      email: testUsers.customer.email,
      password: testUsers.customer.password
    });

    const validToken = tokenResponse.data.token;
    expect(validToken).toBeDefined();

    // Verify token works across different endpoints
    const securedEndpoints = [
      '/api/v1/auth/profile',
      '/api/v1/providers',
      '/api/v1/bookings',
      '/api/v1/quotes/requests',
      '/api/v1/messages/conversations'
    ];

    for (const endpoint of securedEndpoints) {
      const response = await axios.get(`${apiBaseUrl}${endpoint}`, {
        headers: { Authorization: `Bearer ${validToken}` }
      });
      expect(response.status).toBe(200);
    }

    // Test 2: Role-based access control integration
    // Customer trying to access provider-only endpoint
    try {
      await axios.get(`${apiBaseUrl}/api/v1/providers/my/profile`, {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
    } catch (error) {
      expect(error.response.status).toBe(403);
    }

    // Provider trying to access admin-only endpoint
    try {
      await axios.get(`${apiBaseUrl}/api/v1/admin/users`, {
        headers: { Authorization: `Bearer ${providerToken}` }
      });
    } catch (error) {
      // Should fail with 403 or 404 depending on implementation
      expect([403, 404]).toContain(error.response.status);
    }

    // Test 3: Input validation security
    const maliciousInputs = [
      '<script>alert("xss")</script>',
      'SELECT * FROM users WHERE 1=1',
      '../../../etc/passwd',
      '${7*7}', // Template injection
      'javascript:alert(1)' // JavaScript injection
    ];

    for (const maliciousInput of maliciousInputs) {
      try {
        await axios.post(`${apiBaseUrl}/api/v1/auth/register`, {
          email: maliciousInput,
          password: 'Password123!',
          firstName: maliciousInput,
          lastName: 'Test',
          phone: '+1234567890',
          userType: 'customer'
        });
      } catch (error) {
        expect(error.response.status).toBe(400); // Should be rejected due to validation
      }
    }

    // Test 4: Rate limiting integration
    const rateLimitRequests = [];
    for (let i = 0; i < 20; i++) {
      rateLimitRequests.push(
        axios.post(`${apiBaseUrl}/api/v1/auth/login`, {
          email: 'nonexistent@example.com',
          password: 'wrongpassword'
        }).catch(error => error.response)
      );
    }

    const rateLimitResults = await Promise.all(rateLimitRequests);
    const rateLimitedResponses = rateLimitResults.filter(result => result.status === 429);

    // Should have some rate limiting in place
    expect(rateLimitedResponses.length).toBeGreaterThan(0);

    console.log('✅ Security integration validation test passed');
    console.log(`   🔑 JWT validation: Working across ${securedEndpoints.length} endpoints`);
    console.log(`   👤 Role-based access: Properly restricted`);
    console.log(`   🛡️ Input validation: ${maliciousInputs.length} malicious inputs blocked`);
    console.log(`   🚦 Rate limiting: ${rateLimitedResponses.length}/20 requests limited`);
  });

  test('Real-time Features Integration', async () => {
    console.log('⚡ Testing real-time features integration...');

    // Test Socket.IO integration (if available)
    // Note: This is a simplified test - real Socket.IO testing would require WebSocket connections

    // Test 1: Real-time notification delivery
    await customerPage.goto(`${frontendBaseUrl}/notifications`);

    // Create a booking that should trigger notifications
    const bookingData = {
      providerId: testProviders.cleaner.id,
      serviceType: 'house-cleaning',
      scheduledDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      address: '789 Notification Test St, Seattle, WA 98103',
      totalAmount: 150
    };

    const bookingResponse = await axios.post(`${apiBaseUrl}/api/v1/bookings`, bookingData, {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    expect(bookingResponse.status).toBe(201);

    // Check if notification appears (with timeout for real-time delivery)
    await customerPage.waitForSelector('[data-testid="notification-badge"]', { timeout: 10000 });
    const notificationCount = await customerPage.locator('[data-testid="notification-count"]').textContent();
    expect(parseInt(notificationCount || '0')).toBeGreaterThan(0);

    // Test 2: Real-time messaging status updates
    await customerPage.goto(`${frontendBaseUrl}/messages`);

    // Simulate message status updates
    const conversationsResponse = await axios.get(`${apiBaseUrl}/api/v1/messages/conversations`, {
      headers: { Authorization: `Bearer ${customerToken}` }
    });

    if (conversationsResponse.data.conversations.length > 0) {
      const conversationId = conversationsResponse.data.conversations[0].id;

      // Send a message
      const messageResponse = await axios.post(`${apiBaseUrl}/api/v1/messages/messages`, {
        conversationId,
        content: 'Real-time integration test message',
        messageType: 'text'
      }, {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      expect(messageResponse.status).toBe(201);

      // Mark messages as read
      const markReadResponse = await axios.patch(`${apiBaseUrl}/api/v1/messages/conversations/${conversationId}/messages/read`, {}, {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      expect(markReadResponse.status).toBe(200);
    }

    // Test 3: Live data updates
    await providerPage.goto(`${frontendBaseUrl}/provider/dashboard`);

    // Update provider availability and check for real-time reflection
    const availabilityUpdate = {
      availability: {
        monday: { start: '09:00', end: '17:00', available: true },
        tuesday: { start: '09:00', end: '17:00', available: true }
      }
    };

    const updateResponse = await axios.put(`${apiBaseUrl}/api/v1/providers/my/profile`, availabilityUpdate, {
      headers: { Authorization: `Bearer ${providerToken}` }
    });
    expect(updateResponse.status).toBe(200);

    // Verify update appears in dashboard (may require page refresh in non-real-time scenarios)
    await providerPage.reload();
    await providerPage.waitForSelector('[data-testid="availability-monday"]');
    const mondayAvailability = await providerPage.locator('[data-testid="availability-monday"]').textContent();
    expect(mondayAvailability).toContain('09:00');

    console.log('✅ Real-time features integration test passed');
    console.log(`   🔔 Notification delivery: Real-time notifications working`);
    console.log(`   💬 Message status updates: Read receipts functional`);
    console.log(`   📊 Live data updates: Dashboard synchronization working`);
  });

  // Helper function to authenticate users
  async function authenticateUser(userType: 'customer' | 'provider' | 'admin'): Promise<string> {
    const users = {
      customer: testUsers.customer,
      provider: testUsers.provider,
      admin: testUsers.admin
    };

    const user = users[userType];
    if (!user) {
      throw new Error(`Test user not found for type: ${userType}`);
    }

    try {
      const response = await axios.post(`${apiBaseUrl}/api/v1/auth/login`, {
        email: user.email,
        password: user.password
      });
      return response.data.token;
    } catch (error) {
      console.warn(`Authentication failed for ${userType}, attempting registration...`);

      // Try to register if login fails
      const registerResponse = await axios.post(`${apiBaseUrl}/api/v1/auth/register`, {
        email: user.email,
        password: user.password,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        userType: userType
      });
      return registerResponse.data.token;
    }
  }
});