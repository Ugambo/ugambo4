# RideswithMe

Ride-hailing and bus booking for Nigeria: cars, taxis, Keke Napep, motorcycles and
bus seats, for passengers, drivers, admins and fleet operators.

**Status:** Phase 1 (foundation) is built: monorepo, database and migrations,
phone-OTP authentication, roles and permissions with admin two-factor
authentication, audit log, shared packages, Docker and CI. The mobile and web apps
start in Phase 2. See [documentation/PRD.md](documentation/PRD.md) for the plan.

## Requirements

- Node.js 22 (`.nvmrc`) and pnpm 10 (`corepack enable` sets it up)
- Docker, for PostgreSQL + PostGIS and Redis. Or install PostgreSQL 16 with
  PostGIS 3 and Redis 7 yourself.

## Run it locally

```bash
cd rideswithme
pnpm install
docker compose up -d postgres redis        # databases (creates rideswithme and rideswithme_test)

cp apps/api/.env.example apps/api/.env
# Fill in the secrets; each line in .env.example says how to generate it:
#   JWT_ACCESS_SECRET, OTP_PEPPER       openssl rand -hex 32
#   FIELD_ENCRYPTION_KEYS               echo "k1:$(openssl rand -base64 32)"

pnpm build
DATABASE_URL=postgres://rideswithme:rideswithme@localhost:5432/rideswithme pnpm db:migrate
pnpm dev:api                                # http://localhost:3000, reloads on change
```

Sign in from the command line. With `SMS_PROVIDER=console` the code appears in the
API log:

```bash
curl -X POST localhost:3000/v1/auth/otp/request -H 'Content-Type: application/json' \
  -d '{"phone":"0803 123 4567"}'
curl -X POST localhost:3000/v1/auth/otp/verify -H 'Content-Type: application/json' \
  -d '{"phone":"08031234567","code":"<from log>","acceptedPolicyVersion":"2026-11"}'
```

Create the first super admin (creates the account if needed), then sign in and set
up an authenticator app via `/v1/auth/mfa/totp/setup` and `/activate`:

```bash
pnpm --filter @rideswithme/api cli grant-role --phone 08031234567 --role super_admin
```

Whole stack in containers (migrations run first): `docker compose --profile app up --build`.

## Commands

Run from `rideswithme/`.

| Command                                              | What it does                                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm build`                                         | Build all packages and the API                                                                 |
| `pnpm test`                                          | Unit and integration tests (needs PostgreSQL + Redis; uses `rideswithme_test` and Redis db 15) |
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check` | Static checks (CI runs all of these)                                                           |
| `pnpm db:migrate` / `pnpm db:status`                 | Apply or list migrations (`DATABASE_URL`)                                                      |
| `pnpm dev:api`                                       | API with reload, reading `apps/api/.env`                                                       |

Tests use `TEST_DATABASE_URL` (default
`postgres://rwm:rwm@localhost:5432/rideswithme_test`) and `TEST_REDIS_URL` (default
`redis://localhost:6379/15`). With the compose databases, set
`TEST_DATABASE_URL=postgres://rideswithme:rideswithme@localhost:5432/rideswithme_test`.
The test database is wiped and rebuilt from migrations on every run.

## Layout

```
apps/            api (built); passenger-mobile, driver-mobile, passenger-web,
                 admin-dashboard, fleet-portal (later phases)
packages/        shared-types, validation, api-client, ui-components, utilities
infrastructure/  database (migrations + runner), docker, deployment
documentation/   PRD, ARCHITECTURE, DATABASE, API_DOCUMENTATION, DECISIONS
```

## Documentation

- [Product requirements and phases](documentation/PRD.md)
- [Architecture](documentation/ARCHITECTURE.md)
- [Database](documentation/DATABASE.md)
- [API](documentation/API_DOCUMENTATION.md)
- [Decisions and open questions](documentation/DECISIONS.md)
