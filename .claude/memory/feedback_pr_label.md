---
name: feedback-pr-label
description: "Every PR I open in tino2 must carry the \"generated:claude\" label."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f11a3c16-04b0-4198-ab9a-468462d77759
  modified: 2026-08-10T04:45:07.891Z
---

Add the **`generated:claude`** label to every pull request I create in the `tino2` repo.

**Why:** the repo runs a provenance labelling scheme — `generated:claude` means "mostly
Claude-generated, requires **Codex** review", alongside `generated:codex` (requires Claude
review) and `generated:human-or-mixed`. The label routes the PR to the right reviewer, so
omitting it sends the change into the wrong review path.

**How to apply:** the label already exists in the repo, so just attach it:

```bash
gh pr create --label "generated:claude" …
# or on a PR that was auto-created when the branch was pushed:
gh pr edit <n> --add-label "generated:claude"
```

Note that pushing a branch in this repo **auto-opens a PR**, so the usual path is
`gh pr edit` rather than `gh pr create` — see [[project-main-is-pr-only]].
