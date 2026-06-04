# Tino2 — Messaging Feature Audit & Fixes

**Date**: 2026-06-03
**Scope**: Full messaging feature — both roles (CUSTOMER / PROVIDER), all entry points, plus real-time delivery
**Environment**: Local dev (backend :3000, frontend :3001), seeded DB. No production deploy.
**Trigger**: "Seeing issues when logged in as customer@demo, too many to name."

---

## Executive Summary

The messaging feature had **9 distinct issues** spanning a critical security leak, broken
data shaping, polluted/duplicated data, and a raw UI inconsistent with the rest of the app.
All 9 are fixed and verified end-to-end for both roles in light and dark mode.

| # | Severity | Area | Issue |
|---|----------|------|-------|
| 1 | 🔴 Critical | Security | Every messaging response leaked full user records (password hash, reset/verification tokens, Stripe IDs) |
| 2 | 🟠 High | Correctness | Conversation list never showed a last-message preview or timestamp (`lastMessage` always null) |
| 3 | 🟠 High | Correctness | Unread badges never appeared (`unreadCount` never computed) |
| 4 | 🟠 High | Data | 26 orphaned single-participant conversations rendered as "?" junk in the list |
| 5 | 🟡 Medium | Data | ~32 duplicate direct conversations between the same pair (dedup never collapsed them) |
| 6 | 🟡 Medium | Correctness | Empty conversations sorted to the TOP (PostgreSQL `NULLS FIRST` on `DESC`) |
| 7 | 🟡 Medium | Frontend | React `validateDOMNesting` console errors on every render of the conversation list |
| 8 | 🟡 Medium | CX | `markMessagesAsRead` re-fired on every render and never cleared the list's unread badge |
| 9 | 🟢 Polish | CX/Design | Messaging UI was raw default-MUI, inconsistent with the "Casa" design language; English-suffixed titles ("… Service Discussion") in a PT app |
| 10 | 🔴 High | Security (IDOR) | `createConversation` accepted any `metadata.bookingId` without verifying the requester was a party to that booking — enabling squatting on / inserting oneself into another booking's conversation |

Real-time delivery via Socket.IO was found to be **already wired** (JWT handshake auth +
`user_${id}` rooms) — the stale CLAUDE.md note saying otherwise was incorrect. It is now
verified working end-to-end.

---

## Issues & Fixes

### 1. 🔴 Sensitive data leak in every messaging response (SECURITY — CRITICAL)
**Found**: `GET /messages/conversations`, `GET /…/messages`, `POST /messages`, and the Socket.IO
`message:new` / `conversation:new` emits all returned full `User` entities for every
participant / sender / receiver — including `password` (bcrypt hash), `passwordResetToken`,
`emailVerificationToken`, `stripeCustomerId`, `stripePaymentMethodId`, and `settings`.
Any authenticated user could read the other party's password hash and a live password-reset token.

**Fix**: Added `backend/src/utils/serializers.ts` with `toPublicUser()` (whitelist: `id`,
`firstName`, `lastName`, `profileImage`, `userType`) and a `toPublicMessage()` helper.
Applied to every messaging read/write path and both socket emit payloads in
`MessageService.ts` (`getUserConversations`, `getConversationById`, `getConversationMessages`,
`sendMessage`, `createConversation`).
**Verified**: API responses now expose only the 5 safe fields; `LEAK password: False`.

### 2. 🟠 Conversation list never showed a preview or timestamp
**Found**: `getUserConversations` joined `conversation.messages` into a `messages[]` array but
the frontend reads `conversation.lastMessage`. Result: every row showed "Ainda não há
mensagens" — even a conversation with 17 messages — and no timestamps.
**Fix**: Rewrote `getUserConversations` to batch-load the latest message per conversation
(`DISTINCT ON`) and return a shaped `lastMessage` object. The full message array is no longer
dumped into the list payload.
**Verified**: 25/30 conversations now show correct previews + times; the list updates live.

### 3. 🟠 Unread badges never appeared
**Found**: `unreadCount` was never computed; the frontend `Badge` got `undefined`.
**Fix**: Added a grouped unread-count query (`receiverId = me AND isRead = false`) and return
`unreadCount` per conversation. Frontend renders a terracotta count pill + bold styling.
**Verified**: Provider sees "1"/"20" unread badges; opening a thread clears it.

### 4. 🟠 Orphaned single-participant conversations polluting the list
**Found**: 26 conversations had only one participant (the other was wiped by the earlier
`sendMessage` cascade bug). They rendered as "?" avatars titled "Conversa" / "… Service
Discussion", burying real conversations.
**Fix**: (a) API now defensively drops any direct conversation with < 2 participants;
(b) wrote `backend/src/scripts/cleanupConversations.ts` — **repaired 2** orphans (re-derived
the missing participant from their own messages) and **deleted 24** unusable ones (other party
unknowable) plus 24 stranded messages.
**Verified**: 0 orphans in DB and in the list.

### 5. 🟡 Duplicate direct conversations between the same pair
**Found**: ~17 participant-pairs had multiple non-booking direct conversations (dedup never
collapsed historical data).
**Fix**: Same cleanup script merges duplicates into the oldest conversation, moving messages
over and recomputing `lastMessage`. **Merged 32 conversations, moved 249 messages.**
**Verified**: 0 duplicate pairs remain.

