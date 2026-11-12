# Decisions

Choices made where the brief was silent, open, or needed adjusting. Newest at the
bottom. Each entry says what was decided, why, and how to change it.

## Problems found in the brief

These need your answer or awareness. Work continues on the stated assumption.

| #   | Issue                                                                                                                                                                                    | What I did / propose                                                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-1 | The brief says "an empty repository", but `ugambo/ugambo4` already contains the Explore Katsina WordPress project.                                                                       | Built RideswithMe in `rideswithme/` (the root folder name the brief uses) and left Explore Katsina untouched. Moving it to its own repository later is a folder copy; CI already only runs on `rideswithme/**` changes.                                           |
| B-2 | Section 2 refers to the phases as section 14 and the open decisions as section 15. They are sections 15 and 16 (14 is UI direction).                                                     | Assumed the obvious intent.                                                                                                                                                                                                                                       |
| B-3 | "Masked calling" needs a voice/telephony provider (number proxying). None is in the stack.                                                                                               | Proposal: a `VoiceProxyProvider` interface like the SMS one, with a vendor chosen before Phase 3 call buttons ship. Until then the call button can be hidden by configuration. **Needs a vendor decision.**                                                       |
| B-4 | Email is collected at registration but there is no email provider in the stack, so addresses cannot be verified.                                                                         | Email is stored and marked unverified (`email_verified_at` is null). Verification needs a transactional email vendor. **Needs a vendor decision** (any SMTP or API vendor; behind an interface).                                                                  |
| B-5 | 99.9% availability (about 8.7 hours of downtime a year, maintenance included) is not realistic on a single VPS with Docker: one host failure or one OS upgrade can use most of it.       | For launch, either (a) two API hosts behind a load balancer plus managed PostgreSQL with point-in-time recovery, or (b) accept a lower target (99.5%) for the single-VPS launch. Decide before Phase 8. The API is already stateless so (a) needs no code change. |
| B-6 | Bus seats: "unique constraint on schedule + seat" plus holds that expire. A plain unique constraint would block re-selling a seat whose hold expired or whose booking was cancelled.     | Phase 7 will use a partial unique index over active rows (held or confirmed), with expired holds moved to `expired` by a job and re-checked under a row lock at payment time. Same guarantee, seats become sellable again.                                        |
| B-7 | Hausa uses ƙ, ɗ and ɓ, which force SMS into UCS-2 encoding: 70 characters per segment instead of 160. The Hausa OTP message is two segments, roughly double the cost of the English one. | Kept correct spelling. Alternatives: shorten the Hausa message to fit one UCS-2 segment, or send OTP SMS in English for everyone. **Your call.**                                                                                                                  |

## Decision log

### D-001 Repository location

See B-1. The monorepo root is `rideswithme/`. All commands in the README run from there.

### D-002 TypeScript 5.9, not 7

`pnpm add typescript` now installs TypeScript 7 (the Go-native compiler). NestJS's
decorator metadata, typescript-eslint and the SWC test transform target the 5.x
toolchain, so it is pinned to `~5.9.3`. Revisit once those support 7.

### D-003 Kysely and hand-written SQL migrations, not an ORM

The data model leans on PostgreSQL features ORMs handle poorly: PostGIS geography
columns and spatial indexes, date-partitioned `trip_locations`, partial unique
indexes (bus seats), single-statement conditional updates for ride acceptance, and
append-only triggers. Migrations are plain `.sql` files in
`infrastructure/database/migrations`, as the brief asks. Kysely gives typed queries
over them without hiding the SQL. Table types live in `apps/api/src/database/types.ts`
and must be updated with each migration.

### D-004 Migrations are forward-only, checksummed and locked

A migration that has been applied cannot be edited (its SHA-256 is stored); fix
mistakes with a new migration. A PostgreSQL advisory lock stops two runners
applying migrations at once. Each file runs in a transaction unless it starts with
`-- migrate:no-transaction` (needed for `CREATE INDEX CONCURRENTLY`).

### D-005 Shared validation with zod

Request schemas live in `packages/validation` and are used by the API (through
`ZodValidationPipe`) and will be used by the apps' forms, so client and server
agree. Unknown fields are rejected (`.strict()`), so clients cannot set fields
like `status` or `roles`.

### D-006 Shared packages compile to CommonJS with `tsc`

Simplest output for NestJS, and loadable by Next.js and Metro. If a web or mobile
app needs ES modules for tree-shaking, add an ESM build then (Phase 2/3). Turbo
builds dependencies first.

### D-007 Nigerian mobile numbers only

Accepted: `+234` followed by 70x/71x/80x/81x/90x/91x numbers, in any common typed
form (`0803…`, `803…`, `234803…`, `+234 (0) 803…`). Foreign numbers are rejected.
If diaspora visitors need accounts, widen `phoneSchema` and add per-country SMS
routing.

### D-008 One-time codes

6 digits from a CSPRNG, stored only in Redis as HMAC-SHA256(pepper, phone:code),
5-minute expiry, single use. Check-and-consume is one atomic Redis script, so
parallel requests cannot both use a code (a concurrency test caught exactly this).
Limits (all configurable): 60 s resend cooldown, 5 codes per phone per hour,
20 per IP per hour, 5 wrong guesses per code, 60 verify attempts per IP per
10 minutes. A failed SMS send still counts toward hourly limits but clears the
cooldown so the person can retry at once. The request endpoint responds the same
whether or not the number has an account.

