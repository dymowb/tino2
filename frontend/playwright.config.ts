import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for Tino 2 Platform
 * Phase 12 UX Customer Journey Testing
 *
 * CRITICAL: Configured to use Firefox browser exclusively
 */

export default defineConfig({
  testDir: './tests',
  timeout: 60000, // 60 seconds per test
  expect: {
    timeout: 10000 // 10 seconds for assertions
  },
  fullyParallel: false, // Run tests sequentially for better debugging
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1, // Single worker for consistent results
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results/html-report' }],
    ['json', { outputFile: 'test-results/results.json' }]
  ],
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 30000
  },

  projects: [
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        // Explicitly set browser to firefox
        browserName: 'firefox',
        // Set larger viewport for better screenshots
        viewport: { width: 1920, height: 1080 },
        // Slow down actions for better visual debugging
        actionTimeout: 15000,
        // Capture screenshots on all test steps
        screenshot: 'on',
        // Record video for failed tests
        video: 'retain-on-failure'
      },
    }
  ],

  // Screenshots will be stored in test-results directory

  // Web Server (if frontend isn't already running)
  webServer: {
    command: 'npm start',
    port: 3001,
    reuseExistingServer: !process.env.CI,
    timeout: 120000 // 2 minutes to start
  }
});