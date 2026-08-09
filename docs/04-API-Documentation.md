# Tino 2 - API Documentation

## Current favorites, rebook, and AI configuration endpoints

All routes use `/api/v1`. Authenticated routes require a JWT bearer token.

| Method | Route | Authorization | Purpose |
|---|---|---|---|
| `GET` | `/providers/favorites` | customer | List favorite providers |
| `POST` | `/providers/:id/favorite` | customer | Save a provider idempotently |
| `DELETE` | `/providers/:id/favorite` | customer | Remove a favorite idempotently |
| `GET` | `/bookings/:id/rebook-prefill` | booking customer | Return eligibility and deterministic draft |
| `POST` | `/bookings/:id/rebook-refine` | booking customer | Optionally refine an editable draft with AI |
| `GET` | `/config` | public read-only | Return sanitized app and AI model metadata |
| `GET` | `/admin/ai-configuration` | admin | Return active chains and source |
| `PUT` | `/admin/ai-configuration/:field` | admin | Validate, persist, and activate one setting |

Admin fields are `fast`, `reasoning`, `synthesis`, `rebook`, `embedding`, `transcription`,
and `speech`. Chains are comma-separated `provider:model` targets. Invalid values return
HTTP 400; responses never contain API keys. The assistant streaming endpoint emits SSE
`started`, `progress`, `token`, `complete`, and `error` events.

