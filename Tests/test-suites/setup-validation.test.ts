import { test, expect } from '@playwright/test';

// Setup validation tests to ensure test environment is working correctly
test.describe('Phase 10.1: Test Environment Setup Validation', () => {
  
  test('should validate backend server is running', async ({ request }) => {
    const response = await request.get('http://localhost:3000/health');
    
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.message).toContain('running');
    
    console.log('✅ Backend server health check passed');
  });

  test('should validate frontend server is running', async ({ page }) => {
    await page.goto('http://localhost:3001');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check that the page loads successfully
    expect(await page.title()).toBeTruthy();
    
    console.log('✅ Frontend server accessibility check passed');
  });

  test('should validate test directories exist', async ({ page }) => {
    const fs = require('fs');
    const path = require('path');
    
    const testDirs = [
      'Tests/playwright-config',
      'Tests/test-suites/functional',
      'Tests/test-suites/non-functional',
      'Tests/test-data',
      'Tests/results',
      'Tests/evidence',
      'Tests/optimization'
    ];
    
    for (const dir of testDirs) {
      const fullPath = path.join(process.cwd(), dir);
      expect(fs.existsSync(fullPath), `Directory ${dir} should exist`).toBe(true);
    }
    
    console.log('✅ Test directory structure validation passed');
  });

  test('should validate test configuration files exist', async ({ page }) => {
    const fs = require('fs');
    const path = require('path');
    
    const configFiles = [
      'playwright.config.ts',
      'Tests/playwright-config/global-setup.ts',
      'Tests/playwright-config/global-teardown.ts',
      'Tests/playwright-config/auth.setup.ts',
      'Tests/playwright-config/test-utils.ts',
      'Tests/test-data/test-fixtures.ts',
      'Tests/README.md'
    ];
    
    for (const file of configFiles) {
      const fullPath = path.join(process.cwd(), file);
      expect(fs.existsSync(fullPath), `Configuration file ${file} should exist`).toBe(true);
    }
    
    console.log('✅ Test configuration files validation passed');
  });

  test('should validate frontend loads without console errors', async ({ page }) => {
    // Listen for console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Navigate to frontend
    await page.goto('http://localhost:3001');
    await page.waitForLoadState('networkidle');

    // Check that no critical console errors occurred
    const criticalErrors = consoleErrors.filter(error => 
      !error.includes('manifest.json') && // Ignore PWA manifest errors
      !error.includes('favicon.ico') &&  // Ignore favicon errors
      !error.includes('Service Worker') // Ignore SW errors in dev
    );

    expect(criticalErrors.length, `Found console errors: ${criticalErrors.join(', ')}`).toBe(0);
    
    console.log('✅ Frontend console error validation passed');
  });

  test('should validate API endpoints are accessible', async ({ request }) => {
    const endpoints = [
      { path: '/api/v1/auth/register', method: 'POST', expectStatus: 400 }, // Should return validation error
      { path: '/api/v1/providers', method: 'GET', expectStatus: [200, 401] }, // Should return data or require auth
    ];

    for (const endpoint of endpoints) {
      const response = await request.fetch(`http://localhost:3000${endpoint.path}`, {
        method: endpoint.method,
        headers: { 'Content-Type': 'application/json' }
      });

      const statusMatches = Array.isArray(endpoint.expectStatus) 
        ? endpoint.expectStatus.includes(response.status())
        : response.status() === endpoint.expectStatus;

      expect(statusMatches, 
        `Endpoint ${endpoint.method} ${endpoint.path} returned ${response.status()}, expected ${endpoint.expectStatus}`
      ).toBe(true);
    }
    
    console.log('✅ API endpoint accessibility validation passed');
  });

  test('should validate browsers are installed', async ({ browserName }) => {
    // This test runs for each browser project
    expect(['chromium', 'firefox', 'webkit'].includes(browserName)).toBe(true);
    console.log(`✅ Browser ${browserName} is available for testing`);
  });
});

// Evidence collection test
test.describe('Evidence Collection Validation', () => {
  test('should take and save evidence screenshot', async ({ page }) => {
    const { TestUtils } = require('../playwright-config/test-utils');
    const utils = new TestUtils(page);
    
    await page.goto('http://localhost:3001');
    await page.waitForLoadState('networkidle');
    
    // Take evidence screenshot
    const screenshotPath = await utils.takeEvidenceScreenshot('setup-validation', 'frontend-load');
    
    const fs = require('fs');
    expect(fs.existsSync(screenshotPath), 'Evidence screenshot should be saved').toBe(true);
    
    console.log(`✅ Evidence screenshot saved: ${screenshotPath}`);
  });
});