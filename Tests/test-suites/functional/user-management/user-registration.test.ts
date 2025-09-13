import { test, expect } from '@playwright/test';

// TS-001: User registers with valid email and password - expects successful registration and verification email
test.describe('User Registration Journey Tests (TS-001 to TS-005)', () => {
  
  test('TS-001: User registers with valid email and password', async ({ request }) => {
    // Generate unique test data
    const timestamp = Date.now();
    const userData = {
      email: `test-user-${timestamp}@example.com`,
      password: 'TestPassword123!',
      firstName: 'John',
      lastName: 'Doe',
      phone: '+1234567890',
      userType: 'customer'
    };

    console.log('🧪 Testing user registration with valid data...');

    // Make registration API request
    const response = await request.post('http://localhost:3000/api/v1/auth/register', {
      data: userData
    });

    // Validate response
    expect(response.status()).toBe(201);
    
    const responseData = await response.json();
    expect(responseData.success).toBe(true);
    expect(responseData.data.user.email).toBe(userData.email);
    expect(responseData.data.accessToken).toBeDefined();
    expect(responseData.data.refreshToken).toBeDefined();

    // Validate user object structure
    expect(responseData.data.user.firstName).toBe(userData.firstName);
    expect(responseData.data.user.lastName).toBe(userData.lastName);
    expect(responseData.data.user.userType).toBe(userData.userType);
    
    // Password should not be returned
    expect(responseData.data.user.password).toBeUndefined();

    console.log('✅ TS-001 PASSED: User registration successful with valid data');
    console.log(`   📧 Registered email: ${userData.email}`);
    console.log(`   🔑 Access token received: ${responseData.data.accessToken ? 'Yes' : 'No'}`);
  });

  test('TS-002: User attempts to register with existing email', async ({ request }) => {
    const existingUserData = {
      email: 'customer@test.com', // Using existing test user
      password: 'TestPassword123!',
      firstName: 'Jane',
      lastName: 'Smith',
      phone: '+1987654321',
      userType: 'customer'
    };

    console.log('🧪 Testing registration with existing email...');

    const response = await request.post('http://localhost:3000/api/v1/auth/register', {
      data: existingUserData
    });

    // Should return conflict error
    expect(response.status()).toBe(409);
    
    const responseData = await response.json();
    expect(responseData.success).toBe(false);
    expect(responseData.message).toContain('already exists');

    console.log('✅ TS-002 PASSED: Registration correctly rejected for existing email');
    console.log(`   📧 Duplicate email: ${existingUserData.email}`);
    console.log(`   🚫 Error message: ${responseData.message}`);
  });

  test('TS-003: User registers with weak password', async ({ request }) => {
    const timestamp = Date.now();
    const weakPasswordData = {
      email: `weak-password-${timestamp}@example.com`,
      password: '123', // Weak password
      firstName: 'Test',
      lastName: 'User',
      phone: '+1555666777',
      userType: 'customer'
    };

    console.log('🧪 Testing registration with weak password...');

    const response = await request.post('http://localhost:3000/api/v1/auth/register', {
      data: weakPasswordData
    });

    // Should return validation error
    expect(response.status()).toBe(400);
    
    const responseData = await response.json();
    expect(responseData.success).toBe(false);
    expect(responseData.message).toMatch(/password/i);

    console.log('✅ TS-003 PASSED: Registration correctly rejected for weak password');
    console.log(`   🔑 Weak password: ${weakPasswordData.password}`);
    console.log(`   🚫 Error message: ${responseData.message}`);
  });

  test('TS-004: User attempts registration without required fields', async ({ request }) => {
    const incompleteData = {
      email: 'incomplete@example.com',
      // Missing required fields: password, firstName, lastName
      userType: 'customer'
    };

    console.log('🧪 Testing registration with missing required fields...');

    const response = await request.post('http://localhost:3000/api/v1/auth/register', {
      data: incompleteData
    });

    // Should return validation error
    expect(response.status()).toBe(400);
    
    const responseData = await response.json();
    expect(responseData.success).toBe(false);
    
    // Should mention missing fields
    const errorMessage = responseData.message.toLowerCase();
    expect(errorMessage).toMatch(/required|password|firstname|lastname/);

    console.log('✅ TS-004 PASSED: Registration correctly rejected for missing fields');
    console.log(`   🚫 Error message: ${responseData.message}`);
  });

  test('TS-005: Provider user registration', async ({ request }) => {
    const timestamp = Date.now();
    const providerData = {
      email: `provider-${timestamp}@example.com`,
      password: 'TestPassword123!',
      firstName: 'Service',
      lastName: 'Provider',
      phone: '+1444555666',
      userType: 'provider'
    };

    console.log('🧪 Testing provider user registration...');

    const response = await request.post('http://localhost:3000/api/v1/auth/register', {
      data: providerData
    });

    // Should be successful
    expect(response.status()).toBe(201);
    
    const responseData = await response.json();
    expect(responseData.success).toBe(true);
    expect(responseData.data.user.email).toBe(providerData.email);
    expect(responseData.data.user.userType).toBe('provider');
    
    console.log('✅ TS-005 PASSED: Provider registration successful');
    console.log(`   📧 Provider email: ${providerData.email}`);
    console.log(`   👤 User type: ${responseData.data.user.userType}`);
  });
});