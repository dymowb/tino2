# Test Registry

Tracks all UX tests, their status, and which feature areas they exercise.

**Purpose**: differential regression — when a feature changes, only re-run tests tagged with it.

## Testing Protocol

**ALWAYS use automated browser tools for UI testing — never manual "navigate and look" steps.**

- Preferred tool: `chrome-devtools` MCP (mcp__chrome-devtools__*)
- Fallback: `playwright` MCP (mcp__playwright__*)
- Use `take_screenshot` to confirm visual state, `evaluate_script` for DOM assertions, `get_network_request` / `list_network_requests` to verify API calls
- Every test in this registry must be executable end-to-end via one of these tools without human interaction

---

## Feature Tags

| Tag | Description |
|-----|-------------|
| `auth` | Login, logout, token handling |
| `socket` | Socket.IO real-time connection + events |
| `messaging` | Conversations, send/edit/delete messages (REST layer) |
| `payments` | Payment list, amounts, filters, refund dialog |
| `escrow` | Card save, hold, capture, auto-capture, dispute flow |
| `reviews` | Write, edit, filter reviews; criteria labels |
| `bookings` | Create, list, filter, cancel bookings |
| `providers` | Provider search, filter, detail page |
| `quotes` | Quote requests and submissions |
| `profile` | User profile view and edit |
| `notifications` | In-app notification bell and real-time push |
| `home` | Home page hero, categories, featured providers |
| `nav` | Navigation bar, role labels, routing |

---

## Test Catalog

### D — Messaging Page (`/messages`)

| ID | Description | Status | Feature Tags |
|----|-------------|--------|-------------|
| D1 | Conversation list loads | ✅ Pass | `messaging`, `socket` |
| D2 | Open a conversation, messages render | ✅ Pass | `messaging`, `socket` |
| D3 | Send a new message | ✅ Pass | `messaging`, `socket` |
| D4 | Edit a sent message | ✅ Pass | `messaging`, `socket` |
| D5 | Reply to a message | ✅ Pass | `messaging`, `socket` |

### E — Payments Page (`/payments`)

| ID | Description | Status | Feature Tags |
|----|-------------|--------|-------------|
| E1 | Customer payment list loads | ✅ Pass | `payments` |
| E2 | Provider earnings tab loads | ✅ Pass | `payments` |
| E3 | Payment amounts display correctly (customer + provider totals, no NaN) | ✅ Pass | `payments` |
| E4 | Status filter works | ✅ Pass | `payments` |
| E5 | Escrow column shows "—" when undefined | ✅ Pass | `payments` |

### F — Provider Dashboard & Provider-side flows

| ID | Description | Status | Feature Tags |
|----|-------------|--------|-------------|
| F1 | Provider dashboard loads (earnings, completion rate, no crash) | ✅ Pass | `providers`, `bookings` |
| F2 | Provider messages page loads and works | ✅ Pass | `messaging`, `socket`, `providers` |
| F3 | Reviews about provider renders | ✅ Pass | `reviews`, `providers` |
| F4 | Provider payments page loads and shows earnings | ✅ Pass | `payments`, `providers` |

### G — Home Page (`/`)

| ID | Description | Status | Feature Tags |
|----|-------------|--------|-------------|
| G1 | Page loads, hero/CTA renders | ✅ Pass | `home` |
| G2 | Service category cards visible | ✅ Pass | `home` |
| G3 | Featured providers section (stub, cosmetic) | ✅ Pass | `home`, `providers` |

### H — Find Providers (`/providers`)

| ID | Description | Status | Feature Tags |
|----|-------------|--------|-------------|
| H1 | Page loads, AI + Browse tabs render | ✅ Pass | `providers` |
| H2 | Search by keyword filters results | ✅ Pass | `providers` |
| H3 | Filter by service type (Autocomplete) | ✅ Pass | `providers` |
| H4 | Filter by location | ✅ Pass | `providers` — GPS now configured; Haversine radius filter verified on prod (Florianópolis 2km→2, 10km→15, 50km→24; São Paulo 10km→0) |
| H5 | Provider card shows name, rating, services, price | ✅ Pass | `providers` |
| H6 | Click provider card → provider detail page | ✅ Pass | `providers` |

