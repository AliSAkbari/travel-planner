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
Browser (Angular SPA) ──HTTPS + Bearer JWT──▶ Express (single Render web service)
                                               ├─ serves the built Angular app (same origin → no CORS)
                                               └─ /api/*  routes → controllers → services → clients
                                                                                           ├─▶ Open-Meteo  (weather)
                                                                                           ├─▶ Wikipedia   (city summary)
                                                                                           └─▶ ipapi.co    (IP geolocation)
```

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
/                       root package.json: convenience scripts only (build, test, start)
├─ .nvmrc               Node version (read by nvm and by Render)
├─ backend/
│  ├─ src/
│  │  ├─ app.ts         builds the Express app without listening (imported by integration tests)
│  │  ├─ server.ts      entry point; the only file that calls listen()
│  │  ├─ config/        env loading + validation; fails fast on missing/weak secrets
│  │  ├─ data/          the predefined city list
│  │  ├─ routes/
│  │  ├─ controllers/
│  │  ├─ services/
│  │  ├─ clients/       openMeteo, wikipedia, ipapi
│  │  ├─ middleware/    requireAuth, validate, errorHandler, loginRateLimit
│  │  └─ utils/         TtlCache, HttpError, haversine
│  └─ test/
│     ├─ unit/
│     └─ integration/   supertest against app.ts
├─ frontend/
│  └─ src/app/
│     ├─ core/          AuthService, authInterceptor, authGuard, ApiService
│     └─ features/
│        ├─ login/
│        └─ planner/    city selector, description card, current weather, weekly forecast
└─ docs/
```

`frontend` and `backend` each have their own `package.json`. npm workspaces were considered and rejected: the root scripts give the same convenience without dependency-hoisting behaviour to reason about.

**Node version:** Node 22 LTS, which the current Angular CLI requires.
- Pinned in `.nvmrc` and in `engines` as a bounded range (`>=22.12.0 <23`).
- Render's documentation warns that unbounded ranges resolve to the newest Node release.

**Tooling**

- **TypeScript ~6.0**, pinned. Angular 22 and typescript-eslint both support `>=6.0 <6.1`, so the whole repository uses one compiler version.
- **Module system.** The backend is native ESM (`nodenext`), so relative imports carry a `.js` extension.
- **Prettier** formats code, using one root config.
- **ESLint** uses the recommended configs from `@eslint/js` and typescript-eslint, plus the type-aware `no-floating-promises` rule.
- **Environment files.** `.env` is loaded by Node's built-in `--env-file-if-exists` in development, so the `dotenv` package is not needed.

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
| 413 | Request body over 10 kb |
| 429 | Login rate limit exceeded |
| 502 | An upstream API failed or timed out. Every outbound call has a 5-second timeout |
| 500 | Unexpected error. No stack traces in production |

**401 error codes.** `INVALID_CREDENTIALS` (login), `MISSING_TOKEN`, `INVALID_TOKEN`, and `TOKEN_EXPIRED`. The frontend can tell an expired session apart from a bad login.

**Why there is no 403.** 403 means an authenticated caller is not permitted. The app has a single role, so no endpoint has a legitimate 403 case.

### Endpoints

| Method | Path | Auth | Success response | Errors |
|---|---|---|---|---|
| GET | `/healthz` | None | `200 { status: "ok" }` | — |
| POST | `/api/auth/login` | None | `200 { token, expiresIn, user: { username } }` | 400, 401, 429 |
| GET | `/api/auth/me` | Bearer | `200 { username }` | 401 |
| GET | `/api/cities` | Bearer | `200 [{ id, name, country }]` | 401 |
| GET | `/api/location` | Bearer | `200 { detected, cityId, match, distanceKm }` (see §5.3) | 401 |
| GET | `/api/cities/:id/summary` | Bearer | `200 { title, description, extract, thumbnailUrl, wikiUrl }` | 401, 404, 502 |
| GET | `/api/cities/:id/weather` | Bearer | `200 { timezone, current, daily[7] }` | 401, 404, 502 |
| GET | `/api/cities/:id/forecast?date=YYYY-MM-DD` | Bearer | `200` one day's forecast *(optional feature)* | 400, 401, 404, 502 |

- **`current`** contains temperature, feels-like, humidity, wind, weather code, label, icon, and day/night.
- **`daily`** entries contain date, min, max, weather code, label, and precipitation probability.

**Design notes**

- **`/healthz` is intentionally public and outside `/api`.**
  - Render's health checker cannot send a token.
  - It returns no application data.
  - It is the only unauthenticated route besides login.
- **Protected by default.** The API router registers login, then `router.use(requireAuth)`, then every other route. A new route is protected unless it is deliberately placed above that line.
  - Unknown `/api` paths also pass through `requireAuth`, so they return 401 without a token and 404 with one. Unauthenticated callers cannot probe which routes exist.
- **`/api/auth/me`** returns the token's user. The frontend can use it to confirm a stored session is still valid.
- **Current weather and the week share one endpoint.** Open-Meteo returns both in a single response, so this means one upstream call, one cache entry, and one round trip.
- **Data endpoints take a city `id`, never raw coordinates.**
  - Validation is a lookup: an unknown id returns 404.
  - Cache keys are bounded by the city list, so callers cannot grow the cache with arbitrary inputs.
- **The backend translates weather codes.** It maps WMO weather codes to labels and icons. This is business logic, so it lives in a unit-tested service; the frontend only renders.
- **Forecast dates are checked in the city's timezone.** The optional forecast endpoint accepts dates from today to today + 5 days, where "today" is the city's local date.

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

**Provider: ipapi.co**

| | ipapi.co | ip-api.com |
|---|---|---|
| HTTPS on free tier | Yes | No: returns 403 "SSL unavailable" |
| Free limit | ~1,000 requests/day (per provider docs) | 45 requests/minute, non-commercial |

ip-api.com would send users' IP addresses over the internet in plaintext.
ipapi.co may rate-limit requests coming from shared cloud IP ranges. This is checked on the skeleton deploy (§7), while there is still time to switch provider.

**Using the user's IP, not the server's**

- **Why a header is needed.** On Render, the TCP peer is Render's proxy. The client's address arrives in `X-Forwarded-For`, and each proxy appends to that header.
- **How Express reads it.** We set `app.set('trust proxy', N)`, where N is the exact number of proxy hops. Express then takes the address N hops from the right as `req.ip`.
- **Spoofing.** A client can put any values in `X-Forwarded-For`. Because proxies append, forged entries end up on the left, and trusting exactly N hops ignores them. `trust proxy: true` would read the leftmost entry, which the client controls.
- **What spoofing would affect.**
  - The default city: harmless.
  - The login rate limiter, which is keyed on `req.ip`: this is why N must be correct.
- **Configuration.** N comes from the `TRUST_PROXY_HOPS` environment variable. It is verified on the skeleton deploy rather than assumed.

**Private and loopback addresses.** These are detected with Node's `net.BlockList`, after stripping any `::ffff:` IPv4-mapped prefix.
- **Outside production:** the app asks ipapi.co to locate the machine's own public IP. On a developer laptop this is the developer's real location, so local development behaves realistically.
- **In production:** the app skips the lookup and uses the default city. Looking up the server's own IP would return the datacenter's location.

**Matching the detected location to the city list**

| Situation | Result | UI message |
|---|---|---|
| A listed city is within 150 km (haversine) | Select the nearest listed city | "Detected: Airdrie, AB — showing nearest: Calgary (28 km)" |
| No listed city within 150 km | Select **Calgary** (default) | "Detected: Lisbon, PT — no listed city nearby, showing default: Calgary" |
| Lookup failed or IP is private in production | Select **Calgary** | "Couldn't detect your location — showing default: Calgary" |

`GET /api/location` response shape:

```json
{
  "detected": { "city": "Airdrie", "region": "Alberta", "regionCode": "AB", "country": "CA", "lat": 51.29, "lon": -114.01 },
  "cityId": "calgary",
  "match": "nearest",
  "distanceKm": 28
}
```

- `match` is `"nearest"` or `"default"`.
- `detected` is `null` when the lookup fails.
- `distanceKm` is `null` when `match` is `"default"`.

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
- Less exposure to upstream rate limits (notably ipapi.co's daily quota).

### 5.6 Frontend: state and UI

**State**

- **Signals** hold synchronous UI state: selected city, loading and error flags, auth state.
- **RxJS** is used where streams need coordination.
  - City changes feed a `switchMap`, which cancels the in-flight request when the user switches cities quickly. Stale data for a previous city can never render.
  - Results are bridged to templates with `toSignal`.

**UI: Angular Material**

- **Theme.** A Material 3 theme.
- **Components.**
  - The city picker is a `mat-select`.
  - The description, current weather, and weekly forecast are Material cards (`mat-card`).
  - Layout is a responsive card grid.
- **Setup.**
  - Installed with `ng add @angular/material`, so Material's version matches Angular's.
  - Icons are self-hosted from an npm package, not loaded from Google Fonts. This keeps every asset on our own origin and avoids a third-party request.

| | Angular Material (chosen) | No component library |
|---|---|---|
| Time to a polished UI | Fast: ready-made, consistent components | Slower: every component styled by hand |
| Accessibility | Built in: keyboard navigation, ARIA, focus management | Must be implemented and tested by hand |
| Bundle size | Larger | Minimal |
| CSP | More runtime-injected styles to account for (see §9) | Fewer considerations |

### 5.7 Hosting: single Render web service

- **Build.** Build the backend and the frontend.
- **Start.** `node backend/dist/server.js`.
- **Serving.** Express serves Angular's build output and falls back to `index.html` for any non-`/api` route.

| | Single service (chosen) | Separate frontend host + API host |
|---|---|---|
| CORS | Not needed (same origin) | Must be configured |
| Deploys / URLs | One | Two |
| Env configuration | One place | Two places |

**Rollout: skeleton deploy after the auth phase.** The health endpoint and login are deployed before the external-API work. This verifies two things early, while there is still time to change course:
- Render's proxy hop count, by inspecting `X-Forwarded-For`,
- that ipapi.co answers requests from Render's egress IPs.

### 5.8 Hardening

- **helmet.** Security headers, plus a CSP that allows Wikimedia image hosts for thumbnails.
- **Login rate limiting.** See §5.4.
- **Body size limit.** `express.json({ limit: '10kb' })`.
- **Validation: zod.** One small dependency validates environment variables and request inputs, and yields typed results.
- **Upstream timeouts.** Every outbound call has a 5-second timeout (`AbortSignal.timeout`).
- **Secrets.** No secrets in the repository: `.env` is gitignored and only `.env.example` is committed.

## 6. Testing strategy

**Backend: Vitest + supertest**

- **Unit tests.**
  - Services are tested with mocked clients.
  - Clients are tested with a mocked `fetch`, covering success, upstream errors, timeouts, and malformed responses.
  - Pure functions are tested directly: haversine, city matching, IP classification, WMO mapping, `TtlCache` (with fake timers).
- **Integration tests.** supertest runs against `app.ts`. They cover login, 401 for a missing, invalid, or expired token, 404, 400, and the error shape.
- **Coverage.** `@vitest/coverage-v8`, with a minimum threshold enforced.

**Frontend**

- The interceptor, guard, and `AuthService` are tested with `HttpTestingController`.
  - The interceptor tests include a case proving that a 401 from the login endpoint does **not** clear the token or redirect.
- Key components get a few tests.

**End-to-end (optional)**

- One Playwright test: log in, then view a city.

## 7. Environment variables

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `production` on Render |
| `PORT` | Set by Render |
| `JWT_SECRET` | HS256 signing secret, ≥ 32 characters |
| `JWT_EXPIRES_IN_SECONDS` | Token lifetime in seconds (default `3600`) |
| `DEMO_USERNAME` | Demo user's username |
| `DEMO_PASSWORD_HASH` | bcrypt hash of the demo password |
| `TRUST_PROXY_HOPS` | Number of trusted reverse-proxy hops (verified on deploy) |
| `ENABLE_DIAGNOSTICS` | Temporary. `true` registers `GET /api/diagnostics/network` (token required) for verifying the hosting setup |

## 8. Known limitations

- **Cold starts.** Render's free tier spins instances down after about 15 minutes idle. The first request afterwards can take tens of seconds, and the in-memory cache is lost.
- **Cache scope.** The cache is per-instance and does not deduplicate concurrent requests for the same key.
- **Rate-limit scope.** Login rate-limit counters are in memory: per instance, and reset on restart or spin-down.
- **No refresh tokens.** Users log in again after the token expires.
- **A single hard-coded demo user.** There is no user store.
- **IP geolocation accuracy.** It is approximate, and VPNs and mobile carriers can place users far away.
- **Fixed city list.** Locations outside the list map to the nearest listed city or to the default.
- **Free-tier upstream terms.**
  - Open-Meteo is for non-commercial use only.
  - ipapi.co has a daily request quota.

## 9. Open items to verify

- **Proxy hops.** Render's proxy hop count, which sets `TRUST_PROXY_HOPS`. Checked on the skeleton deploy.
- **ipapi.co from Render.** Whether ipapi.co serves requests from Render's egress IPs without rate limiting. Checked on the skeleton deploy.
- **CSP with Angular and Material.** Whether the production build works under helmet's CSP. Angular adds component styles at runtime, and its build can inline critical CSS. Material increases the number of runtime styles. Verified in the browser against the production build during the frontend phase, not assumed.

## 10. Planned extras (time permitting)

- **CI.** A GitHub Actions workflow that runs typecheck, lint, and tests on every push.
- **Date forecast.** The optional forecast endpoint for a chosen date (§4).
- **End-to-end test.** One Playwright test: log in, then view a city.
