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
