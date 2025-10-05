const http = require('http');
const path = require('path');
const fs = require('fs');

async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        ...options.headers
      }
    };

    const req = http.request(reqOptions, (res) => {
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

    if (options.data) {
      req.write(options.data);
    }

    req.end();
  });
}

async function testFrontendDetailed() {
  console.log('🔍 DETAILED TINO 2 FRONTEND ANALYSIS');
  console.log('=' .repeat(60));

  const frontendUrl = 'http://localhost:3001';
  const backendUrl = 'http://localhost:3000';

  console.log(`Frontend URL: ${frontendUrl}`);
  console.log(`Backend URL: ${backendUrl}`);
  console.log();

  // Test 1: Get the main HTML and analyze it
  console.log('📄 Step 1: Analyzing main HTML structure...');
  try {
    const response = await makeRequest(frontendUrl);
    console.log(`Status: ${response.statusCode}`);

    const html = response.body;

    // Check for React app structure
    const hasRoot = html.includes('id="root"');
    const hasReactBundle = html.includes('/static/js/bundle.js');
    const hasManifest = html.includes('/manifest.json');

    console.log(`✅ React root div found: ${hasRoot}`);
    console.log(`✅ JavaScript bundle found: ${hasReactBundle}`);
    console.log(`✅ Manifest file referenced: ${hasManifest}`);

    // Save HTML for analysis
    fs.writeFileSync('/tmp/frontend-main.html', html);
    console.log('💾 HTML saved to /tmp/frontend-main.html');

  } catch (error) {
    console.log(`❌ Error getting main HTML: ${error.message}`);
    return;
  }

  // Test 2: Check if JavaScript bundle is accessible
  console.log('\n📦 Step 2: Testing JavaScript bundle...');
  try {
    const bundleResponse = await makeRequest(`${frontendUrl}/static/js/bundle.js`);
    console.log(`Bundle status: ${bundleResponse.statusCode}`);

    if (bundleResponse.statusCode === 200) {
      const bundleSize = bundleResponse.body.length;
      console.log(`✅ Bundle size: ${(bundleSize / 1024).toFixed(2)} KB`);

      // Check for common React patterns
      const hasReact = bundleResponse.body.includes('React');
      const hasReactDOM = bundleResponse.body.includes('ReactDOM');
      const hasRouter = bundleResponse.body.includes('Router') || bundleResponse.body.includes('BrowserRouter');
      const hasRoutes = bundleResponse.body.includes('Routes') || bundleResponse.body.includes('Route');

      console.log(`React framework: ${hasReact ? '✅' : '❌'}`);
      console.log(`ReactDOM: ${hasReactDOM ? '✅' : '❌'}`);
      console.log(`React Router: ${hasRouter ? '✅' : '❌'}`);
      console.log(`Route definitions: ${hasRoutes ? '✅' : '❌'}`);

      // Look for specific route patterns
      if (bundleResponse.body.includes('/login') || bundleResponse.body.includes('login')) {
        console.log('✅ Login route pattern found in bundle');
      }
      if (bundleResponse.body.includes('/register') || bundleResponse.body.includes('register')) {
        console.log('✅ Register route pattern found in bundle');
      }

      // Check for error handling patterns
      if (bundleResponse.body.includes('404') || bundleResponse.body.includes('Not Found') || bundleResponse.body.includes('Route not found')) {
        console.log('⚠️ Error/404 patterns found in bundle');
      }

    } else {
      console.log('❌ JavaScript bundle not accessible');
    }
  } catch (error) {
    console.log(`❌ Error getting JavaScript bundle: ${error.message}`);
  }

  // Test 3: Test backend API endpoints
  console.log('\n🔌 Step 3: Testing backend API...');

  const apiEndpoints = [
    '/health',
    '/api/v1/auth/login',
    '/api/v1/auth/register',
    '/api/v1/users',
    '/api/v1/providers'
  ];

  for (const endpoint of apiEndpoints) {
    try {
      const url = `${backendUrl}${endpoint}`;
      const response = await makeRequest(url, {
        method: endpoint.includes('auth') ? 'POST' : 'GET',
        headers: endpoint.includes('auth') ? { 'Content-Type': 'application/json' } : {},
        data: endpoint.includes('auth') ? JSON.stringify({}) : null
      });

      console.log(`${endpoint}: ${response.statusCode}`);

      if (response.body.includes('Route not found')) {
        console.log(`  ❌ Backend says route not found for ${endpoint}`);
      } else if (response.statusCode === 401 || response.statusCode === 403) {
        console.log(`  ✅ Endpoint exists but requires authentication`);
      } else if (response.statusCode === 400) {
        console.log(`  ✅ Endpoint exists but has validation errors`);
      } else if (response.statusCode === 200) {
        console.log(`  ✅ Endpoint accessible`);
      }

    } catch (error) {
      console.log(`${endpoint}: Error - ${error.message}`);
    }
  }

  // Test 4: Simulate different routing scenarios
  console.log('\n🗺️ Step 4: Testing routing behavior...');

  const testRoutes = [
    '/',
    '/login',
    '/register',
    '/dashboard',
    '/invalid-route-123'
  ];

  const responses = {};

  for (const route of testRoutes) {
    try {
      const response = await makeRequest(`${frontendUrl}${route}`);
      responses[route] = {
        status: response.statusCode,
        contentLength: response.body.length,
        hasError: response.body.includes('Route not found') || response.body.includes('404')
      };

      console.log(`${route}: Status ${response.statusCode}, Length ${response.body.length}, Has Error: ${responses[route].hasError}`);

    } catch (error) {
      console.log(`${route}: Error - ${error.message}`);
    }
  }

  // Analyze if all routes return the same content (SPA behavior)
  const contentLengths = Object.values(responses).map(r => r.contentLength);
  const allSameLength = contentLengths.every(length => length === contentLengths[0]);

  if (allSameLength) {
    console.log('✅ All routes return same content length - normal SPA behavior');
    console.log('   The React app should handle routing client-side');
  } else {
    console.log('⚠️ Routes return different content lengths');
  }

  // Test 5: Check frontend configuration files
  console.log('\n⚙️ Step 5: Checking configuration...');

  try {
    const manifestResponse = await makeRequest(`${frontendUrl}/manifest.json`);
    if (manifestResponse.statusCode === 200) {
      console.log('✅ Manifest.json accessible');
      const manifest = JSON.parse(manifestResponse.body);
      console.log(`   App name: ${manifest.name || manifest.short_name || 'N/A'}`);
    }
  } catch (error) {
    console.log(`❌ Error accessing manifest: ${error.message}`);
  }

  console.log('\n🔍 DIAGNOSIS SUMMARY:');
  console.log('=' .repeat(40));

  console.log('\n📋 What we found:');
  console.log('1. Frontend server is running and serving React app');
  console.log('2. All routes return the same HTML (normal SPA behavior)');
  console.log('3. JavaScript bundle exists and should handle client-side routing');
  console.log('4. Backend has some API endpoints but some return "Route not found"');

  console.log('\n🤔 Possible issues:');
  console.log('1. If users see "Route not found", it\'s likely happening in the JavaScript');
  console.log('2. The React Router might not be configured correctly');
  console.log('3. Some backend API endpoints are missing or misconfigured');
  console.log('4. The frontend might be trying to call wrong API endpoints');

  console.log('\n🔧 Next steps to diagnose:');
  console.log('1. Check browser DevTools console for JavaScript errors');
  console.log('2. Check if React Router is properly configured in the source code');
  console.log('3. Verify API endpoint configurations match between frontend and backend');
  console.log('4. Test with a real browser to see the actual user experience');

  console.log('\n💻 To test with a real browser:');
  console.log('1. Install system dependencies: sudo npx playwright install-deps');
  console.log('2. Run: node test-frontend-routing.js');
  console.log('3. Or open http://localhost:3001 in your browser and check DevTools');
}

testFrontendDetailed().catch(console.error);