# Architecture

## Components

```
 passenger-mobile ─┐                                         ┌─ PostgreSQL 16 + PostGIS
 driver-mobile ────┤   HTTPS (REST /v1)                      │   (system of record)
 passenger-web ────┼────────────────────────────►  api  ─────┤
                   │   Socket.IO /realtime        (NestJS)   ├─ Redis
                   │                                 ▲       │   (OTP, rate limits, live positions, locks)
 admin browser ──► admin-dashboard server ───────────┤       ├─ SMS gateway (Termii, behind SmsProvider)
 fleet browser ──► fleet-portal server ──────────────┤       ├─ Paystack (payments, transfers, webhooks)
 passenger browser ► passenger-web server ───────────┘       │
                   (Next.js; hold the user's tokens;         │
                    browsers open Socket.IO with a ticket)   │
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
| `apps/api`                  | NestJS API                                                                      | Phases 1-5 built                      |
| `apps/admin-dashboard`      | Next.js admin dashboard (driver verification so far)                            | Phase 2 built; full dashboard Phase 6 |
| `apps/driver-mobile`        | Expo driver app: onboarding, requests, trips, background location               | Phases 2-4 built                      |
| `apps/passenger-mobile`     | Expo passenger app: map, booking, live trip, receipts                           | Phases 3-4 built                      |
| `apps/passenger-web`        | Next.js passenger website: booking, live trip, receipts, history                | Phase 4 built                         |
| `apps/fleet-portal`         | Next.js fleet portal                                                            | Phase 6                               |
| `packages/shared-types`     | Response types, role/permission keys, error codes, driver types                 | Built                                 |
| `packages/validation`       | zod request schemas, Nigerian phone, NIN, plate, NUBAN                          | Built                                 |
| `packages/api-client`       | Typed fetch client with token refresh; Socket.IO client at `/realtime`          | Built                                 |
| `packages/ui-components`    | Design tokens; React Native components at `/native`; base web CSS at `/web.css` | Built                                 |
| `packages/mobile-core`      | Mobile session (secure storage), language, sign-in, formatting                  | Built                                 |
| `packages/web-core`         | Websites' server session and API proxy; browser helpers at `/client`            | Built                                 |
| `packages/e2e-support`      | Starts the API and websites for browser tests                                   | Built                                 |
| `packages/utilities`        | Money in kobo, message catalogues, passenger ride rules and ride text           | Built                                 |
| `infrastructure/database`   | SQL migrations and migration runner                                             | Built                                 |
| `infrastructure/docker`     | API, migration, admin dashboard and passenger website images; Postgres init     | Built                                 |
| `infrastructure/deployment` | Production deployment                                                           | Phase 8                               |

Dependency rule: apps depend on packages; packages never depend on apps;
`shared-types` depends on nothing.

## API structure (`apps/api/src`)

| Module     | Responsibility                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config`   | Reads and validates every environment variable at startup (zod); refuses to start on bad config                                                         |
| `database` | Kysely over a `pg` pool; table types in `types.ts`                                                                                                      |
| `redis`    | ioredis client                                                                                                                                          |
| `common`   | Error type and filter, zod pipe, rate limiter, field encryption, request context, cursors                                                               |
| `sms`      | `SmsProvider` interface; console and Termii implementations                                                                                             |
| `audit`    | Writes `audit_logs` rows, inside the caller's transaction when given one                                                                                |
| `auth`     | OTP, sessions and refresh rotation, JWTs, TOTP, global guards                                                                                           |
| `users`    | Current-user profile; role/permission loading                                                                                                           |
| `admin`    | User search, roles, suspension, audit log reading                                                                                                       |
| `health`   | Liveness and readiness                                                                                                                                  |
| `storage`  | Private S3-compatible storage: presigned uploads with content checks, short-lived view links                                                            |
| `drivers`  | Driver applications, documents, eligibility, admin review                                                                                               |
| `maps`     | `MapsProvider` (Google, or an offline fake): place search, details, reverse geocoding, routes                                                           |
| `pricing`  | Service areas, fare rules, the fare engine and quotes                                                                                                   |
| `rides`    | Booking, matching and dispatch, the ride state machine, cash completion, driver presence, location ingestion and history, partition upkeep              |
| `realtime` | Socket.IO gateway, notifier, connection authentication and session sweep                                                                                |
| `payments` | Ledger, payment provider (Paystack or fake), webhooks, top-ups and cards, ride payments, payouts, refunds, disputes, reconciliation, admin payment APIs |

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

