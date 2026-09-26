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
| 1. Plan | Claude Code proposed the architecture, API design, and options with trade-offs, and probed the Open-Meteo, Wikipedia, ipapi.co, and ip-api.com APIs. Claude (chat) reviewed the plan and suggested changes. | Chose which review suggestions to adopt. Approved the plan with changes: Node 22 via nvm with a pinned version; rolling week; Calgary/Edmonton in the list with Calgary as default; always show the detected location in the UI; skeleton deploy moved to after auth; credentials sent by email, never committed. Requested this document be rewritten as a design doc. |
