# Decisions

Choices made where the brief was silent, open, or needed adjusting. Newest at the
bottom. Each entry says what was decided, why, and how to change it.

## Problems found in the brief

These need your answer or awareness. Work continues on the stated assumption.

| #    | Issue                                                                                                                                                                                                                                                         | What I did / propose                                                                                                                                                                                                                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-1  | The brief says "an empty repository", but `ugambo/ugambo4` already contains the Explore Katsina WordPress project.                                                                                                                                            | Built RideswithMe in `rideswithme/` (the root folder name the brief uses) and left Explore Katsina untouched. Moving it to its own repository later is a folder copy; CI already only runs on `rideswithme/**` changes.                                                                                                                                   |
| B-2  | Section 2 refers to the phases as section 14 and the open decisions as section 15. They are sections 15 and 16 (14 is UI direction).                                                                                                                          | Assumed the obvious intent.                                                                                                                                                                                                                                                                                                                               |
| B-3  | "Masked calling" needs a voice/telephony provider (number proxying). None is in the stack.                                                                                                                                                                    | Proposal: a `VoiceProxyProvider` interface like the SMS one, with a vendor chosen before Phase 3 call buttons ship. Until then the call button can be hidden by configuration. **Needs a vendor decision.**                                                                                                                                               |
| B-4  | Email is collected at registration but there is no email provider in the stack, so addresses cannot be verified.                                                                                                                                              | Email is stored and marked unverified (`email_verified_at` is null). Verification needs a transactional email vendor. **Needs a vendor decision** (any SMTP or API vendor; behind an interface).                                                                                                                                                          |
| B-5  | 99.9% availability (about 8.7 hours of downtime a year, maintenance included) is not realistic on a single VPS with Docker: one host failure or one OS upgrade can use most of it.                                                                            | For launch, either (a) two API hosts behind a load balancer plus managed PostgreSQL with point-in-time recovery, or (b) accept a lower target (99.5%) for the single-VPS launch. Decide before Phase 8. The API is already stateless so (a) needs no code change.                                                                                         |
| B-6  | Bus seats: "unique constraint on schedule + seat" plus holds that expire. A plain unique constraint would block re-selling a seat whose hold expired or whose booking was cancelled.                                                                          | Phase 7 will use a partial unique index over active rows (held or confirmed), with expired holds moved to `expired` by a job and re-checked under a row lock at payment time. Same guarantee, seats become sellable again.                                                                                                                                |
| B-7  | Hausa uses ƙ, ɗ and ɓ, which force SMS into UCS-2 encoding: 70 characters per segment instead of 160. The Hausa OTP message is two segments, roughly double the cost of the English one.                                                                      | Kept correct spelling. Alternatives: shorten the Hausa message to fit one UCS-2 segment, or send OTP SMS in English for everyone. **Your call.**                                                                                                                                                                                                          |
| B-8  | The payout form needs the full list of Nigerian banks and fintech accounts (OPay, Moniepoint, PalmPay, Kuda and others that many drivers use), with their codes, and a check that the account name matches. Neither exists until Paystack arrives in Phase 5. | Phase 2 offers 15 major banks (placeholder list in the driver app) and stores what the driver types. Phase 5 replaces the list with Paystack's bank list and verifies the account name before any payout.                                                                                                                                                 |
| B-9  | Nothing in the stack verifies a NIN against NIMC records. Reviewers can only compare the number with the NIN slip by eye.                                                                                                                                     | Proposal: an identity-verification vendor (e.g. Prembly/IdentityPass, Smile ID, VerifyMe, Dojah) behind an interface, checking NIN, name, photo and licence before approval. **Needs a vendor decision**; can be added any time before launch.                                                                                                            |
| B-10 | Which documents each vehicle type needs is not in the brief (and some permits differ by state).                                                                                                                                                               | Defaults in DECISIONS D-026, editable as data. **Please confirm or correct them**, especially for Keke Napep and motorcycles in the launch city.                                                                                                                                                                                                          |
| B-11 | CI has not run on GitHub yet: the first run failed within 3 seconds with no logs, which means GitHub never gave it a runner (an account setting, e.g. Actions billing or spending limit, or Actions disabled for this private repository).                    | Check the run at github.com/Ugambo/ugambo4/actions. Everything CI runs also ran locally before each commit.                                                                                                                                                                                                                                               |
| B-12 | Real maps need Google Maps Platform keys: a server key (Places API (New), Geocoding, Routes) and an Android Maps SDK key for the passenger app's map. None is configured.                                                                                     | Development and tests use an offline fake (demo places, straight-line routes). **Please create the two keys** (restricted by API and by server IP / app signature); they go in `GOOGLE_MAPS_API_KEY` and `GOOGLE_MAPS_ANDROID_API_KEY`. The Google adapter is unit-tested but has not been called live.                                                   |
| B-13 | Fare values are not in the brief.                                                                                                                                                                                                                             | Placeholder fares are seeded for every vehicle type (D-034). **Please supply real base, per-km, per-minute, minimum, booking, waiting and cancellation fees and commission per vehicle type** before launch.                                                                                                                                              |
| B-14 | The launch city's boundary is needed as a polygon.                                                                                                                                                                                                            | `seed-city` creates a rectangle for development. For launch, send the boundary (GeoJSON, or draw it in Phase 6's admin map) and it is loaded through `PUT /v1/admin/service-areas`.                                                                                                                                                                       |
| B-15 | Passenger web booking (brief section 5) was planned for Phase 3.                                                                                                                                                                                              | Moved to Phase 4: its trip screens need the live updates Phase 4 adds, and building them on polling first would mean writing them twice. Mobile booking is complete in Phase 3.                                                                                                                                                                           |
| B-16 | The brief asks for Google Maps; the passenger website needs a browser Maps JavaScript key, which is separate from the server key.                                                                                                                             | Until one is supplied, the website draws a to-scale route sketch (pickup, destination, route, driver) instead of a street map. Adding the map later changes one component. Please provide a browser key restricted to the website's domain.                                                                                                               |
| B-17 | Holding passengers' money in a wallet is regulated in Nigeria (CBN rules on stored value and e-money).                                                                                                                                                        | The wallet is built (as the brief asks) with a balance limit like a tier-1 account (₦300,000, `WALLET_MAX_BALANCE_KOBO`), no cash-out for passengers, and a full ledger. **Before launch, confirm with a lawyer whether RideswithMe needs a licence or a licensed partner (e.g. holding the funds through Paystack or a bank) and what KYC tiers apply.** |
| B-18 | The brief does not say who pays Paystack's fees (1.5% + ₦100 per card payment, ₦10–₦50 per transfer).                                                                                                                                                         | The platform absorbs them: wallets are credited the full amount paid and drivers receive the full payout; fees are recorded in their own account (`provider_fees`) so their cost is visible. Passing fees on would be a change to the top-up and payout amounts. Please confirm.                                                                          |
| B-19 | Who receives a cancellation fee is not in the brief.                                                                                                                                                                                                          | The driver who was on the way, less the platform's commission at the ride's rate (the same split as a fare). Please confirm, or say if the platform should keep it all.                                                                                                                                                                                   |

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

