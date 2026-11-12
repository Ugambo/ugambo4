# Architecture

## Components

```
 passenger-mobile ─┐                                         ┌─ PostgreSQL 16 + PostGIS
 driver-mobile ────┤   HTTPS (REST /v1)                      │   (system of record)
 passenger-web ────┼────────────────────────────►  api  ─────┤
 fleet-portal ─────┤   Socket.IO (Phase 4)        (NestJS)   ├─ Redis
                   │                                 ▲       │   (OTP, rate limits, live positions, locks)
 admin browser ──► admin-dashboard server ───────────┘       ├─ SMS gateway (Termii, behind SmsProvider)
                   (Next.js; holds the admin's tokens)       ├─ Paystack (Phase 5)
                                                             ├─ Google Maps (Phase 3)
 driver-mobile ──── signed PUT (upload) ───────────────────► └─ S3-compatible storage, private
 admin browser ──── signed GET (60 s view) ────────────────►
```

One API process type, stateless, horizontally scalable. All durable state is in
PostgreSQL; Redis holds only data that can expire or be rebuilt.

## Monorepo

pnpm workspaces + Turborepo. `pnpm turbo run build` builds packages in dependency
order.

| Path                        | Purpose                                                                         | State                                 |
| --------------------------- | ------------------------------------------------------------------------------- | ------------------------------------- |
| `apps/api`                  | NestJS API                                                                      | Phases 1-2 built                      |
| `apps/admin-dashboard`      | Next.js admin dashboard (driver verification so far)                            | Phase 2 built; full dashboard Phase 6 |
| `apps/driver-mobile`        | Expo driver app (onboarding so far)                                             | Phase 2 built; trips Phases 3-4       |
| `apps/passenger-mobile`     | Expo passenger app: map, booking, trip, receipts                                | Phase 3 built                         |
| `apps/passenger-web`        | Next.js passenger web booking                                                   | Phase 4                               |
| `apps/fleet-portal`         | Next.js fleet portal                                                            | Phase 6                               |
| `packages/shared-types`     | Response types, role/permission keys, error codes, driver types                 | Built                                 |
| `packages/validation`       | zod request schemas, Nigerian phone, NIN, plate, NUBAN                          | Built                                 |
| `packages/api-client`       | Typed fetch client with token refresh, used by every app                        | Built                                 |
| `packages/ui-components`    | Design tokens; shared React Native components at `/native` (incl. bottom sheet) | Built                                 |
| `packages/mobile-core`      | Mobile session (secure storage), language, sign-in, formatting                  | Built                                 |
| `packages/utilities`        | Money in kobo, English/Hausa message catalogues                                 | Built                                 |
| `infrastructure/database`   | SQL migrations and migration runner                                             | Built                                 |
| `infrastructure/docker`     | API, migration and admin dashboard images; Postgres init                        | Built                                 |
| `infrastructure/deployment` | Production deployment                                                           | Phase 8                               |

Dependency rule: apps depend on packages; packages never depend on apps;
`shared-types` depends on nothing.

## API structure (`apps/api/src`)

| Module     | Responsibility                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------- |
| `config`   | Reads and validates every environment variable at startup (zod); refuses to start on bad config |
| `database` | Kysely over a `pg` pool; table types in `types.ts`                                              |
| `redis`    | ioredis client                                                                                  |
| `common`   | Error type and filter, zod pipe, rate limiter, field encryption, request context, cursors       |
| `sms`      | `SmsProvider` interface; console and Termii implementations                                     |
| `audit`    | Writes `audit_logs` rows, inside the caller's transaction when given one                        |
| `auth`     | OTP, sessions and refresh rotation, JWTs, TOTP, global guards                                   |
| `users`    | Current-user profile; role/permission loading                                                   |
| `admin`    | User search, roles, suspension, audit log reading                                               |
| `health`   | Liveness and readiness                                                                          |

### Request lifecycle

1. pino-http assigns or accepts a request id and logs the request (credentials
   redacted).
2. `AuthGuard` (global): unless the route is `@Public()`, verifies the JWT, loads
   the session and user, rejects revoked/expired sessions and suspended accounts,
   loads roles and permissions, and attaches a `Principal`.
3. `PermissionsGuard` (global): enforces `@RequirePermissions(...)` and, for
   holders of MFA roles, that this session passed TOTP recently.
4. `ZodValidationPipe` validates body, query and params with the shared schemas.
5. Services do the work. Anything that changes more than one row runs in a
   transaction; audit entries are written in the same transaction.
6. `AllExceptionsFilter` turns every error into the standard error body.

### Authentication

```
app                         api                              Redis / Postgres
 │ POST otp/request ───────► rate limits, cooldown ─────────► otp:code:<phone> = HMAC(code), TTL 5m
 │                           SMS ◄── "Your RideswithMe code is 123456"
 │ POST otp/verify ────────► atomic check-and-consume ──────► (Lua script)
 │                           upsert user, consent, session ─► users, user_consents, user_sessions
 │ ◄── access JWT (15m) + refresh token (rotating)
 │ GET /v1/... Bearer JWT ─► guard: session live? user active? permissions?
 │ POST refresh ───────────► row-locked rotation, reuse detection
```

