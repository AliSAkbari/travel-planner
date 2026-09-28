# Travel Planner — Architecture & Design

| | |
|---|---|
| **Status** | In implementation |
| **Author** | Ali Akbari |
| **Last updated** | 2026-09-26 |

## 1. Overview

A single-page travel planner. After logging in, the user picks a city from a list and sees:

- a short description of the city,
- the current weather,
- the weather for the rolling week (today + 6 days).

On first load the city is pre-selected from the user's IP-based location.
An optional feature (built last) shows the forecast for a chosen date up to 5 days ahead.

**Constraints from the brief**

- All data shown in the frontend comes from our backend. The frontend never calls external APIs and holds no API keys.
- Every data endpoint requires a valid JWT bearer token.
- Unit tests for backend business logic; integration tests strongly encouraged.
- Hosted on a free cloud provider.

## 2. Architecture

```
Browser (Angular SPA)
   │ HTTPS, Bearer JWT, one origin (no CORS)
   ▼
Firebase Hosting (CDN)
   ├─ static file exists?  → Angular build (index.html, JS, CSS)
   ├─ /api/**, /health     → rewrite → 2nd-gen HTTPS function "api" (us-west1)
   │                                      └─ Express: createApp(config)
   │                                           routes → controllers → services → clients
   │                                                                              ├─▶ Open-Meteo  (weather)
   │                                                                              ├─▶ Wikipedia   (city summary)
   │                                                                              └─▶ ip2location.io (IP geolocation)
   └─ anything else        → /index.html (Angular router)
```

Locally, the same Express app runs as a plain Node server (`server.ts`), and the Firebase emulators run the Hosting + function setup.

The backend is layered so each layer has one reason to change:

| Layer | Responsibility | Knows about HTTP? |
|---|---|---|
| **routes** | Map URLs to controllers; attach middleware (auth, validation) | Yes |
| **controllers** | Read the validated request, call a service, shape the response | Yes |
| **services** | Business logic: auth, city matching, weather mapping, IP handling, caching | No |
| **clients** | One module per external API: build the request, parse the response, apply timeouts | Outbound only |

Services depend on clients, never on Express. This lets services be unit tested with mocked clients, and clients be tested with a mocked `fetch`.

## 3. Repository layout

```
/                       root package.json: convenience scripts only
├─ .nvmrc               Node version (read by nvm)
├─ firebase.json        Hosting rewrites + function deploy settings
├─ hosting-placeholder/ temporary page served until the Angular build exists
├─ backend/             also the Firebase functions source directory
│  ├─ local.env.example        template for local.env (local dev server)
│  ├─ firebase.env.example     template for .env.<projectId> (deployed non-secret settings)
│  ├─ src/
│  │  ├─ app.ts         builds the Express app without listening (imported by integration tests)
│  │  ├─ server.ts      local entry point; the only file that calls listen()
│  │  ├─ function.ts    production entry point: the app as a Firebase HTTPS function
│  │  ├─ config/        env loading + validation; fails fast on missing/weak secrets
│  │  ├─ data/          the predefined city list
│  │  ├─ routes/
│  │  ├─ controllers/
│  │  ├─ services/
│  │  ├─ clients/       openMeteo, wikipedia, ip2location
│  │  ├─ middleware/    requireAuth, validate, errorHandler, loginRateLimit
│  │  └─ utils/         TtlCache, HttpError, haversine
│  └─ test/
│     ├─ unit/
│     └─ integration/   supertest against app.ts
├─ frontend/            Angular 22 (standalone components, zoneless, Vitest)
│  ├─ proxy.conf.json   ng serve forwards /api to the backend on :3000
│  └─ src/app/
│     ├─ core/          ApiService + response types, AuthService, authInterceptor,
│     │                 authGuard/guestGuard, icon registration
│     ├─ shared/        Loadable<T>, weather formatting, banner messages (pure functions)
│     └─ features/
│        ├─ login/      login page
│        └─ planner/    city select, location banner, summary / current weather / forecast cards
└─ docs/
```

`frontend` and `backend` each have their own `package.json`. npm workspaces were considered and rejected: the root scripts give the same convenience without dependency-hoisting behaviour to reason about.

**Node version:** Node 22 LTS, which the current Angular CLI requires.
- Pinned in `.nvmrc` and in `engines` as a bounded range (`>=22.12.0 <23`).
- The deployed function runtime is set separately in `firebase.json` (`"runtime": "nodejs22"`). The Firebase CLI prefers that over `engines`.

**Tooling**

