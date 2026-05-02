---
name: Skip permission prompts
description: User runs Claude Code with --dangerously-skip-permissions; do not pause for confirmations
type: feedback
---

Proceed with all tool calls without asking for confirmation. The user starts sessions with `--dangerously-skip-permissions`.

**Why:** They explicitly opted into unrestricted tool use at session start.

**How to apply:** Never pause mid-plan to confirm a bash command, file write, server start, etc. Just do it.
