# RideswithMe

Ride-hailing and bus booking for Nigeria: cars, taxis, Keke Napep, motorcycles and
bus seats, for passengers, drivers, admins and fleet operators.

**Status:** all eight phases are built and approved. What remains before going live needs accounts, keys and decisions from the business (see [documentation/LAUNCH.md](documentation/LAUNCH.md)):

- **Phase 1:** monorepo, database and migrations, phone-OTP sign-in, roles with
  admin two-factor authentication, audit log, Docker and CI.
- **Phase 2:** driver registration in the driver app, document upload to private
  storage, and the admin dashboard's verification queue.
- **Phase 3:** place search, fare estimates, booking (now or scheduled), matching
  to the nearest driver, the ride state machine and cash payment, in the passenger
  app and the driver app.
- **Phase 4:** live updates over Socket.IO, driver background location with an
  offline buffer on the phone, trip location history, "last updated" for old
  positions, and the passenger website (booking, live trip, receipts, history).
- **Phase 5:** a double-entry wallet ledger; Paystack (card and bank transfer) behind
  a provider interface with signed webhooks; wallet top-ups and saved cards; paying
  for rides by cash, wallet or card; commission on cash trips from the driver's
  wallet; driver withdrawals; refunds, fare disputes and chargebacks; a
  reconciliation job.
- **Phase 6:** the admin dashboard's overview (KPIs, 14-day revenue and trip charts),
  live map of drivers and rides, ride management with an event timeline and admin
  cancellation, user management, pricing, service areas drawn on a map, payments
  (wallets, refunds, payouts, disputes), roles and the audit log; fleet operators
  and the fleet portal, where a manager invites drivers (who accept in the driver
  app) and sees only their own fleet's drivers, vehicles, trips and earnings.
- **Phase 7:** bus operators (in the partner portal, the former fleet portal) list
  routes, seat layouts drawn on a grid, and departures with fares per seat class, see
  their passengers and check tickets in; passengers find a bus, choose seats on a seat
  map, pay by wallet, card or bank transfer, and board with a QR code, on the website
  and in the app; staff manage operators, their service fee and payments to them.

- **Phase 8:**
  - **Safety:** SOS on every trip, which alerts on-call staff by SMS, the
    admin dashboard live, and monitoring; live trip sharing by link;
    passenger–driver messages; problem reports.
  - **Engagement:** ratings both ways, support tickets, promotion codes, an
    in-app inbox and push notifications.
  - **Privacy:** account deletion (NDPA).
  - **Launch:** Prometheus metrics with alert rules and runbooks; optional
    Sentry; encrypted backups with restore checks; load tests; checks on every
    Hausa text, and an export for its review; EAS store build profiles. What
    is left before going live (accounts, keys, the Hausa review, the on-call
    rota) is in [documentation/LAUNCH.md](documentation/LAUNCH.md).

The phase plan is in [documentation/PRD.md](documentation/PRD.md).

## Requirements

- Node.js 22 (`.nvmrc`) and pnpm 10 (`corepack enable` sets it up)
- Docker, for PostgreSQL + PostGIS, Redis and S3-compatible storage. Or run
  PostgreSQL 16 with PostGIS 3, Redis 7 and any S3-compatible server yourself.
- For the driver app on a phone: an Android or iOS development build (see
  `apps/driver-mobile/README.md`).

## Run it locally

**Using VS Code?** Follow [documentation/RUN_IN_VSCODE.md](documentation/RUN_IN_VSCODE.md):
ready-made tasks start everything without typing commands, and
`pnpm setup:local` writes the `.env` files with fresh secrets. The commands
below are the same steps by hand.

```bash
cd rideswithme
pnpm install
docker compose up -d postgres redis s3     # databases and storage

cp apps/api/.env.example apps/api/.env
# Fill in the secrets; each line in .env.example says how to generate it:
#   JWT_ACCESS_SECRET, OTP_PEPPER, LOOKUP_HASH_SECRET   openssl rand -hex 32
#   FIELD_ENCRYPTION_KEYS                               echo "k1:$(openssl rand -base64 32)"
#   S3_* already point at the local storage on port 9000

pnpm build
DATABASE_URL=postgres://rideswithme:rideswithme@localhost:5432/rideswithme pnpm db:migrate
# A development city with PLACEHOLDER fares (Katsina city rectangle):
pnpm --filter @rideswithme/api cli seed-city --key katsina --name Katsina --bbox 7.52,12.93,7.68,13.06
pnpm dev:api                                # http://localhost:3000
```

### First admin and the admin dashboard

```bash
# Creates the account if needed; they then sign in with an SMS code and set up an authenticator app.
pnpm --filter @rideswithme/api cli grant-role --phone 08031234567 --role super_admin

cp apps/admin-dashboard/.env.example apps/admin-dashboard/.env.local   # set ADMIN_SESSION_SECRET
pnpm --filter @rideswithme/admin-dashboard dev                         # http://localhost:3001
```

With `SMS_PROVIDER=console` the sign-in code appears in the API log.

The live map loads map tiles from OpenStreetMap by default (`MAP_TILE_URL`); for
production use a tile provider you have an agreement with (see DECISIONS D-057).
For the live map's updates the browser connects to the API directly: set
`API_PUBLIC_URL` and add the dashboard's address to the API's `CORS_ORIGINS`.