### D-009 Tokens and sessions

- Access token: HS256 JWT, 15 minutes, carrying only user id and session id.
- Refresh token: opaque `<sessionId>.<32 random bytes>`; only its SHA-256 is stored.
  Rotated on every use.
- Reuse detection: presenting an already-rotated token revokes the session and
  writes an audit entry (a stolen token was used).
- Grace window (60 s, configurable): on poor mobile networks a refresh response is
  often lost and the app retries with the old token. Within 60 s of rotation that
  retry is accepted once more and rotates again; the lost token dies. The window
  is not extended by repeated retries. Trade-off: a thief using a stolen token in
  that 60 s window is not detected.
- Sessions expire after 30 days unused or 90 days in total.
- The API client refreshes once for many simultaneous 401s, and keeps tokens when
  a refresh fails for lack of network (so an offline driver is not signed out).

### D-010 Permissions are read from the database on every request

Not embedded in the JWT, so role removal, suspension and logout take effect on
the next request rather than when the token expires. Cost: two indexed queries
per authenticated HTTP request. If this shows up in profiling, cache per session
in Redis and invalidate on role/status changes. Socket connections (Phase 4) will
authenticate at connect time and be dropped on revocation.

### D-011 Two-factor authentication

TOTP (RFC 6238; Google Authenticator, Authy, Microsoft Authenticator). Required for
roles marked `requires_mfa`: fleet_manager, support_agent, admin, super_admin.

- Verification is per session and lasts 12 hours (configurable).
- It is enforced on every permission-protected route; the same person can still
  use passenger features without it.
- Each 30-second code is accepted once (replay protection).
- 5 attempts per 15 minutes per user.
- Lost phone: `pnpm --filter @rideswithme/api cli reset-mfa --phone …` clears TOTP
  and signs the user out everywhere (audited). Recovery codes and an admin UI for
  this come with the dashboard (Phase 6).

### D-012 Privileged roles

support_agent, admin and super_admin are privileged. Granting or removing them, and
suspending anyone who holds one, needs `roles.assign_privileged` (super_admin
only). An admin cannot suspend themselves. The last active super admin can be
neither demoted nor suspended; concurrent attempts are serialised with a row lock.
The first super admin is created from the command line (see README).

### D-013 Consent (NDPA)

Sign-in requires the client to send the current terms/privacy version
(`CURRENT_POLICY_VERSION`). Each accepted version is recorded with time, IP and
device. Bumping the version makes every user accept the new one at next sign-in.
Data export and deletion requests are Phase 8; accounts will be anonymised (phone
and personal fields cleared, status `deleted`) rather than hard-deleted, so
financial and audit records keep their references.

### D-014 Audit log is append-only

A trigger rejects UPDATE and DELETE on `audit_logs`. TRUNCATE is not blocked by
row triggers, so in production the application's database role must not own the
table or hold TRUNCATE on it (separate migration and app roles: Phase 8).

### D-015 Field encryption

AES-256-GCM with a key id in each value, so keys can be rotated. The column and
row are bound as authenticated data, so a ciphertext copied to another row fails
to decrypt. Keys come from the environment now; moving them to a cloud KMS is a
Phase 8 option.

### D-016 SMS vendor

Behind `SmsProvider`. Implemented: `console` (development only; refused in
production) and `termii` (a common Nigerian gateway, using its DND channel so
numbers on the Do-Not-Disturb register still get codes). The Termii adapter is
unit-tested against its documented request format but **has not been run against
the live API**; do that with a real key and approved sender ID before launch.

### D-017 Translations

Message catalogues live in `packages/utilities` because the API needs them too (SMS
text). The API returns error codes; apps translate them. Hausa uses the polite
plural "ku" forms, which avoid assuming the reader's gender. **All Hausa strings
need review by a native speaker before launch.** A test fails if any key or
placeholder is missing in Hausa.

### D-018 Money

Integer kobo everywhere; percentages in basis points (20% = 2000); BigInt
arithmetic inside helpers; half-up rounding to the nearest kobo. Commission
rounding direction (whether the driver or the platform gets the half kobo) is
confirmed in Phase 3 with the fare engine.

### D-019 Testing

Vitest with SWC (keeps NestJS decorator metadata). API tests are integration
tests against real PostgreSQL + PostGIS and Redis, not mocks, because the
guarantees that matter (single-use codes, refresh rotation under concurrency,
last-super-admin locking, append-only audit) live in the database and Redis.

### D-020 Error format

Every error is `{ "error": { "code", "message", "details"?, "retryAfterSeconds"? }, "requestId" }`.
Codes are listed in `packages/shared-types/src/errors.ts`; clients translate codes,
not messages. Rate-limit responses also set `Retry-After`.

### D-021 Idempotency keys arrive with the first create endpoints

Phase 1 has no money or booking creates. The API client already supports an
`Idempotency-Key` header; the server side (stored key + response, 24 h) comes in
Phase 3 with ride requests.

### D-022 Open decisions: defaults adopted

1. Launch area: one city, as a service-area polygon (Phase 3/6).
2. Vehicle types: car and Keke Napep enabled; others behind configuration.
3. Commission: percentage per vehicle category (basis points).
4. Payments: cash first; wallet and Paystack in Phase 5.
5. Buses: third-party operators list their routes; RideswithMe takes a service fee.

No Phase 1 code depends on these yet.
