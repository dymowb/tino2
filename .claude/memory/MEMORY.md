# Memory Index

- [UI Redesign Plan — "Casa"](project_ui_redesign.md) — Full redesign plan: Vite migration, new "Casa" tokens/theme, Fraunces+DM Sans, dark mode, mobile bottom nav, 6-phase checklist. Approved 2026-05-28.
- [Production Deployment](project_production.md) — deploy.sh workflow, PM2 + Cloudflare tunnel, .env.production, key infra bugs fixed (CORS hoisting, city filter, Node 18 polyfill).
- [Dev Workflow — no deploys during sessions](feedback_dev_workflow.md) — Use local dev servers only (192.168.1.98:3001). No build/deploy unless user explicitly asks.
- [Process Rules — ask first, Playwright test, i18n test](feedback_process.md) — Ask clarifying questions before implementing; always Playwright-test semantic intent; always test EN+PT after string changes.
- [i18n plural is i18next v4](project_i18n_plural_v4.md) — Use _one/_other suffixes, not _plural; existing *_plural keys are dead app-wide.
- [providerId vs userId auth bug](project_providerid_vs_userid.md) — entity.providerId stores Provider id, not User id; provider-scoped authz must resolve provider.id from userId first. Recurred 3×.
- [Stripe init before checks](project_stripe_init_before_checks.md) — getStripeInstance() throws in dev (no key); calling it before guard clauses hangs/500s the endpoint. Init payment SDK last. Recurred 2× (A1, B1).
- [getProfile omits settings / stubbed save paths](project_getprofile_omits_settings.md) — GET /auth/profile dropped settings; PrivacySettingsDialog Save was a no-op. Verify the full read+write loop for any settings feature.
- [Label every PR `generated:claude`](feedback_pr_label.md) — Repo routes review by provenance label; claude-generated PRs go to Codex for review.
- [main is PR-only](project_main_is_pr_only.md) — Direct pushes to main are rejected; pushing a branch auto-opens a PR (edit it, don't create). Squash-only, 0 approvals needed.
- [Node 22 toolchain via nvm](project_node22_toolchain.md) — Repo needs Node 22.12; source nvm in every Bash call or you silently get system Node 18.
- [Doc separation — CLAUDE.md vs SESSION_CONTEXT](feedback_doc_separation.md) — CLAUDE.md = durable how-to-work guidance; project status/roadmap/caveats go in SESSION_CONTEXT, not duplicated. Prune resolved items.
- [Codex review rounds](project_codex_review_rounds.md) — cross-agent-review blocks security PRs on real races/injection; budget 2-3 rounds and pre-empt the usual classes.
- [TypeORM raw UPDATE result shape](project_typeorm_raw_update_shape.md) — .query() on UPDATE/DELETE returns [rows, rowCount]; rows[0].col is always undefined and fails open. Wrap in a CTE.
- [Silently-degrading paths are verification blind spots](project_silent_degradation_blind_spot.md) — catch-and-return-[] looks like "no data"; exercise the dependency for real. Memory DB is snake_case, entities camelCase.
