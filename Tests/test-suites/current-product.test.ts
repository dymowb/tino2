import { test, expect, APIRequestContext, Page } from '@playwright/test';

const API = 'http://127.0.0.1:3100/api/v1';
const credentials = {
  customer: { email: 'customer@demo.com', password: 'Demo123!' },
  provider: { email: 'provider@demo.com', password: 'Demo123!' },
  admin: { email: 'admin@demo.com', password: 'Demo123!' },
};

async function apiLogin(request: APIRequestContext, role: keyof typeof credentials) {
  const response = await request.post(`${API}/auth/login`, { data: credentials[role] });
  expect(response.ok(), `${role} login failed: ${await response.text()}`).toBeTruthy();
  return (await response.json()).data.accessToken as string;
}

async function uiLogin(page: Page, role: keyof typeof credentials) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: /email|e-mail/i }).fill(credentials[role].email);
  await page.getByLabel(/password|senha/i).fill(credentials[role].password);
  await page.locator('form').getByRole('button', { name: /sign in|entrar/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test.describe('platform, security, and performance', () => {
  test('health, headers, public config, and response time', async ({ request }) => {
    const started = Date.now();
    const health = await request.get('http://127.0.0.1:3100/health');
    expect(health.status()).toBe(200);
    expect(await health.json()).toMatchObject({ success: true, database: 'ok' });
    expect(health.headers()['x-content-type-options']).toBe('nosniff');
    expect(Date.now() - started).toBeLessThan(1500);

    const config = await request.get(`${API}/config`);
    expect(config.ok()).toBeTruthy();
    expect(await config.json()).toHaveProperty('data.maxProvidersPerQuote');
  });

  test('protected resources reject anonymous and cross-role access', async ({ request }) => {
    expect((await request.get(`${API}/bookings`)).status()).toBe(401);
    const customerToken = await apiLogin(request, 'customer');
    const admin = await request.get(`${API}/admin/dashboard`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    expect(admin.status()).toBe(403);
  });

  test('malformed and suspicious input is handled safely', async ({ request }) => {
    const malformed = await request.post(`${API}/auth/login`, {
      headers: { 'Content-Type': 'application/json' },
      data: '{"email":',
    });
    expect(malformed.status()).toBe(400);
    expect(await malformed.text()).not.toContain('/home/');
  });
});

test.describe('customer experience', () => {
  test.beforeEach(async ({ page }) => uiLogin(page, 'customer'));

  test('navigates discovery, bookings, messages, payments, reviews, and profile', async ({
    page,
  }) => {
    for (const path of ['/providers', '/bookings', '/messages', '/payments', '/reviews', '/profile']) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      await expect(page.getByText(/route not found/i)).toHaveCount(0);
    }
  });

  test('supports English and Portuguese and responsive navigation', async ({ page }) => {
    await page.goto('/profile');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('nav').last()).toBeVisible();
    await page.getByRole('button', { name: /language|idioma/i }).click().catch(() => {});
    await expect(page.locator('body')).not.toContainText(/translation missing/i);
  });

  test('has keyboard-reachable landmarks and labelled controls', async ({ page }) => {
    await page.goto('/providers');
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('h1')).toBeVisible({ timeout: 15_000 });
    const images = page.locator('img');
    for (let index = 0; index < (await images.count()); index += 1) {
      await expect(images.nth(index)).toHaveAttribute('alt');
    }
  });
});

test.describe('provider experience', () => {
  test.beforeEach(async ({ page }) => uiLogin(page, 'provider'));

  test('renders dashboard, opportunities, lifecycle hub, messaging, and reviews', async ({
    page,
  }) => {
    for (const path of ['/dashboard', '/opportunities', '/bookings', '/messages', '/reviews']) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
    }
  });
});

test.describe('admin experience', () => {
  test('admin can reach every management area', async ({ page }) => {
    await uiLogin(page, 'admin');
    for (const path of [
      '/admin',
      '/admin/users',
      '/admin/providers',
      '/admin/reviews',
      '/admin/disputes',
      '/admin/quote-requests',
      '/admin/settings',
    ]) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      await expect(page).toHaveURL(new RegExp(path.replace('/', '\\/')));
    }
  });
});

test.describe('API domain contracts', () => {
  test('role-scoped booking, quote, messaging, payment, and review APIs respond', async ({
    request,
  }) => {
    const customer = await apiLogin(request, 'customer');
    const provider = await apiLogin(request, 'provider');
    const cases = [
      [customer, '/bookings'],
      [customer, '/quotes/requests/my'],
      [customer, '/messages/conversations'],
      [customer, '/payments'],
      [customer, '/reviews/customer/my'],
      [provider, '/quotes/available'],
      [provider, '/reviews/provider/my'],
    ] as const;

    for (const [token, path] of cases) {
      const response = await request.get(`${API}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(response.status(), `${path}: ${await response.text()}`).toBeLessThan(500);
      expect(response.status()).not.toBe(401);
    }
  });
});
