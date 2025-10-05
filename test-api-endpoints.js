const http = require('http');

async function makeRequest(url, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Frontend Test Client'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function testApiEndpoints() {
  console.log('🔍 TESTING BACKEND API ENDPOINTS');
  console.log('=' .repeat(50));

  const baseUrl = 'http://localhost:3000';
  const apiUrl = 'http://localhost:3000/api/v1';

  console.log(`Base URL: ${baseUrl}`);
  console.log(`API URL: ${apiUrl}`);
  console.log();

  // Test base endpoints
  console.log('📍 Testing Base Endpoints:');
  const baseEndpoints = [
    '/',
    '/health'
  ];

  for (const endpoint of baseEndpoints) {
    try {
      const response = await makeRequest(`${baseUrl}${endpoint}`);
      console.log(`${endpoint}: ${response.statusCode} - ${JSON.parse(response.body).message || 'OK'}`);
    } catch (error) {
      console.log(`${endpoint}: ERROR - ${error.message}`);
    }
  }

  console.log('\n📍 Testing Authentication Endpoints:');
  const authEndpoints = [
    { path: '/auth/login', method: 'POST', data: { email: 'test@test.com', password: 'test123' } },
    { path: '/auth/register', method: 'POST', data: { email: 'test@test.com', password: 'test123', firstName: 'Test', lastName: 'User', userType: 'customer' } },
    { path: '/auth/logout', method: 'POST', data: {} },
    { path: '/auth/refresh', method: 'POST', data: { refreshToken: 'test' } },
    { path: '/auth/me', method: 'GET', data: null }
  ];

  for (const endpoint of authEndpoints) {
    try {
      const response = await makeRequest(`${apiUrl}${endpoint.path}`, endpoint.method, endpoint.data);
      let responseBody;
      try {
        responseBody = JSON.parse(response.body);
      } catch {
        responseBody = { message: response.body.substring(0, 100) };
      }

      console.log(`${endpoint.method} ${endpoint.path}: ${response.statusCode}`);

      if (responseBody.error) {
        console.log(`  Error: ${responseBody.error}`);
      } else if (responseBody.message) {
        console.log(`  Message: ${responseBody.message}`);
      }

      // Check for "Route not found" specifically
      if (response.body.includes('Route not found')) {
        console.log(`  ❌ ROUTE NOT FOUND ERROR!`);
      } else if (response.statusCode === 400) {
        console.log(`  ✅ Endpoint exists (validation error expected)`);
      } else if (response.statusCode === 401) {
        console.log(`  ✅ Endpoint exists (authentication required)`);
      } else if (response.statusCode === 200) {
        console.log(`  ✅ Endpoint works`);
      }

    } catch (error) {
      console.log(`${endpoint.method} ${endpoint.path}: ERROR - ${error.message}`);
    }
  }

  console.log('\n📍 Testing Other API Endpoints:');
  const otherEndpoints = [
    '/users',
    '/providers',
    '/bookings',
    '/quotes',
    '/messages',
    '/payments',
    '/reviews'
  ];

  for (const endpoint of otherEndpoints) {
    try {
      const response = await makeRequest(`${apiUrl}${endpoint}`);
      let responseBody;
      try {
        responseBody = JSON.parse(response.body);
      } catch {
        responseBody = { message: response.body.substring(0, 100) };
      }

      console.log(`GET ${endpoint}: ${response.statusCode}`);

      if (response.body.includes('Route not found')) {
        console.log(`  ❌ ROUTE NOT FOUND ERROR!`);
      } else if (response.statusCode === 401) {
        console.log(`  ✅ Endpoint exists (authentication required)`);
      } else if (response.statusCode === 200) {
        console.log(`  ✅ Endpoint works`);
      }

    } catch (error) {
      console.log(`GET ${endpoint}: ERROR - ${error.message}`);
    }
  }

  console.log('\n📍 Testing Actual Demo Login:');
  try {
    const loginResponse = await makeRequest(`${apiUrl}/auth/login`, 'POST', {
      email: 'customer@demo.com',
      password: 'Demo123!'
    });

    console.log(`Demo Login Status: ${loginResponse.statusCode}`);

    let loginData;
    try {
      loginData = JSON.parse(loginResponse.body);
    } catch {
      loginData = { body: loginResponse.body.substring(0, 200) };
    }

    if (loginResponse.body.includes('Route not found')) {
      console.log(`❌ LOGIN ENDPOINT NOT FOUND!`);
      console.log(`This explains why users can't log in!`);
    } else if (loginResponse.statusCode === 200) {
      console.log(`✅ Demo login successful!`);
      console.log(`User: ${loginData.data?.user?.firstName} ${loginData.data?.user?.lastName}`);
    } else if (loginResponse.statusCode === 400) {
      console.log(`⚠️ Login endpoint exists but credentials issue`);
      console.log(`Error: ${loginData.error || loginData.message}`);
    } else if (loginResponse.statusCode === 401) {
      console.log(`⚠️ Login endpoint exists but authentication failed`);
      console.log(`Error: ${loginData.error || loginData.message}`);
    } else {
      console.log(`Response: ${JSON.stringify(loginData, null, 2)}`);
    }

  } catch (error) {
    console.log(`Demo Login: ERROR - ${error.message}`);
  }

  console.log('\n🎯 SUMMARY:');
  console.log('=' .repeat(40));
  console.log('This test checked if backend API endpoints exist and work.');
  console.log('Key findings will show which endpoints return "Route not found".');
  console.log('If auth endpoints don\'t work, that explains login issues in the frontend.');
}

testApiEndpoints().catch(console.error);