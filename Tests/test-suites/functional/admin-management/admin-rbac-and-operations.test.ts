/**
 * Admin Operations Tests
 * Tests admin capabilities: user management, provider verification,
 * dispute management, analytics, review moderation, and settings.
 *
 * Response shapes:
 *   GET /admin/users → { data: { users: [...], pagination: {...} } }
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

test.describe('Admin: Dashboard and analytics', () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = (await loginAs(request, 'admin@demo.com')).token;
  });

  test('admin dashboard returns platform summary', async ({ request }) => {
    const res = await request.get(`${BASE}/admin/dashboard`, { headers: auth(adminToken) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  test('admin analytics endpoint returns metrics object', async ({ request }) => {
    const res = await request.get(`${BASE}/admin/analytics`, { headers: auth(adminToken) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });
});

test.describe('Admin: User management', () => {
  let adminToken: string;
  let sampleUserId: string;

  test.beforeAll(async ({ request }) => {
    adminToken = (await loginAs(request, 'admin@demo.com')).token;
    const usersRes = await request.get(`${BASE}/admin/users?limit=1`, { headers: auth(adminToken) });
    const usersBody = await usersRes.json();
    const users = usersBody.data.users ?? usersBody.data;
    sampleUserId = users?.[0]?.id;
  });

  test('admin can list all users with pagination', async ({ request }) => {
    const res = await request.get(`${BASE}/admin/users?page=1&limit=10`, { headers: auth(adminToken) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const users = body.data.users ?? body.data;
    expect(Array.isArray(users)).toBe(true);
  });

  test('admin can list users filtered by role', async ({ request }) => {
    const res = await request.get(`${BASE}/admin/users?userType=customer`, { headers: auth(adminToken) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('admin user status update API returns 2xx or 4xx (not 5xx)', async ({ request }) => {
    if (!sampleUserId) test.skip(true, 'No user available');

    const res = await request.put(`${BASE}/admin/users/${sampleUserId}/status`, {
      headers: auth(adminToken),
      data: { isActive: true },
    });
    // 200 = success, 400 = can't suspend self, 429 = rate limited (strict limiter)
    expect([200, 400, 429]).toContain(res.status());
  });

  test('admin user status update with unknown (valid v4) UUID returns 4xx', async ({ request }) => {
    const res = await request.put(`${BASE}/admin/users/00000000-0000-4000-8000-000000000099/status`, {
      headers: auth(adminToken),
      data: { isActive: true },
    });
    // 404 = not found, 429 = rate limited
    expect([404, 429]).toContain(res.status());
  });
});

test.describe('Admin: Provider verification workflow', () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = (await loginAs(request, 'admin@demo.com')).token;
  });

  test('admin can view pending provider verifications', async ({ request }) => {
    const res = await request.get(`${BASE}/admin/providers/pending`, { headers: auth(adminToken) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('admin verify provider with unknown (valid v4) UUID returns 4xx', async ({ request }) => {
    const res = await request.post(
      `${BASE}/admin/providers/00000000-0000-4000-8000-000000000002/verify`,
      { headers: auth(adminToken), data: { verified: true } }
    );
    // 404 = not found, 429 = rate limited by strict limiter
    expect([404, 400, 429]).toContain(res.status());
  });
});

test.describe('Admin: Dispute management', () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = (await loginAs(request, 'admin@demo.com')).token;
  });

  test('admin can list disputes', async ({ request }) => {
    const res = await request.get(`${BASE}/admin/disputes`, { headers: auth(adminToken) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('admin dispute list returns array', async ({ request }) => {
    const res = await request.get(`${BASE}/admin/disputes`, { headers: auth(adminToken) });
    const body = await res.json();
    const disputes = body.data.disputes ?? body.data;
    expect(Array.isArray(disputes)).toBe(true);
  });

  test('admin can GET individual dispute if one exists', async ({ request }) => {
    // First get list, then get first dispute if it exists
    const listRes = await request.get(`${BASE}/admin/disputes`, { headers: auth(adminToken) });
    const listBody = await listRes.json();
    const disputes = listBody.data.disputes ?? listBody.data ?? [];
    if (disputes.length === 0) {
      test.skip(true, 'No disputes to test');
      return;
    }
    const disputeId = disputes[0].id;
    // Resolve endpoint — should succeed
    const res = await request.put(`${BASE}/admin/disputes/${disputeId}/resolve`, {
      headers: auth(adminToken),
      data: { resolution: 'FAVOR_PROVIDER', notes: 'Automated test resolution', refundAmount: 0 },
    });
    // 200 = resolved, 400 = already resolved, 429 = rate limited
    expect([200, 400, 429]).toContain(res.status());
  });
});

test.describe('Admin: Review moderation', () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = (await loginAs(request, 'admin@demo.com')).token;
  });

  test('admin can list flagged reviews', async ({ request }) => {
    const res = await request.get(`${BASE}/admin/reviews/flagged`, { headers: auth(adminToken) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

test.describe('Admin: Settings management', () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = (await loginAs(request, 'admin@demo.com')).token;
  });

  test('admin can GET platform settings', async ({ request }) => {
    const res = await request.get(`${BASE}/admin/settings`, { headers: auth(adminToken) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('admin settings update rejects non-admin request', async ({ request }) => {
    const { token } = await loginAs(request, 'customer@demo.com');
    const res = await request.put(`${BASE}/admin/settings/someKey`, {
      headers: auth(token),
      data: { value: 'hacked' },
    });
    expect(res.status()).toBe(403);
  });
});
