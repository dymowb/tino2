# Tino 2 - System Diagrams & Flowcharts

## Table of Contents
- [System Architecture Diagram](#system-architecture-diagram)
- [Database Entity Relationship Diagram](#database-entity-relationship-diagram)
- [User Flow Diagrams](#user-flow-diagrams)
- [API Flow Diagrams](#api-flow-diagrams)
- [Real-time Communication Flow](#real-time-communication-flow)
- [Security Architecture](#security-architecture)
- [Deployment Diagrams](#deployment-diagrams)

## System Architecture Diagram

### High-Level System Architecture
```
                                    Internet
                                       |
                              ┌────────▼────────┐
                              │  Load Balancer  │
                              │     (Nginx)     │
                              └────────┬────────┘
                                       |
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
            ┌───────▼───────┐ ┌────────▼────────┐ ┌──────▼──────┐
            │  Web Frontend │ │  Mobile Apps    │ │ Admin Panel │
            │ (React/TypeS) │ │ (React Native)  │ │  (React)    │
            └───────┬───────┘ └────────┬────────┘ └──────┬──────┘
                    │                  │                  │
                    └──────────────────┼──────────────────┘
                                       │
                              ┌────────▼────────┐
                              │   API Gateway   │
                              │  (Express.js)   │
                              └────────┬────────┘
                                       |
                 ┌─────────────────────┼─────────────────────┐
                 │                     │                     │
        ┌────────▼────────┐   ┌────────▼────────┐   ┌──────▼──────┐
        │   PostgreSQL    │   │   Redis Cache   │   │  MongoDB    │
        │  (Main Data)    │   │   (Sessions)    │   │ (Messages)  │
        └─────────────────┘   └─────────────────┘   └─────────────┘
                                       
                              ┌────────────────┐
                              │  External APIs │
                              ├────────────────┤
                              │ • Google Maps  │
                              │ • Stripe       │
                              │ • SendGrid     │
                              │ • Twilio       │
                              └────────────────┘
```

### Microservices Architecture (Future)
```
                        ┌─────────────────┐
                        │  API Gateway    │
                        │   (Kong/Zuul)   │
                        └─────────┬───────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
   ┌────▼────┐              ┌─────▼─────┐            ┌─────▼─────┐
   │ Auth    │              │ Booking   │            │ Payment   │
   │ Service │              │ Service   │            │ Service   │
   └────┬────┘              └─────┬─────┘            └─────┬─────┘
        │                         │                         │
   ┌────▼────┐              ┌─────▼─────┐            ┌─────▼─────┐
   │ User DB │              │Booking DB │            │Payment DB │
   └─────────┘              └───────────┘            └───────────┘
```

## Database Entity Relationship Diagram

### Core Database Relationships
```
      ┌─────────────┐
      │    Users    │
      │             │
      │ id (PK)     │◄─────────────────────┐
      │ email       │                      │
      │ user_type   │                      │
      └──────┬──────┘                      │
             │ 1                           │
             │                             │
             │ 1                           │
      ┌──────▼──────┐                      │
      │  Providers  │                      │
      │             │                      │
      │ id (PK)     │                      │
      │ user_id(FK) │                      │ 1
      │ location    │                      │
      │ rating      │                      │
      └──────┬──────┘                      │
             │ 1                           │
             │                             │
             │ M                           │
      ┌──────▼──────┐                      │
      │  Bookings   │                      │ M
      │             │                      │
      │ id (PK)     │                      │
      │ customer_id │──────────────────────┘
      │ provider_id │                     
      │ status      │                     
      └──────┬──────┘                     
             │ 1                          
             │                            
             │ 1                          
      ┌──────▼──────┐    ┌──────────────┐  
      │  Payments   │    │   Reviews    │  
      │             │    │              │  
      │ id (PK)     │    │ id (PK)      │  
      │ booking_id  │    │ booking_id   │  
      │ amount      │    │ rating       │  
      │ status      │    │ comment      │  
      └─────────────┘    └──────────────┘  

      ┌─────────────┐    ┌──────────────┐
      │Quote Request│    │    Quotes    │
      │             │    │              │
      │ id (PK)     │    │ id (PK)      │
      │ customer_id │    │ request_id   │
      │ location    │    │ provider_id  │
      │ budget      │◄─1─┤ price        │
      └─────────────┘  M └──────────────┘

      ┌─────────────┐
      │  Messages   │
      │ (MongoDB)   │
      │             │
      │ _id         │
      │ sender_id   │
      │ recipient_id│
      │ message     │
      │ timestamp   │
      └─────────────┘
```

### Data Flow Relationships
```
Registration → Authentication → Profile Setup → Service Discovery
     │              │               │               │
     ▼              ▼               ▼               ▼
   Users         JWT Token      Providers       Bookings
     │              │               │               │
     ▼              ▼               ▼               ▼
  Database      Session Cache   Location Data   Payment Flow
```

## User Flow Diagrams

### Customer Journey Flow
```
    Start
      │
      ▼
┌──────────┐    ┌──────────┐    ┌──────────┐
│Register/ │───▶│ Browse   │───▶│  Select  │
│  Login   │    │Providers │    │ Provider │
└──────────┘    └──────────┘    └──────────┘
      │              │               │
      ▼              ▼               ▼
┌──────────┐    ┌──────────┐    ┌──────────┐
│  Create  │    │ Request  │    │   Book   │
│ Profile  │    │  Quote   │    │ Service  │
└──────────┘    └──────────┘    └──────────┘
      │              │               │
      ▼              ▼               ▼
┌──────────┐    ┌──────────┐    ┌──────────┐
│   Chat   │    │ Compare  │    │   Pay    │
│ Provider │    │  Quotes  │    │ Service  │
└──────────┘    └──────────┘    └──────────┘
      │              │               │
      ▼              ▼               ▼
┌──────────┐    ┌──────────┐    ┌──────────┐
│ Service  │    │ Accept   │    │  Leave   │
│Complete  │    │  Quote   │    │ Review   │
└──────────┘    └──────────┘    └──────────┘
      │
      ▼
     End
```

### Provider Journey Flow
```
    Start
      │
      ▼
┌──────────┐    ┌──────────┐    ┌──────────┐
│Register/ │───▶│  Setup   │───▶│  Manage  │
│  Login   │    │ Business │    │Availability│
└──────────┘    │ Profile  │    └──────────┘
      │         └──────────┘         │
      ▼              │               ▼
┌──────────┐         ▼         ┌──────────┐
│ Verify   │    ┌──────────┐   │ Receive  │
│Identity  │    │   Set    │   │  Quote   │
└──────────┘    │ Service  │   │Requests  │
      │         │  Areas   │   └──────────┘
      ▼         └──────────┘         │
┌──────────┐         │               ▼
│  Upload  │         ▼         ┌──────────┐
│Portfolio │    ┌──────────┐   │ Submit   │
└──────────┘    │ Set Rates│   │  Quote   │
      │         └──────────┘   └──────────┘
      ▼              │               │
┌──────────┐         ▼               ▼
│   Go     │    ┌──────────┐   ┌──────────┐
│  Live    │    │ Accept   │   │ Deliver  │
└──────────┘    │Bookings  │   │ Service  │
      │         └──────────┘   └──────────┘
      ▼              │               │
     End             ▼               ▼
                ┌──────────┐   ┌──────────┐
                │Complete  │   │ Receive  │
                │ Service  │   │ Payment  │
                └──────────┘   └──────────┘
```

### Booking Lifecycle Flow
```
   Customer          System           Provider
      │                 │                │
      │ Create Booking  │                │
      ├────────────────▶│                │
      │                 │ Notification   │
      │                 ├───────────────▶│
      │                 │                │
      │                 │ Accept/Reject  │
      │                 │◄───────────────┤
      │ Status Update   │                │
      │◄────────────────┤                │
      │                 │                │
      │ Pre-Service     │                │
      │ Communication   │◄──────────────▶│
      │◄───────────────▶│                │
      │                 │                │
      │                 │ Start Service  │
      │                 │◄───────────────┤
      │ Status Update   │                │
      │◄────────────────┤                │
      │                 │                │
      │                 │Complete Service│
      │                 │◄───────────────┤
      │ Payment Process │                │
      │◄────────────────┤                │
      │                 │ Payment Notify │
      │                 ├───────────────▶│
      │                 │                │
      │ Leave Review    │                │
      │────────────────▶│                │
      │                 │ Review Notify  │
      │                 ├───────────────▶│
```

## API Flow Diagrams

### Authentication Flow
```
   Client               API Server           Database
      │                     │                   │
      │ POST /auth/login    │                   │
      ├────────────────────▶│                   │
      │                     │ Validate User     │
      │                     ├──────────────────▶│
      │                     │ User Data         │
      │                     │◄──────────────────┤
      │                     │ Generate JWT      │
      │                     │                   │
      │ JWT Token + User    │                   │
      │◄────────────────────┤                   │
      │                     │                   │
      │ Authenticated       │                   │
      │ Request + JWT       │                   │
      ├────────────────────▶│                   │
      │                     │ Verify JWT        │
      │                     │ Extract User ID   │
      │                     │                   │
      │ API Response        │                   │
      │◄────────────────────┤                   │
```

### Booking Creation Flow
```
   Customer App         API Server          Database         Provider App
       │                    │                  │                 │
       │ POST /bookings     │                  │                 │
       ├───────────────────▶│                  │                 │
       │                    │ Validate Data    │                 │
       │                    │ Check Provider   │                 │
       │                    ├─────────────────▶│                 │
       │                    │ Provider Valid   │                 │
       │                    │◄─────────────────┤                 │
       │                    │ Create Booking   │                 │
       │                    ├─────────────────▶│                 │
       │                    │ Booking Created  │                 │
       │                    │◄─────────────────┤                 │
       │ Booking Response   │                  │                 │
       │◄───────────────────┤                  │                 │
       │                    │ WebSocket Event  │                 │
       │                    ├─────────────────────────────────────▶│
       │                    │                  │ New Booking     │
       │                    │                  │ Notification    │
```

### Quote System Flow
```
Customer          API Server       Database        Provider 1      Provider 2
   │                  │               │               │               │
   │ POST /quotes     │               │               │               │
   │ /request         │               │               │               │
   ├─────────────────▶│               │               │               │
   │                  │ Store Request │               │               │
   │                  ├──────────────▶│               │               │
   │                  │ Find Nearby   │               │               │
   │                  │ Providers     │               │               │
   │                  │◄──────────────┤               │               │
   │                  │ Notify Providers              │               │
   │                  ├──────────────────────────────▶│               │
   │                  ├─────────────────────────────────────────────▶│
   │                  │               │               │               │
   │                  │               │ Submit Quote  │               │
   │                  │◄──────────────────────────────┤               │
   │                  │               │               │ Submit Quote  │
   │                  │◄─────────────────────────────────────────────┤
   │ Quote Available  │               │               │               │
   │ Notification     │               │               │               │
   │◄─────────────────┤               │               │               │
   │                  │               │               │               │
   │ GET /quotes      │               │               │               │
   │ /request/123     │               │               │               │
   ├─────────────────▶│               │               │               │
   │ Quotes List      │               │               │               │
   │◄─────────────────┤               │               │               │
```

## Real-time Communication Flow

### WebSocket Connection Flow
```
   Client               Socket.IO Server        Database
      │                       │                    │
      │ Connect with JWT      │                    │
      ├──────────────────────▶│                    │
      │                       │ Verify JWT         │
      │                       │                    │
      │ Connection Confirmed  │                    │
      │◄──────────────────────┤                    │
      │                       │                    │
      │ Join Room (user_id)   │                    │
      ├──────────────────────▶│                    │
      │                       │                    │
      │ Send Message          │                    │
      ├──────────────────────▶│                    │
      │                       │ Store Message     │
      │                       ├───────────────────▶│
      │                       │ Emit to Recipient │
      │                       │                    │
      │ Real-time Updates     │                    │
      │◄──────────────────────┤                    │
```

### Message Delivery Flow
```
Sender App         Socket.IO         Database        Recipient App
    │                  │               │                 │
    │ Send Message     │               │                 │
    ├─────────────────▶│               │                 │
    │                  │ Store in DB   │                 │
    │                  ├──────────────▶│                 │
    │                  │ Message Saved │                 │
    │                  │◄──────────────┤                 │
    │ Delivery Confirm │               │                 │
    │◄─────────────────┤               │                 │
    │                  │ Find Recipient│                 │
    │                  │ Socket        │                 │
    │                  │               │                 │
    │                  │ Emit Message  │                 │
    │                  ├──────────────────────────────────▶│
    │                  │               │ Message Received│
    │                  │               │                 │
    │                  │ Read Receipt  │                 │
    │                  │◄──────────────────────────────────┤
    │                  │ Update DB     │                 │
    │                  ├──────────────▶│                 │
```

## Security Architecture

### Security Layers Diagram
```
                    ┌──────────────────┐
                    │   Application    │
                    │    Security      │
                    └──────┬───────────┘
                           │ • Input Validation
                           │ • SQL Injection Protection
                           │ • XSS Protection
                    ┌──────▼───────────┐
                    │  Authentication  │
                    │ & Authorization  │
                    └──────┬───────────┘
                           │ • JWT Tokens
                           │ • Password Hashing
                           │ • Role-based Access
                    ┌──────▼───────────┐
                    │   Transport      │
                    │    Security      │
                    └──────┬───────────┘
                           │ • HTTPS/TLS
                           │ • Security Headers
                           │ • CORS Policy
                    ┌──────▼───────────┐
                    │ Infrastructure   │
                    │    Security      │
                    └──────────────────┘
                           │ • Rate Limiting
                           │ • Firewall Rules
                           │ • DDoS Protection
```

### Authentication Flow
```
   Client                 Auth Service              Database
      │                       │                       │
      │ 1. Registration       │                       │
      ├──────────────────────▶│                       │
      │                       │ 2. Hash Password      │
      │                       │ 3. Store User         │
      │                       ├──────────────────────▶│
      │                       │ 4. User Created       │
      │                       │◄──────────────────────┤
      │ 5. Success Response   │                       │
      │◄──────────────────────┤                       │
      │                       │                       │
      │ 6. Login Request      │                       │
      ├──────────────────────▶│                       │
      │                       │ 7. Verify Credentials │
      │                       ├──────────────────────▶│
      │                       │ 8. User Data          │
      │                       │◄──────────────────────┤
      │                       │ 9. Generate JWT       │
      │ 10. JWT Token         │                       │
      │◄──────────────────────┤                       │
      │                       │                       │
      │ 11. API Request + JWT │                       │
      ├──────────────────────▶│                       │
      │                       │ 12. Verify JWT        │
      │ 13. Protected Data    │                       │
      │◄──────────────────────┤                       │
```

## Deployment Diagrams

### Development Environment
```
Developer Machine
┌─────────────────────┐
│   Frontend (React)  │
│   localhost:3000    │
└─────────────────────┘
           │
           ▼
┌─────────────────────┐    ┌─────────────────┐
│  Backend (Node.js)  │───▶│ PostgreSQL 16   │
│  localhost:3000     │    │  (Docker :5432) │
└─────────────────────┘    └─────────────────┘
           │
           ▼
┌─────────────────────┐
│   Redis Mock        │
│   (In-Memory)       │
└─────────────────────┘
```

### Production Environment (Planned)
```
                        Internet
                           │
                    ┌──────▼──────┐
                    │   CDN       │
                    │(CloudFlare) │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │Load Balancer│
                    │   (Nginx)   │
                    └──────┬──────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
     ┌──────▼──────┐ ┌─────▼─────┐ ┌─────▼─────┐
     │   Web       │ │   API     │ │   API     │
     │  Server 1   │ │ Server 1  │ │ Server 2  │
     │  (Nginx)    │ │(Node.js)  │ │(Node.js)  │
     └─────────────┘ └─────┬─────┘ └─────┬─────┘
                           │             │
            ┌──────────────┴─────────────┴──────────────┐
            │                                          │
     ┌──────▼──────┐ ┌─────────────┐ ┌─────────────┐    │
     │ PostgreSQL  │ │   Redis     │ │  MongoDB    │    │
     │  Primary    │ │  Cluster    │ │  Cluster    │    │
     └─────┬───────┘ └─────────────┘ └─────────────┘    │
           │                                          │
     ┌─────▼───────┐                                  │
     │PostgreSQL   │                                  │
     │Read Replica │                                  │
     └─────────────┘                                  │
                                                      │
     ┌─────────────────────────────────────────────────▼┐
     │              Monitoring & Logging                │
     │         (Prometheus, Grafana, ELK)              │
     └─────────────────────────────────────────────────┘
```

### Container Architecture (Docker)
```
┌─────────────────────────────────────────────────────┐
│                Docker Compose                       │
├─────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │   Frontend  │  │   Backend   │  │   Nginx     │  │
│  │   (React)   │  │  (Node.js)  │  │(Proxy/LB)  │  │
│  │   :3000     │  │   :5000     │  │   :80       │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  │
├─────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │ PostgreSQL  │  │    Redis    │  │  MongoDB    │  │
│  │   :5432     │  │    :6379    │  │   :27017    │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  │
├─────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────────────┐   │
│  │   Monitoring    │  │        Volumes          │   │
│  │  (Prometheus)   │  │  • postgres_data        │   │
│  │    :9090        │  │  • redis_data           │   │
│  └─────────────────┘  │  • mongo_data           │   │
│                       │  • uploads              │   │
│                       └─────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

*These diagrams provide visual representations of the Tino 2 system architecture, data flows, and deployment strategies. They should be updated as the system evolves and new components are added.*