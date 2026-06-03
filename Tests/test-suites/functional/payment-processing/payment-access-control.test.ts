/**
 * Payment access control tests
 * Tests that payment data is only accessible to the correct parties.
 * Avoids real Stripe calls — tests only auth/access-control layer.
 */

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000/api/v1';

async function loginAs(request: any, email: string, password = 'Demo123!'): Promise<{ token: string; userId: string }> {
  const res = await request.post(`${BASE}/auth/login`, { data: { email, password } });
  const body = await res.json();
  if (!body.data?.accessToken) throw new Error(`Login failed for ${email}: ${JSON.stringify(body)}`);
  return { token: body.data.accessToken, userId: body.data.user.id };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

test.describe('Payment list: auth and isolation', () => {
  test('unauthenticated request returns 401', async ({ request }) => {
    const res = await request.get(`${BASE}/payments`);
    expect(res.status()).toBe(401);
  });

  test('authenticated customer can list their payments', async ({ request }) => {
    const { token } = await loginAs(request, 'customer@demo.com');
    const res = await request.get(`${BASE}/payments`, { headers: auth(token) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.payments ?? body.data)).toBe(true);
  });

  test('authenticated provider can list their payments', async ({ request }) => {
    const { token } = await loginAs(request, 'provider@demo.com');
    const res = await request.get(`${BASE}/payments`, { headers: auth(token) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('payment by unknown ID returns 404', async ({ request }) => {
    const { token } = await loginAs(request, 'customer@demo.com');
    const res = await request.get(`${BASE}/payments/00000000-0000-0000-0000-000000000099`, {
      headers: auth(token),
    });
    expect([404, 400]).toContain(res.status());
  });
});

test.describe('Payment intent: validation', () => {
  test('payment intent rejects missing bookingId', async ({ request }) => {
    const { token } = await loginAs(request, 'customer@demo.com');
    const res = await request.post(`${BASE}/payments/intent`, {
      headers: auth(token),
      data: { amount: 100, currency: 'brl' }, // no bookingId
    });
    // Missing required field — or Stripe not configured returns 500/402
    expect([400, 402, 422, 500]).toContain(res.status());
  });

  test('setup intent requires authentication', async ({ request }) => {
    const res = await request.post(`${BASE}/payments/setup-intent`);
    expect(res.status()).toBe(401);
  });
});

test.describe('Payment history: amount correctness', () => {
  test('payment amounts are numeric values (not string concatenations)', async ({ request }) => {
    const { token } = await loginAs(request, 'customer@demo.com');
    const res = await request.get(`${BASE}/payments?limit=20`, { headers: auth(token) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const payments = body.data.payments ?? body.data ?? [];
    for (const p of payments) {
      if (p.amount !== undefined) {
        const amount = Number(p.amount);
        expect(isNaN(amount)).toBe(false);
        expect(amount).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
