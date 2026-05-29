# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tino 2 is a full-stack domestic service application that connects customers with service providers for household services. The platform features GPS-based provider discovery, real-time messaging, booking management, quote systems, and payment processing.

## Project Memory (fresh clone setup)

Memory files are committed to `.claude/memory/`. On a new machine, seed Claude Code's memory store before starting work:

```bash
# find your project memory path (run from repo root)
PROJ_KEY=$(pwd | sed 's|[/\\]|-|g' | sed 's|^-||')
DEST="$HOME/.claude/projects/$PROJ_KEY/memory"
mkdir -p "$DEST" && cp .claude/memory/*.md "$DEST/"
```

After that, Claude will have full context on user preferences, feedback patterns, and phase history without needing to re-establish it.

## Project Navigation — Key .md Files

| File | Purpose |
|------|---------|
| `REQUIREMENTS.md` | Business requirements (FRs, ACs, NFRs) — update when business behaviour changes |
| `SESSION_CONTEXT.md` | Lean: roadmap table + current session status + resume point only |
| `Tests/history/HISTORICAL_CONTEXT.md` | Detailed implementation notes for completed + in-progress phases |
| `TEST_REGISTRY.md` | Test catalog with IDs, status, feature tags; regression checklist by phase |

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

### Frontend (React + Vite)
```bash
cd frontend
npm install                    # Install dependencies
npm run dev                    # Start Vite dev server (port 3001)
npm start                      # Alias for npm run dev
npm run build                  # TypeScript check + Vite production build → build/
npm run preview                # Preview production build locally
```
Env vars use `VITE_` prefix (not `REACT_APP_`). Access via `import.meta.env.VITE_*`.

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
   BROWSERBASE_API_KEY=<your-browserbase-api-key>
   BROWSERBASE_PROJECT_ID=<your-browserbase-project-id>
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
**Status**: ✅ RESOLVED (2026-05-28) — migrated from CRA to Vite, TypeScript upgraded to 5.x.
`react-i18next.d.ts` workaround has been deleted. `useTranslation('namespace')` and `t('key', fallback)` now type-check correctly with TS5 const type parameters.

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

## Testing Protocol
- After implementing or changing any feature, test the full end-to-end user flow for that feature — not just a visual check
- For UI changes: navigate to the page, interact with the feature, verify the result in both UI and backend state
- For auth/security changes: test both the blocked case and the allowed case
- Do not consider a feature done until the happy path AND the key error paths have been verified

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
I developed software for a few years, but it's been 15+ years since I last coded professionally.

## 🎓 Current Learning Focus
**Primary goals** (updated 2026-04-04):
1. **System design** — architecture decisions, tradeoffs, scalability patterns
2. **Agentic AI systems** — agent patterns (reflection, planning, tool use), MCP servers, prompt engineering
3. **Design patterns** — SOLID, DDD, event-driven architecture

TypeScript/coding syntax is no longer a primary focus — familiarity is sufficient.

## 🎓 Teaching Calibration
**IMPORTANT**: At the start of EVERY session, read `@LEARNING_PROGRESS.md` to calibrate.

## Working Relationship

**You (Claude)**: Take the wheel — implement at speed, explain interesting design decisions and patterns as you go
**Me**: Architecture co-designer, reviewer, and learner focused on the "why" not the "how to type it"

### Teaching Approach

**Do:**
- Implement autonomously and explain interesting patterns inline (1–3 sentences max)
- Flag non-obvious design decisions and briefly explain the tradeoff
- Highlight anything touching agentic patterns, system design, or prompt engineering
- Keep moving — depth over breadth, but don't stop for basics

**Don't:**
- Pause for coding exercises on syntax or boilerplate
- Quiz on TypeScript patterns already mastered
- Stop progress to explain things that are obvious from the code

**When to pause and discuss** (still collaborative):
- Architecture decisions with real tradeoffs
- Agentic system design (agent topology, prompt strategy, tool use)
- Anything that will affect the long-term shape of the codebase

### Feedback Style
**Honest and direct** — no overpraise. Constructive criticism when deserved.



