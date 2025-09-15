/**
 * Phase 10.11: Performance and Load Testing
 * Test Suite: Load Testing for Domestic Service Application
 *
 * Tests core platform performance under various load conditions
 * Validates response times, throughput, and system stability
 * Covers API endpoints, database performance, and concurrent operations
 */

import { test, expect, request } from '@playwright/test';

// Performance thresholds (in milliseconds)
const PERFORMANCE_THRESHOLDS = {
  API_RESPONSE: {
    FAST: 200,      // Critical endpoints
    NORMAL: 500,    // Standard endpoints
    SLOW: 1000,     // Complex operations
    TIMEOUT: 5000   // Maximum acceptable
  },
  CONCURRENT_OPERATIONS: {
    MAX_PARALLEL: 10,
    MAX_DURATION: 2000
  },
  DATABASE_OPERATIONS: {
    READ: 100,
    WRITE: 300,
    BULK: 1000
  }
};

// Test data for load testing
const LOAD_TEST_DATA = {
  users: Array.from({ length: 50 }, (_, i) => ({
    email: `loadtest${i + 1}@example.com`,
    password: 'TestPass123@',
    firstName: `LoadTest${i + 1}`,
    lastName: 'User',
    userType: 'customer' as const
  })),
  providers: Array.from({ length: 20 }, (_, i) => ({
    email: `provider${i + 1}@example.com`,
    password: 'TestPass123@',
    firstName: `Provider${i + 1}`,
    lastName: 'Business',
    userType: 'provider' as const,
    businessName: `Test Service ${i + 1}`,
    services: ['house_cleaning', 'lawn_care'][i % 2],
    hourlyRate: 25 + (i * 5)
  })),
  bookings: Array.from({ length: 100 }, (_, i) => ({
    serviceType: ['house_cleaning', 'lawn_care', 'plumbing', 'electrical'][i % 4],
    description: `Load test booking ${i + 1} - comprehensive service request`,
    scheduledDate: new Date(Date.now() + (i * 86400000)).toISOString(),
    location: {
      address: `${1000 + i} Test Street, Test City, TC ${10000 + i}`,
      latitude: 37.7749 + (Math.random() - 0.5) * 0.1,
      longitude: -122.4194 + (Math.random() - 0.5) * 0.1
    },
    estimatedDuration: 2 + (i % 4),
    urgencyLevel: ['low', 'medium', 'high'][i % 3] as 'low' | 'medium' | 'high'
  }))
};

