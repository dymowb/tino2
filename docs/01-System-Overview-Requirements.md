# Tino 2 - System Overview & Requirements

> **Current implementation note (August 2026):** Tino includes Favorites + Rebook,
> provider-neutral AI routing, semantic/episodic memory, AI transparency disclosures, and
> protected runtime model configuration.

## Delivered repeat-customer and AI requirements

- Customers can privately favorite/unfavorite providers and view saved providers.
- Only genuinely completed bookings are eligible for rebooking; cancelled bookings have a
  distinct lifecycle section.
- Rebook prefill is deterministic and retains source booking/target provider provenance.
- Optional AI refinement updates only changes explicitly requested by the customer and
  never submits a request automatically.
- Text generation and embeddings use ordered provider/model chains with fallbacks; model
  identifiers are configuration, not workflow constants.
- AI-powered pages disclose the active model set and warn that output can be wrong.
- Admins may change validated model chains at runtime. Credentials remain server-only.

## Table of Contents
- [Project Overview](#project-overview)
- [Business Requirements](#business-requirements)
- [Functional Requirements](#functional-requirements)
- [Non-Functional Requirements](#non-functional-requirements)
- [User Stories](#user-stories)
- [System Features](#system-features)
- [Success Metrics](#success-metrics)

## Project Overview

**Tino 2** is a comprehensive domestic service marketplace platform that connects customers seeking household services with qualified service providers. The platform facilitates the entire service lifecycle from discovery and booking to payment and review.

### Vision
To create a trusted, efficient, and user-friendly platform where customers can easily find reliable service providers for their household needs while enabling service providers to grow their businesses.

### Mission  
Streamline the domestic service industry by providing a secure, location-aware platform that ensures quality service delivery through transparent communication, competitive pricing, and accountability.

## Business Requirements

### BR-001: Market Position
- Position as the leading domestic service marketplace
- Compete with existing platforms like TaskRabbit, Thumbtack, and local service directories
- Differentiate through superior user experience and real-time features

### BR-002: Revenue Model
- Commission-based revenue from completed transactions
- Premium provider listings and featured placements
- Subscription tiers for high-volume providers
- Payment processing fees

### BR-003: Geographic Coverage
- Initial launch in major metropolitan areas
- GPS-based service provider discovery within configurable radius
- Support for multiple time zones and local regulations

### BR-004: Compliance Requirements
- Data privacy compliance (GDPR, CCPA)
- Financial transaction regulations
- Service provider verification and background checks
- Insurance and liability coverage coordination

## Functional Requirements

### User Management
- **FR-001**: User registration with email verification
- **FR-002**: Secure login with JWT authentication  
- **FR-003**: Dual user types (customers and service providers)
- **FR-004**: Profile management with photo upload
- **FR-005**: Account deactivation and data deletion

### Service Provider Features
- **FR-006**: Business profile creation with service categories
- **FR-007**: Geographic service area definition
- **FR-008**: Hourly rate and pricing management
- **FR-009**: Availability calendar management
- **FR-010**: Portfolio showcase with image uploads

### Customer Features  
- **FR-011**: GPS-based provider search with radius filtering
- **FR-012**: Provider comparison with ratings and reviews
- **FR-013**: Service booking with scheduling
- **FR-014**: Quote request submission
- **FR-015**: Payment processing integration

### Communication System
- **FR-016**: Real-time messaging between users
- **FR-017**: Booking status notifications  
- **FR-018**: Quote submission alerts
- **FR-019**: Push notifications for mobile apps

### Booking Management
- **FR-020**: Booking lifecycle management (pending → confirmed → completed)
- **FR-021**: Booking modification and cancellation
- **FR-022**: Automatic booking reminders
- **FR-023**: Service completion confirmation

### Payment System
- **FR-024**: Multiple payment method support
- **FR-025**: Secure payment processing with PCI compliance
- **FR-026**: Escrow system for customer protection  
- **FR-027**: Provider payout management
- **FR-028**: Transaction history and reporting

### Review and Rating System
- **FR-029**: Post-service review submission
- **FR-030**: 5-star rating system with detailed feedback
- **FR-031**: Provider rating aggregation and display
- **FR-032**: Review verification and moderation

## Non-Functional Requirements

### Performance Requirements
- **NFR-001**: Page load time under 3 seconds
- **NFR-002**: API response time under 500ms for 95% of requests
- **NFR-003**: Support 10,000+ concurrent users
- **NFR-004**: 99.9% system uptime

### Security Requirements
- **NFR-005**: End-to-end encryption for sensitive data
- **NFR-006**: Rate limiting to prevent abuse
- **NFR-007**: SQL injection and XSS protection
- **NFR-008**: Regular security audits and penetration testing

### Scalability Requirements
- **NFR-009**: Horizontal scaling capability
- **NFR-010**: Database partitioning for large datasets
- **NFR-011**: CDN integration for static assets
- **NFR-012**: Auto-scaling based on traffic patterns

### Usability Requirements
- **NFR-013**: Mobile-responsive web interface
- **NFR-014**: Accessibility compliance (WCAG 2.1)
- **NFR-015**: Multi-language support capability
- **NFR-016**: Intuitive user interface with minimal learning curve

## User Stories

### Customer User Stories

**Epic: Service Discovery**
- As a customer, I want to find service providers near my location so that I can get help quickly
- As a customer, I want to filter providers by service type, price, and ratings so that I can find the best match
- As a customer, I want to see provider profiles with photos and reviews so that I can make informed decisions

**Epic: Booking Services**  
- As a customer, I want to request quotes from multiple providers so that I can compare prices
- As a customer, I want to book services at my preferred time so that it fits my schedule
- As a customer, I want to communicate with providers before booking so that I can clarify requirements

**Epic: Payment and Reviews**
- As a customer, I want to pay securely through the platform so that my financial information is protected
- As a customer, I want to leave reviews after service completion so that I can help other customers
- As a customer, I want to track my booking history so that I can re-book providers I trust

### Provider User Stories

**Epic: Business Management**
- As a provider, I want to create a professional profile so that customers can learn about my services  
- As a provider, I want to set my service areas and availability so that I only get relevant requests
- As a provider, I want to manage my pricing and service packages so that I can maximize earnings

**Epic: Customer Interaction**
- As a provider, I want to receive quote requests so that I can grow my business
- As a provider, I want to communicate with customers so that I can understand their needs
- As a provider, I want to confirm bookings and update status so that customers stay informed

**Epic: Business Growth**
- As a provider, I want to see my earnings and statistics so that I can track business performance
- As a provider, I want to build my reputation through reviews so that I can attract more customers
- As a provider, I want to receive payments quickly so that I can maintain cash flow

## System Features

### Core Platform Features
1. **GPS-Based Discovery**: Real-time location-aware provider matching
2. **Dual User Interface**: Separate experiences optimized for customers and providers  
3. **Real-Time Messaging**: Instant communication with chat history
4. **Quote System**: Competitive bidding with transparent pricing
5. **Booking Management**: Complete lifecycle tracking with status updates
6. **Payment Integration**: Secure, multi-method payment processing
7. **Review System**: Two-way rating and feedback mechanism

### Advanced Features  
8. **Smart Matching**: Algorithm-based provider recommendations
9. **Calendar Integration**: Scheduling synchronization with external calendars
10. **Photo Documentation**: Before/after service photos for quality assurance
11. **Emergency Services**: Priority handling for urgent service requests
12. **Loyalty Program**: Customer retention and provider incentives
13. **Analytics Dashboard**: Business intelligence for platform optimization

### Mobile Features
14. **Native Mobile Apps**: iOS and Android applications
15. **Push Notifications**: Real-time alerts and updates
16. **Offline Capability**: Basic functionality without internet connection
17. **Location Services**: GPS tracking and geofencing

## Success Metrics

### Business Metrics
- **Monthly Active Users (MAU)**: Target 50,000+ users within first year
- **Gross Merchandise Volume (GMV)**: $1M+ in transactions within first year  
- **Take Rate**: 15-20% commission on completed transactions
- **Customer Retention**: 60%+ monthly retention rate
- **Provider Retention**: 70%+ monthly retention rate

### Quality Metrics
- **Customer Satisfaction**: 4.5+ average rating
- **Service Completion Rate**: 95%+ booking completion
- **Response Time**: 90%+ quote responses within 24 hours
- **Dispute Rate**: <2% of completed transactions
- **Platform Uptime**: 99.9% availability

### Growth Metrics
- **User Acquisition Cost (CAC)**: Target <$25 per customer
- **Customer Lifetime Value (CLV)**: Target $200+ per customer
- **Provider Marketplace Penetration**: 80%+ of local service categories covered
- **Geographic Expansion**: 10+ metropolitan markets within 2 years

### Operational Metrics
- **Average Quote Response Time**: <4 hours
- **Booking-to-Payment Cycle**: <48 hours average
- **Support Ticket Resolution**: <24 hours average
- **Platform Performance**: <3 second page load times

---

*This document serves as the foundational requirements specification for the Tino 2 domestic service platform. It should be reviewed and updated regularly as the platform evolves and new requirements are identified.*
