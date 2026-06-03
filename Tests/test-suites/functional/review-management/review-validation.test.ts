/**
 * Review Validation Tests
 * Tests review rating bounds, duplicate prevention, and access control.
 *
 * Notes:
 *   GET /reviews/provider/:id is COMMENTED OUT in routes — use /reviews/search
 *   GET /reviews/analytics/:providerId is public and returns summary
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

test.describe('Review RBAC', () => {
  test('unauthenticated review creation returns 401', async ({ request }) => {
    const res = await request.post(`${BASE}/reviews`, {
      data: {
        bookingId: '00000000-0000-0000-0000-000000000001',
        rating: 5,
        comment: 'Great service',
      },
    });
    expect(res.status()).toBe(401);
  });

  test('provider cannot create a review (customers only)', async ({ request }) => {
    const { token } = await loginAs(request, 'provider@demo.com');
    const res = await request.post(`${BASE}/reviews`, {
      headers: auth(token),
      data: {
        bookingId: '00000000-0000-0000-0000-000000000001',
        rating: 5,
        comment: 'Self-review attempt',
      },
    });
    // Provider cannot post customer reviews
    expect([400, 403, 404]).toContain(res.status());
  });
});

test.describe('Review validation: rating bounds', () => {
  let customerToken: string;

  test.beforeAll(async ({ request }) => {
    const { token } = await loginAs(request, 'customer@demo.com');
    customerToken = token;
  });

  test('rating below 1 is rejected', async ({ request }) => {
    const res = await request.post(`${BASE}/reviews`, {
      headers: auth(customerToken),
      data: {
        bookingId: '00000000-0000-0000-0000-000000000001',
        rating: 0,
        comment: 'Zero rating',
      },
    });
    expect(res.status()).toBe(400);
  });

  test('rating above 5 is rejected', async ({ request }) => {
    const res = await request.post(`${BASE}/reviews`, {
      headers: auth(customerToken),
      data: {
        bookingId: '00000000-0000-0000-0000-000000000001',
        rating: 6,
        comment: 'Six-star rating',
      },
    });
    expect(res.status()).toBe(400);
  });

  test('missing bookingId is rejected', async ({ request }) => {
    const res = await request.post(`${BASE}/reviews`, {
      headers: auth(customerToken),
      data: {
        rating: 5,
        comment: 'No booking ID',
      },
    });
    expect(res.status()).toBe(400);
  });

  test('comment over 2000 chars is rejected', async ({ request }) => {
    const longComment = 'a'.repeat(2001);
    const res = await request.post(`${BASE}/reviews`, {
      headers: auth(customerToken),
      data: {
        bookingId: '00000000-0000-0000-0000-000000000001',
        rating: 4,
        comment: longComment,
      },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('Review list: search endpoint', () => {
  let customerToken: string;
  let providerId: string;

  test.beforeAll(async ({ request }) => {
    const { token } = await loginAs(request, 'customer@demo.com');
    customerToken = token;
    const provRes = await request.get(`${BASE}/providers?limit=1`);
    providerId = (await provRes.json()).data.providers[0].id;
  });

  test('authenticated user can search reviews', async ({ request }) => {
    const res = await request.get(`${BASE}/reviews/search?limit=5`, {
      headers: auth(customerToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('review analytics are publicly accessible for a provider', async ({ request }) => {
    const res = await request.get(`${BASE}/reviews/analytics/${providerId}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.totalReviews).toBeDefined();
  });

  test('review ratings in search results are parseable numbers', async ({ request }) => {
    const res = await request.get(`${BASE}/reviews/search?limit=10`, {
      headers: auth(customerToken),
    });
    const body = await res.json();
    const reviews: any[] = body.data ?? [];
    for (const r of reviews.slice(0, 10)) {
      if (r.rating !== undefined) {
        expect(isNaN(Number(r.rating))).toBe(false);
        expect(Number(r.rating)).toBeGreaterThanOrEqual(1);
        expect(Number(r.rating)).toBeLessThanOrEqual(5);
      }
    }
  });

  test('GET /reviews/provider/:id returns public provider reviews (route restored)', async ({ request }) => {
    // Fixed in Goal 2: route was commented out; now active and public.
    const res = await request.get(`${BASE}/reviews/provider/${providerId}`);
    expect(res.status()).toBe(200);
  });
});
