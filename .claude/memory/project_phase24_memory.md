---
name: Phase 24 — Agentic Memory System
description: Per-user agentic memory for Tino 2; Phase 1+2 done; Phase 3 next (semantic read path)
type: project
originSessionId: d6f46493-3b71-4f74-ad3f-6891fa922147
---
Phase 24 is the agentic memory system. ADR approved 2026-04-24.

**Why:** Agentic assistant starts cold every session. Memory layer adds semantic (user preferences/facts), episodic (session summaries), and procedural (behavioral rules) memory to adapt behavior across sessions.

**Ground truth document:** `docs/adr/0001-agentic-memory.md` — read this first every session. Contains data model, scoring formula, prompt template, full phase list.

**Key decisions:**
- Framework: direct implementation (TypeScript, no Mem0/LangGraph)
- Embeddings: Voyage AI `voyage-3` (prod), `voyage-3-lite` (dev)
- Vector store: pgvector on PostgreSQL — separate Docker DB (port 5433) for dev
- Scope: per-user; customers Phase 1, providers Phase 2
- Procedural approval: ≥0.85 auto-approve, 0.65–0.84 queued, <0.65 discarded
- PII: opt-out, scrub on write

**Phase progress:**
1. ✅ Schema (TypeORM migrations) + pgvector setup + EmbeddingService abstraction
2. ✅ Semantic write path: ExtractionAgent (Haiku) + Deduper + PII scrubber; hooked into coordinator post-completion async
3. ⏳ Semantic read path: MemoryRetriever (hybrid scoring) + ContextInjector (`<memory>` block) + coordinator wiring

**Also done this session (not memory-specific):**
- App migrated from SQLite (dev) to PostgreSQL everywhere — Docker postgres:16 on port 5432
- DB setup commands still need to be run after Docker install: `docker compose up -d` → `migration:generate` → `migration:run` → `memory:migration:run` → `seed`
4. Episodic memory (session summaries, FK links to bookings/workflows)
5. Reflection job: episodes → semantic facts + procedural rules (nightly cron)
6. Procedural rules: review queue, auto-approval, prompt injection
7. User-facing API (list/search/delete) + admin stats
8. Evaluation harness: multi-session behavioral tests

**Pending decisions (from ADR):**
- Who reviews pending procedural rules at scale (deferred to Phase 6)
- Provider memory rollout (after customer approach validated)

**How to apply:** At session start, read `docs/adr/0001-agentic-memory.md` before touching any code. All scoring formulas, table schemas, and prompt templates are defined there.
