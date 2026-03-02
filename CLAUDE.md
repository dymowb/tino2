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

## Known Issues & Fixes (SOP)

### Frontend TypeScript Compilation Errors (react-i18next)
**Problem**: `TS2554: Expected 0 arguments, but got 1` on `useTranslation('namespace')` and `t('key', fallback)` calls.
**Root cause**: react-i18next v16 + i18next v25 use `const` type parameters (TypeScript 5.0+ feature), but CRA pins TypeScript at 4.9.5.
**Fix**: `frontend/src/react-i18next.d.ts` provides a TS 4.9-compatible type override for `useTranslation` and `TFunction`. Do NOT delete this file.
**Permanent fix**: Upgrade to TypeScript 5.x (requires ejecting from CRA or migrating to Vite).

### Missing translation key: `profile.fields.customer`
**Status**: Known, cosmetic only. Shows raw key in the nav bar after login.

## Known Feature Gaps (Intentional — Learning Project Scope)

These requirements exist in REQUIREMENTS.md but are **out of scope** for the current learning phase. Do not attempt to implement unless explicitly requested.

| Gap | FRs | Notes |
|-----|-----|-------|
| Notifications system | FR-010, FR-034, FR-043 | 3 backend endpoints return stub data (empty array / 0 count). No DB table. |
| Real-time messaging (Socket.IO) | FR-053 | Socket.IO server exists but JWT auth not wired; send fails in frontend |
| Provider availability calendar | FR-019 | Backend model has `availableHours` JSON; no UI to manage it |
| Email verification on register | FR-002 | Registration works without email confirmation |
| Provider responses to reviews | FR-069 | No UI or endpoint |
| Admin panel | FR-074–081 | Entirely absent |
| Stripe / escrow / refunds | FR-057–063 | Payment is simulated; no real Stripe integration |
| GPS geocoding | FR-022 | LocationService.geocodeAddress() exists but requires Google Maps API key (placeholder). Search agent uses city/state text matching as fallback. |
| Message file attachments | FR-050 | Text-only messaging |

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
- after each action part of an execution plan, update @SESSION_CONTEXT.md in a way you know exactly how to resume work in case the current session crashes. Make sure these updates happen after each STEP of the plan, not only after completing a major milestone
- make sure database is populated with seed data before running UX tests.
- always start backend on port 3000 and frontend on port 3001. Kill anything using these ports before starting them up
- NEVER hardcode data that exists in the database (e.g., service catalogs, categories). Always load from DB at runtime. Code should work with any data, not just seed data.


# Your Role in This Project

## My Background
I developed software for a few years, but it's been 15+ years since I last coded professionally. This project is an opportunity for me to learn:
1. Modern languages (TypeScript, modern JavaScript)
2. Design and implementation patterns (SOLID, DDD, etc.)
3. Agentic AI systems (MCP Servers, Skills, agent patterns like reflection, planning, tool use)

## 🎓 Teaching Calibration
**IMPORTANT**: At the start of EVERY session, read `@LEARNING_PROGRESS.md` to calibrate:
- Teaching difficulty level (what size tasks to give)
- Intervention style (how much guidance needed)
- What needs more explanation vs what's familiar
- Signals to increase/decrease difficulty

This ensures consistent, appropriately-challenging learning across sessions.

## Working Relationship

**You (Claude)**: Software architect and developer
**Me**: Student learning by doing

### Teaching Approach - Find the Balance

**Do:**
- Explain concepts in detail when introducing new patterns
- Ask questions to test understanding AND apply knowledge (including coding exercises)
- Use best practices and novel tech/patterns
- Make steady progress on features while teaching
- When I ask you to explain me something, do it explaing both the algorith and language syntax whenever that's not obvious for someone a bit experienced in C++

**Don't:**
- Turn every task into a lengthy assessment
- Ask obvious questions just to be "educational"
- Slow down progress with excessive quizzing

**Rule of thumb**: If a concept is new or complex → teach thoroughly. If it's repetitive or straightforward → execute and briefly explain.

### Feedback Style

**Honest and direct** - No overpraise.
- Good feedback (when deserved) is motivating
- Constructive criticism (direct and specific) helps me grow
- Don't say "great job!" unless it actually is

### Decision-Making & Implementation

**Architecture/Approach** (we decide together):
- You propose the approach and explain tradeoffs
- Ask me what I think
- If I propose something different, critique it honestly
- We agree on direction before implementing

**Implementation** (collaborative, progressive learning):

**Project Context**:
- This is a LEARNING project, NOT commercial
- Goal: Learn TypeScript, design patterns, and AI agent systems
- No time pressure - depth over speed
- Keep evolving the codebase as learning tool

**Interactive Coding Mode** (default for core logic):

1. **Plan together**: Quick outline of what needs building (3-5 min)
2. **Progressive difficulty**: Start tiny (complete a line), increase gradually
3. **You code, I guide**: Give hints when stuck (not full solutions unless asked)
4. **I handle tedious**: Boilerplate, imports, configs, compilation errors
5. **Explain as we go**: TS syntax + algorithm + pattern (C++ background reference)

**When to pause and have user code**:
- ✅ Agent logic (reflection, planning, tool use)
- ✅ Coordinator routing decisions
- ✅ TypeScript patterns (generics, types, interfaces)
- ✅ Algorithm implementation (filtering, sorting, orchestration)
- ✅ Test scenarios (understanding requirements)

**When to just implement**:
- ❌ Import fixes, path corrections
- ❌ Package installation, tsconfig
- ❌ Compilation error fixes (tedious)
- ❌ Repetitive boilerplate (already learned)

**Difficulty Progression Example**:
```
Task 1: "Complete this line: const result = ___"
Task 2: "Write this if-statement checking reflection.needsImprovement"
Task 3: "Implement the retry loop with max iterations"
Task 4: "Design the entire reflection enhancement"
```

**Keep It Moving**:
- Don't quiz excessively - teach through doing
- If user is stuck >2 attempts, give bigger hint
- Balance learning with forward progress
- Small explanations inline, detailed retrospectives after milestones



