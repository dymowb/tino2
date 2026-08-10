import { defineConfig, devices } from '@playwright/test';

const reuseExistingServer =
  process.env.PLAYWRIGHT_REUSE_SERVERS === 'true' || !process.env.CI;

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './Tests/test-suites',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : 4,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { outputFolder: 'Tests/results/reports' }],
    ['json', { outputFile: 'Tests/results/test-results.json' }],
    ['junit', { outputFile: 'Tests/results/junit-results.xml' }]
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://127.0.0.1:3101',
    
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Record video on failure */
    video: 'retain-on-failure',
    
    /* Screenshot and video directories */
    viewport: { width: 1280, height: 720 },
    
    /* Global test timeout */
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  webServer: [
    {
      command:
        'if [ "${CI:-false}" != "true" ]; then docker compose up -d --wait postgres-test postgres-memory-test; fi; cd backend && npm run migration:run && npm run seed && npm run dev',
      url: 'http://127.0.0.1:3100/health',
      reuseExistingServer,
      timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: '3100',
        DATABASE_URL: 'postgresql://tino_test:tino_test@127.0.0.1:5434/tino_test',
        TEST_DATABASE_URL: 'postgresql://tino_test:tino_test@127.0.0.1:5434/tino_test',
        MEMORY_DATABASE_URL:
          'postgresql://tino_memory_test:tino_memory_test@127.0.0.1:5435/tino_memory_test',
        JWT_SECRET: 'playwright-test-secret-that-is-never-used-outside-tests',
        REDIS_ENABLED: 'false',
        ALLOWED_ORIGINS: 'http://127.0.0.1:3101,http://localhost:3101',
      },
    },
    {
      command: 'cd frontend && npm run dev',
      url: 'http://127.0.0.1:3101',
      reuseExistingServer,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_PROXY_TARGET: 'http://127.0.0.1:3100',
        VITE_PORT: '3101',
      },
    },
  ],
});
