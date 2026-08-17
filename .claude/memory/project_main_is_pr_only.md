---
name: project-main-is-pr-only
description: "main is protected — direct pushes are rejected; work lands via PR, and pushing a branch auto-opens one."
metadata: 
  node_type: memory
  type: project
  originSessionId: f11a3c16-04b0-4198-ab9a-468462d77759
  modified: 2026-08-10T03:42:49.759Z
---

As of 2026-08-09 the `tino2` repo protects `main` with ruleset `no_merging_if_quality_fails`:
direct `git push origin main` is rejected with "2 of 2 required status checks are expected".
Required checks are `validate` and `review-policy`; merge method is **squash only**;
`required_approving_review_count` is **0**.

**Why:** the project's entire history was direct-to-main commits, so the old habit now fails
at the push step and the fix is not obvious from the error.

**How to apply:** commit locally, push a feature branch, then merge the PR.
- Pushing a branch **auto-creates a PR** with a branch-name title and empty body — use
  `gh pr edit <n> --title … --body …`, not `gh pr create` (which errors "already exists").
- GitHub hides the Approve button on your own PRs, and that is fine: `review-policy` exempts
  PRs authored by `dymowb` from needing a second reviewer. A `BLOCKED` merge state with all
  checks green usually means a duplicate check run is still in flight.
- After a squash merge, local `main` reads "ahead N, behind 1" and `pull --ff-only` refuses —
  use `git reset --hard origin/main`.

`gh` is installed at `~/.local/bin/gh` (user-space, no sudo) and authenticated as `dymowb`.

Related: [[project-node22-toolchain]], [[project-production]]
