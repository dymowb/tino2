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
- **Databases**: PostgreSQL (application), PostgreSQL/pgvector (assistant memory), Redis (optional caching)
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

## Browser Automation

Playwright is the supported browser automation layer. The product does not
expose remote-browser session APIs.

## Known Issues (active)

- _None currently._ (Resolved: the `profile.fields.customer/provider` nav-bar keys now exist in en/pt.)

> Feature/phase status and operational caveats live in `SESSION_CONTEXT.md` — not duplicated here. Stripe (test mode) + Google Maps/Places keys are now configured and live on prod.

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
- **Always test with Playwright** after every UI change — not just "does it load" but verify the semantic intention: does the feature actually do what it's supposed to do for a real user?
- Test the full end-to-end user flow, not just the changed component in isolation
- For UI changes: navigate to the page, interact with the feature, verify result in both UI and backend state
- For auth/security changes: test both the blocked case and the allowed case
- **Always test i18n** whenever any customer-facing strings are added or changed: switch locale to EN and PT and verify strings render correctly in both
- Do not consider a feature done until the happy path AND the key error paths have been verified
- Make sure the database is populated with seed data before running UX tests

## Pre-PR Review Protocol

Every PR is reviewed by the *other* agent through the `cross-agent-review` check, which fails
the build on a blocking finding. Before pushing a branch, run the pre-check locally:

```bash
git diff main...HEAD > "$SCRATCHPAD/cross-review.diff"   # same input the CI reviewer gets
```

then spawn the **`pr-precheck`** agent (`.claude/agents/pr-precheck.md`) with the diff path,
a summary of what the change claims to do, and an explicit list of what was deliberately left
out of scope. Fix every blocking-class finding before pushing; advisory findings are usually
noise, because the CI reviewer's own prompt refuses to block on style or design preference.

- The reviewer the pre-check imitates is not a guess: its prompt is committed at
  `.github/review/codex-review.md` and its output schema next to it. **If either changes,
  update the agent definition to match.**
- Spawn it as a *fresh* agent, never as a fork of the implementing session. A fork inherits
  the author's reasoning and ratifies its blind spots — which is exactly how HN2 cost seven
  review rounds.
- A newly added or edited agent definition is **not picked up mid-session**; the registry
  loads at startup. Until the next session, run it as `general-purpose` and tell it to read
  and follow `.claude/agents/pr-precheck.md` first.

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
No need to ask for authorization for POST or GET operations, just do them directly.
- **Before implementing any non-trivial change, ask clarifying questions** to avoid rework. Do not assume intent — the cost of one question is far lower than the cost of building the wrong thing.
- After each action part of an execution plan, update @SESSION_CONTEXT.md so work can be resumed if the session crashes. Updates happen after each STEP, not only after a major milestone.
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


