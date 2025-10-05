const { firefox } = require('playwright');
const fs = require('fs');
const path = require('path');

async function testFrontendRouting() {
  let browser;
  let context;
  let page;

  try {
    console.log('🚀 Starting Tino 2 Frontend Testing with Firefox...\n');

    // Create screenshots directory
    const screenshotsDir = '/home/jrdymdymo/domestic-service-app/test-screenshots';
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    // Launch Firefox browser
    browser = await firefox.launch({
      headless: false, // Set to true if running in CI
      slowMo: 1000,   // Slow down actions for better observation
      timeout: 30000
    });

    // Create browser context
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0'
    });

    // Create new page
    page = await context.newPage();

    // Listen for console messages and errors
    const consoleMessages = [];
    const errors = [];

    page.on('console', msg => {
      const message = `[${msg.type().toUpperCase()}] ${msg.text()}`;
      consoleMessages.push(message);
      console.log(`Browser Console: ${message}`);
    });

    page.on('pageerror', error => {
      const errorMessage = error.toString();
      errors.push(errorMessage);
      console.log(`Browser Error: ${errorMessage}`);
    });

    // Listen for network failures
    page.on('requestfailed', request => {
      console.log(`Network Request Failed: ${request.method()} ${request.url()} - ${request.failure().errorText}`);
    });

    console.log('📍 Step 1: Navigating to http://localhost:3001...');

    // Navigate to the frontend
    try {
      const response = await page.goto('http://localhost:3001', {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      console.log(`✅ Navigation completed with status: ${response.status()}`);
      console.log(`✅ Page URL: ${page.url()}`);
      console.log(`✅ Page title: "${await page.title()}"`);

    } catch (error) {
      console.log(`❌ Navigation failed: ${error.message}`);
      await page.screenshot({ path: `${screenshotsDir}/01-navigation-failed.png`, fullPage: true });
      return;
    }

    // Take initial screenshot
    await page.screenshot({ path: `${screenshotsDir}/01-initial-load.png`, fullPage: true });
    console.log('📸 Screenshot saved: 01-initial-load.png');

    // Wait a moment for any dynamic content to load
    await page.waitForTimeout(2000);

    console.log('\n📍 Step 2: Analyzing page content...');

    // Check if page loaded properly
    const pageContent = await page.textContent('body');
    if (pageContent.includes('Route not found') || pageContent.includes('404') || pageContent.includes('Not Found')) {
      console.log('❌ FOUND: Route not found error in page content');
      console.log('Content preview:', pageContent.substring(0, 200) + '...');
    }

    // Get page HTML for debugging
    const htmlContent = await page.content();
    fs.writeFileSync(`${screenshotsDir}/01-page-html.html`, htmlContent);

    console.log('\n📍 Step 3: Testing navigation elements...');

    // Find and test common navigation elements
    const navigationTests = [
      { name: 'Login button', selectors: ['button[data-testid="login-btn"]', 'button:has-text("Login")', 'a:has-text("Login")', '[href="/login"]'] },
      { name: 'Register/Sign up', selectors: ['button:has-text("Register")', 'button:has-text("Sign Up")', 'a:has-text("Register")', 'a:has-text("Sign Up")', '[href="/register"]'] },
      { name: 'Home link', selectors: ['a:has-text("Home")', '[href="/"]', '[href="/home"]'] },
      { name: 'Services link', selectors: ['a:has-text("Services")', '[href="/services"]'] },
      { name: 'About link', selectors: ['a:has-text("About")', '[href="/about"]'] },
      { name: 'Find Providers', selectors: ['a:has-text("Find Providers")', '[href="/find-providers"]'] },
      { name: 'Navigation menu', selectors: ['nav', '.navigation', '.navbar', '.menu'] }
    ];

    for (const test of navigationTests) {
      console.log(`\n🔍 Looking for: ${test.name}`);

      let element = null;
      for (const selector of test.selectors) {
        try {
          element = await page.$(selector);
          if (element) {
            console.log(`✅ Found ${test.name} with selector: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      if (!element) {
        console.log(`❌ Could not find ${test.name} with any selector`);
        continue;
      }

      // Try to click the element
      try {
        console.log(`🖱️ Clicking on ${test.name}...`);

        // Get element info before clicking
        const elementInfo = await element.evaluate(el => ({
          tagName: el.tagName,
          text: el.textContent?.trim(),
          href: el.href,
          className: el.className,
          id: el.id
        }));
        console.log(`Element info:`, elementInfo);

        // Click and wait for navigation/changes
        await Promise.all([
          page.waitForTimeout(1000), // Wait a moment
          element.click()
        ]);

        // Check URL after click
        const newUrl = page.url();
        console.log(`📍 URL after click: ${newUrl}`);

        // Take screenshot after click
        await page.screenshot({
          path: `${screenshotsDir}/02-after-click-${test.name.replace(/[^a-zA-Z0-9]/g, '-')}.png`,
          fullPage: true
        });

        // Check for route errors
        const newContent = await page.textContent('body');
        if (newContent.includes('Route not found') || newContent.includes('404') || newContent.includes('Not Found')) {
          console.log(`❌ ROUTE ERROR: Found route not found error after clicking ${test.name}`);
          console.log('Error content preview:', newContent.substring(0, 300) + '...');
        }

        // Go back to original page for next test
        if (newUrl !== 'http://localhost:3001/') {
          await page.goto('http://localhost:3001', { waitUntil: 'networkidle' });
          await page.waitForTimeout(1000);
        }

      } catch (error) {
        console.log(`❌ Error clicking ${test.name}: ${error.message}`);
        await page.screenshot({
          path: `${screenshotsDir}/error-clicking-${test.name.replace(/[^a-zA-Z0-9]/g, '-')}.png`,
          fullPage: true
        });
      }
    }

    console.log('\n📍 Step 4: Testing login flow...');

    // Try to find and test login
    try {
      // Look for login form or login page
      let loginFound = false;

      // Try to go directly to login page
      await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);

      const loginUrl = page.url();
      const loginContent = await page.textContent('body');

      console.log(`📍 Login page URL: ${loginUrl}`);

      if (loginContent.includes('Route not found') || loginContent.includes('404')) {
        console.log('❌ ROUTE ERROR: Login page shows route not found');
      } else {
        console.log('✅ Login page loaded successfully');
        loginFound = true;
      }

      await page.screenshot({ path: `${screenshotsDir}/03-login-page.png`, fullPage: true });

      if (loginFound) {
        // Try to fill login form
        const emailField = await page.$('input[type="email"], input[name="email"], input[placeholder*="email" i]');
        const passwordField = await page.$('input[type="password"], input[name="password"]');
        const loginButton = await page.$('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")');

        if (emailField && passwordField && loginButton) {
          console.log('✅ Found login form elements');

          await emailField.fill('customer@demo.com');
          await passwordField.fill('Demo123!');

          console.log('✅ Filled in demo credentials');

          await page.screenshot({ path: `${screenshotsDir}/04-login-form-filled.png`, fullPage: true });

          // Try to submit
          await loginButton.click();
          await page.waitForTimeout(2000);

          const postLoginUrl = page.url();
          const postLoginContent = await page.textContent('body');

          console.log(`📍 URL after login attempt: ${postLoginUrl}`);

          if (postLoginContent.includes('Route not found') || postLoginContent.includes('404')) {
            console.log('❌ ROUTE ERROR: Route not found after login attempt');
          } else if (postLoginUrl.includes('dashboard') || postLoginContent.includes('dashboard') || postLoginContent.includes('welcome')) {
            console.log('✅ Login appears successful - redirected to dashboard/welcome');
          } else {
            console.log('⚠️ Login result unclear - check screenshot');
          }

          await page.screenshot({ path: `${screenshotsDir}/05-after-login.png`, fullPage: true });

        } else {
          console.log('❌ Could not find complete login form (email, password, button)');
        }
      }

    } catch (error) {
      console.log(`❌ Error during login flow: ${error.message}`);
      await page.screenshot({ path: `${screenshotsDir}/error-login-flow.png`, fullPage: true });
    }

    console.log('\n📍 Step 5: Testing other common routes...');

    const routesToTest = [
      '/register',
      '/services',
      '/about',
      '/find-providers',
      '/dashboard',
      '/profile',
      '/bookings'
    ];

    for (const route of routesToTest) {
      try {
        console.log(`\n🔍 Testing route: ${route}`);
        await page.goto(`http://localhost:3001${route}`, { waitUntil: 'networkidle', timeout: 10000 });

        const routeUrl = page.url();
        const routeContent = await page.textContent('body');

        console.log(`📍 Actual URL: ${routeUrl}`);

        if (routeContent.includes('Route not found') || routeContent.includes('404') || routeContent.includes('Not Found')) {
          console.log(`❌ ROUTE ERROR: ${route} shows route not found`);
        } else {
          console.log(`✅ Route ${route} loaded successfully`);
        }

        await page.screenshot({
          path: `${screenshotsDir}/route-${route.replace('/', 'root-').replace(/[^a-zA-Z0-9]/g, '-')}.png`,
          fullPage: true
        });

      } catch (error) {
        console.log(`❌ Error testing route ${route}: ${error.message}`);
      }
    }

    console.log('\n📊 FINAL SUMMARY:');
    console.log('='.repeat(50));
    console.log(`🌐 Frontend URL: http://localhost:3001`);
    console.log(`🔗 Backend URL: http://localhost:3000`);
    console.log(`📸 Screenshots saved in: ${screenshotsDir}`);
    console.log(`📝 Console messages captured: ${consoleMessages.length}`);
    console.log(`❌ JavaScript errors captured: ${errors.length}`);

    if (errors.length > 0) {
      console.log('\nJavaScript Errors:');
      errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error}`);
      });
    }

    if (consoleMessages.length > 0) {
      console.log('\nImportant Console Messages:');
      consoleMessages
        .filter(msg => msg.includes('ERROR') || msg.includes('404') || msg.includes('not found'))
        .slice(0, 10)
        .forEach((msg, index) => {
          console.log(`${index + 1}. ${msg}`);
        });
    }

    console.log('\n✅ Frontend testing completed!');

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  } finally {
    if (page) await page.close();
    if (context) await context.close();
    if (browser) await browser.close();
  }
}

// Run the test
testFrontendRouting().catch(console.error);