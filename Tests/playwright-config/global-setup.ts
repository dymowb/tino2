import { chromium, FullConfig } from '@playwright/test';
import axios from 'axios';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting global setup for Playwright tests...');
  
  // Wait for backend server to be ready
  console.log('⏳ Waiting for backend server...');
  await waitForServer('http://localhost:3000/health', 60000);
  
  // Wait for frontend server to be ready
  console.log('⏳ Waiting for frontend server...');
  await waitForServer('http://localhost:3001', 60000);
  
  // Create test database and seed with test data
  console.log('🗄️ Setting up test database...');
  try {
    await axios.post('http://localhost:3000/api/test/setup', {
      resetDatabase: true,
      seedTestData: true
    });
    console.log('✅ Test database setup complete');
  } catch (error) {
    console.log('ℹ️ Test setup endpoint not available, continuing...');
  }
  
  // Create test users for authentication flows
  console.log('👥 Creating test users...');
  await createTestUsers();
  
  console.log('✅ Global setup completed successfully!');
}

async function waitForServer(url: string, timeout: number = 60000): Promise<void> {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    try {
      await axios.get(url, { timeout: 5000 });
      return;
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  throw new Error(`Server at ${url} did not start within ${timeout}ms`);
}

async function createTestUsers() {
  const testUsers = [
    {
      email: 'customer@test.com',
      password: 'TestPassword123!',
      firstName: 'Test',
      lastName: 'Customer',
      phone: '+1234567890',
      userType: 'customer'
    },
    {
      email: 'provider@test.com',
      password: 'TestPassword123!',
      firstName: 'Test',
      lastName: 'Provider',
      phone: '+1987654321',
      userType: 'provider'
    },
    {
      email: 'admin@test.com',
      password: 'TestPassword123!',
      firstName: 'Test',
      lastName: 'Admin',
      phone: '+1555666777',
      userType: 'admin'
    }
  ];

  for (const userData of testUsers) {
    try {
      const response = await axios.post('http://localhost:3000/api/v1/auth/register', userData);
      console.log(`✅ Created test user: ${userData.email}`);
      
      // Store credentials for tests
      process.env[`TEST_${userData.userType.toUpperCase()}_EMAIL`] = userData.email;
      process.env[`TEST_${userData.userType.toUpperCase()}_PASSWORD`] = userData.password;
      
    } catch (error: any) {
      if (error.response?.status === 409) {
        console.log(`ℹ️ Test user already exists: ${userData.email}`);
      } else {
        console.log(`⚠️ Failed to create test user ${userData.email}:`, error.message);
      }
    }
  }
}

export default globalSetup;