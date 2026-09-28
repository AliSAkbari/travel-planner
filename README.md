# Travel Planner

A single-page travel planner. Log in, pick a city, and see its description, the current weather and a 7-day forecast. The default city comes from your IP address.

**Live app:** https://travel-planner-ali.web.app
**Demo credentials:** provided with the submission email. They are never committed to the repository.

| | |
|---|---|
| Frontend | Angular 22 (standalone components, signals, zoneless) · Angular Material 3 · TypeScript 6 (strict) |
| Backend | Node.js 22 · Express 5 · TypeScript 6 (strict) · zod |
| Data | [Open-Meteo](https://open-meteo.com) (weather) · [Wikipedia REST API](https://en.wikipedia.org/api/rest_v1/) (city summary) · [ip2location.io](https://www.ip2location.io) (IP geolocation) |
| Hosting | Firebase Hosting (static app + CDN) → 2nd-gen Cloud Function (the Express API), same origin |
| Tests | Vitest + supertest: **177 backend** tests (100% line coverage), **55 frontend** tests (~96%) |

Detailed design, decisions and trade-offs: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**. AI tools disclosure: **[docs/AI_USAGE.md](docs/AI_USAGE.md)**.

---

## Features

**Required by the brief:**
- **Login, then planner.** Login issues a JWT. The frontend sends it as a bearer token, and **every data endpoint requires it**.
- **City list:** 12 cities: Calgary, Edmonton, Vancouver, Toronto, Montréal, New York, Mexico City, London, Paris, Berlin, Tokyo, Sydney.
- **For the selected city:**
  - a short **description** (Wikipedia);
  - the **current weather**;
  - the **weather for the week**: today + the next 6 days, in the city's own timezone.
- **Default city from your IP address:**
  - the nearest listed city within 150 km is selected;
  - otherwise the default, Calgary;
  - the page always says what was detected, e.g. *"Detected: Airdrie, Alberta — showing nearest: Calgary (27 km)"*.
- **All data comes from this app's backend.** The browser never calls a third-party API, and no API key reaches the frontend.

**Beyond the brief:**
- Loading and error states, with "Try again", on every card.
- Switching city cancels the previous city's in-flight requests.
- An expired session sends you back to login and then back to where you were.
- Responsive from phone to desktop; accessible labels, alerts and contrast.

---

## Quick start (local development)

### Prerequisites

- **Node.js 22** (`>=22.12 <23`; see `.nvmrc`). With nvm: `nvm install 22 && nvm use 22`.
- npm 10.

### 1. Install

```bash
npm run install:all          # runs `npm ci` in backend/ and frontend/
```

### 2. Configure the backend

```bash
cp backend/local.env.example backend/local.env
# Windows PowerShell: Copy-Item backend\local.env.example backend\local.env
```

Fill in `backend/local.env`:

```bash
# A random 32+ character secret:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # -> JWT_SECRET

# A bcrypt hash of the password you want for the demo user (prompts for it):
npm --prefix backend run hash-password                                            # -> DEMO_PASSWORD_HASH
```

- **Why the file is called `local.env`, not `.env`:** the Firebase CLI would deploy a `backend/.env` into the production function.
- **The config is validated at startup.** A missing, short or malformed value stops the server with a message naming the variable.

### 3. Run

Use two terminals:

```bash
npm run dev            # backend on http://localhost:3000 (restarts on changes)
npm run dev:frontend   # frontend on http://localhost:4200
```

Open **http://localhost:4200** and log in with `DEMO_USERNAME` and the password you hashed.
- **The dev server proxies `/api` to the backend** (`frontend/proxy.conf.json`), so local development is same-origin, like production.
- **Locally, your IP is private,** so the backend asks the provider to locate your machine's public IP instead. That shows your real area.

---

## Environment variables

The backend validates all of them with zod at startup (`backend/src/config/env.ts`).

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `JWT_SECRET` | yes | — | HS256 signing secret, **at least 32 characters** |
| `DEMO_USERNAME` | yes | — | The demo user's username (matched case-insensitively) |
| `DEMO_PASSWORD_HASH` | yes | — | bcrypt hash of the demo password (`npm --prefix backend run hash-password`). Must look like a bcrypt hash |
| `JWT_EXPIRES_IN_SECONDS` | no | `3600` | Token lifetime |
| `IP2LOCATION_API_KEY` | no | *(keyless)* | ip2location.io key. Keyless allows 1,000 lookups/day per calling IP; a free key allows 50,000/month per key |
| `TRUST_PROXY_HOPS` | no | `0` | Reverse proxies in front of the app (Express `trust proxy`). **`2` in production** (measured: Google front end + Hosting CDN) |
| `NODE_ENV` | no | `development` | `development`, `test` or `production` |
| `PORT` | no | `3000` | Local server port (not used in the Cloud Function) |

**Where they live:**

| Setting | Local development | Production (Firebase) |
|---|---|---|
| `JWT_SECRET`, `DEMO_PASSWORD_HASH`, `IP2LOCATION_API_KEY` | `backend/local.env` | **Google Secret Manager** (`firebase functions:secrets:set <NAME>`) |
| Everything else | `backend/local.env` | `backend/.env.<projectId>` (template: `backend/firebase.env.example`) |

All real env files are gitignored; only the `*.example` templates are committed.

---

## Running tests

```bash
npm test                          # backend + frontend
npm run test:coverage             # both, with coverage reports

npm --prefix backend test         # backend only (Vitest + supertest)
npm --prefix backend run test:coverage    # table in the terminal + backend/coverage/index.html
npm --prefix frontend test        # frontend only (Vitest via `ng test`)
npm --prefix frontend run test:coverage   # frontend/coverage/

npm run lint && npm run typecheck # backend ESLint (incl. no-floating-promises) + tsc
```

**Backend: 177 tests, 100% line coverage.** Thresholds are enforced: 80% lines, functions and statements; 75% branches.
- **Unit tests:**
  - pure logic (distance, IP classification, the TTL cache with fake timers, weather-code mapping, city matching);
  - services, with fake API clients passed in;
  - API clients, against a mocked `fetch` using response fixtures captured from the real APIs.
- **Integration tests (supertest against the real Express app):**
  - 401 without, or with an invalid or expired, token on every protected route;
  - login 400/401/429;
  - 404 before any upstream call;
  - 502 when a provider fails or times out;
  - IP detection behind two trusted proxies, including spoofed `X-Forwarded-For`.
- **No test can reach the network:** the fetch mock rejects unknown URLs.

**Frontend: 55 tests, about 96% line coverage.**
- **Auth interceptor:** the token is sent to `/api` only; a 401 from a data endpoint ends the session, but a 401 from login doesn't.
- **Guards**, including open-redirect protection on `returnUrl`.
- **Login page**, with the real interceptor.
- **Planner page:**
  - the detected city is pre-selected;
  - the banner, and its "Back to" button;
  - "Today"/weekday labels and °C formatting;
  - switching city cancels the previous request;
  - retry.

**Before each deploy,** the app was also checked in the Firebase emulators, and in headless Chrome at phone and desktop widths, including the production Content-Security-Policy.

---

## Deployment (Firebase)

This is a one-time setup. It needs a Firebase project on the **Blaze** plan (Cloud Functions require it) and `npm i -g firebase-tools`.

```bash
firebase login
firebase use --add                     # select the project (writes .firebaserc)

cp backend/firebase.env.example backend/.env.<projectId>    # set DEMO_USERNAME; TRUST_PROXY_HOPS=2

firebase functions:secrets:set JWT_SECRET
firebase functions:secrets:set DEMO_PASSWORD_HASH
firebase functions:secrets:set IP2LOCATION_API_KEY
# Tip: pipe values instead of pasting, e.g.
#   node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))" | firebase functions:secrets:set JWT_SECRET --data-file -

npm run deploy                         # firebase deploy --only functions,hosting (builds both apps first)
```

- **Test the whole setup offline** (Hosting rewrites + the function) with the emulators. Put stand-in values in `backend/.env.local` and `backend/.secret.local`, then:

  ```bash
  npm run build && firebase emulators:start --only functions,hosting --project demo-travel-planner
  ```

- **`firebase.json`:**
  - Hosting serves the Angular build;
  - `/api/**` and `/health` are rewritten to the function `api` in `us-west1`;
  - it sets the page security headers (including the CSP) and caching.

---

## Architecture in brief

```
Browser (Angular) ── HTTPS, Bearer JWT, one origin ──▶ Firebase Hosting (CDN)
                                                        ├─ static files ─▶ Angular build
                                                        └─ /api/**, /health ─▶ Cloud Function "api" (Express)
                                                              routes → controllers → services → clients
                                                                                               ├─▶ Open-Meteo
                                                                                               ├─▶ Wikipedia
                                                                                               └─▶ ip2location.io
```

- **The backend is layered:**
  - routes wire URLs to middleware;
  - controllers handle HTTP only;
  - services hold the business logic, have no Express dependency, and receive their API clients as function arguments, so they're easy to test;
  - clients are the only code that calls external APIs. Each call has a **5 s timeout**, and each response is **validated with zod**.
- **Upstream failures** become `502 UPSTREAM_UNAVAILABLE`. Location detection never fails; it falls back to Calgary.
- **Caching:** in-memory, with expiry. Weather 10 min, summaries 24 h, IP lookups 1 h (size-capped). Only successes are cached.
- **One error shape everywhere:** `{ "error": { "code", "message" } }`. 401 responses include `WWW-Authenticate: Bearer`.

| Endpoint | Auth | Returns |
|---|---|---|
| `POST /api/auth/login` | — | `{ token, expiresIn, user }` · 400 / 401 / 429 |
| `GET /api/auth/me` | Bearer | `{ username }` |
| `GET /api/cities` | Bearer | the 12 cities |
| `GET /api/location` | Bearer | `{ detected, cityId, match, distanceKm }` (always 200) |
| `GET /api/cities/:id/summary` | Bearer | Wikipedia summary · 404 / 502 |
| `GET /api/cities/:id/weather` | Bearer | `{ current, daily[7] }` in the city's timezone · 404 / 502 |
| `GET /health` | — | `{ status: "ok" }` (health check; returns no data) |

### Security highlights

- **JWT:** HS256, signed with a 32+ character secret from Secret Manager, 1-hour expiry. The **algorithm is pinned on verify**, so `alg: none` and algorithm-confusion tokens are rejected. The `sub` claim must match the configured user.
- **Login:**
  - bcrypt, cost 12;
  - the username is compared **case-insensitively in constant time**, and an unknown username still runs bcrypt against a dummy hash of equal cost, so response time doesn't reveal which usernames exist;
  - rate-limited to **5 failed attempts per 15 minutes** per IP.
- **Client IP:** comes from `X-Forwarded-For` with exactly **2 trusted proxy hops**. This was measured on the deployed app, and a spoofed header is ignored.
- **Token storage:** in `sessionStorage` (trade-offs in the architecture doc). It is only attached to `/api` calls.
- **Security headers:**
  - a strict page CSP (`script-src 'self'`; images only from Wikimedia), plus helmet on the API;
  - `Cache-Control: no-store` on all API responses;
  - no third-party requests from the page: fonts and icons are self-hosted.

---

## Tech stack choices

| Choice | Why |
|---|---|
| **Angular 22** | Jambo's preferred stack. Standalone components and signals keep it simple; zoneless is the new default |
| **Angular Material 3** | Accessible, consistent components quickly. Icons are 16 self-hosted SVGs instead of a 4 MB icon font |
| **Signals + RxJS** | Signals for UI state (`linkedSignal` for "detected city, until the user picks another"); RxJS `switchMap` to cancel stale requests |
| **Express 5 + TypeScript** | Small and easy to explain line by line. Express 5 forwards errors from async handlers to the error middleware without wrappers. The same app runs locally, in tests and in production |
| **zod** | One library validates environment variables, request bodies and third-party responses, and gives typed results |
| **Open-Meteo** | Free, no key, and a real daily 7-day forecast. OpenWeatherMap needs a key, and its standard free forecast is 5 days in 3-hour steps |
| **Wikipedia REST summary** | A free, plain-text introduction and a thumbnail per city |
| **ip2location.io** | Tested from the deployed function against 6 alternatives: ipapi.co returned 429 from Google Cloud, most likely because keyless quotas count per calling IP and Google's outbound IPs are shared, while ip2location.io was accurate and has a free **per-key** quota. HTTPS (ip-api.com's free tier is HTTP-only) |
| **Firebase Hosting + Cloud Functions** | A CDN for the static app, a same-origin rewrite to the API (no CORS), Secret Manager, and fast cold starts |
| **Vitest** | One test runner for both apps (Angular 22's default), with fast TypeScript support |

---

## AI tools used

- **Claude Code** (Anthropic) was my pair programmer:
  - scaffolding;
  - researching and live-probing external APIs;
  - drafting code, tests and documentation, which I reviewed.
- **Claude** (claude.ai chat) reviewed the plan.

I made the product and architecture decisions, tested the deployed app on desktop and phone (which led to a round of fixes), and reviewed every change. The work was done in phases, with a plan approved before any code, one branch and pull request per phase, and small commits. Generated scaffolds (`ng new`, `ng add @angular/material`) are committed unmodified in their own commits.

The full per-phase log of what AI produced and what I decided or changed is in **[docs/AI_USAGE.md](docs/AI_USAGE.md)**.

---

## Known limitations

- **The direct Cloud Run URL skips Hosting.** A caller using the function's own `run.app` URL can forge `X-Forwarded-For` and get around the *per-IP login rate limit*. Authentication itself is unaffected. This was measured and is documented; fixing it needs a paid load balancer with ingress restrictions.
- **In production, Google's Functions Framework parses request bodies before Express.** So the 10 kb body limit only applies locally, and malformed JSON gets the framework's HTML 400 response instead of the app's JSON error.
- **The CSP allows inline *styles*** (`style-src 'unsafe-inline'`), because Angular and Material inject `<style>` tags at runtime. Scripts remain `'self'` only.
- **One demo user** configured by environment variables; **no refresh tokens or per-token revocation**, so users log in again after an hour.
- **Cache and rate-limit counters are in memory** on a single instance (`maxInstances: 1`, a deliberate cost cap). They reset when the instance scales to zero.
- **Cold starts:** the first request after idle time is slower.
- **A fixed list of 12 cities.** IP geolocation is approximate (VPNs and mobile networks can place you far away).
- **Free-tier terms:** Open-Meteo is for non-commercial use (CC BY 4.0), and ip2location.io's free plan requires attribution. Both are credited in the footer.
- **`npm audit` reports a moderate advisory in `uuid`,** pulled in through `firebase-admin` → `@google-cloud/storage`. That code path is never used.
- **The optional date forecast** from the brief is not implemented.

## What I'd improve with more time

1. **Refresh tokens:** a short-lived access token plus an httpOnly refresh cookie with CSRF protection, and token revocation.
2. **A shared cache and rate-limit store** (e.g. Redis), so they survive restarts and scale out; also deduplicate concurrent cache misses.
3. **Close the direct-URL bypass:** ingress restrictions behind a load balancer.
4. **CI:** GitHub Actions for typecheck, lint and tests on every push, plus preview deploys per pull request.
5. **An end-to-end test suite (Playwright)** and an automated accessibility audit.
6. **Structured logging** with request IDs; error monitoring.
7. **Share the API types** between backend and frontend instead of duplicating them.
8. **Features:** the date forecast, city search beyond the fixed list, and a °C/°F toggle.

---

## Project structure

```
backend/
  src/
    app.ts            Express app: middleware order and service wiring (no listen)
    server.ts         local entry point (listen)
    function.ts       production entry point (Firebase HTTPS function)
    config/env.ts     environment validation (zod)
    routes/           URL -> controller; everything after requireAuth is protected
    controllers/      HTTP layer
    services/         business logic: auth, weather, cities, location, caching
    clients/          external APIs: Open-Meteo, Wikipedia, ip2location.io
    middleware/       requireAuth, validation, login rate limit, error handler
    utils/            TTL cache, distance, IP classification, HttpError
    data/cities.ts    the 12 cities
  test/               unit/ and integration/ (supertest)
  scripts/hash-password.ts
frontend/
  src/app/
    core/             API service and types, auth (service, interceptor, guards), icons
    shared/           pure helpers (request state, formatting, banner messages)
    features/login/   login page
    features/planner/ city select, location banner, summary / weather / forecast cards
docs/
  ARCHITECTURE.md     design, decisions and trade-offs, measurements, limitations
  AI_USAGE.md         AI tools disclosure, per phase
firebase.json         Hosting (rewrites, headers, caching) and function config
```