test.describe('Phase 10.11: Performance and Load Testing Suite', () => {
  let apiContext: any;
  let baseURL: string;

  test.beforeAll(async ({ playwright }) => {
    // Initialize API context for performance testing
    apiContext = await playwright.request.newContext({
      baseURL: 'http://localhost:3000'
    });
    baseURL = 'http://localhost:3000';

    // Verify backend is running
    const healthCheck = await apiContext.get('/health');
    expect(healthCheck.status()).toBe(200);
    console.log('✅ Backend server operational for load testing');
  });

  test.afterAll(async () => {
    await apiContext?.dispose();
  });

  test('TS-039: API Response Time Performance Under Normal Load', async () => {
    console.log('\n🚀 Starting API Response Time Performance Testing...');

    const performanceResults = {
      healthCheck: [] as number[],
      authentication: [] as number[],
      providerSearch: [] as number[],
      bookingOperations: [] as number[]
    };

    // Test health endpoint performance (100 requests)
    console.log('Testing health endpoint performance...');
    for (let i = 0; i < 100; i++) {
      const start = Date.now();
      const response = await apiContext.get('/health');
      const duration = Date.now() - start;

      expect(response.status()).toBe(200);
      performanceResults.healthCheck.push(duration);

      if (duration > PERFORMANCE_THRESHOLDS.API_RESPONSE.FAST) {
        console.warn(`⚠️ Health check slow: ${duration}ms (request ${i + 1})`);
      }
    }

    // Test authentication performance
    console.log('Testing authentication endpoint performance...');
    const testUser = LOAD_TEST_DATA.users[0];

    // Register test user for authentication testing
    await apiContext.post('/api/v1/auth/register', {
      data: testUser
    });

    for (let i = 0; i < 50; i++) {
      const start = Date.now();
      const response = await apiContext.post('/api/v1/auth/login', {
        data: {
          email: testUser.email,
          password: testUser.password
        }
      });
      const duration = Date.now() - start;

      expect(response.status()).toBe(200);
      performanceResults.authentication.push(duration);

      if (duration > PERFORMANCE_THRESHOLDS.API_RESPONSE.NORMAL) {
        console.warn(`⚠️ Authentication slow: ${duration}ms (request ${i + 1})`);
      }
    }

    // Test provider search performance
    console.log('Testing provider search performance...');
    for (let i = 0; i < 30; i++) {
      const start = Date.now();
      const response = await apiContext.get('/api/v1/providers', {
        params: {
          latitude: 37.7749,
          longitude: -122.4194,
          radius: 10,
          service: 'house_cleaning'
        }
      });
      const duration = Date.now() - start;

      expect(response.status()).toBe(200);
      performanceResults.providerSearch.push(duration);

      if (duration > PERFORMANCE_THRESHOLDS.API_RESPONSE.NORMAL) {
        console.warn(`⚠️ Provider search slow: ${duration}ms (request ${i + 1})`);
      }
    }

    // Calculate and validate performance metrics
    const calculateStats = (times: number[]) => {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const sorted = times.sort((a, b) => a - b);
      const p95 = sorted[Math.floor(times.length * 0.95)];
      const max = Math.max(...times);
      return { avg, p95, max };
    };

    const healthStats = calculateStats(performanceResults.healthCheck);
    const authStats = calculateStats(performanceResults.authentication);
    const searchStats = calculateStats(performanceResults.providerSearch);

    console.log('\n📊 Performance Test Results:');
    console.log(`Health Endpoint - Avg: ${healthStats.avg.toFixed(2)}ms, P95: ${healthStats.p95}ms, Max: ${healthStats.max}ms`);
    console.log(`Authentication - Avg: ${authStats.avg.toFixed(2)}ms, P95: ${authStats.p95}ms, Max: ${authStats.max}ms`);
    console.log(`Provider Search - Avg: ${searchStats.avg.toFixed(2)}ms, P95: ${searchStats.p95}ms, Max: ${searchStats.max}ms`);

    // Validate performance requirements
    expect(healthStats.avg).toBeLessThan(PERFORMANCE_THRESHOLDS.API_RESPONSE.FAST);
    expect(authStats.p95).toBeLessThan(PERFORMANCE_THRESHOLDS.API_RESPONSE.NORMAL);
    expect(searchStats.p95).toBeLessThan(PERFORMANCE_THRESHOLDS.API_RESPONSE.NORMAL);

    console.log('✅ API Response Time Performance Test Completed Successfully');
  });

  test('TS-040: Concurrent User Authentication and Session Management', async () => {
    console.log('\n🚀 Starting Concurrent Authentication Testing...');

    const concurrentUsers = 25;
    const authPromises: Promise<any>[] = [];
    const results = {
      successful: 0,
      failed: 0,
      totalTime: 0
    };

    const startTime = Date.now();

    // Create concurrent authentication requests
    for (let i = 0; i < concurrentUsers; i++) {
      const userData = {
        email: `concurrent${i}@example.com`,
        password: 'TestPass123@',
        firstName: `Concurrent${i}`,
        lastName: 'User',
        userType: 'customer' as const
      };

      const authPromise = (async () => {
        try {
          // Register user
          const registerResponse = await apiContext.post('/api/v1/auth/register', {
            data: userData
          });

          if (registerResponse.status() === 201 || registerResponse.status() === 409) {
            // Login user
            const loginResponse = await apiContext.post('/api/v1/auth/login', {
              data: {
                email: userData.email,
                password: userData.password
              }
            });

            if (loginResponse.status() === 200) {
              const loginData = await loginResponse.json();

              // Validate token and get profile
              const profileResponse = await apiContext.get('/api/v1/auth/profile', {
                headers: {
                  'Authorization': `Bearer ${loginData.data.accessToken}`
                }
              });

              if (profileResponse.status() === 200) {
                results.successful++;
                return { success: true, userId: i };
              }
            }
          }
          results.failed++;
          return { success: false, userId: i };
        } catch (error) {
          results.failed++;
          console.warn(`⚠️ Concurrent auth failed for user ${i}: ${error}`);
          return { success: false, userId: i, error };
        }
      })();

      authPromises.push(authPromise);
    }

    // Wait for all concurrent operations
    const concurrentResults = await Promise.all(authPromises);
    results.totalTime = Date.now() - startTime;

    console.log('\n📊 Concurrent Authentication Results:');
    console.log(`Total Users: ${concurrentUsers}`);
    console.log(`Successful: ${results.successful}`);
    console.log(`Failed: ${results.failed}`);
    console.log(`Total Time: ${results.totalTime}ms`);
    console.log(`Average Time per User: ${(results.totalTime / concurrentUsers).toFixed(2)}ms`);

    // Validate concurrent performance requirements
    expect(results.successful).toBeGreaterThan(concurrentUsers * 0.8); // 80% success rate
    expect(results.totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.CONCURRENT_OPERATIONS.MAX_DURATION);
    expect(results.successful + results.failed).toBe(concurrentUsers);

    console.log('✅ Concurrent Authentication Test Completed Successfully');
  });

  test('TS-041: Database Performance Under Heavy Read Operations', async () => {
    console.log('\n🚀 Starting Database Read Performance Testing...');

    // Set up test data first
    const testUser = {
      email: 'dbtest@example.com',
      password: 'TestPass123@',
      firstName: 'Database',
      lastName: 'Tester',
      userType: 'customer' as const
    };

    await apiContext.post('/api/v1/auth/register', { data: testUser });
    const loginResponse = await apiContext.post('/api/v1/auth/login', {
      data: { email: testUser.email, password: testUser.password }
    });
    const loginData = await loginResponse.json();
    const authToken = loginData.data.accessToken;

    const readOperations = {
      userProfile: [] as number[],
      providerList: [] as number[],
      searchOperations: [] as number[]
    };

    // Test user profile read performance (100 requests)
    console.log('Testing user profile read performance...');
    for (let i = 0; i < 100; i++) {
      const start = Date.now();
      const response = await apiContext.get('/api/v1/auth/profile', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      const duration = Date.now() - start;

      expect(response.status()).toBe(200);
      readOperations.userProfile.push(duration);

      if (duration > PERFORMANCE_THRESHOLDS.DATABASE_OPERATIONS.READ) {
        console.warn(`⚠️ Profile read slow: ${duration}ms (request ${i + 1})`);
      }
    }

    // Test provider listing performance (50 requests)
    console.log('Testing provider listing performance...');
    for (let i = 0; i < 50; i++) {
      const start = Date.now();
      const response = await apiContext.get('/api/v1/providers', {
        params: { page: 1, limit: 10 }
      });
      const duration = Date.now() - start;

      expect(response.status()).toBe(200);
      readOperations.providerList.push(duration);

      if (duration > PERFORMANCE_THRESHOLDS.DATABASE_OPERATIONS.READ * 2) {
        console.warn(`⚠️ Provider list slow: ${duration}ms (request ${i + 1})`);
      }
    }

    // Test search operations performance (30 requests)
    console.log('Testing search operations performance...');
    const searchQueries = [
      { service: 'house_cleaning' },
      { minRating: 4.0 },
      { latitude: 37.7749, longitude: -122.4194, radius: 5 },
      { hasInsurance: true },
      { hasBackgroundCheck: true }
    ];

    for (let i = 0; i < 30; i++) {
      const searchQuery = searchQueries[i % searchQueries.length];
      const start = Date.now();
      const response = await apiContext.get('/api/v1/providers', {
        params: searchQuery
      });
      const duration = Date.now() - start;

      expect(response.status()).toBe(200);
      readOperations.searchOperations.push(duration);

      if (duration > PERFORMANCE_THRESHOLDS.DATABASE_OPERATIONS.READ * 3) {
        console.warn(`⚠️ Search operation slow: ${duration}ms (request ${i + 1})`);
      }
    }

    // Calculate performance statistics
    const calculateStats = (times: number[]) => {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const sorted = times.sort((a, b) => a - b);
      const p50 = sorted[Math.floor(times.length * 0.5)];
      const p95 = sorted[Math.floor(times.length * 0.95)];
      const max = Math.max(...times);
      return { avg, p50, p95, max };
    };

    const profileStats = calculateStats(readOperations.userProfile);
    const listStats = calculateStats(readOperations.providerList);
    const searchStats = calculateStats(readOperations.searchOperations);

    console.log('\n📊 Database Read Performance Results:');
    console.log(`User Profile - Avg: ${profileStats.avg.toFixed(2)}ms, P50: ${profileStats.p50}ms, P95: ${profileStats.p95}ms, Max: ${profileStats.max}ms`);
    console.log(`Provider List - Avg: ${listStats.avg.toFixed(2)}ms, P50: ${listStats.p50}ms, P95: ${listStats.p95}ms, Max: ${listStats.max}ms`);
    console.log(`Search Ops - Avg: ${searchStats.avg.toFixed(2)}ms, P50: ${searchStats.p50}ms, P95: ${searchStats.p95}ms, Max: ${searchStats.max}ms`);

    // Validate database performance requirements
    expect(profileStats.p95).toBeLessThan(PERFORMANCE_THRESHOLDS.DATABASE_OPERATIONS.READ * 2);
    expect(listStats.p95).toBeLessThan(PERFORMANCE_THRESHOLDS.DATABASE_OPERATIONS.READ * 3);
    expect(searchStats.p95).toBeLessThan(PERFORMANCE_THRESHOLDS.DATABASE_OPERATIONS.READ * 4);

    console.log('✅ Database Read Performance Test Completed Successfully');
  });

  test('TS-042: Concurrent Booking Creation and Management Stress Test', async () => {
    console.log('\n🚀 Starting Concurrent Booking Stress Testing...');

    // Set up test customers and providers
    const customers = [];
    const providers = [];

    // Register test customers
    for (let i = 0; i < 10; i++) {
      const customerData = {
        email: `stresscustomer${i}@example.com`,
        password: 'TestPass123@',
        firstName: `Customer${i}`,
        lastName: 'Stress',
        userType: 'customer' as const
      };

      const registerResponse = await apiContext.post('/api/v1/auth/register', { data: customerData });
      if (registerResponse.status() === 201 || registerResponse.status() === 409) {
        const loginResponse = await apiContext.post('/api/v1/auth/login', {
          data: { email: customerData.email, password: customerData.password }
        });
        const loginData = await loginResponse.json();
        customers.push({
          ...customerData,
          token: loginData.data.accessToken
        });
      }
    }

    // Register test providers
    for (let i = 0; i < 5; i++) {
      const providerData = {
        email: `stressprovider${i}@example.com`,
        password: 'TestPass123@',
        firstName: `Provider${i}`,
        lastName: 'Business',
        userType: 'provider' as const
      };

      const registerResponse = await apiContext.post('/api/v1/auth/register', { data: providerData });
      if (registerResponse.status() === 201 || registerResponse.status() === 409) {
        const loginResponse = await apiContext.post('/api/v1/auth/login', {
          data: { email: providerData.email, password: providerData.password }
        });
        const loginData = await loginResponse.json();

        // Create provider profile
        const profileResponse = await apiContext.post('/api/v1/providers', {
          data: {
            businessName: `Stress Test Business ${i}`,
            services: ['house_cleaning'],
            serviceAreas: ['Test City'],
            hourlyRate: 25,
            description: 'Stress test provider',
            location: {
              address: `${1000 + i} Stress Street, Test City`,
              latitude: 37.7749,
              longitude: -122.4194
            }
          },
          headers: { 'Authorization': `Bearer ${loginData.data.accessToken}` }
        });

        if (profileResponse.status() === 201) {
          const profileData = await profileResponse.json();
          providers.push({
            ...providerData,
            token: loginData.data.accessToken,
            providerId: profileData.data.id
          });
        }
      }
    }

    console.log(`✅ Set up ${customers.length} customers and ${providers.length} providers for stress testing`);

    // Concurrent booking creation
    const concurrentBookings = 20;
    const bookingPromises: Promise<any>[] = [];
    const results = {
      successful: 0,
      failed: 0,
      conflicts: 0,
      totalTime: 0,
      responseTimeSum: 0
    };

    const startTime = Date.now();

    for (let i = 0; i < concurrentBookings; i++) {
      const customer = customers[i % customers.length];
      const provider = providers[i % providers.length];

      if (!customer || !provider) continue;

      const bookingData = {
        providerId: provider.providerId,
        serviceType: 'house_cleaning',
        description: `Concurrent stress test booking ${i + 1}`,
        scheduledDate: new Date(Date.now() + (i * 3600000) + 86400000).toISOString(), // Stagger times
        location: {
          address: `${2000 + i} Stress Test Ave, Test City`,
          latitude: 37.7749 + (Math.random() - 0.5) * 0.01,
          longitude: -122.4194 + (Math.random() - 0.5) * 0.01
        },
        estimatedDuration: 2,
        urgencyLevel: 'medium' as const
      };

      const bookingPromise = (async () => {
        const requestStart = Date.now();
        try {
          const response = await apiContext.post('/api/v1/bookings', {
            data: bookingData,
            headers: { 'Authorization': `Bearer ${customer.token}` }
          });
          const responseTime = Date.now() - requestStart;
          results.responseTimeSum += responseTime;

          if (response.status() === 201) {
            results.successful++;
            return { success: true, bookingId: i, responseTime };
          } else if (response.status() === 409) {
            results.conflicts++;
            return { success: false, bookingId: i, reason: 'conflict', responseTime };
          } else {
            results.failed++;
            return { success: false, bookingId: i, reason: 'error', responseTime };
          }
        } catch (error) {
          const responseTime = Date.now() - requestStart;
          results.responseTimeSum += responseTime;
          results.failed++;
          return { success: false, bookingId: i, error, responseTime };
        }
      })();

      bookingPromises.push(bookingPromise);
    }

    // Wait for all concurrent booking operations
    const bookingResults = await Promise.all(bookingPromises);
    results.totalTime = Date.now() - startTime;

    const averageResponseTime = results.responseTimeSum / concurrentBookings;

    console.log('\n📊 Concurrent Booking Stress Test Results:');
    console.log(`Total Booking Attempts: ${concurrentBookings}`);
    console.log(`Successful: ${results.successful}`);
    console.log(`Failed: ${results.failed}`);
    console.log(`Conflicts (Expected): ${results.conflicts}`);
    console.log(`Total Time: ${results.totalTime}ms`);
    console.log(`Average Response Time: ${averageResponseTime.toFixed(2)}ms`);
    console.log(`Throughput: ${(concurrentBookings / (results.totalTime / 1000)).toFixed(2)} bookings/second`);

    // Validate stress test performance
    expect(results.successful + results.conflicts).toBeGreaterThan(concurrentBookings * 0.7); // 70% success + expected conflicts
    expect(averageResponseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.API_RESPONSE.SLOW);
    expect(results.totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.CONCURRENT_OPERATIONS.MAX_DURATION * 2);

    console.log('✅ Concurrent Booking Stress Test Completed Successfully');
  });

  test('TS-043: Payment Processing Performance and Transaction Throughput', async () => {
    console.log('\n🚀 Starting Payment Processing Performance Testing...');

    // Set up test user for payment operations
    const testCustomer = {
      email: 'paymenttest@example.com',
      password: 'TestPass123@',
      firstName: 'Payment',
      lastName: 'Tester',
      userType: 'customer' as const
    };

    await apiContext.post('/api/v1/auth/register', { data: testCustomer });
    const loginResponse = await apiContext.post('/api/v1/auth/login', {
      data: { email: testCustomer.email, password: testCustomer.password }
    });
    const loginData = await loginResponse.json();
    const authToken = loginData.data.accessToken;

    // Set up test provider and booking for payment operations
    const providerData = {
      email: 'paymentprovider@example.com',
      password: 'TestPass123@',
      firstName: 'Payment',
      lastName: 'Provider',
      userType: 'provider' as const
    };

    await apiContext.post('/api/v1/auth/register', { data: providerData });
    const providerLogin = await apiContext.post('/api/v1/auth/login', {
      data: { email: providerData.email, password: providerData.password }
    });
    const providerLoginData = await providerLogin.json();

    // Create provider profile
    const providerProfile = await apiContext.post('/api/v1/providers', {
      data: {
        businessName: 'Payment Test Services',
        services: ['house_cleaning'],
        serviceAreas: ['Test City'],
        hourlyRate: 50,
        description: 'Payment performance test provider'
      },
      headers: { 'Authorization': `Bearer ${providerLoginData.data.accessToken}` }
    });
    const providerProfileData = await providerProfile.json();
    const providerId = providerProfileData.data.id;

    const paymentOperations = {
      intentCreation: [] as number[],
      paymentHistory: [] as number[],
      paymentValidation: [] as number[]
    };

    // Test payment intent creation performance (20 requests)
    console.log('Testing payment intent creation performance...');
    for (let i = 0; i < 20; i++) {
      const start = Date.now();

      // Create a test booking first
      const bookingResponse = await apiContext.post('/api/v1/bookings', {
        data: {
          providerId: providerId,
          serviceType: 'house_cleaning',
          description: `Payment test booking ${i + 1}`,
          scheduledDate: new Date(Date.now() + (i * 3600000) + 86400000).toISOString(),
          location: {
            address: '123 Payment Test St, Test City',
            latitude: 37.7749,
            longitude: -122.4194
          },
          estimatedDuration: 2,
          urgencyLevel: 'medium' as const
        },
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      if (bookingResponse.status() === 201) {
        const bookingData = await bookingResponse.json();

        // Create payment intent
        const intentResponse = await apiContext.post('/api/v1/payments/intent', {
          data: {
            bookingId: bookingData.data.id,
            amount: 10000, // $100.00 in cents
            currency: 'usd',
            description: `Payment for booking ${bookingData.data.id}`
          },
          headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const duration = Date.now() - start;
        paymentOperations.intentCreation.push(duration);

        if (duration > PERFORMANCE_THRESHOLDS.API_RESPONSE.SLOW) {
          console.warn(`⚠️ Payment intent creation slow: ${duration}ms (request ${i + 1})`);
        }
      }
    }

    // Test payment history retrieval performance (30 requests)
    console.log('Testing payment history retrieval performance...');
    for (let i = 0; i < 30; i++) {
      const start = Date.now();
      const response = await apiContext.get('/api/v1/payments', {
        params: {
          page: 1,
          limit: 10,
          status: 'pending'
        },
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      const duration = Date.now() - start;

      expect(response.status()).toBe(200);
      paymentOperations.paymentHistory.push(duration);

      if (duration > PERFORMANCE_THRESHOLDS.API_RESPONSE.NORMAL) {
        console.warn(`⚠️ Payment history slow: ${duration}ms (request ${i + 1})`);
      }
    }

    // Test payment validation performance (15 requests)
    console.log('Testing payment validation performance...');
    for (let i = 0; i < 15; i++) {
      const start = Date.now();
      const response = await apiContext.get('/api/v1/payments/customer/' + (await loginResponse.json()).data.user.id, {
        params: {
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString()
        },
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      const duration = Date.now() - start;

      expect(response.status()).toBe(200);
      paymentOperations.paymentValidation.push(duration);

      if (duration > PERFORMANCE_THRESHOLDS.API_RESPONSE.NORMAL) {
        console.warn(`⚠️ Payment validation slow: ${duration}ms (request ${i + 1})`);
      }
    }

    // Calculate payment performance statistics
    const calculateStats = (times: number[]) => {
      if (times.length === 0) return { avg: 0, p50: 0, p95: 0, max: 0 };
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const sorted = times.sort((a, b) => a - b);
      const p50 = sorted[Math.floor(times.length * 0.5)];
      const p95 = sorted[Math.floor(times.length * 0.95)];
      const max = Math.max(...times);
      return { avg, p50, p95, max };
    };

    const intentStats = calculateStats(paymentOperations.intentCreation);
    const historyStats = calculateStats(paymentOperations.paymentHistory);
    const validationStats = calculateStats(paymentOperations.paymentValidation);

    console.log('\n📊 Payment Processing Performance Results:');
    console.log(`Intent Creation - Avg: ${intentStats.avg.toFixed(2)}ms, P50: ${intentStats.p50}ms, P95: ${intentStats.p95}ms, Max: ${intentStats.max}ms`);
    console.log(`History Retrieval - Avg: ${historyStats.avg.toFixed(2)}ms, P50: ${historyStats.p50}ms, P95: ${historyStats.p95}ms, Max: ${historyStats.max}ms`);
    console.log(`Validation - Avg: ${validationStats.avg.toFixed(2)}ms, P50: ${validationStats.p50}ms, P95: ${validationStats.p95}ms, Max: ${validationStats.max}ms`);

    // Validate payment performance requirements
    if (intentStats.avg > 0) {
      expect(intentStats.p95).toBeLessThan(PERFORMANCE_THRESHOLDS.API_RESPONSE.SLOW * 1.5);
    }
    expect(historyStats.p95).toBeLessThan(PERFORMANCE_THRESHOLDS.API_RESPONSE.NORMAL);
    expect(validationStats.p95).toBeLessThan(PERFORMANCE_THRESHOLDS.API_RESPONSE.NORMAL);

    console.log('✅ Payment Processing Performance Test Completed Successfully');
  });

  test('TS-044: Real-time Messaging System Performance Under Load', async () => {
    console.log('\n🚀 Starting Real-time Messaging Performance Testing...');

    // Set up test users for messaging
    const users = [];
    for (let i = 0; i < 10; i++) {
      const userData = {
        email: `messagetest${i}@example.com`,
        password: 'TestPass123@',
        firstName: `MessageUser${i}`,
        lastName: 'Tester',
        userType: 'customer' as const
      };

      await apiContext.post('/api/v1/auth/register', { data: userData });
      const loginResponse = await apiContext.post('/api/v1/auth/login', {
        data: { email: userData.email, password: userData.password }
      });
      const loginData = await loginResponse.json();
      users.push({
        ...userData,
        id: loginData.data.user.id,
        token: loginData.data.accessToken
      });
    }

    console.log(`✅ Set up ${users.length} users for messaging performance testing`);

    const messagingOperations = {
      conversationCreation: [] as number[],
      messagesSending: [] as number[],
      messagesRetrieval: [] as number[],
      conversationListing: [] as number[]
    };

    // Test conversation creation performance (15 conversations)
    console.log('Testing conversation creation performance...');
    const conversations = [];
    for (let i = 0; i < 15; i++) {
      const user1 = users[i % users.length];
      const user2 = users[(i + 1) % users.length];

      const start = Date.now();
      const response = await apiContext.post('/api/v1/messages/conversations', {
        data: {
          participants: [user2.id],
          type: 'direct'
        },
        headers: { 'Authorization': `Bearer ${user1.token}` }
      });
      const duration = Date.now() - start;

      if (response.status() === 201) {
        const conversationData = await response.json();
        conversations.push({
          id: conversationData.data.id,
          creator: user1,
          participant: user2
        });
        messagingOperations.conversationCreation.push(duration);
      }

      if (duration > PERFORMANCE_THRESHOLDS.API_RESPONSE.NORMAL) {
        console.warn(`⚠️ Conversation creation slow: ${duration}ms (request ${i + 1})`);
      }
    }

    // Test message sending performance (50 messages across conversations)
    console.log('Testing message sending performance...');
    for (let i = 0; i < 50; i++) {
      const conversation = conversations[i % conversations.length];
      if (!conversation) continue;

      const sender = i % 2 === 0 ? conversation.creator : conversation.participant;
      const start = Date.now();

      const response = await apiContext.post('/api/v1/messages/messages', {
        data: {
          conversationId: conversation.id,
          content: `Performance test message ${i + 1} - testing message delivery speed and system responsiveness`,
          type: 'text'
        },
        headers: { 'Authorization': `Bearer ${sender.token}` }
      });
      const duration = Date.now() - start;

      if (response.status() === 201) {
        messagingOperations.messagesSending.push(duration);
      }

      if (duration > PERFORMANCE_THRESHOLDS.API_RESPONSE.NORMAL) {
        console.warn(`⚠️ Message sending slow: ${duration}ms (message ${i + 1})`);
      }
    }

    // Test message retrieval performance (30 requests)
    console.log('Testing message retrieval performance...');
    for (let i = 0; i < 30; i++) {
      const conversation = conversations[i % conversations.length];
      if (!conversation) continue;

      const user = conversation.creator;
      const start = Date.now();

      const response = await apiContext.get(`/api/v1/messages/conversations/${conversation.id}/messages`, {
        params: {
          page: 1,
          limit: 20
        },
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      const duration = Date.now() - start;

      expect(response.status()).toBe(200);
      messagingOperations.messagesRetrieval.push(duration);

      if (duration > PERFORMANCE_THRESHOLDS.API_RESPONSE.NORMAL) {
        console.warn(`⚠️ Message retrieval slow: ${duration}ms (request ${i + 1})`);
      }
    }

    // Test conversation listing performance (25 requests)
    console.log('Testing conversation listing performance...');
    for (let i = 0; i < 25; i++) {
      const user = users[i % users.length];
      const start = Date.now();

      const response = await apiContext.get('/api/v1/messages/conversations', {
        params: {
          page: 1,
          limit: 10
        },
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      const duration = Date.now() - start;

      expect(response.status()).toBe(200);
      messagingOperations.conversationListing.push(duration);

      if (duration > PERFORMANCE_THRESHOLDS.API_RESPONSE.NORMAL) {
        console.warn(`⚠️ Conversation listing slow: ${duration}ms (request ${i + 1})`);
      }
    }

    // Calculate messaging performance statistics
    const calculateStats = (times: number[]) => {
      if (times.length === 0) return { avg: 0, p50: 0, p95: 0, max: 0 };
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const sorted = times.sort((a, b) => a - b);
      const p50 = sorted[Math.floor(times.length * 0.5)];
      const p95 = sorted[Math.floor(times.length * 0.95)];
      const max = Math.max(...times);
      return { avg, p50, p95, max };
    };

    const conversationStats = calculateStats(messagingOperations.conversationCreation);
    const sendingStats = calculateStats(messagingOperations.messagesSending);
    const retrievalStats = calculateStats(messagingOperations.messagesRetrieval);
    const listingStats = calculateStats(messagingOperations.conversationListing);

    console.log('\n📊 Messaging System Performance Results:');
    console.log(`Conversation Creation - Avg: ${conversationStats.avg.toFixed(2)}ms, P50: ${conversationStats.p50}ms, P95: ${conversationStats.p95}ms, Max: ${conversationStats.max}ms`);
    console.log(`Message Sending - Avg: ${sendingStats.avg.toFixed(2)}ms, P50: ${sendingStats.p50}ms, P95: ${sendingStats.p95}ms, Max: ${sendingStats.max}ms`);
    console.log(`Message Retrieval - Avg: ${retrievalStats.avg.toFixed(2)}ms, P50: ${retrievalStats.p50}ms, P95: ${retrievalStats.p95}ms, Max: ${retrievalStats.max}ms`);
    console.log(`Conversation Listing - Avg: ${listingStats.avg.toFixed(2)}ms, P50: ${listingStats.p50}ms, P95: ${listingStats.p95}ms, Max: ${listingStats.max}ms`);

    // Validate messaging performance requirements
    if (conversationStats.avg > 0) {
      expect(conversationStats.p95).toBeLessThan(PERFORMANCE_THRESHOLDS.API_RESPONSE.NORMAL);
    }
    if (sendingStats.avg > 0) {
      expect(sendingStats.p95).toBeLessThan(PERFORMANCE_THRESHOLDS.API_RESPONSE.NORMAL);
    }
    expect(retrievalStats.p95).toBeLessThan(PERFORMANCE_THRESHOLDS.API_RESPONSE.NORMAL);
    expect(listingStats.p95).toBeLessThan(PERFORMANCE_THRESHOLDS.API_RESPONSE.NORMAL);

    console.log('✅ Real-time Messaging Performance Test Completed Successfully');
  });

  test('TS-045: System Resource Usage and Memory Performance', async () => {
    console.log('\n🚀 Starting System Resource Usage Testing...');

    // Note: This test focuses on API response patterns that indicate resource efficiency
    // Since we can't directly monitor server memory in this test environment,
    // we'll test for consistent performance over sustained operations

    const resourceTests = {
      sustainedOperations: [] as number[],
      memoryIntensiveOps: [] as number[],
      concurrentConnections: [] as number[]
    };

    // Set up test user
    const testUser = {
      email: 'resourcetest@example.com',
      password: 'TestPass123@',
      firstName: 'Resource',
      lastName: 'Tester',
      userType: 'customer' as const
    };

    await apiContext.post('/api/v1/auth/register', { data: testUser });
    const loginResponse = await apiContext.post('/api/v1/auth/login', {
      data: { email: testUser.email, password: testUser.password }
    });
    const loginData = await loginResponse.json();
    const authToken = loginData.data.accessToken;

    // Test sustained operations performance (100 requests over time)
    console.log('Testing sustained operations performance...');
    for (let i = 0; i < 100; i++) {
      const start = Date.now();

      // Mix of different operations to simulate real usage
      const operations = [
        () => apiContext.get('/health'),
        () => apiContext.get('/api/v1/auth/profile', {
          headers: { 'Authorization': `Bearer ${authToken}` }
        }),
        () => apiContext.get('/api/v1/providers', {
          params: { page: 1, limit: 5 }
        }),
        () => apiContext.get('/api/v1/payments', {
          headers: { 'Authorization': `Bearer ${authToken}` }
        })
      ];

      const operation = operations[i % operations.length];
      const response = await operation();
      const duration = Date.now() - start;

      // Most operations should succeed
      if (response.status() < 400) {
        resourceTests.sustainedOperations.push(duration);
      }

      // Small delay to simulate realistic usage pattern
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    // Test memory-intensive operations (large data retrieval)
    console.log('Testing memory-intensive operations...');
    for (let i = 0; i < 20; i++) {
      const start = Date.now();

      // Request larger data sets
      const response = await apiContext.get('/api/v1/providers', {
        params: {
          page: 1,
          limit: 50, // Larger result set
          includeReviews: true
        }
      });
      const duration = Date.now() - start;

      if (response.status() === 200) {
        resourceTests.memoryIntensiveOps.push(duration);
      }

      if (duration > PERFORMANCE_THRESHOLDS.API_RESPONSE.SLOW) {
        console.warn(`⚠️ Memory-intensive operation slow: ${duration}ms (request ${i + 1})`);
      }
    }

    // Test concurrent connections stability
    console.log('Testing concurrent connections stability...');
    const concurrentPromises = [];
    for (let i = 0; i < 15; i++) {
      const promise = (async () => {
        const start = Date.now();
        const response = await apiContext.get('/api/v1/providers', {
          params: { page: 1, limit: 10 }
        });
        const duration = Date.now() - start;
        return { duration, status: response.status() };
      })();
      concurrentPromises.push(promise);
    }

    const concurrentResults = await Promise.all(concurrentPromises);
    concurrentResults.forEach(result => {
      if (result.status === 200) {
        resourceTests.concurrentConnections.push(result.duration);
      }
    });

    // Calculate resource usage statistics
    const calculateStats = (times: number[]) => {
      if (times.length === 0) return { avg: 0, p50: 0, p95: 0, max: 0, stability: 0 };

      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const sorted = times.sort((a, b) => a - b);
      const p50 = sorted[Math.floor(times.length * 0.5)];
      const p95 = sorted[Math.floor(times.length * 0.95)];
      const max = Math.max(...times);

      // Calculate stability (lower coefficient of variation is better)
      const stdDev = Math.sqrt(times.reduce((sq, n) => sq + Math.pow(n - avg, 2), 0) / times.length);
      const stability = stdDev / avg; // Coefficient of variation

      return { avg, p50, p95, max, stability };
    };

    const sustainedStats = calculateStats(resourceTests.sustainedOperations);
    const memoryStats = calculateStats(resourceTests.memoryIntensiveOps);
    const concurrentStats = calculateStats(resourceTests.concurrentConnections);

    console.log('\n📊 System Resource Usage Performance Results:');
    console.log(`Sustained Operations (${resourceTests.sustainedOperations.length} ops):`);
    console.log(`  Avg: ${sustainedStats.avg.toFixed(2)}ms, P50: ${sustainedStats.p50}ms, P95: ${sustainedStats.p95}ms, Stability: ${(sustainedStats.stability * 100).toFixed(1)}%`);
    console.log(`Memory-Intensive Operations (${resourceTests.memoryIntensiveOps.length} ops):`);
    console.log(`  Avg: ${memoryStats.avg.toFixed(2)}ms, P50: ${memoryStats.p50}ms, P95: ${memoryStats.p95}ms, Stability: ${(memoryStats.stability * 100).toFixed(1)}%`);
    console.log(`Concurrent Connections (${resourceTests.concurrentConnections.length} ops):`);
    console.log(`  Avg: ${concurrentStats.avg.toFixed(2)}ms, P50: ${concurrentStats.p50}ms, P95: ${concurrentStats.p95}ms, Stability: ${(concurrentStats.stability * 100).toFixed(1)}%`);

    // Validate resource efficiency requirements
    expect(sustainedStats.stability).toBeLessThan(1.0); // Response time should be stable (CV < 100%)
    expect(sustainedStats.p95).toBeLessThan(PERFORMANCE_THRESHOLDS.API_RESPONSE.NORMAL * 2);

    if (memoryStats.avg > 0) {
      expect(memoryStats.p95).toBeLessThan(PERFORMANCE_THRESHOLDS.API_RESPONSE.SLOW);
      expect(memoryStats.stability).toBeLessThan(1.5); // Memory ops can be slightly less stable
    }

    expect(concurrentStats.p95).toBeLessThan(PERFORMANCE_THRESHOLDS.API_RESPONSE.NORMAL);

    // Performance degradation check
    const firstQuarter = resourceTests.sustainedOperations.slice(0, 25);
    const lastQuarter = resourceTests.sustainedOperations.slice(-25);

    if (firstQuarter.length > 0 && lastQuarter.length > 0) {
      const firstAvg = firstQuarter.reduce((a, b) => a + b, 0) / firstQuarter.length;
      const lastAvg = lastQuarter.reduce((a, b) => a + b, 0) / lastQuarter.length;
      const degradation = (lastAvg - firstAvg) / firstAvg;

      console.log(`Performance Degradation: ${(degradation * 100).toFixed(2)}%`);
      expect(degradation).toBeLessThan(0.5); // No more than 50% degradation over time
    }

    console.log('✅ System Resource Usage Test Completed Successfully');
  });

  test.afterEach(async ({ }, testInfo) => {
    // Log test completion and performance summary
    if (testInfo.status === 'passed') {
      console.log(`✅ ${testInfo.title} completed successfully`);
    } else {
      console.log(`❌ ${testInfo.title} failed`);
    }
  });
});