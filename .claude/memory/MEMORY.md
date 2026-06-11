# Memory Index

- [UI Redesign Plan — "Casa"](project_ui_redesign.md) — Full redesign plan: Vite migration, new "Casa" tokens/theme, Fraunces+DM Sans, dark mode, mobile bottom nav, 6-phase checklist. Approved 2026-05-28.
- [Production Deployment](project_production.md) — deploy.sh workflow, PM2 + Cloudflare tunnel, .env.production, key infra bugs fixed (CORS hoisting, city filter, Node 18 polyfill).
- [Dev Workflow — no deploys during sessions](feedback_dev_workflow.md) — Use local dev servers only. No build/deploy unless user explicitly asks.
- [Process Rules — ask first, Playwright test, i18n test](feedback_process.md) — Ask clarifying questions before implementing; always Playwright-test semantic intent; always test EN+PT after string changes.
- [Permissions — skip confirmations](feedback_permissions.md) — User runs Claude Code with --dangerously-skip-permissions; don't pause for confirmations.
- [Server startup (local dev)](feedback_server_startup.md) — Linux local dev: backend :3000, frontend :3001 via run_in_background; pkill -f ts-node-dev on stale-serving; Postgres in Docker (tino2-app-db).
- [Doc separation — CLAUDE.md vs SESSION_CONTEXT](feedback_doc_separation.md) — CLAUDE.md = durable how-to-work guidance; project status/roadmap/caveats go in SESSION_CONTEXT, not duplicated. Prune resolved items.
- [i18n plural is i18next v4](project_i18n_plural_v4.md) — Use _one/_other suffixes, not _plural; existing *_plural keys are dead app-wide.
- [providerId vs userId auth bug](project_providerid_vs_userid.md) — entity.providerId stores Provider id, not User id; provider-scoped authz must resolve provider.id from userId first. Recurred 3×.
- [Stripe init before checks](project_stripe_init_before_checks.md) — getStripeInstance() throws in dev (no key); calling it before guard clauses hangs/500s the endpoint. Init payment SDK last. Recurred 2× (A1, B1).
- [LLM JSON parse crashes workflow](project_llm_json_parse.md) — never raw JSON.parse LLM output; empty/truncated responses crash the whole agent pipeline. Use parseLlmJson/parseClaudeJson (utils/llm-json.ts) + a fallback for null.
- [getProfile omits settings / stubbed save paths](project_getprofile_omits_settings.md) — GET /auth/profile dropped settings; PrivacySettingsDialog Save was a no-op. Verify the full read+write loop for any settings feature.

## Historical (completed — kept for reference)
- [Beta launch plan](project_beta_plan.md) — Ordered plan for beta launch (password recovery, hardening, Florianópolis seed + PT_BR). Done.
- [Phase 23 prod-readiness plan](project_phase23_plan.md) — Ordered work list from prod readiness audit (security/resilience gaps). Done.
- [Phase 24 agentic memory plan](project_phase24_memory.md) — Per-user agentic memory; the per-phase plan. All 9 phases now done (see SESSION_CONTEXT roadmap).