## Mobile apps

Both Expo apps use `@rideswithme/mobile-core` (secure session, language, sign-in)
and `@rideswithme/ui-components/native`. `metro.workspace.js` makes workspace
packages use the app's own React, React Native and Expo modules, so each exists
once in the bundle. The passenger app is a full-screen map (react-native-maps)
with a draggable bottom sheet whose content follows the ride: where to → choose a
ride → searching → driver card → on trip → receipt.

## Live updates and location (Phase 4)

```
driver app ── background location (10 s / 20 m) ─► SQLite buffer ─► POST /v1/driver/location (batches of 200)
                                                                      │  or location:update over the socket
api ── presence (Redis: position, geo index) ─► driver:position ─► passenger (app or website)
    └─ trip_locations (by phone time, to the ride active then; daily partitions, 90 days)
ride or offer change ─► database commit ─► Redis adapter ─► every API copy ─► user and ride rooms
client reconnects ─► refetches state (events are not replayed); 30 s fallback check
```

- `apps/api/src/realtime`: the gateway (authentication, rooms, `location:update`),
  the notifier other modules call after a change commits, and a sweep that closes
  connections whose session has ended.
- Mobile apps connect with their access token; websites with a 60-second ticket
  from their own server, so browsers never hold API tokens.
- See DECISIONS D-040 to D-046.

## Websites

`admin-dashboard`, `fleet-portal` and `passenger-web` share `@rideswithme/web-core`: the browser
calls only the website's server, which holds the API tokens in an encrypted
httpOnly cookie, refreshes them, and forwards an allow-list of API paths. Pages
are client components using the shared typed API client. Each request gets a
nonce-based Content-Security-Policy.

## Payments (Phase 5)

```
passenger / driver ── POST checkout ──► api ── initialize ──► Paystack (or fake)
        │                                                        │
        └── pays on the provider's page ◄── checkoutUrl ──────────┘
Paystack ── signed webhook ──► /v1/webhooks/paystack ── stored once ──► apply (ledger journal)
app returns ── GET /v1/payments/:id?refresh=1 ──► api asks the provider (server to server)

ride booked (wallet)  ─► hold: passenger wallet → ride_holds
ride completed        ─► cash: driver wallet → platform_revenue (booking fee + commission)
                         wallet: ride_holds (+ wallet) → driver wallet + platform_revenue
                         card: passenger_receivables → driver wallet + platform_revenue;
                               then charge the card: Paystack → passenger_receivables
payout                ─► driver wallet → payouts_in_transit → (transfer succeeds) Paystack
reconciliation job    ─► pending payments/payouts checked with the provider, holds released,
                         every wallet's balance checked against its lines
```

- `apps/api/src/payments`: `LedgerService` is the only way code moves money; the
  database enforces the rules (DECISIONS D-047). `PaymentProvider` has Paystack
  and fake implementations. `RidePaymentsService` runs inside the ride's own
  transaction, so a ride's status and its money always change together.
- The apps open the provider's page (website: a redirect; phone apps: the system
  browser through `runCheckout` in `@rideswithme/mobile-core`) and then ask the API
  for the outcome. How a ride was paid is described by one shared rule
  (`paymentSummary` in `@rideswithme/utilities`).

## Admin and fleet (Phase 6)

```
admin browser ── pages ──► admin-dashboard server ── /api/proxy (allow-list) ──► api /v1/admin/*
      │                                                                         ▲
      └── Socket.IO (ticket) ── ops:subscribe ── ops:ride / ops:driver ─────────┘
      └── map tiles ──► MAP_TILE_URL (OpenStreetMap by default)

fleet browser ── pages ──► fleet-portal server ── /api/proxy (/v1/fleet/* only) ──► api /v1/fleet/*
                                                                    FleetsService.scope(manager)
driver app ── accept invitation ──► api /v1/driver/fleet-invitations/:id/accept
```

- **Admin dashboard:** left sidebar (items shown by permission), KPI cards and
  charts on the overview, tables with search and filters. Each page calls the
  admin APIs through the dashboard's proxy. The live map is the only page with its
  own connection to the API (a short-lived realtime ticket, then the `ops` room).
  Maps use Leaflet; charts are plain SVG components with a table view.