- **TypeScript ~6.0**, pinned. Angular 22 and typescript-eslint both support `>=6.0 <6.1`, so the whole repository uses one compiler version.
- **Module system.** The backend is native ESM (`nodenext`), so relative imports carry a `.js` extension.
- **Prettier** formats code, using one root config.
- **ESLint** uses the recommended configs from `@eslint/js` and typescript-eslint, plus the type-aware `no-floating-promises` rule.
- **Environment files.** The local dev server loads `backend/local.env` with Node's built-in `--env-file-if-exists`, so the `dotenv` package is not needed.
  - The file is deliberately **not** named `.env`. The Firebase CLI loads `backend/.env` into the deployed function, where `PORT` is a reserved key, and where `JWT_SECRET` and `DEMO_PASSWORD_HASH` must come from Secret Manager instead. A local `.env` would break deploys.

## 4. API design

### Conventions

**Error shape.** All errors share one JSON shape:

```json
{ "error": { "code": "UNAUTHORIZED", "message": "Token expired" } }
```

**Status codes**

| Code | Meaning |
|---|---|
| 400 | Invalid input (request body, params, or query) |
| 401 | Wrong credentials, or a missing, malformed, invalid, or expired token. Always sent with `WWW-Authenticate: Bearer` |
| 404 | Unknown city id, or unknown `/api` route (only reachable with a valid token) |
| 413 | Request body over 10 kb (local server only; see §5.8) |
| 429 | Login rate limit exceeded |
| 502 | An upstream API failed or timed out. Every outbound call has a 5-second timeout |
| 500 | Unexpected error. No stack traces in production |

**401 error codes.** `INVALID_CREDENTIALS` (login), `MISSING_TOKEN`, `INVALID_TOKEN`, and `TOKEN_EXPIRED`. The frontend can tell an expired session apart from a bad login.

**Why there is no 403.** 403 means an authenticated caller is not permitted. The app has a single role, so no endpoint has a legitimate 403 case.

### Endpoints

| Method | Path | Auth | Success response | Errors |
|---|---|---|---|---|
| GET | `/health` | None | `200 { status: "ok" }` | — |
| POST | `/api/auth/login` | None | `200 { token, expiresIn, user: { username } }` | 400, 401, 429 |
| GET | `/api/auth/me` | Bearer | `200 { username }` | 401 |
| GET | `/api/cities` | Bearer | `200 [{ id, name, country }]` | 401 |
| GET | `/api/location` | Bearer | `200 { detected, cityId, match, distanceKm }` (see §5.3). Always 200: failures fall back to Calgary | 401 |
| GET | `/api/cities/:id/summary` | Bearer | `200 { cityId, title, description, extract, thumbnailUrl, wikiUrl }` | 401, 404, 502 |
| GET | `/api/cities/:id/weather` | Bearer | `200 { cityId, timezone, current, daily[7] }` | 401, 404, 502 |

- **`current`:** `time`, `temperatureC`, `feelsLikeC`, `humidityPercent`, `windKmh`, `isDay`, `condition`, `label`.
- **`daily`** (today + 6 days): `date`, `minC`, `maxC`, `precipitationChancePercent` (may be `null`), `condition`, `label`.
- **Dates and times are the city's local ones** (`timezone=auto` upstream). For example, Tokyo's forecast starts on Tokyo's date.
- **Units are in the field names**, so the frontend never guesses what a number means.

**Design notes**

- **`/health` is intentionally public and outside `/api`.**
  - It is for uptime checks and warming the function, which cannot send a token.
  - It returns no application data.
  - It is the only unauthenticated route besides login.
- **Protected by default.** The API router registers login, then `router.use(requireAuth)`, then every other route. A new route is protected unless it is deliberately placed above that line.
  - Unknown `/api` paths also pass through `requireAuth`, so they return 401 without a token and 404 with one. Unauthenticated callers cannot probe which routes exist.
- **`/api/auth/me`** returns the token's user. The frontend can use it to confirm a stored session is still valid.
- **Current weather and the week share one endpoint.** Open-Meteo returns both in a single response, so this means one upstream call, one cache entry, and one round trip.
- **Data endpoints take a city `id`, never raw coordinates.**
  - Validation is a lookup: an unknown id returns 404.
  - Cache keys are bounded by the city list, so callers cannot grow the cache with arbitrary inputs.
