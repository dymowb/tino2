---
name: ui-redesign-casa
description: "UI redesign status — \"Casa\" design language. Track completed/next phases here; full plan in UI_REDESIGN.md."
metadata: 
  node_type: memory
  type: project
  originSessionId: 9de423bc-76ef-4954-bb76-7277c4698e30
---

# UI Redesign — "Casa" Design Language

**Full plan**: `UI_REDESIGN.md` in repo root (authoritative — phase checklist, tokens, component specs).

**Why**: App is feature-complete and beta-ready. UI was stock MUI with no identity. Needs pro-grade overhaul.

## Phase Status

| Phase | What | Status |
|-------|------|--------|
| 1 — Foundation | Vite migration, Casa theme, dark mode, Google Fonts | ✅ Done 2026-05-28 |
| 2 — Homepage + Provider Cards | Structural rebuild of HomePage and FindProvidersPage cards | ✅ Done 2026-05-29 |
| 3 — Bookings + Dashboard | MyBookingsPage, ProviderDashboard, BookingDialog | ⬜ Next |
| 4 — Nav Shell | Mobile bottom nav, page transitions, notification badge | ⬜ |
| 5 — Admin + Polish | Admin sidebar, skeleton states, a11y audit | ⬜ |

## Phase reorder decision (2026-05-29)
"Restructure first, refine later." Original Phase 2 (Shell) was moved later; Homepage and Provider Cards structural rebuilds were done first since they have more visual impact.

## Phase 2 key decisions
- **Homepage hero**: geometric composition (terra circle, earth rotated square, gold dot, ring) instead of photo — no asset dependency
- **Provider cards**: 4:3 colored block with Fraunces initials; color deterministically derived from business name hash; DM Mono price in frosted glass pill overlay
- **Default coords**: Florianópolis (-27.5954, -48.5480) to match seed data
- **Vite LAN**: `server.host: true` — accessible at 192.168.1.98:3001

## Next session: Phase 3
Start with `MyBookingsPage` (status-border card layout), then `ProviderDashboardPage` (Fraunces stat numbers, styled Recharts), then `BookingDialog` step indicator.

**Why:** booking flow is the core customer journey — most important to polish after the search/discovery experience is done.
