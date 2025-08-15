# Tino 2 - System Architecture Documentation

## Table of Contents
- [Architecture Overview](#architecture-overview)
- [Technology Stack](#technology-stack)
- [System Components](#system-components)
- [Data Architecture](#data-architecture)
- [Security Architecture](#security-architecture)
- [Deployment Architecture](#deployment-architecture)
- [Integration Architecture](#integration-architecture)

## Architecture Overview

Tino 2 follows a modern **microservices-oriented architecture** with a **layered approach** that separates concerns and enables scalability. The system is built using a **full-stack JavaScript** approach with **React** frontend, **Node.js** backend, and **multiple database systems** optimized for different data types.

### Architectural Principles
- **Separation of Concerns**: Clear boundaries between presentation, business logic, and data layers
- **Scalability**: Horizontal scaling capability with load balancing
- **Security First**: Multiple security layers with authentication, authorization, and data protection
- **Real-time Capability**: WebSocket-based real-time communication
- **API-First Design**: RESTful APIs with consistent interface contracts
- **Mobile Ready**: Architecture prepared for native mobile applications

### High-Level Architecture Diagram

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Frontend  │    │  Mobile Apps    │    │  Admin Panel    │
│   (React/TS)    │    │ (React Native)  │    │   (React)       │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                          ┌──────▼──────┐
                          │ Load Balancer │
                          │   (Nginx)     │
                          └──────┬──────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
              ┌─────▼─────┐             ┌─────▼─────┐
              │  API Gateway │           │  API Gateway │
              │  (Express)   │           │  (Express)   │
              └─────┬─────┘             └─────┬─────┘
                    │                         │
          ┌─────────┴─────────┐     ┌─────────┴─────────┐
          │                   │     │                   │
    ┌─────▼─────┐       ┌─────▼─────▼─────┐       ┌─────▼─────┐
    │PostgreSQL │       │   Redis Cache   │       │ MongoDB   │
    │  (Main)   │       │   (Sessions)    │       │(Messages) │
    └───────────┘       └─────────────────┘       └───────────┘
```

## Technology Stack

### Frontend Stack
```yaml
Core Framework: React 19.1.0 with TypeScript 4.9.5
State Management: React Query (@tanstack/react-query)
HTTP Client: Axios 1.10.0
Routing: React Router DOM 7.6.3
Real-time: Socket.IO Client 4.8.1
Build Tool: React Scripts 5.0.1
Testing: React Testing Library + Jest
Styling: CSS-in-JS (inline styles, prepared for styled-components)
```

### Backend Stack  
```yaml
Runtime: Node.js (18+)
Framework: Express.js 5.1.0
Authentication: JWT (jsonwebtoken 9.0.2) + bcryptjs 3.0.2
Real-time: Socket.IO 4.8.1
Validation: express-validator 7.2.1
Security: Helmet 8.1.0, CORS 2.8.5, Rate Limiting
File Upload: Multer 2.0.1
Development: nodemon 3.1.10, ESLint, Prettier
Testing: Jest 30.0.4 + Supertest 7.1.1
```

### Database Stack
```yaml
Development Database: SQLite 3 (better-sqlite3 12.2.0)
Production Database: PostgreSQL (pg 8.16.3)
Cache Layer: Redis 5.5.6
Message Store: MongoDB 6.17.0 with Mongoose 8.16.1
```

### DevOps & Infrastructure
```yaml
Container: Docker (prepared)
Process Management: PM2 (prepared)
Load Balancer: Nginx (prepared)
Monitoring: Prometheus + Grafana (prepared)
Logging: Winston (prepared)
```

## System Components

### 1. Web Application Layer

#### Frontend Components Architecture
```
src/
├── components/
│   ├── auth/              # Authentication forms
│   │   ├── LoginForm.tsx
│   │   └── RegisterForm.tsx
│   ├── layout/            # Layout components  
│   │   └── Navigation.tsx
│   └── pages/             # Page components
│       ├── HomePage.tsx
│       ├── FindProvidersPage.tsx
│       ├── MyBookingsPage.tsx
│       ├── ProviderDashboardPage.tsx
│       ├── QuoteManagementPage.tsx
│       └── ProfilePage.tsx
├── contexts/              # React Context providers
│   └── AuthContext.tsx
└── services/              # API service layer
    └── api.ts
```

#### Key Frontend Features
- **Single Page Application (SPA)**: Client-side routing with React Router
- **Responsive Design**: Mobile-first responsive layout
- **Authentication State**: Global auth context with JWT token management
- **Real-time Updates**: Socket.IO client for live updates
- **API Integration**: Centralized API service with error handling
- **Type Safety**: Full TypeScript implementation

### 2. API Gateway Layer

#### Backend Structure
```
src/
├── routes/                # API route handlers
│   ├── auth.js           # Authentication endpoints
│   ├── users.js          # User management
│   ├── providers.js      # Provider operations  
│   ├── bookings.js       # Booking management
│   ├── quotes.js         # Quote system
│   ├── messages.js       # Messaging system
│   ├── payments.js       # Payment processing
│   └── reviews.js        # Review system
├── middleware/           # Custom middleware
│   └── auth.js          # JWT authentication middleware
├── controllers/          # Business logic controllers
├── models/              # Database models/schemas
├── services/            # Business services
├── utils/               # Utility functions
├── config/              # Configuration files
│   ├── database.js      # Database connections
│   └── database-dev.js  # Development database
└── app.js              # Express application setup
```

### 3. Real-time Communication Layer

#### Socket.IO Implementation
```javascript
// Real-time event structure
Events: {
  'connection': 'User connects to system',
  'join-room': 'Join private conversation room',
  'private-message': 'Send/receive private messages',
  'booking-update': 'Booking status changes',  
  'quote-notification': 'New quote submissions',
  'location-update': 'Provider location updates',
  'disconnect': 'User disconnects from system'
}
```

#### Real-time Features
- **Private Messaging**: Room-based chat between users
- **Booking Notifications**: Live status updates
- **Quote Alerts**: Instant quote submission notifications  
- **Location Updates**: Real-time provider location tracking

### 4. Business Logic Layer

#### Core Business Services
- **Authentication Service**: User registration, login, JWT management
- **Location Service**: GPS-based provider discovery with radius calculations  
- **Booking Service**: Complete booking lifecycle management
- **Quote Service**: Competitive bidding system
- **Payment Service**: Transaction processing and management
- **Notification Service**: Multi-channel notification delivery
- **Review Service**: Rating and feedback system

## Data Architecture

### Database Design Strategy

#### Multi-Database Approach
```yaml
Primary Database (PostgreSQL/SQLite):
  Purpose: Transactional data, user profiles, bookings
  Characteristics: ACID compliance, complex relationships
  
Cache Layer (Redis):  
  Purpose: Session data, temporary data, performance optimization
  Characteristics: In-memory, fast access, TTL support
  
Document Store (MongoDB):
  Purpose: Messages, logs, flexible schema data
  Characteristics: Document-based, horizontal scaling
```

#### Database Schema Overview
```sql
-- Core Tables Structure
users (id, email, password_hash, first_name, last_name, user_type, created_at)
providers (id, user_id, business_name, description, services[], location, rating)
bookings (id, customer_id, provider_id, service_type, status, scheduled_date)
quote_requests (id, customer_id, service_type, description, location, budget)
quotes (id, quote_request_id, provider_id, price, estimated_duration)
messages (id, sender_id, recipient_id, message, timestamp)
payments (id, booking_id, amount, payment_method, status, transaction_id)
reviews (id, booking_id, customer_id, provider_id, rating, comment)
```

### Data Flow Architecture

#### Request/Response Flow
```
1. Client Request → API Gateway → Authentication Middleware
2. Route Handler → Business Service → Database Layer
3. Database Response → Business Logic → API Response
4. Real-time Events → Socket.IO → Client Updates
```

#### Data Consistency Strategy
- **ACID Transactions**: Critical business operations
- **Eventual Consistency**: Real-time updates and notifications
- **Caching Strategy**: Redis for frequently accessed data
- **Data Validation**: Input validation at API and database levels

## Security Architecture

### Authentication & Authorization

#### JWT-Based Authentication
```yaml
Token Structure:
  Header: Algorithm and token type
  Payload: User ID, email, user type, expiration
  Signature: Secret key verification
  
Security Features:
  - Stateless authentication
  - Token expiration management  
  - Refresh token strategy (planned)
  - Role-based access control
```

#### Authorization Levels
```yaml
Public Endpoints: Registration, login, public provider listings
Authenticated Endpoints: Profile management, messaging, bookings
Customer-Only Endpoints: Booking creation, quote requests  
Provider-Only Endpoints: Quote submissions, availability management
Admin Endpoints: User management, system monitoring (planned)
```

### Security Layers

#### Application Security
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Input Validation**: express-validator for all user inputs
- **SQL Injection Protection**: Parameterized queries
- **XSS Protection**: Content Security Policy headers
- **CSRF Protection**: Token-based CSRF prevention

#### Data Security  
- **Password Hashing**: bcryptjs with 12 salt rounds  
- **Data Encryption**: TLS 1.3 for data in transit
- **Database Encryption**: Encrypted at rest (production)
- **Sensitive Data Handling**: PII protection and anonymization

#### Infrastructure Security
- **HTTPS Enforcement**: SSL/TLS certificates
- **Security Headers**: Helmet.js implementation
- **CORS Policy**: Restricted cross-origin requests  
- **Environment Variables**: Secure configuration management

## Deployment Architecture

### Development Environment
```yaml
Database: SQLite (local file-based)
Cache: ioredis-mock (in-memory simulation)
File Storage: Local filesystem
Real-time: Socket.IO development mode
Process Management: nodemon + react-scripts
```

### Production Environment (Planned)
```yaml
Web Servers: Multiple Node.js instances behind load balancer
Database: PostgreSQL with read replicas
Cache: Redis cluster for high availability  
File Storage: AWS S3 or similar cloud storage
CDN: CloudFlare or AWS CloudFront
Load Balancer: Nginx with SSL termination
Monitoring: Application and infrastructure monitoring
```

### Container Architecture (Prepared)
```dockerfile
# Multi-stage Docker build
Frontend: nginx serving static React build
Backend: Node.js application server
Database: PostgreSQL container  
Cache: Redis container
Reverse Proxy: Nginx load balancer
```

## Integration Architecture

### External Service Integrations

#### Payment Gateways (Planned)
```yaml
Primary: Stripe for credit card processing
Secondary: PayPal for alternative payments  
Mobile: Apple Pay and Google Pay integration
Features: Subscription billing, escrow system
```

#### Map Services
```yaml
Primary: Google Maps API  
Features: Geocoding, distance calculation, route planning
Backup: OpenStreetMap for redundancy
```

#### Communication Services (Planned)
```yaml
Email: SendGrid or AWS SES for transactional emails
SMS: Twilio for booking confirmations and alerts  
Push Notifications: Firebase Cloud Messaging
```

#### Analytics and Monitoring (Planned)
```yaml
Application Monitoring: New Relic or DataDog
Error Tracking: Sentry for error reporting
Analytics: Google Analytics, custom business metrics
Performance: Application performance monitoring
```

### API Design Principles

#### RESTful API Standards
```yaml
Resource-Based URLs: /api/bookings, /api/providers  
HTTP Methods: GET, POST, PUT, DELETE for CRUD operations
Status Codes: Proper HTTP status code usage
Content Types: JSON for data exchange
Versioning: URL-based versioning (/api/v1/)
```

#### API Response Format
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully",
  "timestamp": "2024-01-01T00:00:00Z",
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

### Performance Optimization

#### Frontend Optimization
- **Code Splitting**: Route-based lazy loading
- **Caching**: Browser caching for static assets
- **Compression**: Gzip compression for responses
- **Image Optimization**: WebP format and lazy loading

#### Backend Optimization  
- **Database Indexing**: Optimized queries with proper indexes
- **Connection Pooling**: Database connection management
- **Caching Strategy**: Redis for frequently accessed data
- **Compression**: Response compression middleware

---

*This architecture documentation provides a comprehensive view of the Tino 2 system design and serves as a guide for development, deployment, and maintenance activities.*