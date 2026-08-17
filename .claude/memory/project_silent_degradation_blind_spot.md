---
name: project_silent_degradation_blind_spot
description: "Code paths that catch an error and return a placeholder look identical to \"no data\" — my own live verification cannot tell them apart, so exercise them for real."
metadata: 
  node_type: memory
  type: project
  originSessionId: 3629a03a-9914-432c-abcf-940c749534ee
  modified: 2026-08-16T00:29:49.898Z
---

A path that degrades on failure (`try { query } catch { return [] }`) is invisible to
end-to-end verification: an empty collection reads as "this account has nothing"
rather than "this code has never successfully run".

**Why:** in the M6 data export (PR #28) the assistant-memory query named columns that
did not exist — the `semantic_memories` table is snake_case (`user_id`,
`source_type`, `created_at`) while its entity is camelCase, and there is no `kind` or
`updated_at`. I verified the export live in a browser, as two roles, in two locales,
and reported it working. The memory data source simply was not initialized in any of
those runs, so the code returned `[]` before ever reaching the SQL. Codex caught it by
reading the schema. Every real deployment would have exported "memory unavailable".

**How to apply:** when a collection can degrade rather than fail, verification has to
make the dependency actually present — initialize the store, insert a row, assert it
comes back — not just observe an empty list and move on. Same for anything guarded by
`isInitialized`, a feature flag, or an optional third-party client. And when a raw
query targets the memory store, check the column names against `\d <table>`: that
database is snake_case while its entities are camelCase.

Note the harness trap found while writing that test: `memory.data-source.ts` calls
`dotenv.config()` at import time, so before the fix any test touching memory connected
to the **shared development memory store**, not a test one. Related:
[[project_codex_review_rounds]], [[project_typeorm_raw_update_shape]].
