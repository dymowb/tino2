---
name: project_codex_review_rounds
description: Codex cross-review reliably blocks security PRs on real concurrency/injection issues; budget 2-3 rounds and pre-empt the usual classes.
metadata: 
  node_type: memory
  type: project
  originSessionId: 793ec41f-73bb-463b-9b21-17b1cc52bdab
  modified: 2026-08-12T19:47:33.454Z
---

The `cross-agent-review` gate (Codex) is a real reviewer, not a rubber stamp. Across the
2026-08 audit-remediation stack it blocked 3 of 5 PRs, every finding was legitimate, and
two rounds per security PR was normal.

The classes it catches, worth pre-empting before pushing:

- **Read-modify-write races** on anything money- or counter-shaped. Caught three times in
  one session: cumulative refund totals, and the failed-login counter twice. Do the
  increment, the comparison and the write in ONE statement, or hold a pessimistic row lock
  across the whole sequence. Two follow-on traps once you go atomic: (a) a success path
  that clears state read *before* a slow operation (bcrypt) will wipe a lock a concurrent
  request just set — the clear must be conditional on no lock existing; (b) `RETURNING` a
  column your CASE left unchanged does not mean you changed it, so "did I just cross the
  threshold" needs its own signal.
- **Self-grant authorization** — a check that trusts a record the attacker can create.
  Anchor authorization to the *owner's* action, and validate at write time too.
- **Untrusted strings used as URLs/paths.** Anything a user stores that the client later
  fetches with credentials attached. Allowlist a canonical shape at both ends.
- **Header/encoding edges** — non-Latin-1 in HTTP headers throws in Node; multipart
  filenames arrive from busboy as UTF-8 bytes read as latin1.
- **Config read by two paths** that can disagree (env vs DB). One resolver, always.
- **Throws after a side effect** — validation that runs after the payment row exists means
  the request fails while the write persists, and the retry is refused as a duplicate.

Stacked PRs work well here: base each on the previous branch so the diff stays incremental,
then merge fixes upward as each round lands. See [[project_main_is_pr_only]] and
[[feedback_pr_label]] for the surrounding PR mechanics.
