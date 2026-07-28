# Tino 2

A full-stack platform connecting customers with service providers for household services (cleaning, plumbing, electrical, etc.). Built as a commercial-grade learning project with a Node/React/PostgreSQL stack and an agentic AI assistant.

## Tech Stack

- **Backend**: Node.js 22, Express, TypeScript, TypeORM
- **Frontend**: React 18, TypeScript, Vite
- **Databases**: PostgreSQL 16 (app data) + PostgreSQL/pgvector (agentic memory) — both via Docker
- **AI**: Anthropic Claude API, Voyage AI embeddings, pgvector semantic search
- **Auth**: JWT, bcrypt
- **Payments**: Stripe
- **Real-time**: Socket.IO

## Prerequisites

- **Node.js 22** — use `nvm` and run `./use-node22.sh`, or install directly
- **Docker Desktop** — all databases run in containers

## First-Time Setup

```bash
# 1. Clone and enter the repo
git clone <repository-url>
cd tino2

# 2. Copy and fill in environment variables
cp backend/.env.example backend/.env
# Open backend/.env and add your API keys (see Required API Keys below)

# 3. Start databases
docker compose up -d
# Starts: postgres-app (5432), postgres-memory/pgvector (5433), adminer (8080)

# 4. Install dependencies
cd backend && npm install
cd ../frontend && npm install

# 5. Run database migrations
cd ../backend
npm run migration:run          # main app schema
npm run memory:migration:run   # pgvector memory schema

# 6. Seed demo data (Florianópolis service providers, users, bookings)
npm run seed

# 7. Start the servers
cd ..
bash start-servers.sh
# Backend: http://localhost:3000
# Frontend: http://localhost:3001
```

## Required API Keys

| Key | Where | Required for |
|-----|-------|-------------|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) | Agentic assistant |
| `VOYAGE_API_KEY` | [voyageai.com](https://www.voyageai.com) | Memory system (semantic search) |
| `STRIPE_SECRET_KEY` + `STRIPE_PUBLISHABLE_KEY` | [dashboard.stripe.com](https://dashboard.stripe.com) | Payments |
| `GOOGLE_MAPS_API_KEY` | Google Cloud Console | GPS features (degrades gracefully without it) |

## Demo Accounts

After seeding, these accounts are ready to use (password: `Demo123!`):

| Role | Email |
|------|-------|
| Customer | customer@demo.com |
| Provider | provider@demo.com |
| Admin | admin@demo.com |

## Daily Development

```bash
# Start databases (if not already running)
docker compose up -d

# Start servers (kills ports 3000/3001 first, then starts both)
bash start-servers.sh

# Or start manually in two terminals:
cd backend && npm run dev      # port 3000
cd frontend && npm start       # port 3001
```

## Key npm Scripts (backend)

```bash
npm run dev                    # development server (nodemon)
npm run build                  # TypeScript compile
npm run seed                   # seed demo data
npm run migration:run          # apply main DB migrations
npm run migration:generate     # generate migration from entity changes
npm run memory:migration:run   # apply pgvector memory migrations
npm test                       # Jest
npm run lint                   # ESLint
npm run format:check           # Prettier verification
```

## Quality Checks

Use Node 22 (`nvm use`) throughout. Backend integration tests use the disposable
PostgreSQL service on port 5434:

```bash
cd backend && npm run test:db:up && npm test

# Frontend component and decision-logic tests
npm test --prefix frontend

# From the repository root (isolated app ports 3100/3101)
npm run test:ci                # Chromium product suite
npm test                       # Full desktop/mobile browser matrix
```

GitHub Actions runs clean installs, dependency security, backend quality and
integration tests, frontend tests/build, and Chromium validation.

Every HTTP response includes an `x-request-id` for log correlation. Runtime
health and latest background-job outcomes are exposed by `/health`; the
machine-readable API contract is available at `/api/v1/openapi.json`.

## Project Documentation

| File | Contents |
|------|----------|
| `CLAUDE.md` | AI assistant instructions, architecture notes, known issues |
| `REQUIREMENTS.md` | Full business requirements (FRs, ACs, NFRs) |
| `SESSION_CONTEXT.md` | Current phase, resume point, per-phase notes |
| `LEARNING_PROGRESS.md` | Learning goals and progress tracker |
| `TEST_REGISTRY.md` | Test catalog by phase |
| `Tests/history/HISTORICAL_CONTEXT.md` | Detailed implementation notes per phase |
| `docs/adr/0001-agentic-memory.md` | Architecture Decision Record for the memory system |

## Architecture Highlights

- **Agentic assistant**: multi-agent pipeline (coordinator → requirements → recommendation → verification) with per-user semantic memory (pgvector) and episodic summaries
- **Streaming AI search**: SSE-based provider search with live token streaming from Claude
- **Real-time messaging**: Socket.IO with JWT auth
- **Stripe escrow flow**: hold on booking → capture on completion → refund on dispute
- **Operational visibility**: structured JSON logs, request correlation, job metrics, and optional Sentry reporting
- **Admin panel**: user/provider management, dispute resolution, platform settings
- **i18n**: full pt-BR / en-US coverage via react-i18next

## Database Admin

Adminer is available at **http://localhost:8080** once Docker is running.

- App DB: server `postgres-app`, user `tino`, password `tino`, database `tino_app`
- Memory DB: server `postgres-memory`, user `tino`, password `tino`, database `tino_memory`