### D-023 Driver documents: direct uploads to private storage

- The app asks the API for an upload; the API records it (`file_uploads`) and
  returns a signed PUT URL valid for 10 minutes, bound to the declared type and
  exact size. The phone uploads straight to storage (no file passes through the
  API, which keeps the API light and lets uploads go as fast as the connection
  allows).
- When the app attaches the upload, the API checks the object exists, its size
  matches, it is at most 10 MB, and its first bytes really are JPEG, PNG or PDF.
  The type the phone declared is not trusted. HTML or programs renamed as images
  are refused.
- Only uploads the user was given can be attached, each only once.
- Object keys are `driver-documents/<user id>/<type>/<random uuid>`: no names or
  numbers in keys or URLs.
- The bucket is private. Storage encrypts every object at rest
  (`S3_SERVER_SIDE_ENCRYPTION=AES256`, required in production). Admins view a
  document through a link valid for 60 seconds, and every view is written to the
  audit log.
- The driver app shrinks photos to at most 1600 px, JPEG quality 70% (typically
  200-500 KB from a 4-8 MB camera photo) before upload, and retries network
  failures with backoff, asking for a fresh URL if the old one has expired.

### D-024 Local and CI object storage: moto

MinIO no longer publishes images on Docker Hub, so local development and CI use
moto (`motoserver/moto`), an S3-compatible server. It keeps files in memory (they
vanish when it restarts). Production uses a real S3-compatible service; the code
only speaks the S3 API, so AWS S3, DigitalOcean Spaces, Cloudflare R2, Backblaze
B2 or self-hosted MinIO all work. **Choose one before launch** (data residency:
there is no AWS region in Nigeria; Cape Town or Europe are the nearest).

