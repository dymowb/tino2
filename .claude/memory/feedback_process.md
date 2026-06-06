---
name: feedback_process
description: "Process rules — ask before implementing, always Playwright test, always test i18n"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 5d042ee2-602c-43a6-8a66-8c00717a20c4
---

**Rule 1 — Ask clarifying questions before implementing any non-trivial change.**
Don't assume intent. One clarifying question costs nothing; building the wrong thing costs a session.
Why: user explicitly asked for this to avoid rework.
How to apply: whenever a request has ambiguity (UX flow, scope, data model, what "looks the same" means, etc.) — ask before writing code.

**Rule 2 — Always test with Playwright after every UI change.**
Verify semantic intention, not just "it loads". Does the feature do what a real user expects?
Why: visual checks miss logic errors; the user has caught several cases where code "worked" but the UX was wrong.
How to apply: after every UI change, open the app via Playwright, walk the user flow end-to-end, and confirm the intended behavior is actually present.

**Rule 3 — Always test i18n when customer-facing strings are touched.**
Switch locale to both EN and PT, verify strings render correctly in each.
Why: several bugs were caused by hardcoded PT strings or missing translation keys in EN.
How to apply: after adding/changing any `t('...')` key or locale file, browser-test in both locales.

See also [[feedback_dev_workflow]] for the no-deploy rule.