### Partner portal (fleets and bus operators)

Staff create a fleet (Fleets → New fleet) or a bus operator (Buses → New bus
operator) in the admin dashboard with the manager's phone number. The manager then
signs in to the portal with an SMS code and sets up an authenticator app, as staff
do, and sees the fleet pages, the bus pages, or both.

```bash
cp apps/fleet-portal/.env.example apps/fleet-portal/.env.local   # set FLEET_SESSION_SECRET
pnpm --filter @rideswithme/fleet-portal dev                      # http://localhost:3003
```

### Payments in development

With `PAYMENT_PROVIDER=fake` (the default) no money moves: top-ups and saved cards
open a test checkout page on the API (`/v1/dev/fake-checkout/...`) with buttons to
pay, decline or cancel, and webhooks are simulated. For Paystack's test mode set
`PAYMENT_PROVIDER=paystack` and `PAYSTACK_SECRET_KEY` (a `sk_test_...` key), point
the Paystack dashboard's webhook URL at `<public API URL>/v1/webhooks/paystack`
(e.g. through a tunnel), and see `apps/api/.env.example` for the other settings.

### Passenger and driver apps

Both need a development build on a phone or emulator (see each app's README).
With `MAPS_PROVIDER=fake` the API offers demo places in Kano, Katsina, Abuja and
Lagos (search "Kurmi", "airport"…), and routes are straight-line estimates.

### Passenger website

```bash
cp apps/passenger-web/.env.example apps/passenger-web/.env.local   # set PASSENGER_SESSION_SECRET
pnpm --filter @rideswithme/passenger-web dev                       # http://localhost:3002
```

The API's `CORS_ORIGINS` must include the website's address for live updates
(the example `.env` already lists `http://localhost:3002`).

### Driver app

```bash
cp apps/driver-mobile/.env.example apps/driver-mobile/.env   # API address as seen from the phone
pnpm --filter @rideswithme/driver-mobile start               # needs a development build installed
```

### Everything in containers

`docker compose --profile app up --build` runs migrations, the API, the admin
dashboard, the passenger website and the fleet portal (create `apps/api/.env`,
`apps/admin-dashboard/.env.local`, `apps/passenger-web/.env.local` and
`apps/fleet-portal/.env.local` first).

## Commands

Run from `rideswithme/`.

| Command                                                 | What it does                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm build`                                            | Build all packages and apps                                            |
| `pnpm test`                                             | Unit and integration tests (needs PostgreSQL, Redis and S3; see below) |
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check`    | Static checks (CI runs all of these)                                   |
| `pnpm --filter @rideswithme/admin-dashboard e2e`        | Browser tests of the admin dashboard against a real API (build first)  |
| `pnpm --filter @rideswithme/passenger-web e2e`          | Browser tests of the passenger website: booking with live updates      |
| `pnpm --filter @rideswithme/fleet-portal e2e`           | Browser tests of the partner portal: fleets and bus operators          |
| `pnpm --filter @rideswithme/driver-mobile bundle:check` | Bundles the driver app for Android with Metro (same for passenger)     |
| `pnpm db:migrate` / `pnpm db:status`                    | Apply or list migrations (`DATABASE_URL`)                              |
| `pnpm --filter @rideswithme/load-tests load-test`       | Load test against a fresh local API (infrastructure/load-tests)        |
| `pnpm hausa:export`                                     | All English and Hausa text as a CSV for the Hausa reviewer             |
| `pnpm dev:api`                                          | API with reload, reading `apps/api/.env`                               |

Integration tests use `TEST_DATABASE_URL` (default
`postgres://rwm:rwm@localhost:5432/rideswithme_test`), `TEST_REDIS_URL` (default
`redis://localhost:6379/15`) and `TEST_S3_ENDPOINT` (default
`http://127.0.0.1:9000`). With the compose services, set
`TEST_DATABASE_URL=postgres://rideswithme:rideswithme@localhost:5432/rideswithme_test`.
The test database is wiped and rebuilt from migrations on every run. The website
end-to-end tests use `E2E_DATABASE_URL` (a database they drop and recreate; the
passenger website's tests add `_passenger` to its name, the fleet portal's
`_fleet`) and `E2E_REDIS_URL` in the same way.

## Layout

```
apps/            api, admin-dashboard, fleet-portal, driver-mobile, passenger-mobile,
                 passenger-web
packages/        shared-types, validation, api-client, ui-components, utilities, mobile-core,
                 web-core, e2e-support
infrastructure/  database (migrations, runner, backups), docker, deployment (monitoring),
                 load-tests
scripts/         hausa-review.mts
documentation/   PRD, ARCHITECTURE, DATABASE, API_DOCUMENTATION, DECISIONS, LAUNCH,
                 HAUSA_REVIEW
```

## Documentation

- [Product requirements and phases](documentation/PRD.md)
- [Architecture](documentation/ARCHITECTURE.md)
- [Database](documentation/DATABASE.md)
- [API](documentation/API_DOCUMENTATION.md)
- [Decisions and open questions](documentation/DECISIONS.md)
- [Launch: checklist, monitoring, runbooks, backups, store builds](documentation/LAUNCH.md)
- [Hausa review](documentation/HAUSA_REVIEW.md)
- [Running it in VS Code](documentation/RUN_IN_VSCODE.md)