### D-025 Driver application lifecycle and eligibility

- Statuses: `onboarding` → `pending_review` → `approved` or `rejected` (driver
  fixes and resubmits); `suspended` is reserved for Phase 6.
- Name, NIN, vehicle and payout account can be edited only while `onboarding` or
  `rejected`. After approval, changes go through support (Phase 6); changing a
  payout account gets extra verification in Phase 5 (a common fraud route).
- An admin approves each required document, then the driver. Approval of the
  driver is refused unless every required document has an approved, in-date copy.
- **Can go online** is computed live from: account active, driver approved,
  active vehicle in an enabled category, and every required document approved
  and not past its expiry date. An expired licence blocks driving immediately; the
  hourly sweep that marks documents `expired` only keeps stored statuses tidy.
- An expiry date is the last valid day, in Nigerian time.
- Approved drivers can upload renewals at any time; their current approval keeps
  them driving until it expires. Renewals appear in the review queue.

### D-026 Document requirements are data

`document_types` and `vehicle_category_document_requirements` hold which
documents each vehicle type needs, so they can change without a code release
(admin screens in Phase 6). Defaults:

| Document                                                       | Car | Keke Napep | Taxi | Motorcycle |
| -------------------------------------------------------------- | --- | ---------- | ---- | ---------- |
| Profile photo, national ID, driver's licence                   | ✓   | ✓          | ✓    | ✓          |
| Vehicle licence/registration, photos front and back, insurance | ✓   | ✓          | ✓    | ✓          |
| Photo of the inside, roadworthiness certificate                | ✓   |            | ✓    |            |
| Operating permit                                               |     | ✓          | ✓    | ✓          |

Licence, vehicle licence, insurance, roadworthiness and permits must have an
expiry date; the licence must have its number.

### D-027 Identity numbers

NIN, licence numbers and payout account numbers are encrypted (D-015) and shown
only by their last 4 digits, to drivers and admins alike. The NIN also gets a
keyed hash (`LOOKUP_HASH_SECRET`) with a unique index, so one NIN cannot register
two driver accounts. Reviewers compare the last 4 digits with the uploaded image.

### D-028 Review rules

- Nobody can review their own driver application.
- Two reviewers acting on the same document at once: one wins, the other gets
  `INVALID_STATE` (row lock). Overturning an approval needs an explicit
  `withdrawApproval: true`, so one reviewer cannot silently undo another.
- A rejection reason is shown to the driver; write it for them.
- The driver gets an SMS (in their language) when approved or sent back. SMS
  failures are logged and do not undo the decision; the app shows the status too.

### D-029 Review queue

Contains applications waiting on a reviewer: submitted (`pending_review`, since
submission) and approved drivers with new uploads (renewals, since the oldest
upload). Oldest first. Applications being filled in or sent back are waiting on
the driver and are not listed (they are under "All drivers").

### D-030 Admin dashboard security

- The browser never holds API tokens. The dashboard's own server keeps them in an
  encrypted (AES-256-GCM), httpOnly, `SameSite=Strict` cookie and calls the API
  for the browser through an allow-listed proxy (`/api/proxy/v1/...`).