## Table of Contents
- [API Overview](#api-overview)
- [Authentication](#authentication)
- [API Standards](#api-standards)
- [Error Handling](#error-handling)
- [Authentication Endpoints](#authentication-endpoints)
- [User Management Endpoints](#user-management-endpoints)
- [Provider Endpoints](#provider-endpoints)
- [Booking Endpoints](#booking-endpoints)
- [Quote System Endpoints](#quote-system-endpoints)
- [Messaging Endpoints](#messaging-endpoints)
- [Payment Endpoints](#payment-endpoints)
- [Review Endpoints](#review-endpoints)
- [WebSocket Events](#websocket-events)

## API Overview

The Tino 2 API is a RESTful web service built with Express.js that provides comprehensive functionality for the domestic service marketplace. All endpoints return JSON responses and follow consistent patterns for request/response formats.

### Base URL
```
Development: http://localhost:5000/api
Production: https://api.tino2.com/api
```

### API Versioning
```
Current Version: v1 (implicit)
Future Versions: /api/v2/...
```

### Content Type
```
Request: application/json
Response: application/json
```

## Authentication

### JWT Token Authentication
The API uses JSON Web Tokens (JWT) for authentication. Tokens must be included in the Authorization header for protected endpoints.

```http
Authorization: Bearer <jwt_token>
```

### Token Structure
```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "userId": 123,
    "email": "user@example.com",
    "userType": "customer",
    "iat": 1640995200,
    "exp": 1640998800
  }
}
```

### Token Expiration
- Default expiration: 1 hour
- Refresh strategy: Re-authenticate after expiration
- Security: Tokens are stateless and cannot be revoked server-side

## API Standards

### HTTP Methods
- `GET`: Retrieve data
- `POST`: Create new resources
- `PUT`: Update existing resources
- `DELETE`: Remove resources

### Response Format
All API responses follow a consistent structure:

```json
{
  "success": true|false,
  "data": {}, // Response payload
  "message": "Human readable message",
  "error": {}, // Error details (if applicable)
  "meta": {
    "timestamp": "2024-01-01T00:00:00Z",
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

### Status Codes
- `200 OK`: Successful GET, PUT requests
- `201 Created`: Successful POST requests
- `400 Bad Request`: Invalid request data
- `401 Unauthorized`: Missing or invalid authentication
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `422 Unprocessable Entity`: Validation errors
- `500 Internal Server Error`: Server errors

## Error Handling

### Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
```

### Common Error Codes
- `VALIDATION_ERROR`: Request validation failed
- `AUTHENTICATION_REQUIRED`: Missing authentication token
- `INVALID_CREDENTIALS`: Login failed
- `ACCESS_DENIED`: Insufficient permissions
- `RESOURCE_NOT_FOUND`: Requested resource doesn't exist
- `RATE_LIMIT_EXCEEDED`: Too many requests

## Authentication Endpoints

### Register User
Create a new user account.

```http
POST /api/auth/register
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890",
  "userType": "customer"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 123,
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "userType": "customer"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message": "Registration successful"
}
```

### Login User
Authenticate user and receive JWT token.

```http
POST /api/auth/login
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 123,
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "userType": "customer"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message": "Login successful"
}
```

## User Management Endpoints

### Get User Profile
Retrieve current user's profile information.

```http
GET /api/users/profile
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 123,
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "phone": "+1234567890",
      "userType": "customer",
      "isActive": true,
      "emailVerified": true,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  }
}
```

### Update User Profile
Update current user's profile information.

```http
PUT /api/users/profile
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Smith",
  "phone": "+1234567890"
}
```

## Provider Endpoints

### Get Nearby Providers
Find service providers within specified radius.

```http
GET /api/providers/nearby?lat=40.7128&lng=-74.0060&radius=25&service=cleaning&limit=20
```

**Query Parameters:**
- `lat` (required): Latitude coordinate
- `lng` (required): Longitude coordinate
- `radius` (optional): Search radius in miles (default: 25)
- `service` (optional): Service type filter
- `limit` (optional): Maximum results (default: 20)

**Response:**
```json
{
  "success": true,
  "data": {
    "providers": [
      {
        "id": 456,
        "businessName": "CleanPro Services",
        "description": "Professional cleaning services",
        "services": ["house_cleaning", "deep_cleaning"],
        "hourlyRate": 25.00,
        "rating": 4.8,
        "totalReviews": 127,
        "distance": 2.3,
        "isVerified": true,
        "firstName": "Jane",
        "lastName": "Smith"
      }
    ]
  },
  "meta": {
    "total": 15,
    "limit": 20,
    "page": 1
  }
}
```

### Get Provider Details
Get detailed information about a specific provider.

```http
GET /api/providers/456
```

**Response:**
```json
{
  "success": true,
  "data": {
    "provider": {
      "id": 456,
      "businessName": "CleanPro Services",
      "description": "Professional cleaning with 5+ years experience",
      "services": ["house_cleaning", "deep_cleaning", "office_cleaning"],
      "hourlyRate": 25.00,
      "rating": 4.8,
      "totalReviews": 127,
      "isVerified": true,
      "serviceRadius": 30,
      "availabilitySchedule": {
        "monday": ["09:00", "17:00"],
        "tuesday": ["09:00", "17:00"]
      },
      "user": {
        "firstName": "Jane",
        "lastName": "Smith",
        "phone": "+1234567891"
      },
      "recentReviews": [
        {
          "rating": 5,
          "comment": "Excellent service!",
          "customerName": "John D.",
          "createdAt": "2024-01-15T00:00:00Z"
        }
      ]
    }
  }
}
```

### Update Provider Profile
Update provider business information (Provider only).

```http
PUT /api/providers/profile
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "businessName": "CleanPro Services LLC",
  "description": "Professional cleaning services with insurance",
  "services": ["house_cleaning", "deep_cleaning", "office_cleaning"],
  "hourlyRate": 30.00,
  "serviceRadius": 35
}
```

## Booking Endpoints

### Create Booking
Create a new service booking (Customer only).

```http
POST /api/bookings
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "providerId": 456,
  "serviceType": "house_cleaning",
  "description": "Deep cleaning for 3-bedroom apartment",
  "address": "123 Main St, New York, NY 10001",
  "scheduledDate": "2024-01-15T10:00:00Z",
  "estimatedDuration": 180
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "booking": {
      "id": 789,
      "customerId": 123,
      "providerId": 456,
      "serviceType": "house_cleaning",
      "description": "Deep cleaning for 3-bedroom apartment",
      "address": "123 Main St, New York, NY 10001",
      "scheduledDate": "2024-01-15T10:00:00Z",
      "estimatedDuration": 180,
      "status": "pending",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  },
  "message": "Booking created successfully"
}
```

### Get User Bookings
Retrieve bookings for current user.

```http
GET /api/bookings?status=pending&limit=10&page=1
Authorization: Bearer <token>
```

**Query Parameters:**
- `status` (optional): Filter by booking status
- `limit` (optional): Results per page (default: 20)
- `page` (optional): Page number (default: 1)

**Response:**
```json
{
  "success": true,
  "data": {
    "bookings": [
      {
        "id": 789,
        "serviceType": "house_cleaning",
        "description": "Deep cleaning for 3-bedroom apartment",
        "address": "123 Main St, New York, NY 10001",
        "scheduledDate": "2024-01-15T10:00:00Z",
        "status": "confirmed",
        "totalAmount": 150.00,
        "provider": {
          "businessName": "CleanPro Services",
          "firstName": "Jane",
          "lastName": "Smith",
          "phone": "+1234567891"
        }
      }
    ]
  },
  "meta": {
    "total": 25,
    "limit": 10,
    "page": 1
  }
}
```

### Update Booking Status
Update booking status (Provider only).

```http
PUT /api/bookings/789/status
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "status": "confirmed",
  "notes": "Confirmed for Tuesday 10 AM"
}
```

## Quote System Endpoints

### Create Quote Request
Submit a request for service quotes (Customer only).

```http
POST /api/quotes/request
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "serviceType": "house_cleaning",
  "description": "Weekly cleaning for 2-bedroom apartment",
  "address": "456 Oak St, Brooklyn, NY 11201",
  "latitude": 40.6892,
  "longitude": -73.9442,
  "preferredDate": "2024-01-20T10:00:00Z",
  "estimatedBudget": 100.00,
  "urgency": "medium"
}
```

### Submit Quote
Submit a quote for a request (Provider only).

```http
POST /api/quotes/123/submit
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "totalPrice": 85.00,
  "estimatedDuration": 120,
  "description": "Weekly cleaning service including bathrooms, kitchen, and common areas",
  "itemizedPricing": {
    "baseService": 60.00,
    "deepCleaning": 15.00,
    "supplies": 10.00
  },
  "validUntil": "2024-01-25T00:00:00Z",
  "notes": "I can start as early as this weekend"
}
```

### Get Quotes for Request
Retrieve all quotes for a specific request.

```http
GET /api/quotes/request/123
Authorization: Bearer <token>
```

### Accept Quote
Accept a specific quote (Customer only).

```http
PUT /api/quotes/456/accept
Authorization: Bearer <token>
```

## Messaging Endpoints

### Send Message
Send a private message to another user.

```http
POST /api/messages
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "recipientId": 456,
  "message": "Hello, I'd like to discuss the cleaning service details.",
  "messageType": "text"
}
```

### Get Conversations
List all conversations for current user.

```http
GET /api/messages/conversations
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "conversations": [
      {
        "conversationId": "123_456",
        "otherUser": {
          "id": 456,
          "firstName": "Jane",
          "lastName": "Smith",
          "userType": "provider"
        },
        "lastMessage": {
          "message": "Great! Looking forward to working with you.",
          "timestamp": "2024-01-10T15:30:00Z",
          "isRead": true
        },
        "unreadCount": 0
      }
    ]
  }
}
```

### Get Conversation Messages
Retrieve messages for a specific conversation.

```http
GET /api/messages/456?limit=50&page=1
Authorization: Bearer <token>
```

## Payment Endpoints

### Process Payment
Process payment for a booking.

```http
POST /api/payments/process
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "bookingId": 789,
  "paymentMethod": "credit_card",
  "amount": 150.00,
  "paymentToken": "tok_visa_4242"
}
```

### Get Payment History
Retrieve payment history for current user.

```http
GET /api/payments/history
Authorization: Bearer <token>
```

## Review Endpoints

### Submit Review
Submit a review for completed booking (Customer only).

```http
POST /api/reviews
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "bookingId": 789,
  "providerId": 456,
  "rating": 5,
  "comment": "Excellent service! Very thorough and professional.",
  "serviceQualityRating": 5,
  "communicationRating": 5,
  "punctualityRating": 5
}
```

### Get Provider Reviews
Retrieve reviews for a specific provider.

```http
GET /api/reviews/provider/456?limit=10&page=1
```

**Response:**
```json
{
  "success": true,
  "data": {
    "reviews": [
      {
        "id": 101,
        "rating": 5,
        "comment": "Excellent service! Very thorough and professional.",
        "serviceQualityRating": 5,
        "communicationRating": 5,
        "punctualityRating": 5,
        "customerName": "John D.",
        "createdAt": "2024-01-15T00:00:00Z",
        "isVerified": true
      }
    ],
    "summary": {
      "averageRating": 4.8,
      "totalReviews": 127,
      "ratingDistribution": {
        "5": 89,
        "4": 28,
        "3": 8,
        "2": 2,
        "1": 0
      }
    }
  }
}
```

## WebSocket Events

The API includes real-time functionality via Socket.IO for instant communication and updates.

### Connection
```javascript
const socket = io('http://localhost:5000', {
  auth: {
    token: 'your_jwt_token'
  }
});
```

### Events

#### Join Room
Join a private conversation room.
```javascript
socket.emit('join-room', conversationId);
```

#### Private Message
Send/receive private messages.
```javascript
// Send message
socket.emit('private-message', {
  roomId: conversationId,
  message: 'Hello there!',
  recipientId: 456
});

// Receive message
socket.on('private-message', (data) => {
  console.log('New message:', data.message);
});
```

#### Booking Updates
Real-time booking status updates.
```javascript
socket.on('booking-update', (data) => {
  console.log('Booking status changed:', data.status);
});
```

#### Quote Notifications
New quote submission alerts.
```javascript
socket.on('quote-notification', (data) => {
  console.log('New quote received:', data.quoteId);
});
```

#### Location Updates
Provider location updates (future feature).
```javascript
socket.on('provider-location-update', (data) => {
  console.log('Provider location updated:', data.coordinates);
});
```

### Rate Limiting

API endpoints are rate limited to prevent abuse:
- **Default limit**: 100 requests per 15 minutes per IP
- **Authentication endpoints**: 5 requests per 15 minutes per IP
- **Message endpoints**: 50 requests per 15 minutes per user

### Pagination

List endpoints support pagination with consistent parameters:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)

Response includes pagination metadata:
```json
{
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

---

*This API documentation provides comprehensive information for integrating with the Tino 2 platform. For additional support or questions, please refer to the developer portal or contact the development team.*
