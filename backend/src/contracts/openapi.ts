const successEnvelope = {
  type: 'object',
  required: ['success'],
  properties: {
    success: { type: 'boolean' },
    data: {},
    message: { type: 'string' },
    error: { type: 'string' },
    requestId: { type: 'string', format: 'uuid' },
  },
} as const;

export const openApiDocument = {
  openapi: '3.1.0',
  info: { title: 'Tino API', version: '1.0.0' },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: { ApiResponse: successEnvelope },
  },
  paths: {
    '/auth/login': {
      post: { tags: ['Auth'], responses: { '200': { description: 'Authenticated' } } },
    },
    '/auth/register': {
      post: { tags: ['Auth'], responses: { '201': { description: 'Registered' } } },
    },
    '/providers': {
      get: {
        tags: ['Providers'],
        responses: { '200': { description: 'Provider search results' } },
      },
    },
    '/quotes/requests': {
      get: {
        tags: ['Quotes'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Quote requests' } },
      },
      post: {
        tags: ['Quotes'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Quote request created' } },
      },
    },
    '/bookings': {
      get: {
        tags: ['Bookings'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Bookings' } },
      },
    },
    '/payments': {
      get: {
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Payments' } },
      },
    },
    '/messages/conversations': {
      get: {
        tags: ['Messages'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Conversations' } },
      },
    },
    '/notifications': {
      get: {
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Notifications' } },
      },
    },
  },
} as const;