- State-changing requests need a custom header and a same-host `Origin`
  (cross-site forgery protection on top of `SameSite=Strict`).
- Each page gets a Content-Security-Policy with a fresh nonce; only this site's
  scripts run, and images/frames are limited to the storage origin.
- Token refreshes are de-duplicated per server process. With several dashboard
  servers, the API's 60-second refresh grace (D-009) covers the rare overlap.
- Set the API's `TRUST_PROXY_HOPS` to count the dashboard server, so audit logs
  record the admin's IP rather than the dashboard's.

### D-031 Driver app

Expo SDK 58, built as development builds (background location comes in Phase 4).
Tokens in the phone's secure keystore (`expo-secure-store`). Signing in to the
driver app starts the driver application. Language follows the phone (Hausa if
the phone is set to Hausa), switchable on every main screen. Offline banner from
`@react-native-community/netinfo`. **Not yet run on a phone or emulator** (none in
the build environment): it type-checks, its logic is unit-tested, and Metro
bundles it for Android in CI. Bundle identifiers `com.rideswithme.driver` are
placeholders until the company domain and store accounts are known.

### D-032 Upfront prices

The passenger sees and books a fixed price from the quote (distance and time from
the route at booking). The final fare is that price plus any waiting charge at
pickup. Actual distance driven does not change it, which suits cash payment and
avoids disputes. Route deviations caused by the passenger (extra stops) are a
later feature.

### D-033 Fare formula details

- `F = B + D×Rd + T×Rt + A` with D in metres and T in seconds, prorated to the
  per-km and per-minute rates in integer kobo (BigInt, half-up).
- An optional peak multiplier (Nigerian-time windows; the highest active one wins,
  1.0×–3.0×) applies to B + D×Rd + T×Rt.
- The minimum fare applies to that trip part; then the booking fee (A) is added;
  then the total is rounded **up** to ₦50 (configurable) so change is easy.
- Split of a completed fare: the booking fee goes to the platform in full;
  commission (basis points per vehicle type) is taken from the rest; the driver
  keeps the remainder. For cash rides the driver holds the cash, so the booking fee
  plus commission is recorded as owed (`commissions`, `pending_settlement`) and
  settled from the driver's wallet in Phase 5.
- Waiting: free for the first minutes after the driver arrives, then per started
  minute.
- Cancellation: free while searching and for a grace period (2 minutes) after a
  driver accepts; the fee applies after that or once the driver has arrived. A
  driver may report a no-show after waiting 5 minutes at the pickup, which charges
  the passenger the same fee. Cash fees cannot be taken on the spot; they are
  recorded as outstanding and collected from the wallet in Phase 5.
- Fare rule changes create a new row and deactivate the old one; booked rides keep
  their snapshot (tested: a change after booking does not affect the ride).

### D-034 Placeholder fares (NOT business-approved)

Seeded by `seed-city` for each vehicle type, e.g. car ₦500 base, ₦120/km, ₦15/min,
₦800 minimum, ₦100 booking fee, ₦300 cancellation, 20% commission; Keke Napep
₦200 base, ₦70/km, ₦8/min, ₦400 minimum, ₦50 booking fee, 15% commission. See
`apps/api/src/pricing/default-fares.ts`. Replace before launch (B-13). Only super
admins hold `pricing.manage` and `service_areas.manage` by default; every change
is audited with the previous and new values.

### D-035 Matching

- Drivers' live state (online, vehicle type, latest position with device and
  server time) lives in Redis, with one geo index per vehicle type.
- A ride is offered to **one driver at a time**: the nearest online, eligible,
  free driver of the booked type whose last position is under 60 seconds old. The
  driver has 15 seconds; after a rejection or timeout the next nearest is asked.
  A driver is never asked twice for the same ride. The search radius grows from 3
  to 5 to 8 km; after 3 minutes the ride ends as `no_driver_found`.
- Eligibility (documents in date, account active) is checked again before each
  offer and at acceptance; a driver whose documents lapse is taken offline.
