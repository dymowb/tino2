/**
 * Messaging Tests
 * Tests conversation creation, message sending, and conversation isolation.
 *
 * Response shapes / route notes:
 *   POST /messages/conversations      → { data: { id, ... } }
 *   GET  /messages/conversations      → { data: { conversations: [...] } }
 *   POST /messages/messages           → { data: { id, ... } }  (field: 'message', not 'content')
 *   GET  /messages/conversations/:id/messages → { data: { messages: [...] } }
 *
 * SECURITY NOTE: Admin CAN read any conversation's messages (200) — this is a Gap.
 * See tino2-phase1-results.md for Goal 2 follow-up.
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

test.describe('Conversations: creation and access', () => {
  let customerToken: string;
  let providerUserId: string;

  test.beforeAll(async ({ request }) => {
    const [cust, prov] = await Promise.all([
      loginAs(request, 'customer@demo.com'),
      loginAs(request, 'provider@demo.com'),
    ]);
    customerToken = cust.token;
    providerUserId = prov.userId;
  });

  test('authenticated user can create a conversation', async ({ request }) => {
    const res = await request.post(`${BASE}/messages/conversations`, {
      headers: auth(customerToken),
      data: {
        participantIds: [providerUserId],
        type: 'direct',
      },
    });
    expect([200, 201]).toContain(res.status());
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
  });

  test('conversation requires at least one participant', async ({ request }) => {
    const res = await request.post(`${BASE}/messages/conversations`, {
      headers: auth(customerToken),
      data: {
        participantIds: [],
        type: 'direct',
      },
    });
    expect(res.status()).toBe(400);
  });

  test('conversation rejects invalid participant UUID', async ({ request }) => {
    const res = await request.post(`${BASE}/messages/conversations`, {
      headers: auth(customerToken),
      data: {
        participantIds: ['not-a-uuid'],
        type: 'direct',
      },
    });
    expect(res.status()).toBe(400);
  });

  test('authenticated user can list their conversations', async ({ request }) => {
    const res = await request.get(`${BASE}/messages/conversations`, { headers: auth(customerToken) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Shape: data.conversations (array) or data (array)
    const convs = body.data.conversations ?? body.data;
    expect(Array.isArray(convs)).toBe(true);
  });

  test('unauthenticated user cannot list conversations', async ({ request }) => {
    const res = await request.get(`${BASE}/messages/conversations`);
    expect(res.status()).toBe(401);
  });
});

test.describe.serial('Messages: sending and reading', () => {
  let customerToken: string;
  let providerToken: string;
  let providerUserId: string;
  let conversationId: string;

  test.beforeAll(async ({ request }) => {
    const [cust, prov] = await Promise.all([
      loginAs(request, 'customer@demo.com'),
      loginAs(request, 'provider@demo.com'),
    ]);
    customerToken = cust.token;
    providerToken = prov.token;
    providerUserId = prov.userId;

    const res = await request.post(`${BASE}/messages/conversations`, {
      headers: auth(customerToken),
      data: { participantIds: [providerUserId], type: 'direct' },
    });
    if ([200, 201].includes(res.status())) {
      conversationId = (await res.json()).data.id;
    }
  });

  test('participant can send a message to the conversation', async ({ request }) => {
    if (!conversationId) test.skip(true, 'No conversation available');

    // Message field is 'message' (not 'content'), route is POST /messages/messages
    const res = await request.post(`${BASE}/messages/messages`, {
      headers: auth(customerToken),
      data: {
        conversationId,
        message: 'Olá! Gostaria de confirmar o horário do serviço.',
        messageType: 'text',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('message with empty text and no attachments is rejected', async ({ request }) => {
    if (!conversationId) test.skip(true, 'No conversation available');

    const res = await request.post(`${BASE}/messages/messages`, {
      headers: auth(customerToken),
      data: {
        conversationId,
        message: '',
        messageType: 'text',
      },
    });
    // Empty message with no attachments should be rejected
    expect([400, 422]).toContain(res.status());
  });

  test('provider can read messages in the shared conversation', async ({ request }) => {
    if (!conversationId) test.skip(true, 'No conversation available');

    const res = await request.get(
      `${BASE}/messages/conversations/${conversationId}/messages`,
      { headers: auth(providerToken) }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('admin cannot read private conversation messages (returns 403)', async ({ request }) => {
    if (!conversationId) test.skip(true, 'No conversation available');

    // Admin must not be able to eavesdrop on private customer↔provider conversations.
    // Fixed in Goal 2: participant check added to MessageController.getConversationMessages.
    const { token: adminToken } = await loginAs(request, 'admin@demo.com');
    const res = await request.get(
      `${BASE}/messages/conversations/${conversationId}/messages`,
      { headers: auth(adminToken) }
    );
    expect(res.status()).toBe(403);
  });
});
