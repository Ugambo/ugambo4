# Architecture

## Components

```
 passenger-mobile ─┐                                   ┌─ PostgreSQL 16 + PostGIS
 driver-mobile ────┤   HTTPS (REST /v1)                │   (system of record)
 passenger-web ────┼──────────────────────►  api  ─────┤
 admin-dashboard ──┤   Socket.IO (Phase 4)  (NestJS)   ├─ Redis
 fleet-portal ─────┘                                   │   (OTP, rate limits, live positions, locks)
                                                       ├─ SMS gateway (Termii, behind SmsProvider)
                                                       ├─ Paystack (Phase 5)
                                                       ├─ Google Maps (Phase 3)
                                                       └─ S3-compatible storage, private (Phase 2)
```

One API process type, stateless, horizontally scalable. All durable state is in
PostgreSQL; Redis holds only data that can expire or be rebuilt.

## Monorepo

pnpm workspaces + Turborepo. `pnpm turbo run build` builds packages in dependency
order.

| Path                                                              | Purpose                                                          | State          |
| ----------------------------------------------------------------- | ---------------------------------------------------------------- | -------------- |
| `apps/api`                                                        | NestJS API                                                       | Phase 1 built  |
| `apps/passenger-mobile`, `apps/driver-mobile`                     | Expo apps (development builds)                                   | Phases 2–4     |
| `apps/passenger-web`, `apps/admin-dashboard`, `apps/fleet-portal` | Next.js apps                                                     | Phases 2, 3, 6 |
| `packages/shared-types`                                           | Response types, role/permission keys, error codes                | Built          |
| `packages/validation`                                             | zod request schemas, Nigerian phone normalisation                | Built          |
| `packages/api-client`                                             | Typed fetch client with token refresh                            | Built          |
| `packages/ui-components`                                          | Design tokens (colours, type, spacing, radius); components later | Tokens built   |
| `packages/utilities`                                              | Money in kobo, English/Hausa message catalogues                  | Built          |
| `infrastructure/database`                                         | SQL migrations and migration runner                              | Built          |
| `infrastructure/docker`                                           | API/migration image, Postgres init                               | Built          |
| `infrastructure/deployment`                                       | Production deployment                                            | Phase 8        |

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

## Planned shape of later phases

- **Matching (Phase 3):** nearby drivers from Redis `GEOSEARCH`, filtered by
  category, online state and service area; acceptance is a single conditional
  `UPDATE rides … WHERE status = 'searching'` so two drivers can never win.
- **Real time (Phase 4):** Socket.IO with the Redis adapter so any API replica can
  reach any client; clients refetch ride state on reconnect; positions carry device
  and server timestamps and are shown as stale past a threshold.
- **Payments (Phase 5):** Paystack webhooks verified by signature are the source of
  truth; wallets are a double-entry ledger with balances derived from it.