- A dispatcher runs every second on each API copy; rows are claimed with
  `FOR UPDATE SKIP LOCKED`, so several copies cooperate safely.
- Acceptance is one conditional update on the ride (`status = 'searching'`),
  after locking the ride row first. Unique indexes stop a driver holding two
  active rides or two open offers, and a passenger holding two immediate rides.
  The concurrent-accept test caught a deadlock when the ride was locked second;
  every path now locks the ride before its offers, and any future deadlock returns
  a retryable 409 instead of a 500.
- When a driver cancels (other than for a no-show) the ride ends; the passenger
  app offers to request again. Automatic re-dispatch is a possible improvement.

### D-036 Idempotent booking

`POST /v1/rides` requires an `Idempotency-Key`. The first request runs; a retry
with the same key and body returns the same ride; the same key with a different
body is refused; a retry while the first is running gets 409 with Retry-After.
Failed attempts are forgotten so a corrected retry can run. Keys are kept 24 hours.
The apps keep one key per booking attempt and reuse it on retry.

### D-037 Live updates in Phase 3 (replaced in Phase 4 by D-040 to D-044)

The passenger app polls its ride every 4 seconds and the driver app polls for
requests every 3 seconds. Phase 4 replaces this with Socket.IO, background
location and an offline position buffer. Driver positions are already stored with
device and server time, and apps show "last updated … ago" for positions older
than 30 seconds.

### D-038 Shared mobile packages

`@rideswithme/ui-components/native` (presentational components, all text passed
in) and `@rideswithme/mobile-core` (secure session, language, sign-in, formatting)
are shared by both Expo apps. A Metro resolver rule (`metro.workspace.js`) makes
workspace packages use the app's own React, React Native and Expo modules; the
bundle source maps were checked to contain exactly one copy of each.

### D-039 Contacting the driver

The driver card shows call and message buttons, disabled with a "coming soon"
note, until a masked-calling vendor is chosen (B-3). Phone numbers are never
shown to either side.

### D-040 Live updates over Socket.IO

