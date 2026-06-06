---
name: project-i18n-plural-v4
description: "Frontend i18next is v4 — plural keys must use _one/_other, not _plural; existing _plural keys are dead."
metadata: 
  node_type: memory
  type: project
  originSessionId: a59deb3c-7861-49ec-92d6-0bd939b23897
---

The frontend i18n (`frontend/src/i18n.ts`) runs **i18next v4** with no `compatibilityJSON` set. Pluralization therefore uses Intl.PluralRules suffixes **`_one` / `_other`**, NOT the v3 `_plural` suffix.

All pre-existing `*_plural` keys in the locale JSONs (e.g. `reviews_count_plural`, `completed_jobs_plural`) are **dead** — i18next ignores them and falls back to the base (singular) key even when count>1. This is an app-wide latent i18n bug.

**How to apply:** when adding a pluralized string, define `key_one` and `key_other` (+ keep `key` as a base fallback) and pass `{ count }`. Don't use `_plural`. Discovered during the Find Providers E2E audit (2026-06-04) — see [[project-find-providers-audit]] context in SESSION_CONTEXT.md.
