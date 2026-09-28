# AI Usage Disclosure

## Tools

- **Claude Code** (Anthropic), used as a pair programmer throughout the project.
- **Claude** (claude.ai chat), used to review the plan and suggest changes, and for interview preparation.

## How it was used

- **Research.** Researching external APIs. Response formats, limits, and HTTPS support were checked with live requests rather than assumed.
- **Scaffolding.** Project setup and boilerplate.
- **Drafting.** First drafts of code, tests, and documentation, which I then reviewed and edited.

## What I did

- Made the product and architecture decisions, choosing between the options and trade-offs proposed. Examples:
  - a rolling 7-day week,
  - Calgary as the default city,
  - nearest-city matching within 150 km,
  - sessionStorage for the token,
  - an early skeleton deploy to de-risk hosting.
- Reviewed all code before committing it, and can explain each part of it.
- Worked in phases, approving each plan before any code for it was written.

## Log by phase

| Phase | AI contribution | My decisions / changes |
|---|---|---|
| 1. Plan | Claude Code proposed the architecture, API design, and options with trade-offs, and probed the Open-Meteo, Wikipedia, ipapi.co, and ip-api.com APIs. Claude (chat) reviewed the plan and suggested changes. | Chose which review suggestions to adopt. Approved the plan with changes: Node 22 via nvm with a pinned version; rolling week; Calgary/Edmonton in the list with Calgary as default; always show the detected location in the UI; skeleton deploy moved to after auth; credentials sent by email, never committed. Requested this document be rewritten as a design doc. Later switched the UI plan from "no component library" to Angular Material (Material 3 theme, `mat-select`, Material cards), with self-hosted icons and CSP verification. |
| 2. Backend skeleton | Claude Code proposed the packages and configuration, checked version compatibility (TypeScript 6.0 for Angular 22 and typescript-eslint), and drafted the config, env validation, error handling, health endpoint, and tests. | Chose ESM with `.js` imports. Added Prettier, and ESLint limited to the recommended configs plus `no-floating-promises`. Planned a CI workflow for later. |
| 3. Auth | Claude Code drafted the auth config, auth service, middleware, routes, the temporary diagnostics endpoint, and tests. It also found the cause of the empty coverage table: Vitest hides fully covered files when it detects an AI agent. | Required the rate limiter to be created per app instance, and the unknown-username path to compare against a dummy hash of the same cost. Approved token lifetime in seconds, the diagnostics endpoint, and 401 for unknown `/api` routes without a token. |
| 3b. Hosting switch | Claude Code checked Firebase's docs, and the Firebase CLI and Functions Framework source code. From that it proposed the Hosting + 2nd-gen function design, wrote the function entry point and `firebase.json`, and tested everything in the Firebase emulators. The emulators exposed three issues, which it fixed or documented: `PORT` set to a socket path, an undefined `req.ip` crashing the rate limiter, and the framework parsing request bodies first. | Switched hosting from Render to Firebase before the first deploy. Chose region `us-west1` and `maxInstances: 1`. Decided to document, not code around, the local-only body limit and the direct-URL bypass. Kept the existing git history unchanged. Creates the Firebase project and sets all secrets personally. |
| 3c. First deploy | Claude Code ran the deploys, read the function logs, and diagnosed a truncated `JWT_SECRET`, the reserved `/healthz` path, and the clean-up policy that blocked the Hosting release. It extended the diagnostics endpoint to compare seven geolocation providers from production, then removed the endpoint and turned the proxy findings into regression tests. | Ran the diagnostics and the spoofing test personally, and read the results: 2 trusted hops, Hosting drops a forged `X-Forwarded-For`, and the direct URL can be spoofed. Chose **ip2location.io** for reliability: all providers except ipapi.co returned the correct city from Google Cloud, and ip2location.io is the only one with a per-key free quota. Made the API key optional. Kept bcrypt cost 12. |
| 4. External APIs | Claude Code checked the live APIs before coding: all 12 Wikipedia titles, Open-Meteo's fields and error body, ip2location.io's behavior without an `ip`, for private IPs and with a bad key, and the WMO code table from Open-Meteo's raw docs. A page summary had invented a code 97, which checking the raw docs caught. It wrote the city list, cache, clients, services, endpoints and 170 tests, and ran a smoke test of all 12 cities against the real APIs. | Kept scope to the required features (no date forecast). Chose ip2location.io with an optional key and the default-city fallback. |
| 5. Frontend | Claude Code scaffolded the app with the Angular CLI and `ng add @angular/material`; both generated outputs are committed unchanged, in their own commits. It wrote the core layer, pages, cards and 41 tests. It found the icon font was 4 MB and switched to 16 individual SVGs, and it looked up the exact attribution wording that Open-Meteo and ip2location.io require. It checked the UI in headless Chrome at phone and desktop widths, and verified the CSP in a real browser, including a stricter negative control. | Added: a toolbar logout button with the username; the mobile-width check; °C with units, weather icons, "Mon"-style day names and "Today"; the three exact banner messages; the dev-server proxy; labels and contrast. Kept dark mode and the date forecast out of scope. |
| 5b. Fixes after my device testing | Claude Code implemented the fixes and their tests. For the autofill bug, it checked my suggested cause (missing CDK autofill styles) against the build, found those styles were present, and reproduced the real cause in headless Chrome: zoneless change detection doesn't notice values inserted without an `input` event. It also audited inline comments file by file and verified each fix through the real UI. | I tested the deployed app on desktop and phone, and requested: a case-insensitive username (password still case-sensitive, timing-safe comparison, configured name in the token); the autofill label fix; a capitalised username in the header; an SVG favicon; a short "Your location" banner with a "Back to" button after picking another city; and a check that every source file has meaningful comments. |
| 8. README | Claude Code drafted the README from the code and docs, after running the documented setup from a clean install (`npm run install:all`, both test suites, lint, typecheck, build) to confirm the instructions work. It softened two claims that weren't fully verified (OpenWeatherMap's plans, the reason for ipapi.co's 429). | Asked for the README once the app was finished; it covers everything the brief requires: setup, environment variables, tests, stack choices, AI use and known limitations. |