The API serves Socket.IO at `/realtime`, with the Redis adapter so an event raised
on one API copy reaches clients connected to any other. Each user joins a private
room on connecting; a ride's passenger, driver and staff with `rides.read` may also
join that ride's room. Events: `ride:updated` (the full ride view, shaped for the
passenger or the driver), `offer:new`, `offer:closed`, `driver:position` (only to
the passenger of the driver's active ride) and `session:ended`. Drivers may send
locations over the connection (`location:update`, 60 a minute) as well as over
HTTP. Events are sent after the database change commits; a failure to send is
logged and never undoes the change. Apps treat events as hints to show fresh
state, not as the record: see D-044.

### D-041 Who may connect

A connection authenticates with an access token (the mobile apps) or a 60-second
realtime ticket (the websites, whose browsers never hold API tokens; their server
asks for a ticket with the user's token). A ticket only opens a connection; the
HTTP API refuses it. Staff permissions apply over the connection only when the
session has passed two-factor verification, as on HTTP. Every 60 seconds each API
copy checks that its connections' sessions are still valid, and closes any that
were signed out, revoked or suspended with `session:ended`. A refused handshake
says why: `UNAUTHENTICATED` (missing or expired credential: clients refresh their
token once and retry) or `SESSION_REVOKED` (signed out or account suspended).

### D-042 Trip location history

`trip_locations` stores readings taken during a ride, partitioned by UTC day.
Each reading is attributed, by the time the phone took it, to the driver's ride
that was active at that moment, so a buffer uploaded late still lands on the right
trip; readings outside any ride are not stored (the live position is in Redis
only). Readings more than 48 hours old are dropped, and phone times more than two
minutes in the future are clamped. A maintenance job (every 6 hours, one API copy
at a time via a Redis lock) creates partitions from two days back to seven ahead
and drops partitions older than 90 days (`TRIP_LOCATION_RETENTION_DAYS`), which
is how location history is deleted under the privacy rules. There is no default
partition: if the job stopped for over a week, location history writes would
fail, which monitoring in Phase 8 must catch. On completion the driven distance is
computed from readings with accuracy of 50 m or better and stored on the ride
(`actual_distance_meters`); the fare stays the upfront price (D-032), so this is
for receipts and disputes. The brief's `driver_locations` table is not created:
the live position lives in Redis (D-035).

### D-043 Driver app: background location and offline buffer

While online, the driver app tracks location with a foreground service (Android
shows an ongoing notification; iOS background location), every 10 seconds or 20
metres. If the driver allows location only while the app is open, it still works
and says so. Every reading goes first into a SQLite buffer on the phone (up to
20,000 readings, oldest dropped first) and is uploaded in batches of 200 every 15
seconds and when the network returns; a batch is deleted only after the API
accepts it, so nothing is lost to a dropped connection or an app restart. The
newest reading becomes the driver's position; older ones never move the driver
back. The screen shows how many readings are waiting to upload.

### D-044 Missed events

Events sent while a client is disconnected are not replayed. Instead every screen
that shows live state refetches it when the connection comes back, and also checks
every 30 seconds as a fallback. Positions older than 30 seconds are always shown
as "last updated … ago", never as live.

### D-045 Passenger website

Next.js, built like the admin dashboard: the browser talks only to the website's
own server, which keeps the API tokens in an encrypted httpOnly cookie and forwards
an allow-list of passenger endpoints. Live updates go straight from the browser to
the API with a realtime ticket (D-041), so the API must list the website's origin
in `CORS_ORIGINS`. Payment is cash only until Phase 5. The map is a to-scale sketch
until a browser Maps key is supplied (B-16).

### D-046 Shared code for the apps and websites

To avoid copies between apps: the passenger ride rules and ride text live in
`@rideswithme/utilities`; the realtime client in `@rideswithme/api-client/realtime`
(no React Native code, used by both mobile apps and the website);
`@rideswithme/web-core` holds the websites' server session and proxy (standard
Request/Response, no Next.js dependency) and, at `/client`, their API client,
translations and loading/error/offline states; base web styles are in
`@rideswithme/ui-components/web.css`; `@rideswithme/e2e-support` starts the
services for the websites' browser tests.

### D-047 The ledger

Money is recorded as double entry, as the brief asks: `wallets` holds every
account (each passenger's and driver's wallet, and the platform's own accounts)
and `wallet_transactions` holds the lines of each journal, debits positive and
credits negative. The database, not application code, enforces the rules: a
journal's lines must sum to zero and there must be at least two; lines can only
be added in the transaction that created the journal; nothing can be updated or
deleted; and a wallet's balance changes only through the trigger that inserts a
line, which locks the wallet and refuses to take a passenger wallet below zero
(so concurrent spends can never overdraw it). The balance stored on the wallet is
the running total of its lines, kept by that trigger, and
`ledger_balance_mismatches()` checks it; the reconciliation job runs the check.

Platform accounts: `paystack_balance` (our money at Paystack), `passenger_receivables`
(fares and fees passengers still owe), `provider_fees` (Paystack's fees),
`platform_revenue` (booking fees and commission), `ride_holds` (wallet money held
for rides in progress), `payouts_in_transit` and `refunds_in_transit`. Every
journal has a unique reference naming the business event (for example
`ride:<id>:settle`), so posting the same event twice does nothing. The API locks
wallets in a fixed order so concurrent journals cannot deadlock.

### D-048 Paystack and the fake provider

Paystack sits behind a `PaymentProvider` interface (checkout, verify, charge a
saved card, transfer recipients, transfers, refunds, webhook signature and
parsing). Development and tests use a fake that behaves the same way: it keeps its
state in Redis, serves a test checkout page at `/v1/dev/fake-checkout/<reference>`,
uses Paystack's fee schedule, and sends Paystack-shaped webhooks signed with its
own key into the real webhook handler. The fake is refused in production.

Our payment id is the provider's reference, so every answer maps to one row.
Results are only ever taken from the provider (a signed webhook, or a
server-to-server verify or charge call); the app's return from the checkout page
only prompts the server to ask. A charge whose amount differs from what we asked
for is never credited and is flagged for a person.

### D-049 Webhooks

`POST /v1/webhooks/paystack` checks the HMAC-SHA512 signature over the exact bytes
received (the raw body is kept for that route only), and optionally the source IP.
Each valid event is stored once (`payment_webhook_events`, unique per event) and
processed idempotently. If processing fails, the event is kept and retried by the
reconciliation job, and Paystack still gets 200 so it does not keep resending.

### D-050 Paying for rides

- **Cash:** the driver keeps the fare. At completion the booking fee and commission
  are debited from the driver's wallet, which may go negative. A driver owing more
  than `DRIVER_DEBT_LIMIT_KOBO` (₦5,000) cannot go online until they top up their
  wallet.
- **Wallet:** the quoted price is held at booking (refused if the balance is too
  low). At completion the final price (including any waiting charge) is taken from
  the hold, then from the wallet; the rest of the hold goes back.
- **Card:** a saved card is charged after the trip, outside the ride's transaction.
  If the provider cannot be reached the payment stays pending and the
  reconciliation job retries with the same reference.
- In every case the driver's share and the platform's fees are credited when the
  trip completes. If the passenger cannot pay (card declined, wallet short), the
  platform carries the risk and the passenger owes the difference.

### D-051 Money owed

What a passenger owes (a declined card, a wallet shortfall, a cash cancellation
fee) is recorded as `outstanding` on the payment and as a receivable in the
ledger. It is taken from the wallet automatically whenever there is money there
(after every top-up, and at once when it arises), and the passenger cannot book
another ride until it is paid. If a card payment arrives late for something
already paid from the wallet, that amount goes back to the wallet.

### D-052 Saving a card

A card is saved by a small checkout (`CARD_LINK_AMOUNT_KOBO`, ₦50) whose amount
goes into the passenger's wallet, so nothing is lost. Paystack's reusable
authorization code is stored field-encrypted; the same card saved twice (same
Paystack signature) stays one card. Cards are never saved from ordinary top-ups.

### D-053 Payouts

Drivers withdraw their positive balance to the bank account from their application
(`PAYOUT_MIN_KOBO`, one payout at a time). The amount leaves the wallet when
requested; the transfer is sent after that commits; a failed or reversed transfer
puts the money back. Withdrawals pause for `PAYOUT_ACCOUNT_CHANGE_HOLD_HOURS` (24)
after the bank account is replaced, against account takeover. Paystack transfers
need "Disable OTP for transfers" on the Paystack account; scheduled automatic
payouts can be added later.

### D-054 Refunds, disputes and chargebacks

Staff with `payments.refund` refund all or part of what was paid for a ride: to the
wallet (at once) or to the original card (through Paystack). A refund is paid from
platform revenue or, where the driver was at fault, from the driver's wallet; the
total can never exceed what was paid. A card refund Paystack refuses outright is
undone; one that fails later is credited to the wallet instead. Passengers can
report a problem with a fare once per ride, within `DISPUTE_WINDOW_DAYS` (30);
staff resolve it with a refund or a written reason. Card chargebacks from Paystack
are recorded; a lost chargeback is taken from platform revenue (staff can recover it
from the driver with an adjustment). Refunds, dispute decisions, adjustments and
payout retries are all in the audit log. Super admins can make manual wallet
adjustments (`wallets.adjust`) with a reason. The screens for all of this arrive
with the dashboard in Phase 6; the APIs are ready.

### D-055 Reconciliation

Every `PAYMENT_RECONCILE_INTERVAL_MINUTES` (5), one API copy asks the provider about
payments and payouts pending longer than `PAYMENT_RECONCILE_AFTER_MINUTES` (10),
retries card charges and transfers that never reached it, marks checkouts abandoned
after `PAYMENT_ABANDON_AFTER_HOURS` (24), retries failed webhook processing, returns
wallet holds left on finished rides, and logs an error if any wallet balance differs
from its ledger lines.
