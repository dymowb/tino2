# Test Registry

Tracks all UX tests, their status, and which feature areas they exercise.

**Purpose**: differential regression — when a feature changes, only re-run tests tagged with it.

---

## Feature Tags

| Tag | Description |
|-----|-------------|
| `auth` | Login, logout, token handling |
| `socket` | Socket.IO real-time connection + events |
| `messaging` | Conversations, send/edit/delete messages (REST layer) |
| `payments` | Payment list, amounts, filters, refund dialog |
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
| E3 | Payment amounts display correctly | ✅ Pass | `payments` |
| E4 | Status filter works | ✅ Pass | `payments` |
| E5 | Escrow column shows "—" when undefined | ✅ Pass | `payments` |

### F — Provider Dashboard & Provider-side flows

| ID | Description | Status | Feature Tags |
|----|-------------|--------|-------------|
| F1 | Provider dashboard loads (earnings, completion rate) | ✅ Pass | `providers`, `bookings` |
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
| H4 | Filter by location | ⚠️ Skip | `providers` — GPS not configured (expected) |
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

### L — My Quotes (`/quotes`)

| ID | Description | Status | Feature Tags |
|----|-------------|--------|-------------|
| L1 | Page loads and renders | ❌ No route | `quotes` — FR-037, Phase 10 |
| L2 | Quote request list renders | ❌ No route | `quotes` — FR-037, Phase 10 |

### R — My Reviews (`/reviews`)

| ID | Description | Status | Feature Tags |
|----|-------------|--------|-------------|
| R1 | Page loads, reviews list renders | ✅ Pass | `reviews` |
| R2 | Write a new review | ✅ Pass | `reviews`, `bookings` |
| R3 | Rating filter works | ✅ Pass | `reviews` |
| R4 | Edit an existing review | ✅ Pass | `reviews` |

---

## Regression Checklist by Phase

When a phase is complete, re-run only the tests whose tags intersect with what changed.

| Phase | Changed Feature Tags | Tests to Re-run |
|-------|---------------------|-----------------|
| Phase 8 — Socket.IO real-time | `socket`, `messaging` | D1, D2, D3, D4, D5, F2 |
| Phase 9 — Notifications | `notifications`, `socket`, `nav` | + new N tests (TBD) |
| Phase 10 — Quote system | `quotes` | L1, L2 + new L tests |
| Phase 11 — Provider availability | `providers`, `bookings` | H1–H6, I2–I4, J1–J4 |
| Phase 12 — Provider review responses | `reviews` | R1–R4, I1, F3 |
| Phase 13 — Admin panel | new `admin` tag | new A tests (TBD) |
| Phase 14 — Stripe integration | `payments` | E1–E5, F4 |
| Phase 15 — Email verification | `auth` | K1, K3 + new reg test |
| Phase 16 — GPS geocoding | `providers` | H4 (currently skipped) |

---

## Adding New Tests

When a new phase adds new pages or flows:
1. Add test rows to the catalog under a new letter section
2. Add the feature tag(s) to the tag table if new tags are needed
3. Update the regression checklist row for that phase
