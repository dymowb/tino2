---
name: project-providerid-vs-userid
description: Recurring auth bug — code compares entity.providerId (Provider id) against req.user.userId (User id); they never match.
metadata: 
  node_type: memory
  type: project
  originSessionId: cd55f453-c81b-4689-b02d-2b32e1e97aa5
---

In this codebase `quote.providerId`, `review.providerId`, and `booking.providerId` all store the **Provider entity id** (providers.id), NOT the provider's User id. JWT `req.user.userId` is the **User id**. Several provider-side authz checks were written as `entity.providerId === req.user.userId` (or `findOne({ where: { providerId: userId } })`), which can NEVER match → providers locked out of their own resources.

Confirmed broken & fixed in Goal 2 Chunk A (2026-06-05): `QuoteService.updateQuoteStatus`/`withdrawQuote`/`updateQuote` (provider couldn't withdraw/edit own quote) and `ReviewService.addProviderResponse` (provider couldn't respond to reviews, FR-069). Fix pattern: resolve the Provider profile first via `providerRepository.findOne({ where: { userId } })`, then compare/query by `provider.id`. `searchQuotes` already handled it with an OR-match (`quote.providerId = :id OR providerUser.id = :id`).

**Why:** the two id spaces are silently interchangeable in TypeScript (both `string`/uuid), so the mistake compiles and only fails at runtime as a 403/404 for the legit owner.

**How to apply:** any new provider-scoped handler must resolve provider.id from userId before authz/lookup. When auditing (e.g. Chunk B admin/dispute handlers), grep for `providerId === ` / `providerId: userId` / `providerId: req.user`. Customer-side is fine — `customerId` columns DO store the User id. See [[project-production]] for the related Goal-1 provider-data leak.
