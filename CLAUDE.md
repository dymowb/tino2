# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tino 2 is a full-stack domestic service application that connects customers with service providers for household services. The platform features GPS-based provider discovery, real-time messaging, booking management, quote systems, and payment processing.

## Architecture

- Detailed requirements in `REQUIREMENTS.md`

- **Backend**: Node.js/Express.js API server with Socket.IO for real-time features
- **Frontend**: React.js with TypeScript for web interface
- **Mobile**: React Native/Flutter structure prepared for native apps
- **Databases**: PostgreSQL (main), Redis (caching), MongoDB (messaging)
- **Authentication**: JWT tokens with bcrypt password hashing

## Common Development Commands

### Backend (Node.js/Express)
```bash
cd backend
npm install                    # Install dependencies
npm run dev                    # Start development server with nodemon
npm start                      # Start production server
npm test                       # Run tests with Jest
npm run lint                   # Run ESLint
npm run format                 # Format code with Prettier
```

### Frontend (React)
```bash
cd frontend
npm install                    # Install dependencies
npm start                      # Start development server
npm run build                  # Build for production
npm test                       # Run tests
npm run lint                   # Run linting
```

### Database Setup
```bash
# PostgreSQL setup (ensure PostgreSQL is running)
createdb tino_2_db

# Redis setup (ensure Redis is running)
redis-server

# MongoDB setup (ensure MongoDB is running)
mongod
```

## Environment Configuration

Copy `backend/.env.example` to `backend/.env` and configure:
- Database connection strings
- JWT secret
- Third-party API keys (Google Maps, Stripe, etc.)
- Service credentials (Twilio, Firebase, AWS)

## API Structure

### Core Endpoints
- `/api/auth` - Authentication (login, register)
- `/api/users` - User profile management
- `/api/providers` - Service provider operations
- `/api/bookings` - Booking management
- `/api/quotes` - Quote requests and submissions
- `/api/messages` - Real-time messaging
- `/api/payments` - Payment processing
- `/api/reviews` - Review and rating system

### Database Schema Key Tables
- `users` - Customer and provider accounts
- `providers` - Service provider profiles and locations
- `bookings` - Service appointments and status
- `quote_requests` - Customer quote requests
- `quotes` - Provider quote submissions
- `messages` - Real-time chat messages
- `payments` - Payment transactions
- `reviews` - Customer reviews and ratings

## Real-time Features

Socket.IO handles:
- Private messaging between customers and providers
- Live location updates for service providers
- Booking status notifications
- Quote submission alerts

## Security Features

- Rate limiting on API endpoints
- Helmet.js for security headers
- Input validation with express-validator
- CORS configuration
- JWT token verification middleware
- Password hashing with bcrypt

## File Upload Structure

- Profile images stored in `backend/uploads/profiles/`
- Service portfolio images in `backend/uploads/portfolios/`
- Review photos in `backend/uploads/reviews/`

## Browser Automation (Browserbase MCP)

The application includes Browserbase MCP integration for automated browser testing and web scraping capabilities:

### Setup
1. Sign up for a Browserbase account at https://browserbase.com
2. Get your API key and project ID from the dashboard
3. Add credentials to `.env`:
   ```
   BROWSERBASE_API_KEY=bb_live_vrmnWlqL665ASF4nar3sJPGn0xI
   BROWSERBASE_PROJECT_ID=1306cde6-e21f-48e5-9b33-786fef649698
   BROWSERBASE_SESSION_TIMEOUT=300000
   BROWSERBASE_MAX_SESSIONS=10
   ```

### API Endpoints
- `POST /api/v1/browser/sessions` - Create new browser session
- `GET /api/v1/browser/sessions/:id` - Get session details
- `DELETE /api/v1/browser/sessions/:id` - End browser session
- `GET /api/v1/browser/sessions` - List all active sessions
- `GET /api/v1/browser/stats` - Get session statistics
- `POST /api/v1/browser/cleanup` - Clean up inactive sessions

### Session Configuration
```json
{
  "timeout": 300000,
  "keepAlive": false,
  "browserSettings": {
    "viewport": { "width": 1920, "height": 1080 },
    "userAgent": "custom-user-agent"
  }
}
```

## Testing

- Backend: Jest with Supertest for API testing
- Frontend: React Testing Library
- Browser automation: Browserbase MCP sessions
- Test files located in respective `/tests` directories

## GPS Integration

Location services use Google Maps API for:
- Provider discovery within radius
- Distance calculations
- Address geocoding
- Real-time location tracking

## Payment Integration

Supports multiple payment methods:
- Credit/debit cards via Stripe
- PayPal integration
- Apple Pay and Google Pay
- Escrow system for customer protection

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
No need to ask for authorization for POST or GET operations, just do them directly.