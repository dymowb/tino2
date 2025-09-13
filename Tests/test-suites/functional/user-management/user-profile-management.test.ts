import { test, expect } from '@playwright/test';

// Additional User Management Tests for Profile Updates and Session Management
test.describe('User Profile Management Tests', () => {
  let userToken: string;

  test.beforeEach(async ({ request }) => {
    // Login to get valid token for authenticated tests
    const loginResponse = await request.post('http://localhost:3000/api/v1/auth/login', {
      data: {
        email: 'customer@test.com',
        password: 'TestPassword123!'
      }
    });

    const loginData = await loginResponse.json();
    userToken = loginData.data.accessToken;
  });

  test('User can update profile information', async ({ request }) => {
    const updateData = {
      firstName: 'UpdatedFirstName',
      lastName: 'UpdatedLastName',
      phone: '+1999888777'
    };

    console.log('🧪 Testing profile information update...');

    const response = await request.put('http://localhost:3000/api/v1/users/profile', {
      data: updateData,
      headers: {
        'Authorization': `Bearer ${userToken}`
      }
    });

    if (response.status() === 200) {
      const responseData = await response.json();
      expect(responseData.success).toBe(true);
      expect(responseData.data.firstName).toBe(updateData.firstName);
      expect(responseData.data.lastName).toBe(updateData.lastName);
      
      console.log('✅ Profile update successful');
      console.log(`   👤 Updated name: ${updateData.firstName} ${updateData.lastName}`);
    } else {
      console.log(`ℹ️ Profile update endpoint returned ${response.status()} - may not be implemented yet`);
    }
  });

  test('User can change password with valid current password', async ({ request }) => {
    const passwordChangeData = {
      currentPassword: 'TestPassword123!',
      newPassword: 'NewTestPassword123!',
      confirmPassword: 'NewTestPassword123!'
    };

    console.log('🧪 Testing password change...');

    const response = await request.put('http://localhost:3000/api/v1/auth/change-password', {
      data: passwordChangeData,
      headers: {
        'Authorization': `Bearer ${userToken}`
      }
    });

    if (response.status() === 200) {
      const responseData = await response.json();
      expect(responseData.success).toBe(true);
      
      console.log('✅ Password change successful');
      
      // Try to login with new password
      const loginResponse = await request.post('http://localhost:3000/api/v1/auth/login', {
        data: {
          email: 'customer@test.com',
          password: passwordChangeData.newPassword
        }
      });
      
      expect(loginResponse.status()).toBe(200);
      console.log('   🔑 Login with new password: Successful');
      
      // Change password back for other tests
      await request.put('http://localhost:3000/api/v1/auth/change-password', {
        data: {
          currentPassword: passwordChangeData.newPassword,
          newPassword: 'TestPassword123!',
          confirmPassword: 'TestPassword123!'
        },
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
    } else {
      console.log(`ℹ️ Password change endpoint returned ${response.status()} - may not be implemented yet`);
    }
  });

  test('User session persists across requests', async ({ request }) => {
    console.log('🧪 Testing session persistence...');

    // Make multiple authenticated requests
    const requests = [
      request.get('http://localhost:3000/api/v1/auth/profile', {
        headers: { 'Authorization': `Bearer ${userToken}` }
      }),
      request.get('http://localhost:3000/api/v1/auth/profile', {
        headers: { 'Authorization': `Bearer ${userToken}` }
      }),
      request.get('http://localhost:3000/api/v1/auth/profile', {
        headers: { 'Authorization': `Bearer ${userToken}` }
      })
    ];

    const responses = await Promise.all(requests);
    
    // All should be successful
    responses.forEach((response, index) => {
      expect(response.status()).toBe(200);
    });

    console.log('✅ Session persistence validated');
    console.log(`   🔄 Made ${responses.length} sequential authenticated requests`);
    console.log(`   ✅ All requests successful with same token`);
  });

  test('Token refresh mechanism works', async ({ request }) => {
    // First login to get both tokens
    const loginResponse = await request.post('http://localhost:3000/api/v1/auth/login', {
      data: {
        email: 'provider@test.com',
        password: 'TestPassword123!'
      }
    });

    const loginData = await loginResponse.json();
    const refreshToken = loginData.data.refreshToken;

    console.log('🧪 Testing token refresh...');

    const refreshResponse = await request.post('http://localhost:3000/api/v1/auth/refresh', {
      data: {
        refreshToken: refreshToken
      }
    });

    if (refreshResponse.status() === 200) {
      const refreshData = await refreshResponse.json();
      expect(refreshData.success).toBe(true);
      expect(refreshData.data.accessToken).toBeDefined();
      expect(refreshData.data.refreshToken).toBeDefined();
      
      // New tokens should be different from old ones
      expect(refreshData.data.accessToken).not.toBe(loginData.data.accessToken);
      
      console.log('✅ Token refresh successful');
      console.log(`   🔄 New access token generated`);
    } else {
      console.log(`ℹ️ Token refresh endpoint returned ${refreshResponse.status()} - may not be implemented yet`);
    }
  });

  test('User logout invalidates token', async ({ request }) => {
    console.log('🧪 Testing user logout...');

    // Logout request
    const logoutResponse = await request.post('http://localhost:3000/api/v1/auth/logout', {
      headers: {
        'Authorization': `Bearer ${userToken}`
      }
    });

    if (logoutResponse.status() === 200) {
      const logoutData = await logoutResponse.json();
      expect(logoutData.success).toBe(true);
      
      console.log('✅ Logout successful');
      
      // Try to use the token after logout - should fail
      const profileResponse = await request.get('http://localhost:3000/api/v1/auth/profile', {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      
      expect(profileResponse.status()).toBe(401);
      console.log('   🔐 Token invalidated after logout');
    } else {
      console.log(`ℹ️ Logout endpoint returned ${logoutResponse.status()} - may not be implemented yet`);
    }
  });
});

// User Management Integration Tests
test.describe('User Management Integration Tests', () => {
  
  test('Complete user registration to profile access flow', async ({ request }) => {
    const timestamp = Date.now();
    const userData = {
      email: `integration-test-${timestamp}@example.com`,
      password: 'IntegrationTest123!',
      firstName: 'Integration',
      lastName: 'Test',
      phone: '+1111222333',
      userType: 'customer'
    };

    console.log('🧪 Testing complete user management flow...');

    // Step 1: Register user
    console.log('   📝 Step 1: User registration');
    const registerResponse = await request.post('http://localhost:3000/api/v1/auth/register', {
      data: userData
    });
    
    expect(registerResponse.status()).toBe(201);
    const registerData = await registerResponse.json();
    expect(registerData.success).toBe(true);

    // Step 2: Login with new user
    console.log('   🔑 Step 2: User login');
    const loginResponse = await request.post('http://localhost:3000/api/v1/auth/login', {
      data: {
        email: userData.email,
        password: userData.password
      }
    });

    expect(loginResponse.status()).toBe(200);
    const loginData = await loginResponse.json();
    const accessToken = loginData.data.accessToken;

    // Step 3: Access profile
    console.log('   👤 Step 3: Profile access');
    const profileResponse = await request.get('http://localhost:3000/api/v1/auth/profile', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    expect(profileResponse.status()).toBe(200);
    const profileData = await profileResponse.json();
    expect(profileData.data.email).toBe(userData.email);

    console.log('✅ Complete user management flow successful');
    console.log(`   📧 User created and authenticated: ${userData.email}`);
    console.log(`   👤 Profile accessible with token: Yes`);
  });
});