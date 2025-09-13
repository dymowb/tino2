import { test as setup, expect } from '@playwright/test';
import path from 'path';

const customerAuthFile = path.join(__dirname, '../test-data/customer-auth.json');
const providerAuthFile = path.join(__dirname, '../test-data/provider-auth.json');
const adminAuthFile = path.join(__dirname, '../test-data/admin-auth.json');

setup('authenticate as customer', async ({ page }) => {
  await page.goto('http://localhost:3001/login');
  
  // Fill login form
  await page.fill('[data-testid="email-input"]', process.env.TEST_CUSTOMER_EMAIL || 'customer@test.com');
  await page.fill('[data-testid="password-input"]', process.env.TEST_CUSTOMER_PASSWORD || 'TestPassword123!');
  
  // Click login button
  await page.click('[data-testid="login-button"]');
  
  // Wait for successful login redirect
  await page.waitForURL('http://localhost:3001/dashboard');
  await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  
  // Save authentication state
  await page.context().storageState({ path: customerAuthFile });
});

setup('authenticate as provider', async ({ page }) => {
  await page.goto('http://localhost:3001/login');
  
  // Fill login form
  await page.fill('[data-testid="email-input"]', process.env.TEST_PROVIDER_EMAIL || 'provider@test.com');
  await page.fill('[data-testid="password-input"]', process.env.TEST_PROVIDER_PASSWORD || 'TestPassword123!');
  
  // Click login button
  await page.click('[data-testid="login-button"]');
  
  // Wait for successful login redirect
  await page.waitForURL('http://localhost:3001/provider-dashboard');
  await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  
  // Save authentication state
  await page.context().storageState({ path: providerAuthFile });
});

setup('authenticate as admin', async ({ page }) => {
  await page.goto('http://localhost:3001/login');
  
  // Fill login form
  await page.fill('[data-testid="email-input"]', process.env.TEST_ADMIN_EMAIL || 'admin@test.com');
  await page.fill('[data-testid="password-input"]', process.env.TEST_ADMIN_PASSWORD || 'TestPassword123!');
  
  // Click login button
  await page.click('[data-testid="login-button"]');
  
  // Wait for successful login redirect (admin might have different dashboard)
  await page.waitForURL(/\/(dashboard|admin)/);
  await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  
  // Save authentication state
  await page.context().storageState({ path: adminAuthFile });
});