- **The backend translates weather codes.** It maps WMO weather codes (from Open-Meteo's documentation) to a `condition` (`clear`, `partly-cloudy`, `cloudy`, `fog`, `drizzle`, `rain`, `snow`, `thunderstorm`, `unknown`) and a human-readable `label`. This is business logic, so it lives in a unit-tested service.
  - The frontend maps `condition` to an icon, so the icon set can change without an API change.
  - Unknown codes degrade to `unknown` rather than failing.
- **Optional date forecast (not built unless time allows, §10).** It would accept dates from today to today + 5 days, where "today" is the city's local date.

## 5. Key decisions

### 5.1 Weather: Open-Meteo

| | Open-Meteo | OpenWeatherMap (free) |
|---|---|---|
| API key | Not required | Required |
| Forecast range | Up to 16 days, daily | 5 days in 3-hour steps |
| Current + daily in one call | Yes | No |

The brief asks for "the current week", which OpenWeatherMap's free tier cannot provide.

**Open-Meteo details** (verified against the live API on 2026-09-26):
- `current` updates every 15 minutes (`interval: 900`).
- `timezone=auto` returns dates in the city's local timezone.
- `forecast_days` accepts 0–16.

**Trade-off:** Open-Meteo's free tier is for non-commercial use only.

**Decision: "current week" means today + the next 6 days.** A calendar week (Mon–Sun) would show days that have already passed for most of the week, which is not useful for planning a trip.

### 5.2 City description: Wikipedia REST summary

- Endpoint: `GET https://en.wikipedia.org/api/rest_v1/page/summary/{title}`.
- It returns a plain-text `extract`, a short `description`, and a `thumbnail`. A missing page returns 404.
- Each city in the list stores an explicit Wikipedia title, so lookups never land on disambiguation pages.
- Requests send a descriptive `User-Agent`, as the Wikimedia API policy requires.
- Only the plain-text `extract` is rendered, never `extract_html`. No upstream HTML reaches the DOM, which supports the token-storage decision in §5.4.

### 5.3 IP geolocation

**Provider: ip2location.io** (chosen after testing candidates from the deployed function)

The original choice, ipapi.co, returned **429 RateLimited** when called from the deployed function. Keyless quotas are counted per *client IP*, and the function's outbound address is a Google Cloud egress IP shared with other tenants.

So the temporary diagnostics endpoint asked seven keyless providers about the same real client IP, in parallel, from production, through both the Hosting and the direct URL:

| Provider | Result from Google Cloud | HTTPS | Key | Free limit (provider docs) | Notes |
|---|---|---|---|---|---|
| ipapi.co | ❌ 429 RateLimited | ✅ | no | ~1,000/day per client IP | Rejected |
| ip-api.com | ✅ correct city (Calgary) | ❌ HTTP only | no | 45/min per IP | Non-commercial; sends users' IPs in plaintext |
| ipwho.is | ✅ correct city | ✅ | no | 1,000/day | Commercial use allowed |
| **ip2location.io** | ✅ correct city | ✅ | optional | 1,000/day keyless; **50,000/month per free key** | Free plan requires visible attribution |
| ipinfo.io (no token) | ✅ correct city | ✅ | no | 50k/month (legacy, "may be discontinued") | The free token tier (Lite) is country-only |
| ipapi.is (anonymous) | ✅ correct city | ✅ | no | 30/day per client IP, then a 24 h block | |
| geojs.io | ✅ correct city | ✅ | no | Not published | |

**Why ip2location.io:** all six working providers were equally accurate, so the choice was made on **reliability**.
- Only ip2location.io offers a free, city-level quota counted **per API key** (50,000/month) rather than per client IP. That makes it the one option that cannot be exhausted by other tenants sharing Google's egress IPs.
- **The key is optional.** The client works keyless, and adds the key when `IP2LOCATION_API_KEY` is set (a Secret Manager secret in production).
- **Attribution.** The free plan's required attribution line goes in the app footer.
- **Failure handling.** Any provider failure (error, timeout, 429, private IP) falls back to the default city with a message; it never breaks the app.

**Using the user's IP, not the server's**

- **Why a header is needed.** In production, the TCP peer is Google's infrastructure, not the browser. The client's address arrives in `X-Forwarded-For`, and each proxy appends to that header.
- **How Express reads it.** We set `app.set('trust proxy', N)`, where N is the exact number of proxy hops. Express then takes the address N hops from the right as `req.ip`.
- **Spoofing.** A client can put any values in `X-Forwarded-For`. Because proxies append, forged entries end up on the left, and trusting exactly N hops ignores them. `trust proxy: true` would read the leftmost entry, which the client controls.
- **What spoofing would affect.**
  - The default city: harmless.
  - The login rate limiter, which is keyed on `req.ip`: this is why N must be correct.
- **Configuration.** N comes from the `TRUST_PROXY_HOPS` environment variable. It is **2** in production, measured rather than assumed (below).

**Measured on the deployed app** (temporary diagnostics endpoint, since removed):

| | Through Firebase Hosting | Direct `run.app` URL |
|---|---|---|
| Socket peer | Google front end | Google front end |
| `X-Forwarded-For` received | `<client>, <Hosting CDN>` | `<client>` (plus anything the caller sends) |
| Spoof test: request sent with `X-Forwarded-For: 6.6.6.6` | Hosting **dropped** the forged value; `req.ip` = real client IP | `req.ip` = **`6.6.6.6`** |

- **The hop count.** Express puts the socket peer first and then reads `X-Forwarded-For` right to left: `[front end, CDN, client]`. Trusting 2 hops makes `req.ip` the client.
- **Trust-proxy precedence confirmed.** Google's Functions Framework enables `trust proxy` on its own Express app, but our app's setting governs `req.ip`.
- **Regression tests** pin both rows of the spoof test (`test/integration/auth.test.ts`). With 2 trusted hops, prepending forged entries cannot dodge the login rate limit. The one-hop-shorter direct-URL shape lets a forged entry become `req.ip`.

**Private and loopback addresses.** These are detected with Node's `net.BlockList`, after stripping any `::ffff:` IPv4-mapped prefix.
- **Outside production:** the app asks the provider to locate the machine's own public IP. On a developer laptop this is the developer's real location, so local development behaves realistically.
- **In production:** the app skips the lookup and uses the default city. Looking up the server's own IP would return the datacenter's location.

**Matching the detected location to the city list**

| Situation | Result | UI message |
|---|---|---|
| A listed city is within 150 km (haversine) | Select the nearest listed city | "Detected: Airdrie, Alberta — showing nearest: Calgary (27 km)" |
| No listed city within 150 km | Select **Calgary** (default) | "Detected: Lisbon — no listed city nearby, showing default: Calgary" |
| Lookup failed or IP is private in production | Select **Calgary** | "Couldn't detect your location — showing default: Calgary" |

`GET /api/location` response shape:

```json
{
  "detected": { "city": "Airdrie", "region": "Alberta", "country": "CA", "lat": 51.29, "lon": -114.01 },
  "cityId": "calgary",
  "match": "nearest",
  "distanceKm": 27
}
```

- `match` is `"nearest"` or `"default"`.
- `detected` is `null` when the lookup fails.
- `distanceKm` is `null` when `match` is `"default"`.
- `region` is the full region name ("Alberta"). ip2location.io returns no short region code, so the UI shows the full name.
- **Private IPs.** ip2location.io answers 200 with every field `null`, which the client turns into `detected: null`. Outside production, a private `req.ip` makes the app call the provider with **no** `ip` parameter, so it locates the machine's own public IP (verified against the live API).

**Why this design**

- The UI always shows what was actually detected, so a mismatch between the user's location and the selected city is explained, not hidden.
- Weather and summary endpoints stay keyed by a validated city id.
- The matching rule is a small pure function that is straightforward to unit test.
- Calgary is the default, since the expected users are in Alberta.

**City list (12):** Calgary, Edmonton, Vancouver, Toronto, Montréal, New York, Mexico City, London, Paris, Berlin, Tokyo, Sydney.

### 5.4 Authentication (JWT)

**Login**

- **Demo user.** One user, configured by the environment variables `DEMO_USERNAME` and `DEMO_PASSWORD_HASH`.
  - A `hash-password` script generates the bcrypt hash.
  - The plaintext password is never committed. Reviewers receive credentials with the submission email.
- **Hashing: bcryptjs** (pure JavaScript). The native `bcrypt` package needs node-gyp builds, which are fragile on Windows and on some hosts. The speed difference is irrelevant for one user.
- **No username enumeration.**
  - A wrong username and a wrong password return the identical 401 response.
  - For an unknown username, `bcrypt.compare` still runs, against a dummy hash precomputed at startup with the same cost factor as the real hash. Both paths do the same work, so response time does not reveal whether a username exists (measured locally: 289 ms vs 263 ms at cost 12).
- **Password length.** Limited to 72 bytes, because bcrypt ignores anything longer. Checked in bytes, not characters: `é` is 2 bytes in UTF-8.
- **Rate limit.** Login is limited to 5 failed attempts per 15 minutes per IP (express-rate-limit).
  - Successful logins are not counted, so a legitimate user is never locked out.
  - The limiter runs before validation, so malformed requests count as failed attempts too.
  - It is created inside `createApp`, so each app instance (and each test) has its own counters.
  - Counters are keyed by `ipKeyGenerator(req.ip)`, which groups IPv6 addresses by /56, because one user typically controls a whole IPv6 range. If `req.ip` is undefined, requests share one `unknown-ip` bucket: still limited, rather than a 500.

**Token**

- **Format.** `jsonwebtoken`, HS256, signed with `JWT_SECRET`. Startup fails if the secret is shorter than 32 characters.
- **Claims.** `sub`, `iat`, and `exp`. Lifetime is `JWT_EXPIRES_IN_SECONDS` (default 3600). Seconds are used rather than strings like `1h`, so zod can validate the value strictly, and the login response returns the same number as `expiresIn`.
- **Subject check.** After the signature is verified, `sub` must equal `DEMO_USERNAME`. Changing the username invalidates existing tokens.
- **Algorithm pinning.** Verification pins `algorithms: ['HS256']`, which rejects `alg: none` and algorithm-confusion tokens.

**Browser storage: sessionStorage**

| Option | Survives refresh | Readable by injected script | Notes |
|---|---|---|---|
| In memory | No | No | Logged out on every refresh |
| **sessionStorage** | **Yes** | **Yes** | **Cleared when the tab closes** |
| localStorage | Yes | Yes | Persists indefinitely |
| httpOnly cookie | Yes | No | Not a bearer header as the brief specifies; requires CSRF protection |

The main XSS risk with sessionStorage is reduced by:
- Angular's automatic template escaping,
- never rendering upstream HTML,
- a Content-Security-Policy set by helmet,
- the short token lifetime.

**Frontend**

- **Interceptor.** A functional `HttpInterceptorFn` attaches `Authorization: Bearer <token>`.
  - On a 401 from any data endpoint, it clears the token and redirects to `/login?returnUrl=…`, because the session has expired or is invalid.
  - **Exception: `POST /api/auth/login`.** A 401 there only means the credentials were wrong; there is no session to end. The interceptor passes that error through untouched, and the login page shows "Invalid username or password". This path gets a dedicated frontend test.
- **Guard.** A functional `CanActivateFn` checks that a token exists and that its `exp` is in the future. This only improves the user experience; the server remains the authority.

### 5.5 Caching

External responses are cached in a small in-memory `TtlCache`: a `Map` plus expiry timestamps, about 30 lines, written in-house rather than added as a dependency.

| Data | TTL | Rationale |
|---|---|---|
| Weather | 10 min | Upstream `current` updates every 15 min |
| Wikipedia summary | 24 h | Changes rarely |
| IP → location | 1 h, size-capped | Keys come from users, so the cache is bounded |

**Why this is safe**

- Weather and summaries are public and identical for every user.
- Their cache keys are bounded by the city list.
- Briefly stale weather is harmless.

**Benefits**

- Lower latency.
- Less exposure to upstream rate limits (notably the geolocation provider's quota).

### 5.6 Frontend: state and UI

**State**

- **Signals** hold synchronous UI state: the session (`AuthService`), the selected city, and each card's state.
- **`linkedSignal` for the selected city.** It starts as the detected city (or Calgary if detection failed), and the user's choice then overrides it. No effect or manual subscription is needed to "set the default once".
- **RxJS** is used where streams need coordination.
  - The selected city feeds a `switchMap`. When the user switches cities, the previous city's requests are unsubscribed, which makes `HttpClient` abort them. A slow response for an old city can never overwrite a newer one; a unit test asserts the cancellation.
  - Results are bridged to templates with `toSignal`.
- **One state type for every card:** `Loadable<T>` = `loading | ok(data) | error(message)`. Templates branch on it with `@if`, and strict template type-checking narrows the union, so `data` is only reachable in the `ok` branch. Every card has a loading state, an error state and a "Try again" button.

**Session handling**

- **Token.** It is kept in `sessionStorage` behind a signal; the username comes from the token's `sub` claim.
- **Interceptor.** It attaches the token to `/api/*` requests only. Static files such as the icon SVGs never get it.
- **Guards.** `authGuard` checks the token's `exp`; `guestGuard` keeps logged-in users off the login page.
- **Redirects.** After login the user returns to `returnUrl`, which is accepted only if it is a same-app path. `safeReturnUrl` rejects `https://…`, `//…` and `/\…`, which would otherwise be an open redirect.

**Presentation**

- **Temperatures** are shown in °C with the unit ("14 °C"), rounded to whole degrees.
- **Forecast days** read "Today", then short weekday names ("Mon"). Day names are computed from the city's own calendar date, interpreted as UTC, so the viewer's timezone can't shift them.
- **Detected-location banner.** It uses the three exact messages from §5.3, built by a pure, unit-tested function.
- **Responsive.** One column on phones, where the forecast wraps 4 + 3. From 840 px, the description sits beside the current weather and the forecast spans the full width. On phones the logout button is icon-only (it keeps its `aria-label`) and long usernames are cut with an ellipsis. Checked in headless Chrome at 390 px and 1280 px: no horizontal scrolling.
- **Accessibility.**
  - Labelled form fields (`mat-label`) and `autocomplete` hints.
  - Errors in `role="alert"`; the location banner in `role="status"`.
  - Decorative icons are `aria-hidden`, and each forecast day has one spoken sentence ("Today: Overcast, high 18 °C, low 2 °C").
  - Only Material 3's paired "on-X over X" colour tokens are used, which are designed for WCAG AA contrast.

**UI: Angular Material**

- **Theme.** A Material 3 theme.
- **Components.**
  - The city picker is a `mat-select`.
  - The description, current weather, and weekly forecast are Material cards (`mat-card`).
  - Layout is a responsive card grid.
- **Setup.**
  - Installed with `ng add @angular/material`, so Material's version matches Angular's.
  - **No third-party requests.** `ng add` links Roboto and the icon font from Google Fonts. Both are replaced with self-hosted copies: Roboto from `@fontsource/roboto`.
  - **Icons are individual SVGs, not the icon font.** The Material Symbols font is **4 MB**, because it contains every icon. Instead, the build copies only the 16 SVGs the app uses (0.3–1.3 KB each) from `@material-symbols/svg-400` (Apache-2.0; its LICENSE ships alongside). `MatIconRegistry` registers them, so templates still use `<mat-icon svgIcon="…">`.
  - **Initial download: about 96 KB compressed.** Each page is lazy-loaded.

| | Angular Material (chosen) | No component library |
|---|---|---|
| Time to a polished UI | Fast: ready-made, consistent components | Slower: every component styled by hand |
| Accessibility | Built in: keyboard navigation, ARIA, focus management | Must be implemented and tested by hand |
| Bundle size | Larger | Minimal |
| CSP | More runtime-injected styles to account for (see §9) | Fewer considerations |

### 5.7 Hosting: Firebase Hosting + 2nd-gen Cloud Functions

The hosting target changed from Render to Firebase before the first deploy.

**Firebase facts that shaped the design** (from Firebase's documentation, checked 2026-09-26):
- **Plan.** Deploying functions requires the **Blaze** (pay-as-you-go) plan. Its free monthly quotas are 2M invocations, 400K GB-seconds, and 200K CPU-seconds.
- **Outbound calls.** Calls to non-Google APIs are allowed. Outbound data is free up to 5 GB/month.
- **Runtime.** Node.js 22 is supported. It is set with `"runtime": "nodejs22"` in `firebase.json`.
- **Rewrite region.** Hosting rewrites work with any function region. Firebase recommends colocating with Hosting in `us-west1`, `us-central1`, `us-east1`, `europe-west1` or `asia-east1`.
- **Priority.** Static files take priority over rewrites.
- **CDN caching.** Function responses are not cached on the CDN unless they send `Cache-Control: public`.
- **Timeout.** Rewritten requests time out after 60 seconds.

**Serving**

- **Hosting serves the Angular build and the SPA fallback.** Express no longer serves static files or `index.html`.
- **Rewrites.** `/api/**` and `/health` go to the function, so the whole app is on one origin with no CORS configuration.

**The function (`backend/src/function.ts`)**

| Setting | Value | Why |
|---|---|---|
| `region` | `us-west1` | On Firebase's colocated list, and close to Alberta |
| `invoker` | `public` | Hosting forwards public traffic to it; our JWT middleware does the authentication |
| `maxInstances` | 1 | Caps cost if the app is flooded, and keeps one set of in-memory rate-limit counters and caches |
| `concurrency` / `cpu` | 80 / 1 | Set explicitly instead of relying on defaults; one instance serves up to 80 requests at once |
| `minInstances` | 0 (default) | Nothing runs while idle, at the cost of cold starts |
| `secrets` | `JWT_SECRET`, `DEMO_PASSWORD_HASH` | Bound to this function only |

**Startup**

- **Config is read in `onInit`.** The Firebase CLI loads the code during deploy, before secret values exist. Reading them at module scope fails the deploy, so the app is built in `onInit`, which runs once per instance at startup.
- **One validator.** Secret values are merged into the environment object passed to `loadConfig`, so it stays the single place config is validated.
- **`PORT` is dropped.** It is platform-owned (a reserved key), and the Firebase emulator sets it to a socket path. The function never calls `listen()`, so `PORT` is not ours to validate.

**Why not Firebase's typed params** (`defineString`, `defineInt`) for non-secret settings: they validate and convert values themselves. That would be a second validation layer next to `loadConfig`.

**Rollout: skeleton deploy after the auth phase.** Health and login are deployed before the external-API work. This verifies early, while there is still time to change course:
- the proxy hop count (`TRUST_PROXY_HOPS`), through Hosting;
- the same through the function's direct `run.app` URL (see §8);
- that the geolocation provider answers requests from Google's egress IPs (ipapi.co did not; see §5.3).

**Emulator testing.** The Hosting and Functions emulators were used before the first deploy. They surfaced three differences from a plain Node server:
- **`PORT` is a socket path**, which `loadConfig` rejected. Fixed by dropping `PORT` in `function.ts`.
- **`req.ip` is `undefined`.** The emulator connects to the function over a pipe and adds no `X-Forwarded-For`. This crashed the login rate limiter; it now falls back to a shared `unknown-ip` bucket (§5.4).
- **The body is parsed by the framework first.** See §5.8.

**Found on the first real deploy** (not reproducible in the emulator):
- **`/healthz` never reached the app.** Cloud Run reserves "some paths ending with `z`" and recommends avoiding them all, so Google's front end answered it with its own 404, even on the direct URL. The endpoint was renamed to `/health`.
- **A too-short `JWT_SECRET` was caught at startup.** The value had been truncated when pasted into the CLI's hidden prompt. `loadConfig` rejected it inside `onInit` and logged the variable name only, never the value. The secret was re-set by piping a generated value straight into `firebase functions:secrets:set --data-file -`, so no clipboard was involved.
- **The first deploy stopped before releasing Hosting.** In non-interactive mode, the CLI could not set up the container-image clean-up policy. It was set explicitly with `firebase functions:artifacts:setpolicy --location us-west1 --days 1`.

### 5.8 Hardening

- **helmet.** Security headers on every response from Express.
  - In production, Express only answers `/api/**` and `/health`. Hosting serves the Angular files itself, so the **page's** security headers are set in `firebase.json`.
- **Page CSP** (`firebase.json`):

  | Directive | Value | Why |
  |---|---|---|
  | `script-src` | `'self'` | No inline scripts. The build's critical-CSS inlining is turned off (`inlineCritical: false`) because it adds an `onload` handler |
  | `style-src` | `'self' 'unsafe-inline'` | Angular and Material add component styles as `<style>` tags at runtime. A nonce is not an option on static hosting, which can't generate one per request |
  | `img-src` | `'self'`, `thumb.wikimedia.org`, `upload.wikimedia.org` | City photos (all 12 currently come from `thumb.wikimedia.org`) |
  | `font-src`, `connect-src` | `'self'` | Self-hosted fonts; the API is same-origin |
  | `object-src` / `frame-ancestors` | `'none'` | No plugins; the app can't be framed (clickjacking) |

  - **Verified, not assumed.** The production build was loaded in headless Chrome with this exact policy enforced, logged in, and showed a city: no violations. A deliberately stricter policy (no inline styles, no Wikimedia images) **did** produce violations, which proves both allowances are needed. After deploying, the live headers were checked with `curl`, and the login page was loaded under the live policy with no errors.
- **Other page headers:** `nosniff`, a referrer policy, a permissions policy (no camera, microphone or geolocation), and HSTS. Firebase Hosting replaces our HSTS value with its own stronger one (`preload`).
- **Caching:**
  - Pages are `no-cache`, so a new deploy is seen immediately.
  - Content-hashed JS, CSS and font files are cached for a year (`immutable`).
  - When several header rules match, the later one wins; this was verified in production.
- **No caching of API responses.** Every `/api` response sends `Cache-Control: no-store`. Responses are per-user, and the login response contains a token, so neither the browser nor the CDN may store them.
- **Login rate limiting.** See §5.4.
- **Body size limit: local only.** `express.json({ limit: '10kb' })` applies on the local server.
  - In production, Google's Functions Framework parses the body before our app runs (limit `1024mb`, in practice capped by Cloud Run at 32 MB), so our parser is skipped. This was confirmed in the emulator: a 20 kb body was accepted.
  - For the same reason, **malformed JSON in production gets the framework's own HTML 400 response**, not our JSON error shape.
  - No extra code was added: a check inside our app would run after the body is already read, so it could not protect memory.
- **Validation: zod.** One small dependency validates environment variables and request inputs, and yields typed results.
- **Upstream timeouts.** Every outbound call has a 5-second timeout (`AbortSignal.timeout`).
- **Secrets.** No secrets in the repository.
  - In production, `JWT_SECRET` and `DEMO_PASSWORD_HASH` live in Google Secret Manager.
  - All env files are gitignored; only the `*.example` templates are committed.

## 6. Testing strategy

**Backend: Vitest + supertest**

- **Unit tests.**
  - Services are tested with mocked clients.
  - Clients are tested with a mocked `fetch`, covering success, upstream errors, timeouts, and malformed responses.
  - Pure functions are tested directly: haversine, city matching, IP classification, WMO mapping, `TtlCache` (with fake timers).
- **Integration tests.** supertest runs against `app.ts`. They cover login, 401 for a missing, invalid, or expired token, 404, 400, and the error shape.
- **Coverage.** `@vitest/coverage-v8`, with a minimum threshold enforced.

**Frontend**

41 Vitest tests through `ng test`, with about 96% line coverage (`npm run test:coverage`):

- **Interceptor:** the token is sent to `/api/*` only; a 401 from a data endpoint logs out and redirects; a 401 from the login endpoint does **not**.
- **`AuthService` and guards:**
  - session restore;
  - expired and malformed tokens;
  - the redirect with `returnUrl`;
  - `safeReturnUrl` rejects other sites.
- **Login page**, tested with the real interceptor:
  - a wrong password stays on the form with "Invalid username or password.";
  - a 429 has its own message;
  - the return URL is honoured, but never an external one.
- **Planner page:**
  - the detected city is pre-selected, with the banner text;
  - "Today", weekday names and °C formatting;
  - switching city cancels the previous requests;
  - the error state and "Try again" work.
- **Pure helpers:** the three banner messages, day labels and temperature formatting.
- **Browser check.** A throwaway headless-Chrome script, outside the repo, logs in through the real UI at phone and desktop widths, checks for horizontal scrolling and console errors, and optionally enforces a CSP.

**End-to-end (optional)**

- One Playwright test: log in, then view a city.

## 7. Environment variables

| Variable | Purpose | Local dev server | Deployed function |
|---|---|---|---|
| `NODE_ENV` | `development`, `test` or `production` | `local.env` | `.env.<projectId>` (`production`) |
| `PORT` | Port for `server.ts` | `local.env` | Not used: platform-owned |
| `JWT_SECRET` | HS256 signing secret, ≥ 32 characters | `local.env` | **Secret Manager** |
| `JWT_EXPIRES_IN_SECONDS` | Token lifetime in seconds (default `3600`) | `local.env` | `.env.<projectId>` |
| `DEMO_USERNAME` | Demo user's username | `local.env` | `.env.<projectId>` |
| `DEMO_PASSWORD_HASH` | bcrypt hash of the demo password | `local.env` | **Secret Manager** |
| `TRUST_PROXY_HOPS` | Number of trusted reverse-proxy hops | `local.env` (`0`) | `.env.<projectId>` (`2`, measured) |
| `IP2LOCATION_API_KEY` | Optional ip2location.io key: per-key quota instead of the keyless per-IP one | `local.env` (optional) | **Secret Manager** (optional) |

**Files**

- **`backend/local.env`** comes from `local.env.example`.
- **`backend/.env.<projectId>`** comes from `firebase.env.example`. The Firebase CLI reads it at deploy time.
- **Emulator overrides:**
  - `backend/.env.local` holds non-secret settings.
  - `backend/.secret.local` holds stand-in values for the two secrets.

All of these are gitignored.

## 8. Known limitations

- **Inline styles are allowed by the CSP** (`style-src 'unsafe-inline'`). Angular and Material inject `<style>` tags at runtime, and static hosting can't issue the per-request nonce that would avoid this. Scripts stay strict (`'self'` only).

- **Blaze plan required.** Cloud Functions need a billing account. Budget alerts only warn; they do not cap spending. `maxInstances: 1` and the login rate limit bound the exposure.
- **Cold starts.** With `minInstances: 0`, the first request after idle time starts a new instance. `onInit` then computes the cost-12 dummy bcrypt hash, which added about 3 s to the first request in the emulator; production is measured on deploy. Keeping an instance warm would cost money.
- **In-memory state.** The cache and rate-limit counters live on the single instance. They are lost when it shuts down, and they do not deduplicate concurrent requests for the same key.
- **Scaling ceiling.** One instance at 80 concurrent requests is the deliberate cost cap.
- **60-second request timeout** on requests rewritten through Hosting.
- **Body limit and JSON errors.** The 10 kb limit and the JSON `INVALID_JSON` response apply only on the local server (§5.8).
- **Direct-URL bypass of Hosting.** The function also has its own public `run.app` URL.
  - A request sent there skips Hosting, so it passes through one fewer proxy.
  - `TRUST_PROXY_HOPS` is set for the Hosting path, so a caller using the direct URL can choose their own `req.ip` by adding one `X-Forwarded-For` entry. That weakens the per-IP login rate limit.
  - **Measured:** a request to the `run.app` URL with `X-Forwarded-For: 6.6.6.6` produced `req.ip = 6.6.6.6`, while the same request through Hosting kept the real IP (§5.3). A regression test documents the bypass.
  - **Accepted for this demo.** The exposure is limited to the login rate limit; authentication itself is unaffected. Fixes need paid Google Cloud load-balancer features, or depending on undocumented Hosting headers.
- **Dependency advisory.** `npm audit` reports a moderate advisory in `uuid` (bounds check in its v3/v5/v6 functions when a caller passes a buffer). It comes in through `firebase-admin` → `@google-cloud/storage` → `gaxios`, which pins `uuid@^9`. The app never calls that code path; the package is only installed because `firebase-functions` requires `firebase-admin` as a peer.
- **No refresh tokens.** Users log in again after the token expires.
- **A single hard-coded demo user.** There is no user store.
- **IP geolocation accuracy.** It is approximate, and VPNs and mobile carriers can place users far away.
- **Fixed city list.** Locations outside the list map to the nearest listed city or to the default.
- **Free-tier upstream terms.**
  - Open-Meteo is for non-commercial use only.
  - ip2location.io allows 1,000 lookups/day keyless, or 50,000/month with a free key, and requires attribution on the free plan.

## 9. Open items to verify

- ~~**Proxy hops.**~~ **Resolved:** 2 through Hosting (§5.3).
- ~~**Direct-URL hops.**~~ **Resolved:** one fewer; the bypass is measured and documented (§8).
- ~~**Trust-proxy precedence.**~~ **Resolved:** our app's setting governs `req.ip`, confirmed by the spoof test.
- ~~**ipapi.co from Google Cloud.**~~ **Resolved:** it returns 429, so the provider changed to ip2location.io (§5.3).
- ~~**CSP with Angular and Material.**~~ **Resolved:** the page CSP lives in `firebase.json`. It needs `'unsafe-inline'` for styles only, and was verified in a real browser (§5.8).

## 10. Planned extras (time permitting)

- **CI.** A GitHub Actions workflow that runs typecheck, lint, and tests on every push.
- **Date forecast.** `GET /api/cities/:id/forecast?date=YYYY-MM-DD`, for a date up to 5 days ahead in the city's timezone.
- **End-to-end test.** One Playwright test: log in, then view a city.
