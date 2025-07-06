# Domestic Service App

A comprehensive platform connecting customers with qualified service providers for household services.

## Features

- **GPS-Based Discovery**: Find nearby service providers using real-time location
- **Dual User System**: Separate interfaces for customers and service providers
- **Real-time Messaging**: In-app chat with image sharing capabilities
- **Quote System**: Request and compare multiple service quotes
- **Booking Management**: Complete booking lifecycle from request to completion
- **Payment Integration**: Secure payment processing with multiple methods
- **Review System**: Two-way rating and review system
- **Location Services**: GPS integration for service provider discovery

## Tech Stack

- **Backend**: Node.js, Express.js, Socket.IO
- **Frontend**: React.js with TypeScript
- **Databases**: PostgreSQL, Redis, MongoDB
- **Authentication**: JWT tokens
- **Real-time**: WebSocket connections
- **Payment**: Stripe, PayPal integration
- **Maps**: Google Maps API

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL
- Redis
- MongoDB

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd domestic-service-app
```

2. Install backend dependencies
```bash
cd backend
npm install
```

3. Install frontend dependencies
```bash
cd ../frontend
npm install
```

4. Set up environment variables
```bash
cd ../backend
cp .env.example .env
# Edit .env with your configuration
```

5. Start the services
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend  
cd frontend
npm start
```

## API Documentation

The API provides RESTful endpoints for:
- Authentication (`/api/auth`)
- User management (`/api/users`)
- Provider operations (`/api/providers`)
- Booking system (`/api/bookings`)
- Quote management (`/api/quotes`)
- Messaging (`/api/messages`)
- Payment processing (`/api/payments`)
- Reviews (`/api/reviews`)

## Real-time Features

- Private messaging between users
- Live location updates for service providers
- Booking status notifications
- Quote submission alerts

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the ISC License.