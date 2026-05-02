# Memory Index

* [Skip permission prompts](feedback_permissions.md) — User runs with --dangerously-skip-permissions; never pause for confirmations
* [Server startup on Windows Git Bash](feedback_server_startup.md) — Run `bash start-servers.sh` from repo root; never use raw `npm run dev &`
* [Phase 23 prod hardening plan](project_phase23_plan.md) — P0+P1 done; AWS/EC2+PM2 chosen; JWT cookies deferred post-beta; Browserbase key needs rotation
* [Phase 24 agentic memory plan](project_phase24_memory.md) — ADR approved 2026-04-24; Phase 1 is next; full design in docs/adr/0001-agentic-memory.md





# Project Memory

## Project Intent

This is a **commercial candidate**, not just a learning project.

* Targeting beta testers, with intent to launch commercially
* All functional AND non-functional requirements in REQUIREMENTS.md should eventually be implemented
* Treat architectural decisions with production standards in mind
* Do not skip requirements as "out of scope" without explicit user agreement

## Tech Stack

* Backend: Node.js/Express/TypeScript on port 3000
* Frontend: React/TypeScript (CRA) on port 3001
* DB: SQLite (dev) / PostgreSQL (prod), TypeORM. Phase 24+ uses PostgreSQL locally via Docker for memory work (pgvector requires it)
* Auth: JWT (accessToken field, not token)
* Real-time: Socket.IO
* AI: @anthropic-ai/sdk installed, agents in backend/src/agents/

## Key Patterns

* API routes versioned: /api/v1/...
* Admin role: userType === 'admin', protected by requireAdminRole middleware
* Agents use anthropicService.callClaude() from agents/services/anthropic.service.ts
* anthropicService.stream() available for token-by-token streaming (async generator)
* Few-shot prompting used in review-response.agent.ts
* SSE streaming: POST /workflows?stream=true — emits started/progress/token/complete events
* Frontend fetch token: localStorage.getItem('accessToken'), base URL: process.env.REACT\_APP\_API\_URL || 'http://localhost:3000/api/v1'
* requirements.agent.ts: normalises followUpQuestions\[] → followUpQuestion string in parseClaudeResponse

## User Preferences

* Direct, honest feedback — no overpraise
* Treat as commercial project going forward
* Industry-standard safety guards for admin panel (same-app approach)
* For teaching: Intermediate→Advanced level, collaborative design + independent implementation