- **Fleets:** `apps/api/src/fleets`. Every portal call first resolves the caller's
  fleet (`scope`), and every query is written against that fleet id; trips are
  joined to memberships by time, so a fleet never sees a driver's trips outside
  their membership. The portal's proxy forwards only sign-in, session and
  `/v1/fleet/*` paths, so even a mistake in a page cannot reach staff endpoints.
- **Shared code:** staff sign-in (SMS code, authenticator set-up and check) is in
  `@rideswithme/web-core` for both staff websites; browser-test helpers (sign-in,
  driver applications, rides) are in `@rideswithme/e2e-support`.

## Buses (Phase 7)

```
operator manager ── partner portal ── /v1/operator/* ── routes, layouts, departures, check-in
passenger ── app / website ── /v1/bus/search → departures/:id (seat map)
          → POST bookings (hold, locks the departure) → pay (wallet | saved card | checkout)
paid      ─► passenger wallet / Paystack → operator account (fare − fee) + platform_revenue (fee)
cancelled ─► operator account + platform_revenue → passenger wallet
staff     ── admin dashboard ── /v1/admin/bus-* ── fees, settlements, cancellations, lookups
```

- `apps/api/src/buses`: `CatalogService` (routes, layouts, departures, search, seat
  maps), `BookingsService` (holds, payment, cancellations, the hold sweep, check-in)
  and `OperatorsService` (staff management, the operator scope, statements). Every
  seat change locks the departure row first; the partial unique index on active seats
  is the backstop (DECISIONS D-064).
- Card payments for bus tickets settle through the same `PaymentsService.applyCharge`
  as everything else; the bus module registers a handler that confirms the booking or,
  if its seats are gone, credits the passenger's wallet.
- The seat map (`SeatMap`) and QR image (`QrImage`) are shared web components in
  `@rideswithme/web-core`; the app has its own native versions.

## Safety, engagement and launch (Phase 8)

```
SOS press ── POST /v1/sos ──► emergency_alerts (one per 30 minutes)
                          ├─► SMS to SOS_ALERT_PHONES (at most every 5 minutes)
                          ├─► sos:alert to the ops room ──► admin banner and SOS panel
                          └─► /metrics: oldest unacknowledged ──► Prometheus ──► page after 2 minutes
ride change ── RealtimeNotifier ──► socket + NotificationsService (inbox, Expo push, SMS)
booking with a code ── PromotionsService.reserve (row lock) ──► completion: used, ledger lines
                                                         └─► cancel or no driver: released
```

API modules:

- **`apps/api/src/safety`**, linked by `ride-access.ts` (who may see a ride):
  - `SosService`
  - `TripShareService`, with the public `/v1/share/:token`
  - `RideMessagesService`
  - `IncidentsService`
- **`apps/api/src/engagement`**: `RatingsService` (running sums on `users`) and
  `SupportService`.
- **`apps/api/src/promotions`**:
  - discounts are pure functions in `discount.ts`, unit-tested
  - checked in pricing, reserved in booking, used or released in
    `RidePaymentsService` and the dispatcher
- **`apps/api/src/notifications`**:
  - a global module; `notify()` never throws
  - templates in English and Hausa
  - `PushProvider`: Expo, or a logging provider
- **`apps/api/src/privacy`**: `DeletionService`, a periodic sweep under a Redis
  lock, so only one replica erases at a time.
- **`apps/api/src/observability`**:
  - `MetricsService` (prom-client registry, business gauges read at scrape time)
  - `MetricsInterceptor` (request histogram by route pattern)
  - the token-guarded `/metrics`
  - `error-tracking.ts` (optional Sentry, with request data removed)

Apps:

- **Shared UI:**
  - mobile: `SosButton`, `RideChat` and `RateForm` in
    `@rideswithme/mobile-core`, with push registration
  - web: SOS, sharing, chat, rating and problem-report components in the
    passenger website
  - admin: the SOS banner in the dashboard shell
- **Driver app:** explains background location before the system prompt.

Operations tooling:

- **Backups:** `infrastructure/database/src/backup.ts`, run by the `backup` image.
- **Monitoring:** `infrastructure/deployment/monitoring/`.
- **Load tests:** `infrastructure/load-tests/`.
- **Hausa:** `scripts/hausa-review.mts` and `checkCatalog` in
  `@rideswithme/utilities`.

The whole runbook is `documentation/LAUNCH.md`.
