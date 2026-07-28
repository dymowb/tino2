# Test Registry

This registry describes the supported automated regression surface. Historical,
feature-specific test notes live under `Tests/history/`.

## Backend integration suite

Run with `npm test --prefix backend`. Tests use disposable PostgreSQL databases,
run real migrations, and truncate application tables between cases.

| Suite | Coverage |
| --- | --- |
| `auth.test.ts` | Registration, login, validation, authentication, and profile access |
| `platform.integration.test.ts` | Health, public configuration, authorization boundaries, and malformed requests |
| `lifecycle.integration.test.ts` | Quote, booking, escrow hold, completion, and capture |
| `search-agent.test.ts` | Search-agent behavior with the external LLM boundary mocked |

Frontend component and decision-logic tests run with `npm test --prefix frontend`.

## Current-product browser suite

Run Chromium with `npm run test:ci`, or all configured browser projects with
`npm test`. The canonical suite is `Tests/test-suites/current-product.test.ts`.

| Area | Coverage |
| --- | --- |
| Platform | Health, security headers, API response time |
| Access | Anonymous redirects and customer/provider/admin role boundaries |
| Validation | Malformed API input |
| Customer | Home, providers, bookings, payments, messages, reviews, profile |
| Provider | Dashboard, opportunities, bookings, payments, messages, reviews |
| Admin | Dashboard, users, providers, disputes, reviews, requests, settings |
| UX | Mobile layout, Portuguese UI, landmarks, headings, and image text alternatives |

The suite intentionally tests behavior present in the current product. Removed
legacy scenarios were aspirational or contradicted current flows and are not a
release contract.