### 6. 🟡 Empty conversations sorted to the top
**Found**: `ORDER BY lastMessageAt DESC` → PostgreSQL `NULLS FIRST` floated empty
conversations above active ones.
**Fix**: Order by `COALESCE(lastMessageAt, createdAt) DESC` via a lean paginated ID query
(TypeORM can't order by a raw expression alongside an M2M join + skip/take, so the page of IDs
is selected first, then hydrated).
**Verified**: Most-recent conversations now lead the list.

### 7. 🟡 React DOM-nesting console errors
**Found**: `ListItemText`'s `secondary` (`<p>`) wrapped a `<Box>`/`<p>` → two
`validateDOMNesting` errors on every render.
**Fix**: Rebuilt the conversation list with custom `<Box>` rows (no `ListItem`/`ListItemText`).
**Verified**: Console shows **0 errors** (was 2) on the messages page.

### 8. 🟡 Read-marking looped and didn't clear the list badge
**Found**: The read effect depended on `[conversationId, messages]`, re-marking on every message
change, and never invalidated the conversations query, so the list badge stayed.
**Fix**: Mark read only when the latest message id changes AND there is unread inbound mail,
then invalidate `['conversations']` so the badge clears.
**Verified**: Opening a thread clears its unread badge for both roles.

### 9. 🟢 UI redesign to the "Casa" design language
**Found**: Messaging was raw MUI (default `Paper`/`Grid`), inconsistent with the rest of the
redesigned app; titles showed seed-data English suffixes ("… Service Discussion").
**Fix**: Rewrote `MessagingPage.tsx` and `ChatInterface.tsx` with Casa tokens — Fraunces
headings, DM Sans body, DM Mono timestamps, terracotta accents, deterministic avatar tints,
pill search, message bubbles with date separators, polished empty states, framer-motion
reveals, full light/dark support, and a mobile back button. Direct conversations now display
the other person's name (the service chip carries the service context), eliminating the
English title leak. Added i18n keys (`today`, `attachment_image/file`, `you_prefix`) in EN + PT.
**Verified**: Consistent, polished UI in light and dark mode for both roles.

---

### 10. 🔴 IDOR — booking-scoped conversation hijack (post-commit security review)
**Found**: `createConversation` looked up / created a conversation by `metadata.bookingId`
without checking the requester was a party to that booking. An attacker could (a) fetch the
existing booking conversation (leaking the two parties' names + conversation id), or (b) create
a conversation tagged with someone else's `bookingId` and supply arbitrary `participantIds` —
"squatting" on the booking. Because booking conversations are deduped by `bookingId`, the
legitimate parties would then be handed the attacker's poisoned conversation, letting the
attacker read the booking's messages as a "participant".
**Fix** (`MessageService.createConversation`):
- Load the `Booking` and require `userId === booking.customerId || userId === booking.provider.userId`; otherwise throw (`Booking not found` / `Access denied: you are not a party to this booking`).
- For booking conversations, **force** the participants to exactly the two booking parties — client-supplied `participantIds` are ignored.
- Only reuse an existing booking conversation when its participant set is *exactly* the two booking parties; any mis-scoped/poisoned record is deactivated and a clean one is created (self-heals pre-existing poison).
**Verified**: own booking → 201; another user's booking → denied ("not a party"); bogus id →
"Booking not found"; `messaging-isolation` still 9/9.

---

## Verification

**Static**: `tsc --noEmit` clean on both frontend and backend.

**API**: conversations/messages/send all return only safe user fields; `lastMessage` +
`unreadCount` populated; 0 orphans; 0 duplicate pairs.

**Browser E2E (Playwright, both roles, light + dark):**
| Check | Customer | Provider |
|-------|:--:|:--:|
| List: names, previews, timestamps, service chips | ✅ | ✅ |
| Unread badge appears on inbound to non-active chat | ✅ | ✅ |
| Real-time delivery into an open thread (no refresh) | ✅ | ✅ |
| Outgoing send (UI) → bubble + list re-sort | ✅ | ✅ |
| Opening a thread clears its unread badge | ✅ | ✅ |
| Correct bubble alignment per perspective | ✅ | ✅ |
| Console errors | 0 | 0 |
| Dark mode legible | ✅ | ✅ |

**Regression**: authoritative `messaging-isolation` suite **9/9**; `review-validation` **10/10**;
`cross-role-events` **8/8** in isolation. The large parallel `functional/` run shows failures
that are pre-existing shared-DB/rate-limit contention (Phase-1 documented) — they re-run green
in isolation. The 3 `realtime-messaging.test.ts` failures are a pre-existing scaffold that POSTs
to non-existent REST endpoints (`/messages/socket/connect`, `/messages/socket/subscribe`,
`/messages/report`) and are unrelated to these changes.

---

## Files Changed

**Backend**
- `src/utils/serializers.ts` *(new)* — `toPublicUser` whitelist
- `src/services/MessageService.ts` — sanitize all paths; shape `lastMessage` + `unreadCount`; COALESCE ordering; drop orphans
- `src/scripts/cleanupConversations.ts` *(new)* — repair/delete orphans + dedupe (one-off, idempotent)

**Frontend**
- `src/components/pages/MessagingPage.tsx` — full Casa redesign; custom rows (fixes DOM nesting); preview/time/unread; responsive
- `src/components/messaging/ChatInterface.tsx` — Casa bubbles, date separators, composer; fixed read-marking; mobile back; i18n
- `public/locales/{en,pt}/messages.json` — added `today`, `attachment_image`, `attachment_file`, `you_prefix`

**Data (dev DB, via cleanup script)**: repaired 2 orphans · deleted 24 orphan conversations
(+24 stranded messages) · merged 32 duplicates (moved 249 messages).