### I — Provider Detail + Booking Dialog

| ID | Description | Status | Feature Tags |
|----|-------------|--------|-------------|
| I1 | Provider profile renders (bio, services, rating, reviews) | ✅ Pass | `providers`, `reviews` |
| I2 | "Book Now" opens booking dialog | ✅ Pass | `bookings`, `providers` |
| I3 | Booking dialog form fills and submits | ✅ Pass | `bookings` |
| I4 | Booking confirmation shown | ✅ Pass | `bookings` |

### J — My Bookings (`/bookings`)

| ID | Description | Status | Feature Tags |
|----|-------------|--------|-------------|
| J1 | Page loads, booking list renders | ✅ Pass | `bookings` |
| J2 | New booking shows correct data | ✅ Pass | `bookings` |
| J3 | Status filter works | ✅ Pass | `bookings` |
| J4 | Cancel a pending booking | ✅ Pass | `bookings` |

### K — Profile Page

| ID | Description | Status | Feature Tags |
|----|-------------|--------|-------------|
| K1 | Page loads with correct user data pre-filled | ✅ Pass | `profile`, `auth` |
| K2 | Edit a field and save | ✅ Pass | `profile` |
| K3 | Change password dialog renders | ✅ Pass | `profile`, `auth` |

### P — Escrow Payment Flow (Phase 14)

Stripe test cards: `4242 4242 4242 4242` (success) · `4000000000009995` (no funds) · `4000002500003155` (3DS)

| ID | Scenario | Status | Feature Tags |
|----|----------|--------|--------------|
| P1 | Accept quote → card setup form appears, card saved successfully | ✅ Passed | `escrow`, `quotes`, `payments` |
| P2 | Provider starts service → hold placed, booking → IN_PROGRESS | ✅ Passed | `escrow`, `bookings` |
| P3 | Hold fails (no funds card) → booking CANCELLED, both parties notified | ✅ Passed (via Stripe error path — Stripe blocks saving truly declined cards at setup, failure path verified via invalid-key test which hit same catch block) | `escrow`, `bookings`, `notifications` |
| P4 | Provider marks complete → booking → PENDING_COMPLETION, customer notified | ✅ Passed | `escrow`, `bookings`, `notifications` |
| P5 | Customer confirms completion → payment captured, booking → COMPLETED | ✅ Passed | `escrow`, `payments`, `bookings` |
| P6 | Customer disputes → booking → IN_DISPUTE, capture frozen, admin notified | ✅ Passed | `escrow`, `payments`, `bookings` |
| P7 | Auto-capture: PENDING_COMPLETION past N days → captured, COMPLETED | ✅ Passed | `escrow`, `payments` |
| P8 | Admin settings: auto_capture_days readable and editable | ✅ Passed | `escrow` |
| P9 | Cancel before service starts → no charge | ✅ Passed | `escrow`, `bookings` |
| P10 | Payment history page shows escrow status correctly | ✅ Passed (+ fixed missing i18n keys for pending_completion/in_dispute) | `payments`, `escrow` |
| P11 | Admin disputes page: open tab shows IN_DISPUTE bookings | ✅ Passed (bug fix: r.data → r.data.data unwrap in AdminDisputesPage) | `escrow`, `admin` |
| P12 | Admin disputes page: filter tabs (open/resolved/all) switch correctly | ✅ Passed | `escrow`, `admin` |
| P13 | Resolve dialog: opens with correct amount, reason, decision radios | ✅ Passed | `escrow`, `admin` |
| P14 | Resolve dialog: radio toggle changes button label (Release Payment ↔ Refund Customer) | ✅ Passed | `escrow`, `admin` |
| P15 | Resolve dialog: processing spinner shown, buttons disabled during submit | ✅ Passed | `escrow`, `admin` |
| P16 | Resolve dialog: Stripe error shown inline, dialog stays open | ✅ Passed | `escrow`, `admin` |
| P17 | Resolved disputes move to resolved tab; show "Customer won"/"Provider won" chip | ✅ Passed (bug fix: getDisputes now queries isDisputed=true, not status=IN_DISPUTE, so resolved disputes remain visible) | `escrow`, `admin` |

