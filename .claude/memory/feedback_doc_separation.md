---
name: feedback-doc-separation
description: What belongs in CLAUDE.md vs SESSION_CONTEXT.md — keep durable guidance separate from project status.
metadata: 
  node_type: memory
  type: feedback
  originSessionId: aeee8df3-ab2e-451f-b633-70b940e7c89c
---

CLAUDE.md is for **durable "how to work in this repo" guidance** (architecture, commands, conventions, SOPs, role/teaching calibration) — it should change rarely. **Project status** (what's built, which phase, feature caveats, roadmap) belongs in `SESSION_CONTEXT.md`, not CLAUDE.md.

**Why:** the user noticed a "Feature Status — Residual Caveats" table I'd put in CLAUDE.md and correctly flagged it as out of place — it was status that duplicated the SESSION_CONTEXT roadmap. Resolved/✅ items (e.g. a "RESOLVED" SOP entry) are history, not standing procedure, and are clutter in CLAUDE.md too.

**How to apply:** when editing CLAUDE.md, ask "is this stable guidance, or current status?" If status → put it in SESSION_CONTEXT (or REQUIREMENTS for business rules) and at most leave a one-line pointer in CLAUDE.md. Don't duplicate the roadmap across files. Prune resolved items rather than leaving them marked DONE. Related: [[feedback_process]].
