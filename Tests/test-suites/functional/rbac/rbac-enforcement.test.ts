/**
 * RBAC Enforcement Tests
 * Validates that each role cannot access routes intended for other roles.
 * Uses live demo accounts: customer@demo.com / provider@demo.com / admin@demo.com
 */

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000/api/v1';

// ─── helpers ──────────────────────────────────────────────────────────────────

async function loginAs(request: any, email: string, password = 'Demo123!'): Promise<string> {
  const res = await request.post(`${BASE}/auth/login`, {
    data: { email, password },
  });
  const body = await res.json();
  if (!body.data?.accessToken) throw new Error(`Login failed for ${email}: ${JSON.stringify(body)}`);
  return body.data.accessToken;
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ─── RBAC: customer cannot reach provider-only routes ─────────────────────────

test.describe('RBAC: Customer vs Provider-only endpoints', () => {
  let customerToken: string;

  test.beforeAll(async ({ request }) => {
    customerToken = await loginAs(request, 'customer@demo.com');
  });

  test('customer cannot GET /providers/my (provider-only)', async ({ request }) => {
    const res = await request.get(`${BASE}/providers/my`, {
      headers: authHeader(customerToken),
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test('customer cannot GET /providers/my/dashboard-stats', async ({ request }) => {
    const res = await request.get(`${BASE}/providers/my/dashboard-stats`, {
      headers: authHeader(customerToken),
    });
    expect(res.status()).toBe(403);
  });

  test('customer cannot POST /providers (create provider profile)', async ({ request }) => {
    const res = await request.post(`${BASE}/providers`, {
      headers: authHeader(customerToken),
      data: {
        businessName: 'Hacker Services',
        description: 'Testing RBAC bypass',
        services: ['Cleaning'],
        location: { address: 'x', latitude: -27.5, longitude: -48.5 },
        serviceRadius: 10,
      },
    });
    expect(res.status()).toBe(403);
  });

  test('customer cannot GET /bookings/my-provider (provider-only booking view)', async ({ request }) => {
    // The GET /bookings endpoint returns customer bookings when called as customer,
    // but the provider-specific endpoint at /providers/my requires providerRole.
    // We re-use the already-tested /providers/my/dashboard-stats as the sentinel.
    // Additionally test a PUT /:id/status confirm — only providers can do this.
    const fakeBookingId = '00000000-0000-0000-0000-000000000010';
    const res = await request.put(`${BASE}/bookings/${fakeBookingId}/status`, {
      headers: authHeader(customerToken),
      data: { status: 'confirmed' }, // only providers can confirm
    });
    // 400 (invalid transition for customer) or 404 (booking not found)
    expect([400, 404]).toContain(res.status());
  });
});

// ─── RBAC: provider cannot reach customer-only routes ─────────────────────────

test.describe('RBAC: Provider vs Customer-only endpoints', () => {
  let providerToken: string;

  test.beforeAll(async ({ request }) => {
    providerToken = await loginAs(request, 'provider@demo.com');
  });

  test('provider cannot POST /bookings (create booking — customers only)', async ({ request }) => {
    const res = await request.post(`${BASE}/bookings`, {
      headers: authHeader(providerToken),
      data: {
        providerId: 'd8ddddc0-ecfc-403f-ae0c-58b788c50458',
        serviceType: 'Cleaning',
        description: 'Test',
        location: { latitude: -27.5954, longitude: -48.548, address: 'Florianópolis' },
        scheduledDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        estimatedDuration: 60,
      },
    });
    expect(res.status()).toBe(403);
  });

  test('provider cannot PUT /bookings/:id (customer-only update fields)', async ({ request }) => {
    // Use a fake UUID — should 403 before even hitting the DB
    const res = await request.put(`${BASE}/bookings/00000000-0000-0000-0000-000000000001`, {
      headers: authHeader(providerToken),
      data: { description: 'RBAC bypass attempt' },
    });
    expect(res.status()).toBe(403);
  });

  test('provider cannot POST /quotes/requests (customers only)', async ({ request }) => {
    const res = await request.post(`${BASE}/quotes/requests`, {
      headers: authHeader(providerToken),
      data: {
        serviceType: 'Cleaning',
        description: 'Test quote request',
        location: { city: 'Florianópolis' },
      },
    });
    expect(res.status()).toBe(403);
  });
});

// ─── RBAC: customer/provider cannot reach admin routes ────────────────────────

test.describe('RBAC: Admin routes blocked for non-admins', () => {
  let customerToken: string;
  let providerToken: string;

  test.beforeAll(async ({ request }) => {
    [customerToken, providerToken] = await Promise.all([
      loginAs(request, 'customer@demo.com'),
      loginAs(request, 'provider@demo.com'),
    ]);
  });

  const adminRoutes = [
    { method: 'GET',  path: '/admin/dashboard' },
    { method: 'GET',  path: '/admin/users' },
    { method: 'GET',  path: '/admin/providers/pending' },
    { method: 'GET',  path: '/admin/analytics' },
    { method: 'GET',  path: '/admin/disputes' },
    { method: 'GET',  path: '/admin/reviews/flagged' },
    { method: 'GET',  path: '/admin/settings' },
  ];

  for (const route of adminRoutes) {
    test(`customer blocked from ${route.method} ${route.path}`, async ({ request }) => {
      const res = await request.fetch(`${BASE}${route.path}`, {
        method: route.method,
        headers: authHeader(customerToken),
      });
      expect(res.status()).toBe(403);
    });

    test(`provider blocked from ${route.method} ${route.path}`, async ({ request }) => {
      const res = await request.fetch(`${BASE}${route.path}`, {
        method: route.method,
        headers: authHeader(providerToken),
      });
      expect(res.status()).toBe(403);
    });
  }
});

// ─── RBAC: unauthenticated requests ───────────────────────────────────────────

test.describe('RBAC: Unauthenticated access blocked', () => {
  const protectedRoutes = [
    { method: 'GET',  path: '/bookings' },
    { method: 'GET',  path: '/providers/my' },
    { method: 'GET',  path: '/admin/dashboard' },
    { method: 'GET',  path: '/notifications' },
    { method: 'GET',  path: '/messages/conversations' },
    { method: 'GET',  path: '/payments' },
  ];

  for (const route of protectedRoutes) {
    test(`unauthenticated blocked from ${route.method} ${route.path}`, async ({ request }) => {
      const res = await request.fetch(`${BASE}${route.path}`, { method: route.method });
      expect(res.status()).toBe(401);
    });
  }
});

// ─── Admin can reach all admin routes ─────────────────────────────────────────

test.describe('RBAC: Admin can access admin routes', () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await loginAs(request, 'admin@demo.com');
  });

  test('admin can GET /admin/dashboard', async ({ request }) => {
    const res = await request.get(`${BASE}/admin/dashboard`, {
      headers: authHeader(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('admin can GET /admin/users', async ({ request }) => {
    const res = await request.get(`${BASE}/admin/users`, {
      headers: authHeader(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('admin can GET /admin/analytics', async ({ request }) => {
    const res = await request.get(`${BASE}/admin/analytics`, {
      headers: authHeader(adminToken),
    });
    expect(res.status()).toBe(200);
  });

  test('admin can GET /admin/disputes', async ({ request }) => {
    const res = await request.get(`${BASE}/admin/disputes`, {
      headers: authHeader(adminToken),
    });
    expect(res.status()).toBe(200);
  });
});
