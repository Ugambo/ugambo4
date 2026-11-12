# RideswithMe

Ride-hailing and bus booking for Nigeria: cars, taxis, Keke Napep, motorcycles and
bus seats, for passengers, drivers, admins and fleet operators.

**Status:** Phase 4 (real-time tracking) is built and awaiting approval:

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

The phase plan is in [documentation/PRD.md](documentation/PRD.md).

## Requirements

- Node.js 22 (`.nvmrc`) and pnpm 10 (`corepack enable` sets it up)
- Docker, for PostgreSQL + PostGIS, Redis and S3-compatible storage. Or run
  PostgreSQL 16 with PostGIS 3, Redis 7 and any S3-compatible server yourself.
- For the driver app on a phone: an Android or iOS development build (see
  `apps/driver-mobile/README.md`).

## Run it locally

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
# A development city with PLACEHOLDER fares (Kano rectangle):
pnpm --filter @rideswithme/api cli seed-city --key kano --name Kano --bbox 8.40,11.90,8.62,12.10
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
dashboard and the passenger website (create `apps/api/.env`,
`apps/admin-dashboard/.env.local` and `apps/passenger-web/.env.local` first).

## Commands

Run from `rideswithme/`.

| Command                                                 | What it does                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm build`                                            | Build all packages and apps                                            |
| `pnpm test`                                             | Unit and integration tests (needs PostgreSQL, Redis and S3; see below) |
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check`    | Static checks (CI runs all of these)                                   |
| `pnpm --filter @rideswithme/admin-dashboard e2e`        | Browser tests of the admin dashboard against a real API (build first)  |
| `pnpm --filter @rideswithme/passenger-web e2e`          | Browser tests of the passenger website: booking with live updates      |
| `pnpm --filter @rideswithme/driver-mobile bundle:check` | Bundles the driver app for Android with Metro (same for passenger)     |
| `pnpm db:migrate` / `pnpm db:status`                    | Apply or list migrations (`DATABASE_URL`)                              |
| `pnpm dev:api`                                          | API with reload, reading `apps/api/.env`                               |

Integration tests use `TEST_DATABASE_URL` (default
`postgres://rwm:rwm@localhost:5432/rideswithme_test`), `TEST_REDIS_URL` (default
`redis://localhost:6379/15`) and `TEST_S3_ENDPOINT` (default
`http://127.0.0.1:9000`). With the compose services, set
`TEST_DATABASE_URL=postgres://rideswithme:rideswithme@localhost:5432/rideswithme_test`.
The test database is wiped and rebuilt from migrations on every run. The website
end-to-end tests use `E2E_DATABASE_URL` (a database they drop and recreate; the
passenger website's tests add `_passenger` to its name) and `E2E_REDIS_URL` in the
same way.

## Layout

```
apps/            api, admin-dashboard, driver-mobile, passenger-mobile, passenger-web (built);
                 fleet-portal (Phase 6)
packages/        shared-types, validation, api-client, ui-components, utilities, mobile-core,
                 web-core, e2e-support
infrastructure/  database (migrations + runner), docker, deployment
documentation/   PRD, ARCHITECTURE, DATABASE, API_DOCUMENTATION, DECISIONS
```

## Documentation

- [Product requirements and phases](documentation/PRD.md)
- [Architecture](documentation/ARCHITECTURE.md)
- [Database](documentation/DATABASE.md)
- [API](documentation/API_DOCUMENTATION.md)
- [Decisions and open questions](documentation/DECISIONS.md)