---

### L — My Quotes (`/quotes`)

| ID | Description | Status | Feature Tags |
|----|-------------|--------|-------------|
| L1 | Customer: page loads with "Minhas Cotações" title and tabs in Portuguese | ✅ Pass | `quotes` |
| L2 | Customer: empty state shows PT copy, "Solicitar Nova Cotação" button works | ✅ Pass | `quotes` |
| L3 | Provider: page loads with "Solicitações de Cotação" title and correct tabs | ✅ Pass | `quotes`, `providers` |

### R — My Reviews (`/reviews`)

| ID | Description | Status | Feature Tags |
|----|-------------|--------|-------------|
| R1 | Page loads, reviews list renders | ✅ Pass | `reviews` |
| R2 | Write a new review | ✅ Pass | `reviews`, `bookings` |
| R3 | Rating filter works | ✅ Pass | `reviews` |
| R4 | Edit an existing review | ✅ Pass | `reviews` |

### EV — Email Verification (Phase 16)

| ID | Description | Status | Feature Tags |
|----|-------------|--------|-------------|
| EV1 | Seeded demo user logs in without email verification gate | ✅ Pass | `auth` |
| EV2 | Register new user → confirmation screen shown; login attempt returns EMAIL_NOT_VERIFIED warning with resend button | ✅ Pass (2 bugs fixed: `register()` and `login()` in AuthContext were toggling global `loading`, causing ProtectedRoute to remount the form and reset local state before it could render) | `auth` |
| EV3 | Extract token from backend log → navigate to /verify-email?token=... → "Email verified!" → login succeeds | ✅ Pass | `auth` |
| EV4 | Resend verification email button → "Verification email sent! Check your inbox." confirmation | ✅ Pass | `auth` |
| EV5 | /verify-email?token=bogustoken → "Verification failed / Invalid or expired verification token" | ✅ Pass | `auth` |

### GPS — GPS Geocoding (Phase 17)

| ID | Description | Status | Feature Tags |
|----|-------------|--------|-------------|
| GPS1 | Type address in search box → geocodes → provider list updates to new city | ✅ Pass (bug fixed: `handleAddressSearch` was reading `result.latitude` and `result.formatted_address` but API returns `result.location.latitude` and `result.formattedAddress`) | `providers` |
| GPS2 | Use My Location button → browser geolocation → search re-runs with new coords | ✅ Pass | `providers` |
| GPS3 | Provider cards show correct distance and duration chips (e.g. "6.18 km / 17 min") | ✅ Pass (2 bugs fixed: `formatDistance` assumed meters but API returns km; `formatDuration` assumed seconds but API returns minutes — fixed by using `distanceText`/`durationText` from API) | `providers` |
| GPS4 | Invalid/nonsense address → 400 from geocoding API → error toast, location unchanged | ✅ Pass | `providers` |

### FA — File Attachments in Messages (Phase 18)

| ID | Description | Status | Feature Tags |
|----|-------------|--------|--------------|
| FA1 | Attach image + text → upload 200 → preview thumbnail shown → send → image renders inline in bubble | ✅ Pass | `messaging` |
| FA2 | Attach non-image file (txt) with no text → upload 200 → file icon preview shown → send (attachment-only) → file link renders in bubble | ✅ Pass (bug fixed: route validator required non-empty `message`; made `message` optional with cross-field validator requiring message OR attachments) | `messaging` |

