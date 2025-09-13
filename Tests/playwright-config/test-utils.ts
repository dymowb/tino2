import { Page, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';

export class TestUtils {
  constructor(private page: Page) {}

  // Authentication helpers
  static getCustomerAuthState() {
    return path.join(__dirname, '../test-data/customer-auth.json');
  }

  static getProviderAuthState() {
    return path.join(__dirname, '../test-data/provider-auth.json');
  }

  static getAdminAuthState() {
    return path.join(__dirname, '../test-data/admin-auth.json');
  }

  // Navigation helpers
  async navigateToLogin() {
    await this.page.goto('/login');
    await this.page.waitForLoadState('networkidle');
  }

  async navigateToDashboard() {
    await this.page.goto('/dashboard');
    await this.page.waitForLoadState('networkidle');
  }

  async navigateToProviderDashboard() {
    await this.page.goto('/provider-dashboard');
    await this.page.waitForLoadState('networkidle');
  }

  // Form helpers
  async fillLoginForm(email: string, password: string) {
    await this.page.fill('[data-testid="email-input"]', email);
    await this.page.fill('[data-testid="password-input"]', password);
  }

  async submitForm(formSelector: string = 'form') {
    await this.page.click(`${formSelector} [type="submit"]`);
  }

  // Wait helpers
  async waitForToast(message?: string, timeout: number = 5000) {
    if (message) {
      await expect(this.page.locator('[data-testid="toast"]', { hasText: message }))
        .toBeVisible({ timeout });
    } else {
      await expect(this.page.locator('[data-testid="toast"]'))
        .toBeVisible({ timeout });
    }
  }

  async waitForLoadingToComplete(timeout: number = 10000) {
    await expect(this.page.locator('[data-testid="loading"]'))
      .toBeHidden({ timeout });
  }

  // API helpers
  async makeAPIRequest(endpoint: string, options: any = {}) {
    const baseURL = 'http://localhost:3000';
    
    const response = await this.page.request.fetch(`${baseURL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    return response;
  }

  async makeAuthenticatedAPIRequest(endpoint: string, options: any = {}) {
    // Get token from localStorage
    const token = await this.page.evaluate(() => {
      return localStorage.getItem('accessToken');
    });

    return this.makeAPIRequest(endpoint, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        ...options.headers
      }
    });
  }

  // Screenshot helpers
  async takeEvidenceScreenshot(testName: string, stepName: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${testName}-${stepName}-${timestamp}.png`;
    const screenshotPath = path.join(process.cwd(), 'Tests', 'results', 'screenshots', filename);
    
    await this.page.screenshot({ path: screenshotPath, fullPage: true });
    
    return screenshotPath;
  }

  async takeElementScreenshot(selector: string, filename: string) {
    const element = this.page.locator(selector);
    const screenshotPath = path.join(process.cwd(), 'Tests', 'results', 'screenshots', filename);
    
    await element.screenshot({ path: screenshotPath });
    
    return screenshotPath;
  }

  // Performance helpers
  async measurePageLoadTime() {
    const performanceTiming = await this.page.evaluate(() => {
      return JSON.stringify(performance.timing);
    });

    const timing = JSON.parse(performanceTiming);
    const loadTime = timing.loadEventEnd - timing.navigationStart;
    
    return loadTime;
  }

  async measureAPIResponseTime(endpoint: string, options: any = {}) {
    const start = performance.now();
    const response = await this.makeAPIRequest(endpoint, options);
    const end = performance.now();
    
    return {
      responseTime: end - start,
      status: response.status(),
      response
    };
  }

  // Test data helpers
  static generateTestUser(userType: 'customer' | 'provider' = 'customer') {
    const timestamp = Date.now();
    
    return {
      email: `test-${userType}-${timestamp}@example.com`,
      password: 'TestPassword123!',
      firstName: 'Test',
      lastName: `${userType.charAt(0).toUpperCase() + userType.slice(1)}`,
      phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
      userType
    };
  }

  static generateTestBooking() {
    return {
      serviceType: 'House Cleaning',
      description: 'Regular house cleaning service',
      location: {
        address: '123 Test Street, Test City, TC 12345',
        latitude: 40.7128,
        longitude: -74.0060
      },
      scheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week from now
      estimatedDuration: 2,
      specialInstructions: 'Please bring eco-friendly cleaning products'
    };
  }

  // Validation helpers
  async validateElementText(selector: string, expectedText: string) {
    await expect(this.page.locator(selector)).toContainText(expectedText);
  }

  async validateElementVisible(selector: string) {
    await expect(this.page.locator(selector)).toBeVisible();
  }

  async validateElementHidden(selector: string) {
    await expect(this.page.locator(selector)).toBeHidden();
  }

  async validateURL(expectedURL: string | RegExp) {
    if (typeof expectedURL === 'string') {
      await expect(this.page).toHaveURL(expectedURL);
    } else {
      await this.page.waitForURL(expectedURL);
    }
  }

  // Logging helpers
  async logTestStep(stepName: string, details?: any) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] TEST STEP: ${stepName}`, details ? JSON.stringify(details, null, 2) : '');
  }

  async logTestEvidence(evidenceType: string, data: any) {
    const timestamp = new Date().toISOString();
    const evidencePath = path.join(process.cwd(), 'Tests', 'evidence', `${evidenceType}-${timestamp}.json`);
    
    await fs.writeFile(evidencePath, JSON.stringify({
      timestamp,
      evidenceType,
      data
    }, null, 2));

    console.log(`[${timestamp}] EVIDENCE: ${evidenceType} saved to ${evidencePath}`);
    
    return evidencePath;
  }
}