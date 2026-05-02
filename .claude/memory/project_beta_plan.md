---
name: Beta Prep Plan
description: Ordered plan for beta launch — password recovery, hardening, Florianópolis seed + PT_BR
type: project
originSessionId: 9f2992ec-a097-4b06-879c-9db61b2e81df
---
## Beta Launch Plan (agreed 2026-04-19)

**Why:** App is targeting commercial beta launch. Florianópolis-SC, Brazil is the target market. PT_BR must be the default language. Hardening tasks are pre-launch blockers.

### Phase 19 — Password Change & Recovery
**Status:** Implementation exists (ForgotPasswordPage, ResetPasswordPage, PasswordChangeDialog, backend routes all wired). Was mid-test when session froze.
**How to apply:** Verify E2E — forgot password email flow (Ethereal), reset via token link, in-profile password change dialog. Fix any gaps found during test.

### Phase 20 — Production Hardening
**Status:** Full audit in `PRODUCTION_HARDENING.md`. ~1 session of work.
**How to apply:** Work through PRODUCTION_HARDENING.md checklist before beta deploy. Keys already safe (.env not in git).

### Phase 21 — Florianópolis Seed + PT_BR Default
**Requirements:**
- Seed data (users, providers, services) scoped to Florianópolis-SC, Brazil (lat -27.59, lng -48.55)
- App default language: pt-BR (i18n default locale)
- All UI strings need pt-BR translations if not already present
- Service categories relevant to Brazilian domestic services market

**How to apply:** Update seed script for Florianópolis geography. Set i18next default language to pt-BR. Audit translation files for completeness.
