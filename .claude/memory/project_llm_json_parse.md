---
name: project-llm-json-parse
description: "Agents must never raw JSON.parse LLM output — empty/truncated responses crashed the whole multi-agent workflow. Use parseLlmJson/parseClaudeJson + a graceful fallback."
metadata:
  node_type: memory
  type: project
---

Recurring crash pattern in the agentic-assistant pipeline (`backend/src/agents/`): an agent did a raw `JSON.parse(response.text.match(...)[0])` on the LLM output. When the model returns an empty or truncated body (common under rate limiting — the env is rate-limited, Voyage/Anthropic 429s are frequent), `JSON.parse('')` throws **"Unexpected end of JSON input"**. The coordinator has no per-agent recovery, so one bad LLM response **fails the entire workflow into the error screen**, discarding the search/analysis already done by earlier agents. This bit analysis + recommendation; verification also had an unguarded `parsed.requirementsCoverage.passed` that threw on a wrong-shape (but valid) JSON.

**How to apply:** never `JSON.parse` an LLM response directly. Use the shared helpers in `backend/src/agents/utils/llm-json.ts`:
- `parseLlmJson<T>(text, 'object'|'array')` — strips ```fences/prose/trailing commas, returns `null` instead of throwing.
- `parseClaudeJson<T>(runCall, kind, {agentName})` — runs the Claude call, parses, and **retries once** on parse failure (transient hiccups usually succeed on attempt 2).

Then ALWAYS provide a graceful fallback for `null` so the pipeline still completes degraded rather than crashing (analysis → minimal analysis from search `matchScore`; recommendation → rank by `matchScore` + generic localized reasoning; verification → soft pass). Also defend post-parse field access (a valid JSON can omit expected keys). Related recurring-risk memories: [[project-stripe-init-before-checks]].
