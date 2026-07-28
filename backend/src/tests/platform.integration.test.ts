import request from 'supertest';
import App from '@/app';

describe('platform integration contracts', () => {
  const server = new App().app;

  test('reports database readiness', async () => {
    const response = await request(server).get('/health').expect(200);
    expect(response.body).toMatchObject({
      success: true,
      database: 'ok',
      environment: 'test',
      jobs: {},
    });
  });

  test('propagates valid request IDs and generates invalid ones', async () => {
    const supplied = await request(server)
      .get('/health')
      .set('x-request-id', 'test-request-123')
      .expect(200);
    expect(supplied.headers['x-request-id']).toBe('test-request-123');

    const generated = await request(server).get('/health').set('x-request-id', 'bad').expect(200);
    expect(generated.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  test('publishes the machine-readable API contract', async () => {
    const response = await request(server).get('/api/v1/openapi.json').expect(200);
    expect(response.body.openapi).toBe('3.1.0');
    expect(response.body.paths).toHaveProperty('/quotes/requests');
    expect(response.body.components.securitySchemes).toHaveProperty('bearerAuth');
  });

  test.each([
    ['GET', '/api/v1/bookings'],
    ['GET', '/api/v1/messages/conversations'],
    ['GET', '/api/v1/notifications'],
    ['GET', '/api/v1/payments'],
    ['GET', '/api/v1/memory'],
  ])('protects %s %s', async (method, path) => {
    const response = await request(server)[method.toLowerCase() as 'get'](path);
    expect([401, 404]).toContain(response.status);
  });

  test('returns security headers and a stable JSON 404', async () => {
    const response = await request(server).get('/api/v1/not-a-route').expect(404);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.body).toMatchObject({ success: false, error: 'Route not found' });
  });

  test('rejects malformed JSON without exposing a stack trace', async () => {
    const response = await request(server)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":')
      .expect(400);
    expect(response.body.stack).toBeUndefined();
  });

  test('rejects unsigned Stripe webhooks', async () => {
    await request(server)
      .post('/api/v1/payments/webhook/stripe')
      .set('Content-Type', 'application/json')
      .send(Buffer.from('{}'))
      .expect(400);
  });
});
