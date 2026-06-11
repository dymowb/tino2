---
name: project_getprofile_omits_settings
description: Profile/settings save paths were stubbed — getProfile omitted settings; PrivacySettingsDialog Save was a no-op. Check the whole read+write loop.
metadata: 
  node_type: memory
  type: project
  originSessionId: be000c5d-0307-4ea4-98c3-e040337d3ee6
---

`GET /auth/profile` (`AuthController.getProfile`) historically returned only id/email/name/phone/userType/createdAt — it **omitted `settings`, `isVerified`, `profileImage`** behind a stale "not available in BasicUser" comment, even though the `BasicUser` entity has those columns. Fixed 2026-06-11 to include them.

Paired bug: `PrivacySettingsDialog` Save button was `onClick={onClose}` (a pure no-op) and the visibility toggle hardcoded `true`, so profile-visibility never loaded or persisted. Now wired to load `settings.privacy.showProfile` and persist a **merged** `settings` object via `PUT /auth/profile` (the update whitelists `settings` and replaces the whole jsonb column — so always send notifications+privacy together or you wipe notification prefs).

**Why:** these were silent — the UI looked functional but read defaults and saved nothing. **How to apply:** when touching any profile/settings feature, verify the FULL loop end-to-end (DB → API response actually includes the field → dialog loads it → Save calls a real endpoint → DB persists), not just that the dialog renders. Related: [[project_providerid_vs_userid]] (req.user carries `userId`, not `id` — the `/users/settings` controller reads `req.user.id` and is itself broken).
