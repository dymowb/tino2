const http = require('http');
const https = require('https');

async function makeRequest(url, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    };

    if (data) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(data);
    }

    const protocol = urlObj.protocol === 'https:' ? https : http;

    const req = protocol.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body,
          url: url
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (data) {
      req.write(data);
    }

    req.end();
  });
}

async function testFrontendBasic() {
  console.log('🚀 Starting Basic Tino 2 Frontend Analysis...\n');

  const baseUrls = {
    frontend: 'http://localhost:3001',
    backend: 'http://localhost:3000'
  };

  console.log('📍 Step 1: Testing if servers are running...\n');

  // Test if backend is running
  try {
    const backendResponse = await makeRequest(`${baseUrls.backend}/api/health`);
    console.log(`✅ Backend (${baseUrls.backend}): Status ${backendResponse.statusCode}`);
  } catch (error) {
    console.log(`❌ Backend (${baseUrls.backend}): ${error.message}`);
  }

  // Test frontend root
  try {
    const frontendResponse = await makeRequest(baseUrls.frontend);
    console.log(`✅ Frontend (${baseUrls.frontend}): Status ${frontendResponse.statusCode}`);

    if (frontendResponse.body.includes('Route not found') || frontendResponse.body.includes('404')) {
      console.log('❌ ROUTE ERROR: Root path shows route not found!');
      console.log('Response preview:', frontendResponse.body.substring(0, 500));
    } else {
      console.log('✅ Root path loads content (no immediate route error)');

      // Look for React app indicators
      if (frontendResponse.body.includes('react') || frontendResponse.body.includes('root')) {
        console.log('✅ Detected React app structure');
      }

      // Look for routing indicators
      if (frontendResponse.body.includes('router') || frontendResponse.body.includes('Router')) {
        console.log('✅ Detected routing configuration');
      }
    }
  } catch (error) {
    console.log(`❌ Frontend (${baseUrls.frontend}): ${error.message}`);
    return;
  }

  console.log('\n📍 Step 2: Testing common routes...\n');

  const routesToTest = [
    '/',
    '/login',
    '/register',
    '/dashboard',
    '/services',
    '/about',
    '/find-providers',
    '/profile',
    '/bookings',
    '/non-existent-route'  // This should show 404
  ];

  for (const route of routesToTest) {
    try {
      const url = `${baseUrls.frontend}${route}`;
      console.log(`🔍 Testing: ${url}`);

      const response = await makeRequest(url);

      console.log(`   Status: ${response.statusCode}`);

      if (response.body.includes('Route not found') || response.body.includes('404') || response.body.includes('Not Found')) {
        if (route === '/non-existent-route') {
          console.log('   ✅ Correctly shows 404 for non-existent route');
        } else {
          console.log(`   ❌ ROUTE ERROR: Shows route not found for ${route}`);
        }
      } else {
        if (route === '/non-existent-route') {
          console.log('   ⚠️ Non-existent route does not show 404 (may be caught by catch-all)');
        } else {
          console.log(`   ✅ Route ${route} loads content`);
        }
      }

      // Check if it's just serving the same HTML for all routes (SPA behavior)
      const htmlLength = response.body.length;
      console.log(`   Content length: ${htmlLength} chars`);

    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }

  console.log('\n📍 Step 3: Analyzing frontend build and routing setup...\n');

  // Check if frontend is properly built
  try {
    const staticFiles = [
      '/static/js',
      '/static/css',
      '/manifest.json',
      '/favicon.ico'
    ];

    for (const file of staticFiles) {
      try {
        const response = await makeRequest(`${baseUrls.frontend}${file}`);
        if (response.statusCode === 200) {
          console.log(`✅ Static file ${file}: Available`);
        } else {
          console.log(`⚠️ Static file ${file}: Status ${response.statusCode}`);
        }
      } catch (error) {
        console.log(`❌ Static file ${file}: ${error.message}`);
      }
    }
  } catch (error) {
    console.log(`❌ Error testing static files: ${error.message}`);
  }

  console.log('\n📍 Step 4: Testing API endpoints...\n');

  const apiEndpoints = [
    '/api/auth/me',
    '/api/health',
    '/api/users',
    '/api/providers'
  ];

  for (const endpoint of apiEndpoints) {
    try {
      const url = `${baseUrls.backend}${endpoint}`;
      console.log(`🔍 Testing API: ${url}`);

      const response = await makeRequest(url);
      console.log(`   Status: ${response.statusCode}`);

      if (response.statusCode === 404) {
        console.log(`   ❌ API endpoint not found: ${endpoint}`);
      } else if (response.statusCode === 401) {
        console.log(`   ✅ API endpoint exists but requires auth: ${endpoint}`);
      } else if (response.statusCode === 200) {
        console.log(`   ✅ API endpoint accessible: ${endpoint}`);
      } else {
        console.log(`   ⚠️ API endpoint returned: ${response.statusCode}`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }

  console.log('\n📊 ANALYSIS SUMMARY:');
  console.log('='.repeat(50));
  console.log('This basic test checked:');
  console.log('1. ✅ Server connectivity');
  console.log('2. ✅ Route responses');
  console.log('3. ✅ Static file serving');
  console.log('4. ✅ API endpoint availability');
  console.log('\nFor detailed browser testing, install system dependencies:');
  console.log('sudo npx playwright install-deps');
  console.log('\nThen run the full browser test with:');
  console.log('node test-frontend-routing.js');
}

testFrontendBasic().catch(console.error);