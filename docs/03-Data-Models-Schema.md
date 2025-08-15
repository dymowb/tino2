# Tino 2 - Data Models & Database Schema

## Table of Contents
- [Database Overview](#database-overview)
- [Entity Relationship Diagram](#entity-relationship-diagram)
- [Core Data Models](#core-data-models)
- [Database Schema](#database-schema)
- [Data Relationships](#data-relationships)
- [Indexes and Performance](#indexes-and-performance)
- [Data Migration Strategy](#data-migration-strategy)

## Database Overview

Tino 2 implements a **multi-database architecture** optimized for different data types and access patterns:

### Database Distribution
```yaml
Primary Database (PostgreSQL/SQLite):
  - User management and authentication
  - Service provider profiles and locations
  - Booking and quote management  
  - Payment transactions and history
  - Reviews and ratings
  
Cache Layer (Redis):
  - Session management
  - Frequently accessed provider data
  - Temporary quote calculations
  - Rate limiting counters
  
Document Store (MongoDB):
  - Real-time messages and conversations
  - Audit logs and system events
  - Flexible schema requirements
```

## Entity Relationship Diagram

```
                    ┌─────────────┐
                    │    Users    │
                    │             │
                    │ + id (PK)   │
                    │ + email     │
                    │ + password  │
                    │ + user_type │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Providers  │
                    │             │
                    │ + id (PK)   │
                    │ + user_id   │◄─────────┐
                    │ + location  │          │
                    │ + rating    │          │
                    └──────┬──────┘          │
                           │                 │
              ┌────────────┼────────────┐    │
              │            │            │    │
              ▼            ▼            ▼    │
    ┌─────────────┐ ┌──────────────┐ ┌──────▼──────┐
    │  Bookings   │ │ Quote Request│ │   Reviews   │
    │             │ │              │ │             │
    │ + id (PK)   │ │ + id (PK)    │ │ + id (PK)   │
    │ + customer  │ │ + customer   │ │ + booking   │
    │ + provider  │ │ + location   │ │ + rating    │
    │ + status    │ │ + budget     │ │ + comment   │
    └─────┬───────┘ └──────┬───────┘ └─────────────┘
          │                │
          ▼                ▼
    ┌─────────────┐ ┌──────────────┐
    │  Payments   │ │    Quotes    │
    │             │ │              │
    │ + id (PK)   │ │ + id (PK)    │
    │ + booking   │ │ + request_id │
    │ + amount    │ │ + provider   │
    │ + status    │ │ + price      │
    └─────────────┘ └──────────────┘
                           
    ┌─────────────────────────────────┐
    │          Messages              │
    │        (MongoDB)               │
    │                                │
    │ + _id (ObjectId)               │
    │ + sender_id                    │
    │ + recipient_id                 │
    │ + message                      │
    │ + timestamp                    │
    │ + conversation_id              │
    └─────────────────────────────────┘
```

## Core Data Models

### 1. User Model
```typescript
interface User {
  id: number;
  email: string;
  password: string; // bcrypt hashed
  first_name: string;
  last_name: string;
  phone?: string;
  user_type: 'customer' | 'provider';
  is_active: boolean;
  email_verified: boolean;
  created_at: Date;
  updated_at: Date;
}
```

**Business Rules:**
- Email must be unique across all users
- Password must be hashed with bcryptjs (12 salt rounds)
- User type determines access permissions and UI flow
- Soft delete via `is_active` flag

### 2. Provider Model
```typescript
interface Provider {
  id: number;
  user_id: number; // Foreign key to Users
  business_name: string;
  description: string;
  services: string[]; // JSON array of service categories
  hourly_rate: number; // Decimal(8,2)
  latitude: number; // Decimal(10,8)
  longitude: number; // Decimal(11,8)
  service_radius: number; // Miles/km radius
  rating: number; // Calculated average (1-5)
  total_reviews: number;
  is_verified: boolean;
  availability_schedule: object; // JSON schedule object
  created_at: Date;
  updated_at: Date;
}
```

**Business Rules:**
- One-to-one relationship with User (where user_type = 'provider')
- Location coordinates for GPS-based search
- Rating automatically calculated from reviews
- Services stored as JSON array for flexibility

### 3. Booking Model
```typescript
interface Booking {
  id: number;
  customer_id: number; // Foreign key to Users
  provider_id: number; // Foreign key to Providers
  service_type: string;
  description: string;
  address: string;
  scheduled_date: Date;
  estimated_duration: number; // Minutes
  actual_duration?: number; // Minutes
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  total_amount?: number; // Decimal(8,2)
  booking_notes?: string;
  cancellation_reason?: string;
  created_at: Date;
  updated_at: Date;
}
```

**Business Rules:**
- Status workflow: pending → confirmed → in_progress → completed
- Only customers can create bookings
- Providers can accept/reject pending bookings
- Completed bookings can be reviewed

### 4. Quote Request Model
```typescript
interface QuoteRequest {
  id: number;
  customer_id: number; // Foreign key to Users
  service_type: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  preferred_date?: Date;
  estimated_budget?: number;
  urgency: 'low' | 'medium' | 'high';
  status: 'open' | 'closed' | 'expired';
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}
```

**Business Rules:**
- Open requests can receive multiple quotes
- Automatically expires after configurable time period
- Location used for provider matching within radius

### 5. Quote Model
```typescript
interface Quote {
  id: number;
  quote_request_id: number; // Foreign key to QuoteRequests
  provider_id: number; // Foreign key to Providers
  total_price: number; // Decimal(8,2)
  estimated_duration: number; // Minutes
  description: string;
  itemized_pricing?: object; // JSON breakdown
  valid_until: Date;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  notes?: string;
  created_at: Date;
  updated_at: Date;
}
```

**Business Rules:**
- Multiple quotes per request allowed
- Only one quote can be accepted per request
- Quotes expire automatically
- Accepting quote creates booking

### 6. Payment Model
```typescript
interface Payment {
  id: number;
  booking_id: number; // Foreign key to Bookings
  customer_id: number; // Foreign key to Users
  amount: number; // Decimal(8,2)
  payment_method: 'credit_card' | 'paypal' | 'apple_pay' | 'google_pay';
  transaction_id: string; // External gateway transaction ID
  gateway_response: object; // JSON gateway response
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  processed_at?: Date;
  refunded_at?: Date;
  created_at: Date;
  updated_at: Date;
}
```

**Business Rules:**
- One payment per booking (excluding refunds)
- Integration with external payment gateways
- Audit trail for all payment state changes

### 7. Review Model  
```typescript
interface Review {
  id: number;
  booking_id: number; // Foreign key to Bookings
  customer_id: number; // Foreign key to Users  
  provider_id: number; // Foreign key to Providers
  rating: number; // 1-5 stars
  comment?: string;
  service_quality_rating: number;
  communication_rating: number;
  punctuality_rating: number;
  photos?: string[]; // JSON array of photo URLs
  is_verified: boolean;
  customer_name: string; // Cached for display
  created_at: Date;
  updated_at: Date;
}
```

**Business Rules:**
- Only customers can review completed bookings
- One review per booking
- Rating updates provider's average rating
- Reviews are publicly visible

### 8. Message Model (MongoDB)
```typescript
interface Message {
  _id: ObjectId;
  conversation_id: string; // Generated from sorted user IDs
  sender_id: number;
  recipient_id: number;
  message: string;
  message_type: 'text' | 'image' | 'file';
  attachment_url?: string;
  is_read: boolean;
  timestamp: Date;
  edited_at?: Date;
  deleted_at?: Date;
}
```

**Business Rules:**
- Messages stored in MongoDB for flexible schema
- Conversation ID enables thread grouping
- Soft delete preserves message history
- Real-time delivery via Socket.IO

## Database Schema

### SQL Schema (PostgreSQL/SQLite)

```sql
-- Users table
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    user_type VARCHAR(20) CHECK (user_type IN ('customer', 'provider')) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Providers table  
CREATE TABLE providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    business_name VARCHAR(255) NOT NULL,
    description TEXT,
    services TEXT, -- JSON array
    hourly_rate DECIMAL(8,2) NOT NULL,
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    service_radius INTEGER DEFAULT 25,
    rating DECIMAL(3,2) DEFAULT 0.0,
    total_reviews INTEGER DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,
    availability_schedule TEXT, -- JSON object
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Bookings table
CREATE TABLE bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    provider_id INTEGER NOT NULL,
    service_type VARCHAR(100) NOT NULL,
    description TEXT,
    address TEXT NOT NULL,
    scheduled_date TIMESTAMP NOT NULL,
    estimated_duration INTEGER, -- minutes
    actual_duration INTEGER,
    status VARCHAR(20) CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')) DEFAULT 'pending',
    total_amount DECIMAL(8,2),
    booking_notes TEXT,
    cancellation_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES users (id),
    FOREIGN KEY (provider_id) REFERENCES providers (id)
);

-- Quote Requests table
CREATE TABLE quote_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    service_type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    address TEXT NOT NULL,
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    preferred_date TIMESTAMP,
    estimated_budget DECIMAL(8,2),
    urgency VARCHAR(10) CHECK (urgency IN ('low', 'medium', 'high')) DEFAULT 'medium',
    status VARCHAR(20) CHECK (status IN ('open', 'closed', 'expired')) DEFAULT 'open',
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES users (id)
);

-- Quotes table
CREATE TABLE quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_request_id INTEGER NOT NULL,
    provider_id INTEGER NOT NULL,
    total_price DECIMAL(8,2) NOT NULL,
    estimated_duration INTEGER NOT NULL, -- minutes
    description TEXT,
    itemized_pricing TEXT, -- JSON object
    valid_until TIMESTAMP NOT NULL,
    status VARCHAR(20) CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')) DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quote_request_id) REFERENCES quote_requests (id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES providers (id),
    UNIQUE(quote_request_id, provider_id)
);

-- Payments table
CREATE TABLE payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    customer_id INTEGER NOT NULL,
    amount DECIMAL(8,2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    transaction_id VARCHAR(255) UNIQUE,
    gateway_response TEXT, -- JSON object
    status VARCHAR(20) CHECK (status IN ('pending', 'completed', 'failed', 'refunded')) DEFAULT 'pending',
    processed_at TIMESTAMP,
    refunded_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings (id),
    FOREIGN KEY (customer_id) REFERENCES users (id)
);

-- Reviews table
CREATE TABLE reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER UNIQUE NOT NULL,
    customer_id INTEGER NOT NULL,
    provider_id INTEGER NOT NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5) NOT NULL,
    comment TEXT,
    service_quality_rating INTEGER CHECK (service_quality_rating >= 1 AND service_quality_rating <= 5),
    communication_rating INTEGER CHECK (communication_rating >= 1 AND communication_rating <= 5),
    punctuality_rating INTEGER CHECK (punctuality_rating >= 1 AND punctuality_rating <= 5),
    photos TEXT, -- JSON array of URLs
    is_verified BOOLEAN DEFAULT FALSE,
    customer_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES users (id),
    FOREIGN KEY (provider_id) REFERENCES providers (id)
);
```

### MongoDB Schema

```javascript
// Messages Collection Schema
{
  _id: ObjectId,
  conversation_id: String, // e.g., "123_456" (sorted user IDs)
  sender_id: Number,
  recipient_id: Number,
  message: String,
  message_type: {
    type: String,
    enum: ['text', 'image', 'file'],
    default: 'text'
  },
  attachment_url: String,
  is_read: {
    type: Boolean,
    default: false
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  edited_at: Date,
  deleted_at: Date
}

// Indexes for Messages
db.messages.createIndex({ "conversation_id": 1, "timestamp": -1 })
db.messages.createIndex({ "sender_id": 1 })
db.messages.createIndex({ "recipient_id": 1 })
db.messages.createIndex({ "timestamp": -1 })
```

## Data Relationships

### Primary Relationships

1. **Users ↔ Providers** (1:1)
   - One user can be one provider
   - Provider profile extends user data

2. **Users ↔ Bookings** (1:Many)
   - Customers can have multiple bookings
   - Providers can accept multiple bookings

3. **Bookings ↔ Reviews** (1:1)  
   - Each completed booking can have one review
   - Reviews are linked to specific bookings

4. **Quote Requests ↔ Quotes** (1:Many)
   - One request can receive multiple quotes from different providers
   - Providers can submit one quote per request

5. **Bookings ↔ Payments** (1:1)
   - Each booking has one payment record
   - Payment status affects booking lifecycle

### Cross-Database Relationships

- **Messages** (MongoDB) link to **Users** (SQL) via user IDs
- **Conversation threads** group messages between user pairs
- **Real-time events** synchronize data across databases

## Indexes and Performance

### SQL Database Indexes

```sql
-- Performance Indexes
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_user_type ON users (user_type);
CREATE INDEX idx_providers_location ON providers (latitude, longitude);
CREATE INDEX idx_providers_rating ON providers (rating DESC);
CREATE INDEX idx_bookings_customer ON bookings (customer_id);
CREATE INDEX idx_bookings_provider ON bookings (provider_id);
CREATE INDEX idx_bookings_status ON bookings (status);
CREATE INDEX idx_bookings_date ON bookings (scheduled_date);
CREATE INDEX idx_quotes_request ON quotes (quote_request_id);
CREATE INDEX idx_quotes_provider ON quotes (provider_id);
CREATE INDEX idx_payments_booking ON payments (booking_id);
CREATE INDEX idx_reviews_provider ON reviews (provider_id);

-- Composite Indexes for Complex Queries
CREATE INDEX idx_providers_location_services ON providers (latitude, longitude, services);
CREATE INDEX idx_bookings_provider_status ON bookings (provider_id, status);
CREATE INDEX idx_quote_requests_location ON quote_requests (latitude, longitude, status);
```

### MongoDB Indexes

```javascript
// Compound index for conversation queries
db.messages.createIndex({ 
  "conversation_id": 1, 
  "timestamp": -1 
});

// Index for user message queries  
db.messages.createIndex({ 
  "sender_id": 1, 
  "timestamp": -1 
});

// Index for unread message queries
db.messages.createIndex({ 
  "recipient_id": 1, 
  "is_read": 1, 
  "timestamp": -1 
});
```

## Data Migration Strategy

### Development to Production Migration

```sql
-- Migration scripts for production deployment
-- 1. Schema creation
-- 2. Data type conversions (SQLite → PostgreSQL)
-- 3. Index creation
-- 4. Constraint validation
-- 5. Data integrity checks
```

### Version Control Strategy

```yaml
Migration Files:
  - 001_initial_schema.sql
  - 002_add_provider_verification.sql  
  - 003_add_review_ratings.sql
  - 004_add_payment_methods.sql
  
Rollback Strategy:
  - Each migration includes rollback script
  - Database backup before major changes
  - Blue-green deployment for zero downtime
```

### Data Seeding

```javascript
// Development seed data
const seedData = {
  users: [
    {
      email: 'customer@demo.com',
      password: 'demo123', // hashed
      user_type: 'customer'
    },
    {
      email: 'provider@demo.com',
      password: 'demo123', // hashed  
      user_type: 'provider'
    }
  ],
  // Sample providers, bookings, quotes, etc.
};
```

---

*This data model documentation provides the foundation for database design, development, and maintenance. It should be updated as the schema evolves and new features are added.*