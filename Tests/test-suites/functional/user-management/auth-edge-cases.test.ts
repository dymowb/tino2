/**
 * Auth edge case tests
 * Covers registration, login errors, token expiry, profile update, and password flow.
 * Extends user-authentication.test.ts — does NOT duplicate its happy paths.
 */

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000/api/v1';

// ─── Registration edge cases ───────────────────────────────────────────────────

test.describe('Registration edge cases', () => {
  test('registration rejects duplicate email', async ({ request }) => {
    const res = await request.post(`${BASE}/auth/register`, {
      data: {
        email: 'customer@demo.com', // already exists
        password: 'NewPassword123!',
        firstName: 'Dup',
        lastName: 'User',
        phone: '+5548999990001',
        userType: 'customer',
      },
    });
    expect([400, 409]).toContain(res.status());
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test('registration rejects weak password (< 8 chars)', async ({ request }) => {
    const ts = Date.now();
    const res = await request.post(`${BASE}/auth/register`, {
      data: {
        email: `weakpw-${ts}@test.com`,
        password: 'abc',
        firstName: 'Weak',
        lastName: 'Pass',
        phone: '+5548999990002',
        userType: 'customer',
      },
    });
    expect(res.status()).toBe(400);
  });

  test('registration rejects invalid email format', async ({ request }) => {
    const res = await request.post(`${BASE}/auth/register`, {
      data: {
        email: 'not-an-email',
        password: 'ValidPass123!',
        firstName: 'Bad',
        lastName: 'Email',
        phone: '+5548999990003',
        userType: 'customer',
      },
    });
    expect(res.status()).toBe(400);
  });

  test('registration rejects missing required fields', async ({ request }) => {
    const res = await request.post(`${BASE}/auth/register`, {
      data: {
        email: `missing-${Date.now()}@test.com`,
        // password missing
        firstName: 'NoPass',
        userType: 'customer',
      },
    });
    expect(res.status()).toBe(400);
  });

  test('registration rejects invalid userType', async ({ request }) => {
    const ts = Date.now();
    const res = await request.post(`${BASE}/auth/register`, {
      data: {
        email: `badtype-${ts}@test.com`,
        password: 'ValidPass123!',
        firstName: 'Bad',
        lastName: 'Type',
        phone: '+5548999990004',
        userType: 'superuser', // invalid
      },
    });
    expect(res.status()).toBe(400);
  });
});

// ─── Login edge cases ─────────────────────────────────────────────────────────

test.describe('Login edge cases', () => {
  test('login rejects non-existent email', async ({ request }) => {
    const res = await request.post(`${BASE}/auth/login`, {
      data: { email: 'nobody@nonexistent.invalid', password: 'SomePass123!' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test('login rejects correct email but wrong password', async ({ request }) => {
    const res = await request.post(`${BASE}/auth/login`, {
      data: { email: 'customer@demo.com', password: 'WrongPassword999!' },
    });
    expect(res.status()).toBe(401);
  });

  test('login rejects missing password field', async ({ request }) => {
    const res = await request.post(`${BASE}/auth/login`, {
      data: { email: 'customer@demo.com' },
    });
    expect(res.status()).toBe(400);
  });

  test('login rejects empty credentials', async ({ request }) => {
    const res = await request.post(`${BASE}/auth/login`, {
      data: { email: '', password: '' },
    });
    expect(res.status()).toBe(400);
  });
});

// ─── Token validation ─────────────────────────────────────────────────────────

test.describe('Token validation', () => {
  test('malformed JWT returns 401', async ({ request }) => {
    const res = await request.get(`${BASE}/auth/profile`, {
      headers: { Authorization: 'Bearer this.is.notajwt' },
    });
    expect(res.status()).toBe(401);
  });

  test('missing Authorization header returns 401', async ({ request }) => {
    const res = await request.get(`${BASE}/auth/profile`);
    expect(res.status()).toBe(401);
  });

  test('completely wrong token format returns 401', async ({ request }) => {
    const res = await request.get(`${BASE}/auth/profile`, {
      headers: { Authorization: 'NotBearer abc' },
    });
    expect(res.status()).toBe(401);
  });

  test('valid token returns profile', async ({ request }) => {
    const loginRes = await request.post(`${BASE}/auth/login`, {
      data: { email: 'customer@demo.com', password: 'Demo123!' },
    });
    const loginBody = await loginRes.json();
    const token = loginBody.data.accessToken;

    const res = await request.get(`${BASE}/auth/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.email).toBe('customer@demo.com');
  });
});

// ─── Profile update ───────────────────────────────────────────────────────────

test.describe('Profile update', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${BASE}/auth/login`, {
      data: { email: 'customer@demo.com', password: 'Demo123!' },
    });
    token = (await res.json()).data.accessToken;
  });

  test('authenticated user can update their own profile', async ({ request }) => {
    const res = await request.put(`${BASE}/auth/profile`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { firstName: 'UpdatedFirst', lastName: 'UpdatedLast' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('profile update rejects invalid phone format', async ({ request }) => {
    const res = await request.put(`${BASE}/auth/profile`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { phone: 'not-a-phone' },
    });
    expect([400, 422]).toContain(res.status());
  });
});

// ─── Password change ──────────────────────────────────────────────────────────

test.describe('Password change', () => {
  test('password change rejects wrong current password', async ({ request }) => {
    const loginRes = await request.post(`${BASE}/auth/login`, {
      data: { email: 'customer@demo.com', password: 'Demo123!' },
    });
    const token = (await loginRes.json()).data.accessToken;

    const res = await request.put(`${BASE}/auth/password`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        currentPassword: 'WrongCurrentPassword!',
        newPassword: 'NewPassword456!',
      },
    });
    expect([400, 401]).toContain(res.status());
  });

  test('password change rejects weak new password', async ({ request }) => {
    const loginRes = await request.post(`${BASE}/auth/login`, {
      data: { email: 'customer@demo.com', password: 'Demo123!' },
    });
    const token = (await loginRes.json()).data.accessToken;

    const res = await request.put(`${BASE}/auth/password`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        currentPassword: 'Demo123!',
        newPassword: 'abc',
      },
    });
    expect(res.status()).toBe(400);
  });
});

// ─── Forgot password flow ─────────────────────────────────────────────────────

test.describe('Forgot password flow', () => {
  test('forgot-password returns success for existing email', async ({ request }) => {
    const res = await request.post(`${BASE}/auth/forgot-password`, {
      data: { email: 'customer@demo.com' },
    });
    // Should always return 200 (don't leak whether email exists)
    expect(res.status()).toBe(200);
  });

  test('forgot-password returns success for non-existent email (no user enumeration)', async ({ request }) => {
    const res = await request.post(`${BASE}/auth/forgot-password`, {
      data: { email: 'doesnotexist@tino.invalid' },
    });
    // Must not return 404 — that would leak whether an account exists
    expect(res.status()).toBe(200);
  });

  test('reset-password rejects invalid token', async ({ request }) => {
    const res = await request.post(`${BASE}/auth/reset-password`, {
      data: { token: 'totally-invalid-reset-token', newPassword: 'NewPass123!' },
    });
    expect([400, 401]).toContain(res.status());
  });
});