Details and trade-offs: DECISIONS D-008 to D-012.

### Driver documents

```
driver app                      api                                   storage (private bucket)
 │ POST documents/uploads ─────► checks type, size, rate ─► file_uploads row
 │ ◄── signed PUT URL (10 min, exact type and size, encrypted at rest)
 │ PUT file ───────────────────────────────────────────────────────────► object
 │ POST documents {uploadId} ──► HEAD + first bytes: size and real type ◄─┘
 │                               driver_documents row (pending), audit
admin dashboard
 │ view ───────────────────────► audit "viewed" ─► signed GET URL (60 s) ─► browser shows it
 │ approve / reject ───────────► row lock, audit; driver approval needs every
                                 required document approved and in date; SMS
```

Whether a driver may go online is computed on every read from their status,
vehicle and documents (DECISIONS D-025), so an expired licence blocks driving
without waiting for a background job.

## Admin dashboard (`apps/admin-dashboard`)

Next.js 16 (App Router). The browser talks only to the dashboard's own server:

- `/api/auth/*` signs in (SMS code) and out. The API's tokens go into an
  encrypted, httpOnly, SameSite=Strict cookie, never to page scripts.
- `/api/proxy/v1/...` forwards allow-listed API calls with the admin's token,
  refreshing it when needed. Pages use the shared typed `api-client` against it.
- `src/proxy.ts` (Next 16's name for middleware) redirects signed-out visitors and
  sets a per-request nonce Content-Security-Policy.
- Text comes from English/Hausa catalogues; design tokens become CSS variables.

## Driver app (`apps/driver-mobile`)

Expo SDK 58 with Expo Router. Screens: sign-in, application checklist, name/NIN,
vehicle, payout account, one screen per document (camera, gallery, PDF). Logic
that matters (checklist, day-first dates, upload with retry) is plain TypeScript
with unit tests; screens use the shared `api-client`, validation and tokens.

## Cross-cutting rules

- **Money:** integer kobo only; helpers in `@rideswithme/utilities`.
- **Text:** no hard-coded user-facing strings in apps; use the catalogues. The API
  returns error codes, not sentences.
- **Time:** store UTC `timestamptz`; format in the client's time zone (Africa/Lagos).
- **Secrets:** environment only, validated at startup, documented in
  `.env.example`.
- **Logs:** JSON to stdout with request id; never log tokens, codes, full ID
  numbers or document URLs.
- **Retries:** clients retry on network failure, so create endpoints take an
  `Idempotency-Key` (from Phase 3) and token refresh tolerates lost responses.

## Ride flow (Phase 3)

```
passenger app                    api                                         Redis / Postgres
 │ POST fares/estimate ────────► service area (PostGIS) → route (maps, cached) → fare engine per type
 │ ◄── options with quoteId, price breakdown, nearest-driver ETA                 fare_quotes
 │ POST rides (Idempotency-Key) ► snapshot the quote into the ride, status searching ─► rides, ride_events
dispatcher (every second, each API copy)
 │  scheduled due → searching; expire offers; give up after 3 min
 │  nearest fresh, online, eligible, free driver (Redis GEOSEARCH, 3→5→8 km) ─► ride_requests (15 s)
driver app
 │ GET offers/current (poll) ──► offer: pickup, trip, fare, earnings
 │ POST accept ────────────────► lock ride → conditional UPDATE (searching → driver_assigned)
 │ arrived → start (waiting charge) → complete (cash payment + commission owed)
```

- Pricing: `apps/api/src/pricing/fare-engine.ts` is a pure function of the rule and
  the route, unit-tested with hand-calculated values; everything is integer kobo.
- Maps: `MapsProvider` with a Google implementation (Places API (New), Geocoding,
  Routes) and an offline fake for development and tests.
- Every ride status change and offer is written to `ride_events`.
- Phase 3 apps poll; Phase 4 adds Socket.IO, background location and buffering.

## Mobile apps

Both Expo apps use `@rideswithme/mobile-core` (secure session, language, sign-in)
and `@rideswithme/ui-components/native`. `metro.workspace.js` makes workspace
packages use the app's own React, React Native and Expo modules, so each exists
once in the bundle. The passenger app is a full-screen map (react-native-maps)
with a draggable bottom sheet whose content follows the ride: where to → choose a
ride → searching → driver card → on trip → receipt.

## Planned shape of later phases

- **Real time (Phase 4):** Socket.IO with the Redis adapter so any API replica can
  reach any client; clients refetch ride state on reconnect; positions carry device
  and server timestamps and are shown as stale past a threshold.
- **Payments (Phase 5):** Paystack webhooks verified by signature are the source of
  truth; wallets are a double-entry ledger with balances derived from it.