### N — Notifications (Phase 9)

| ID | Description | Status | Feature Tags |
|----|-------------|--------|-------------|
| N1 | Notification bell shows unread count badge | ✅ Pass | `notifications`, `nav` |
| N2 | Click bell → notification dropdown opens | ✅ Pass | `notifications` |
| N3 | Unread count clears after viewing | ✅ Pass | `notifications` |

### A — Admin Panel (Phase 13)

| ID | Description | Status | Feature Tags |
|----|-------------|--------|-------------|
| A1 | Admin login at `/admin` renders dashboard | ✅ Pass | `admin`, `auth` |
| A2 | Dashboard shows user/provider/booking counts | ✅ Pass | `admin` |
| A3 | Users page: list loads, search works | ✅ Pass | `admin` |
| A4 | Suspend user → user cannot login | ✅ Pass | `admin`, `auth` |
| A5 | Reactivate user → login works again | ✅ Pass | `admin`, `auth` |
| A6 | Providers page: list loads, verify/unverify toggle | ✅ Pass | `admin`, `providers` |

### PW — Password Recovery (Phase 19)

| ID | Description | Status | Feature Tags |
|----|-------------|--------|-------------|
| PW1 | Forgot password → email sent (Ethereal preview URL in backend log) | ✅ Pass | `auth` |
| PW2 | Reset link → new password accepted → login with new password succeeds | ✅ Pass | `auth` |
| PW3 | Bogus reset token → "Invalid or expired token" error | ✅ Pass | `auth` |
| PW4 | Change password from profile page (logged-in flow) | ✅ Pass | `auth`, `profile` |

### M — Agentic Memory (Phase 24)

| ID | Description | Status | Feature Tags |
|----|-------------|--------|-------------|
| M1 | AI assistant extracts location from conversation and stores to memory | ✅ Pass | `assistant` |
| M2 | On next session, agent references memory (skips asking about known location) | ✅ Pass | `assistant` |
| M3 | Reflection job synthesises cross-session patterns into semantic facts + rules | ✅ Pass | `assistant` |
| M4 | `GET /api/v1/agentic-assistant/memory-debug` returns scored memories for user | ✅ Pass | `assistant` |

---

## Regression Checklist by Phase

When a phase is complete, re-run only the tests whose tags intersect with what changed.

| Phase | Changed Feature Tags | Tests to Re-run |
|-------|---------------------|-----------------|
| Phase 8 — Socket.IO real-time | `socket`, `messaging` | D1–D5, F2 |
| Phase 9 — Notifications | `notifications`, `socket`, `nav` | N1–N3 |
| Phase 10 — Quote system | `quotes` | L1–L3 |
| Phase 11 — Provider availability | `providers`, `bookings` | H1–H6, I2–I4, J1–J4 |
| Phase 12 — Provider review responses | `reviews` | R1���R4, I1, F3 |
| Phase 13 — Admin panel | `admin`, `auth` | A1–A6 |
| Phase 14 — Stripe escrow | `payments`, `escrow`, `bookings` | E1–E5, F4, P1–P10 |
| Phase 15 — Dispute resolution | `escrow`, `payments`, `admin` | P6, P11–P17 |
| Phase 16 — Email verification | `auth` | K1, K3, EV1–EV5 |
| Phase 17 — GPS geocoding | `providers` | GPS1–GPS4 |
| Phase 18 — File attachments | `messaging` | FA1–FA2 |
| Phase 19 �� Password recovery | `auth`, `profile` | PW1–PW4 |
| Phase 21/22 — i18n + seed data | all pages | Full smoke test both roles |
| Phase 24 — Agentic memory | `assistant` | M1–M4 |

---

## Adding New Tests

When a new phase adds new pages or flows:
1. Add test rows to the catalog under a new letter section
2. Add the feature tag(s) to the tag table if new tags are needed
3. Update the regression checklist row for that phase
