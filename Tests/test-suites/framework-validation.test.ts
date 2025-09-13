import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Framework validation tests that don't require browser launch
test.describe('Phase 10.1: Test Framework Setup Validation', () => {
  
  test('should validate test directory structure exists', async () => {
    const testDirs = [
      'Tests/playwright-config',
      'Tests/test-suites/functional',
      'Tests/test-suites/non-functional',
      'Tests/test-data',
      'Tests/results/screenshots',
      'Tests/results/videos',
      'Tests/results/reports',
      'Tests/results/metrics',
      'Tests/evidence',
      'Tests/optimization'
    ];
    
    const missingDirs: string[] = [];
    
    for (const dir of testDirs) {
      const fullPath = path.join(process.cwd(), dir);
      if (!fs.existsSync(fullPath)) {
        missingDirs.push(dir);
      }
    }
    
    expect(missingDirs, `Missing directories: ${missingDirs.join(', ')}`).toEqual([]);
    
    console.log('✅ Test directory structure validation passed');
  });

  test('should validate configuration files exist', async () => {
    const configFiles = [
      'playwright.config.ts',
      'Tests/playwright-config/global-setup.ts',
      'Tests/playwright-config/global-teardown.ts', 
      'Tests/playwright-config/auth.setup.ts',
      'Tests/playwright-config/test-utils.ts',
      'Tests/test-data/test-fixtures.ts',
      'Tests/README.md',
      'package.json'
    ];
    
    const missingFiles: string[] = [];
    
    for (const file of configFiles) {
      const fullPath = path.join(process.cwd(), file);
      if (!fs.existsSync(fullPath)) {
        missingFiles.push(file);
      }
    }
    
    expect(missingFiles, `Missing configuration files: ${missingFiles.join(', ')}`).toEqual([]);
    
    console.log('✅ Configuration files validation passed');
  });

  test('should validate package.json contains required dependencies', async () => {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // Check dependencies
    expect(packageJson.dependencies).toBeDefined();
    expect(packageJson.dependencies['axios']).toBeDefined();
    
    // Check devDependencies
    expect(packageJson.devDependencies).toBeDefined();
    expect(packageJson.devDependencies['@playwright/test']).toBeDefined();
    
    // Check scripts
    expect(packageJson.scripts).toBeDefined();
    expect(packageJson.scripts['test']).toBe('playwright test');
    
    console.log('✅ Package.json dependencies validation passed');
  });

  test('should validate test fixtures are properly structured', async () => {
    const fixturesPath = path.join(process.cwd(), 'Tests/test-data/test-fixtures.ts');
    const fixturesContent = fs.readFileSync(fixturesPath, 'utf8');
    
    // Check for required fixtures
    const requiredFixtures = [
      'TestUsers',
      'TestProvider',
      'TestBooking',
      'TestQuoteRequest',
      'TestQuote',
      'TestMessage',
      'TestPayment',
      'TestReview',
      'PerformanceThresholds'
    ];
    
    const missingFixtures: string[] = [];
    
    for (const fixture of requiredFixtures) {
      if (!fixturesContent.includes(`export const ${fixture}`)) {
        missingFixtures.push(fixture);
      }
    }
    
    expect(missingFixtures, `Missing test fixtures: ${missingFixtures.join(', ')}`).toEqual([]);
    
    console.log('✅ Test fixtures validation passed');
  });

  test('should validate test utilities are available', async () => {
    const utilsPath = path.join(process.cwd(), 'Tests/playwright-config/test-utils.ts');
    const utilsContent = fs.readFileSync(utilsPath, 'utf8');
    
    // Check for required utility methods
    const requiredMethods = [
      'getCustomerAuthState',
      'getProviderAuthState',
      'getAdminAuthState',
      'takeEvidenceScreenshot',
      'measurePageLoadTime',
      'generateTestUser'
    ];
    
    const missingMethods: string[] = [];
    
    for (const method of requiredMethods) {
      if (!utilsContent.includes(method)) {
        missingMethods.push(method);
      }
    }
    
    expect(missingMethods, `Missing utility methods: ${missingMethods.join(', ')}`).toEqual([]);
    
    console.log('✅ Test utilities validation passed');
  });

  test('should validate playwright config is properly structured', async () => {
    const configPath = path.join(process.cwd(), 'playwright.config.ts');
    const configContent = fs.readFileSync(configPath, 'utf8');
    
    // Check for required configurations
    const requiredConfigs = [
      'testDir: \'./Tests/test-suites\'',
      'baseURL: \'http://localhost:3000\'',
      'projects:',
      // 'webServer:' // temporarily disabled
    ];
    
    const missingConfigs: string[] = [];
    
    for (const config of requiredConfigs) {
      if (!configContent.includes(config)) {
        missingConfigs.push(config);
      }
    }
    
    expect(missingConfigs, `Missing Playwright configurations: ${missingConfigs.join(', ')}`).toEqual([]);
    
    console.log('✅ Playwright configuration validation passed');
  });

  test('should validate test data can be loaded', async () => {
    // Dynamically import test fixtures
    const fixturesModule = await import('../test-data/test-fixtures');
    
    // Check that key fixtures are available
    expect(fixturesModule.TestUsers).toBeDefined();
    expect(fixturesModule.TestUsers.customer).toBeDefined();
    expect(fixturesModule.TestUsers.provider).toBeDefined();
    
    expect(fixturesModule.TestProvider).toBeDefined();
    expect(fixturesModule.TestBooking).toBeDefined();
    expect(fixturesModule.PerformanceThresholds).toBeDefined();
    
    // Validate structure of key fixtures
    expect(fixturesModule.TestUsers.customer.email).toBe('customer@test.com');
    expect(fixturesModule.TestUsers.provider.email).toBe('provider@test.com');
    
    expect(typeof fixturesModule.PerformanceThresholds.pageLoadTime).toBe('number');
    expect(typeof fixturesModule.PerformanceThresholds.apiResponseTime).toBe('number');
    
    console.log('✅ Test data loading validation passed');
  });

  test('should validate performance thresholds are reasonable', async () => {
    const fixturesModule = await import('../test-data/test-fixtures');
    const thresholds = fixturesModule.PerformanceThresholds;
    
    // Validate thresholds are within reasonable ranges
    expect(thresholds.pageLoadTime).toBeGreaterThan(0);
    expect(thresholds.pageLoadTime).toBeLessThan(10000); // Less than 10 seconds
    
    expect(thresholds.apiResponseTime).toBeGreaterThan(0);
    expect(thresholds.apiResponseTime).toBeLessThan(1000); // Less than 1 second
    
    expect(thresholds.searchResponseTime).toBeGreaterThan(0);
    expect(thresholds.searchResponseTime).toBeLessThan(2000); // Less than 2 seconds
    
    console.log('✅ Performance thresholds validation passed');
  });

  test('should validate test environment setup is complete', async () => {
    // Check for README
    const readmePath = path.join(process.cwd(), 'Tests/README.md');
    const readme = fs.readFileSync(readmePath, 'utf8');
    
    expect(readme).toContain('Tino 2 - Phase 10 End-to-End Testing Suite');
    expect(readme).toContain('Test Coverage');
    expect(readme).toContain('Running Tests');
    
    // Check that results directory has proper structure
    const resultsDir = path.join(process.cwd(), 'Tests/results');
    const subDirs = ['screenshots', 'videos', 'reports', 'metrics'];
    
    for (const subDir of subDirs) {
      const subDirPath = path.join(resultsDir, subDir);
      expect(fs.existsSync(subDirPath), `Results subdirectory ${subDir} should exist`).toBe(true);
    }
    
    console.log('✅ Test environment setup validation passed');
  });
});

// Evidence collection framework validation
test.describe('Evidence Collection Framework', () => {
  test('should validate evidence collection structure', async () => {
    const evidenceDir = path.join(process.cwd(), 'Tests/evidence');
    expect(fs.existsSync(evidenceDir), 'Evidence directory should exist').toBe(true);
    
    // Test utils should be importable
    const utilsModule = await import('../playwright-config/test-utils');
    expect(utilsModule.TestUtils).toBeDefined();
    
    console.log('✅ Evidence collection framework validation passed');
  });
});