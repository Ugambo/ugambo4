# Decisions

Choices made where the brief was silent, open, or needed adjusting. Newest at the
bottom. Each entry says what was decided, why, and how to change it.

## Problems found in the brief

These need your answer or awareness. Work continues on the stated assumption.

| #    | Issue                                                                                                                                                                                                                                                         | What I did / propose                                                                                                                                                                                                                                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-1  | The brief says "an empty repository", but `ugambo/ugambo4` already contains the Explore Katsina WordPress project.                                                                                                                                            | Built RideswithMe in `rideswithme/` (the root folder name the brief uses) and left Explore Katsina untouched. Moving it to its own repository later is a folder copy; CI already only runs on `rideswithme/**` changes.                                                                                                                                     |
| B-2  | Section 2 refers to the phases as section 14 and the open decisions as section 15. They are sections 15 and 16 (14 is UI direction).                                                                                                                          | Assumed the obvious intent.                                                                                                                                                                                                                                                                                                                                 |
| B-3  | "Masked calling" needs a voice/telephony provider (number proxying). None is in the stack.                                                                                                                                                                    | Proposal: a `VoiceProxyProvider` interface like the SMS one, with a vendor chosen before Phase 3 call buttons ship. Until then the call button can be hidden by configuration. **Needs a vendor decision.**                                                                                                                                                 |
| B-4  | Email is collected at registration but there is no email provider in the stack, so addresses cannot be verified.                                                                                                                                              | Email is stored and marked unverified (`email_verified_at` is null). Verification needs a transactional email vendor. **Needs a vendor decision** (any SMTP or API vendor; behind an interface).                                                                                                                                                            |
| B-5  | 99.9% availability (about 8.7 hours of downtime a year, maintenance included) is not realistic on a single VPS with Docker: one host failure or one OS upgrade can use most of it.                                                                            | For launch, either (a) two API hosts behind a load balancer plus managed PostgreSQL with point-in-time recovery, or (b) accept a lower target (99.5%) for the single-VPS launch. Decide before Phase 8. The API is already stateless so (a) needs no code change.                                                                                           |
| B-6  | Bus seats: "unique constraint on schedule + seat" plus holds that expire. A plain unique constraint would block re-selling a seat whose hold expired or whose booking was cancelled.                                                                          | Phase 7 will use a partial unique index over active rows (held or confirmed), with expired holds moved to `expired` by a job and re-checked under a row lock at payment time. Same guarantee, seats become sellable again.                                                                                                                                  |
| B-7  | Hausa uses ƙ, ɗ and ɓ, which force SMS into UCS-2 encoding: 70 characters per segment instead of 160. The Hausa OTP message is two segments, roughly double the cost of the English one.                                                                      | Kept correct spelling. Alternatives: shorten the Hausa message to fit one UCS-2 segment, or send OTP SMS in English for everyone. **Your call.**                                                                                                                                                                                                            |
| B-8  | The payout form needs the full list of Nigerian banks and fintech accounts (OPay, Moniepoint, PalmPay, Kuda and others that many drivers use), with their codes, and a check that the account name matches. Neither exists until Paystack arrives in Phase 5. | Phase 2 offers 15 major banks (placeholder list in the driver app) and stores what the driver types. Phase 5 replaces the list with Paystack's bank list and verifies the account name before any payout.                                                                                                                                                   |
| B-9  | Nothing in the stack verifies a NIN against NIMC records. Reviewers can only compare the number with the NIN slip by eye.                                                                                                                                     | Proposal: an identity-verification vendor (e.g. Prembly/IdentityPass, Smile ID, VerifyMe, Dojah) behind an interface, checking NIN, name, photo and licence before approval. **Needs a vendor decision**; can be added any time before launch.                                                                                                              |
| B-10 | Which documents each vehicle type needs is not in the brief (and some permits differ by state).                                                                                                                                                               | Defaults in DECISIONS D-026, editable as data. **Please confirm or correct them**, especially for Keke Napep and motorcycles in the launch city.                                                                                                                                                                                                            |
| B-11 | CI has not run on GitHub yet: the first run failed within 3 seconds with no logs, which means GitHub never gave it a runner (an account setting, e.g. Actions billing or spending limit, or Actions disabled for this private repository).                    | Check the run at github.com/Ugambo/ugambo4/actions. Everything CI runs also ran locally before each commit.                                                                                                                                                                                                                                                 |
| B-12 | Real maps need Google Maps Platform keys: a server key (Places API (New), Geocoding, Routes) and an Android Maps SDK key for the passenger app's map. None is configured.                                                                                     | Development and tests use an offline fake (demo places, straight-line routes). **Please create the two keys** (restricted by API and by server IP / app signature); they go in `GOOGLE_MAPS_API_KEY` and `GOOGLE_MAPS_ANDROID_API_KEY`. The Google adapter is unit-tested but has not been called live.                                                     |
| B-13 | Fare values are not in the brief.                                                                                                                                                                                                                             | Placeholder fares are seeded for every vehicle type (D-034). **Please supply real base, per-km, per-minute, minimum, booking, waiting and cancellation fees and commission per vehicle type** before launch.                                                                                                                                                |
| B-14 | The launch city's boundary is needed as a polygon.                                                                                                                                                                                                            | `seed-city` creates a rectangle for development. For launch, send the boundary (GeoJSON, or draw it in Phase 6's admin map) and it is loaded through `PUT /v1/admin/service-areas`.                                                                                                                                                                         |
| B-15 | Passenger web booking (brief section 5) was planned for Phase 3.                                                                                                                                                                                              | Moved to Phase 4: its trip screens need the live updates Phase 4 adds, and building them on polling first would mean writing them twice. Mobile booking is complete in Phase 3.                                                                                                                                                                             |
| B-16 | The brief asks for Google Maps; the passenger website needs a browser Maps JavaScript key, which is separate from the server key.                                                                                                                             | Until one is supplied, the website draws a to-scale route sketch (pickup, destination, route, driver) instead of a street map. Adding the map later changes one component. Please provide a browser key restricted to the website's domain.                                                                                                                 |
| B-17 | Holding passengers' money in a wallet is regulated in Nigeria (CBN rules on stored value and e-money).                                                                                                                                                        | The wallet is built (as the brief asks) with a balance limit like a tier-1 account (₦300,000, `WALLET_MAX_BALANCE_KOBO`), no cash-out for passengers, and a full ledger. **Before launch, confirm with a lawyer whether RideswithMe needs a licence or a licensed partner (e.g. holding the funds through Paystack or a bank) and what KYC tiers apply.**   |
| B-18 | The brief does not say who pays Paystack's fees (1.5% + ₦100 per card payment, ₦10–₦50 per transfer).                                                                                                                                                         | The platform absorbs them: wallets are credited the full amount paid and drivers receive the full payout; fees are recorded in their own account (`provider_fees`) so their cost is visible. Passing fees on would be a change to the top-up and payout amounts. Please confirm.                                                                            |
| B-19 | Who receives a cancellation fee is not in the brief.                                                                                                                                                                                                          | The driver who was on the way, less the platform's commission at the ride's rate (the same split as a fare). Please confirm, or say if the platform should keep it all.                                                                                                                                                                                     |
| B-20 | The admin maps need map tiles. OpenStreetMap's own tile servers are free but their usage policy forbids heavy or commercial use, and Google map tiles need the browser key from B-16.                                                                         | The maps use Leaflet with the tile server set by `MAP_TILE_URL` (OpenStreetMap by default, fine for development and a few staff). **Before launch, choose a tile provider** (e.g. MapTiler, Stadia, Mapbox, or Google with a key) and set `MAP_TILE_URL` and `MAP_TILE_ATTRIBUTION`. See D-057.                                                             |
| B-21 | The brief says fleet operators see their drivers' earnings, but not whether the fleet is paid instead of the driver, or takes a share.                                                                                                                        | Drivers in a fleet are still paid individually to their own wallets and bank accounts; the fleet only sees the numbers. Paying fleets (all earnings, or a share) would be a ledger change: a fleet wallet and a split at settlement. **Please say which model fleets in your market expect.**                                                               |
| B-22 | The admin section lists promotions and an SOS panel, but the phase plan puts promotions and SOS in Phase 8, and buses in Phase 7.                                                                                                                             | **Resolved:** you confirmed following the phase plan. Bus screens are built in Phase 7; promotions and SOS in Phase 8.                                                                                                                                                                                                                                      |
| B-23 | Refunds for cancelled bus tickets: the brief does not say where the money goes, and passengers cannot withdraw wallet money (B-17).                                                                                                                           | Every bus refund (passenger cancellation, operator cancellation, staff) goes to the passenger's RideswithMe wallet at once, usable for rides and buses. Card refunds for buses could be added like ride refunds (D-054). **Please say whether passengers who paid by card should get their money back on the card.**                                        |
| B-24 | How and when bus operators are paid is not in the brief.                                                                                                                                                                                                      | RideswithMe holds what operators are owed in a ledger account per operator; staff record payments made outside the app (e.g. a transfer from the Paystack dashboard). Automatic payouts by transfer (as for drivers, D-053) need each operator's bank account and an agreed schedule (weekly?). **Please confirm the schedule and whether to automate it.** |
| B-25 | The bus cancellation policy is not in the brief.                                                                                                                                                                                                              | Default: passengers can cancel for a full refund until `BUS_CANCEL_CUTOFF_HOURS` (12) before departure, and not after; if the operator or RideswithMe cancels, everyone is refunded in full. Operators often have their own rules (e.g. a 10% charge); per-operator policies can be added. **Please confirm or give the policy you want.**                  |
| B-26 | Who pays RideswithMe's bus service fee is open: the passenger (added to the fare) or the operator (taken from the fare).                                                                                                                                      | Default: the passenger pays the operator's fare and RideswithMe keeps `service_fee_bps` of it (10% for new operators, set per operator by staff). Adding a passenger booking fee instead is a pricing change in one place. **Please confirm.**                                                                                                              |
| B-27 | The apps' bundle identifiers (`com.rideswithme.app`, `com.rideswithme.driver`) and store accounts do not exist yet. Identifiers cannot change after the first store release.                                                                                  | Placeholders in each `app.config.ts`. **Please create the Apple Developer and Google Play accounts and confirm the identifiers** (normally the company's domain reversed).                                                                                                                                                                                  |
| B-28 | There is no app icon, splash screen or store artwork, and no screenshots.                                                                                                                                                                                     | The apps use Expo's defaults. **Please supply the brand artwork**; store screenshots in English and Hausa are needed too.                                                                                                                                                                                                                                   |
| B-29 | Push notifications need an Expo (EAS) project, a Firebase project for Android and an Apple push key for iOS. None exist yet.                                                                                                                                  | Push is built and tested with a logging provider (`PUSH_PROVIDER=log`). Set `PUSH_PROVIDER=expo` and the EAS variables once the accounts exist (LAUNCH.md, "Store builds"). Until then, important events (SOS acknowledgement, bus cancellations) also go by SMS.                                                                                           |
| B-30 | The brief says SOS must alert staff at once, but not who: there is no on-call rota, and no agreed procedure with the police or emergency services.                                                                                                            | Every new SOS texts every phone in `SOS_ALERT_PHONES` and pages through monitoring after 2 minutes unacknowledged (LAUNCH.md#sos, which says to call 112). **Please name the on-call team, staff it every hour the service runs, and confirm the escalation procedure.**                                                                                    |
| B-31 | Driver support requests: the brief lists support tickets, but not whether drivers raise them in the driver app.                                                                                                                                               | **Resolved:** built. Drivers and applicants contact support from the driver app (checklist and drive screens), with topics for driving, payment, trips, account and other. The screens are shared with the passenger app (`SupportHome`, `SupportTicket` in `@rideswithme/mobile-core`).                                                                    |
| B-32 | Error tracking for the web apps and mobile apps (crash reporting) is not in the brief's stack.                                                                                                                                                                | **Resolved:** built for all apps, off until a DSN is set (D-078). Needs a Sentry or GlitchTip account.                                                                                                                                                                                                                                                      |
| B-33 | How long trips, payments, messages and safety reports are kept after an account is deleted is a legal question (NDPA, tax and CBN record-keeping rules).                                                                                                      | Kept indefinitely, linked to an anonymous account (D-074). **Please get legal advice on retention periods**; a scheduled purge of old records is then straightforward.                                                                                                                                                                                      |

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
adjustments (`wallets.adjust`) with a reason. The admin dashboard's Payments
screens (Phase 6) cover all of this.

### D-055 Reconciliation

Every `PAYMENT_RECONCILE_INTERVAL_MINUTES` (5), one API copy asks the provider about
payments and payouts pending longer than `PAYMENT_RECONCILE_AFTER_MINUTES` (10),
retries card charges and transfers that never reached it, marks checkouts abandoned
after `PAYMENT_ABANDON_AFTER_HOURS` (24), retries failed webhook processing, returns
wallet holds left on finished rides, and logs an error if any wallet balance differs
from its ledger lines.

### D-056 Admin overview numbers

KPI cards: riders (active accounts with the passenger role, plus new today),
approved drivers (plus online now), rides in progress, trips completed today, and
today's fares and platform revenue. "Today" is the Nigerian calendar day
(Africa/Lagos). Revenue is what the platform earned (booking fees, commission and
its share of cancellation fees, less chargebacks): the movement on the
`platform_revenue` ledger account, not the fares passengers paid, which are shown
separately. The 14-day charts are single-series bars (revenue in naira; trips
completed), each with a table view, following the shared chart guidance (one
colour, no dual axes). Numbers come from SQL on demand; at larger volumes they can
move to a daily summary table without changing the API.

### D-057 Maps in the admin dashboard: Leaflet and a configurable tile server

The live map and the service-area editor use Leaflet (open source, small, works
with any tile server) instead of Google's Maps JavaScript API, which would need a
browser key (B-16) and billing. Tiles come from `MAP_TILE_URL` with
`MAP_TILE_ATTRIBUTION`; the default is OpenStreetMap, whose policy allows light use
only (B-20). The tile host is added to the dashboard's Content Security Policy
automatically. Markers are drawn with CSS, not image files. Service areas are
drawn as a polygon: click the map to add corners, drag a corner to move it, with
buttons to remove the last corner or start again. Saving uses the existing
`PUT /v1/admin/service-areas`.

### D-058 Fleets

Staff create a fleet operator with a manager's phone number (the account is
created if needed and given the `fleet_manager` role). Managers use the fleet portal
with two-factor authentication (`fleet.portal` requires it, as staff permissions
do). Drivers join only by accepting an invitation in the driver app, because the
fleet will see their trips and earnings; a driver is in at most one fleet, and can
leave at any time. A manager sees a driver's trips only between joining and leaving
(by the time the ride was assigned), so joining a fleet does not expose past trips
and leaving stops new ones from showing. Removed drivers' past trips stay visible
to the fleet. A suspended fleet's managers cannot use the portal. One person
manages at most one fleet. Every change is audited (`fleets.*`).

### D-059 Staff stopping a ride

Staff with `rides.manage` can stop a ride in any state before it ends, with a
written reason (`cancelled_by_admin`). There is never a fee: a wallet hold is
returned and nothing is charged. A trip already in progress is stopped without a
fare; if the passenger should pay part of it, that is handled afterwards. The
passenger and driver see "Stopped by RideswithMe" and the reason is in the ride's
timeline and the audit log.

### D-060 Live operations feed

Staff with `rides.read` join the `ops` Socket.IO room (`ops:subscribe`) and receive
every ride change (`ops:ride`) and every driver position (`ops:driver`). The live
map first loads `GET /v1/admin/live` (online drivers, rides in progress), then
applies the events, and reloads on reconnect, as the apps do (D-044). A driver whose
last position is more than 30 seconds old is drawn grey with its age, never as
live (the brief's staleness rule).

### D-061 One sign-in for staff and fleet managers

The SMS code plus authenticator sign-in (including first-time authenticator set-up
with a QR code) is a component in `@rideswithme/web-core`, used by the admin
dashboard and the fleet portal with their own titles and landing pages. Apps can
also word API errors for their own users (for example, "No driver with this phone
number" in the fleet portal rather than the driver app's wording).

### D-062 Buses: operators and money

Bus operators are third parties (PRD open decision 5). Staff create an operator
with a manager's phone number (the `bus_operator` role, which needs two-factor
authentication) and a service fee in basis points (`BUS_DEFAULT_SERVICE_FEE_BPS`,
1000 = 10%, changeable per operator; a change applies to new bookings only). The
passenger pays the fare the operator sets; RideswithMe keeps the service fee and the
rest is credited to the operator's ledger account (a `bus_operator` wallet, one per
operator, allowed to go negative after refunds). Staff record payments made to the
operator outside the app, which reduce both that account and our Paystack balance
(B-24). Every booking keeps its total, fee and fee rate as a snapshot, so later fee or
fare changes never alter it. Operators run their listings in the partner portal
(the fleet portal, which now serves fleets, bus operators, or someone who is both);
staff see and act on every operator in the admin dashboard.

### D-063 Routes, seat layouts and departures

A route is point to point between two cities (terminal or motor park at each end,
journey time); intermediate stops are not modelled yet. A seat layout is a grid of
rows and columns where each cell is a seat (label, class: standard, executive or VIP)
or empty (aisle, door, driver). A layout cannot change once a departure uses it,
because tickets refer to its seats; operators make a new one. Departures are created
in bulk: one per chosen day (Nigerian time), same time, bus and fares, up to 62 at
once; the same route cannot depart twice at the same minute. Fares are set per
departure and seat class (the brief's "route, operator, seat class and departure");
changing them affects new bookings only. Booking closes `BUS_SALES_CLOSE_MINUTES`
(30) before departure.

### D-064 Seat holds and never selling a seat twice

Choosing seats creates a booking that holds them for `BUS_HOLD_MINUTES` (10) while
the passenger pays (extended once payment starts on a card or the payment page). This
is the brief's "seat held with an expiry", using the partial unique index proposed in
B-6: `bus_booking_seats` has one row per seat per booking, and a unique index on
(departure, seat) over active rows means a seat can be held or sold only once, while
released seats can be sold again. Every change to a departure's seats (holding,
paying, cancelling, releasing lapsed holds) first locks that departure's row, so
changes happen one at a time and see each other; the index is the last line of
defence. A lapsed hold counts as free immediately; the sweep job
(`BUS_HOLD_SWEEP_MINUTES`) only tidies its status. If a card payment succeeds after the
hold lapsed, the booking is confirmed if the seats are still free and the bus has not
left; otherwise the money goes to the passenger's wallet. Choosing seats again on the
same departure replaces the passenger's earlier unpaid choice. Tested with eight
passengers trying for one seat at the same moment.

### D-065 Paying for bus tickets

Wallet (immediately), a saved card (charged at once), or the payment page (any card or
bank transfer, confirmed by the webhook or the return check). Cash is not offered for
buses: seats are sold in advance. Passengers who owe money from rides must pay it
first, as for rides. Payments for bus tickets are `payments` rows with purpose
`bus_booking`, so reconciliation, webhooks and the admin payments screens cover them.

### D-066 Tickets and boarding

Each paid seat is a ticket with a 10-character code (from 32 unambiguous letters and
digits, about 50 bits, so codes cannot be guessed) shown under a QR code containing
`RWMBUS:<code>`. Codes are shown only once the booking is paid. Operators check
passengers in from the portal by typing the code or using a QR scanner that types into
the box (no camera access needed); a ticket is accepted only for that operator's
departures, from 24 hours before to 12 hours after departure, and checking in twice
shows when it was first checked in. The app draws QR codes with plain views (the
`qrcode` library), so no new native module or app build is needed. Operators see a
passenger list (seat, name, booking reference, boarded or not), never phone numbers.

### D-067 Bus cancellations

Unpaid bookings can be released at any time. Paid bookings: see B-25. When an operator
or staff cancels a departure, every paid booking is refunded in full to the wallet and
unpaid holds are released, in one transaction; passengers see the reason on their
booking. Refunds reverse both the operator's share and RideswithMe's fee. All
cancellations are audited (`buses.*`).

### D-068 SOS

The brief makes SOS the highest priority, so it is built to never fail the
person pressing it:

- `POST /v1/sos` is never refused. It works with or without a ride, and with or
  without a location (the last known driver position is used if the phone has
  none). Rate limits do not apply.
- Presses within 30 minutes of an open alert add to the same alert (press
  count, newest location) instead of creating more, so staff see one incident.
- Staff hear about it three ways at once:
  - an SMS to every phone in `SOS_ALERT_PHONES`, with a map link (at most one
    every 5 minutes per alert, however often it is pressed)
  - a realtime `sos:alert` event in the `ops` room, which staff with
    `rides.read` or `safety.read` join; the admin dashboard shows a red banner
    on every page and also polls every 15 seconds in case the socket is down
  - the metric `rwm_sos_oldest_unacknowledged_seconds`, which pages on-call
    after 2 minutes (LAUNCH.md#sos)
- Staff acknowledge (the person gets a push: help is coming) and resolve with a
  written account. Every step is in the ride's events and the audit log.

New permissions: `safety.read` and `safety.manage`, given to support agents and
admins.

### D-069 Trip sharing

A passenger can share a live trip link with family or friends. Only a SHA-256 hash of the
token is stored, so the database cannot be used to rebuild links. Making a new
link revokes the old one. Links stop working `TRIP_SHARE_AFTER_END_MINUTES`
after the trip ends.

The public view (`GET /v1/share/:token`, 240 requests an hour per IP) shows the
status, route, the driver's first name, vehicle and plate, and the live
position. It never shows phone numbers or the passenger's details. The website
serves it at `/track/<token>` without sign-in, through its own server so the
API's address and the viewer's IP are handled as for any other request.

### D-070 Messages during a ride

Passenger and driver can message each other from assignment until the trip
ends (`driver_assigned`, `driver_arrived`, `in_progress`), and not before or
after. The other party gets a push notification. Messages are not copied to the
notification inbox. Staff with `safety.read` can read a ride's messages when
handling a complaint or SOS.

This replaces masked calling for now (B-3): neither side sees the other's phone
number.

### D-071 Ratings and incident reports

**Ratings:**

- Both ways: passenger rates driver, driver rates passenger.
- 1–5 stars, an optional comment and tags, within 7 days of the trip, once per
  direction (`RATING_CLOSED` after that).
- Running sums and counts are kept on the `users` row, so averages cost nothing
  to show.
- An average is shown only from 3 ratings, so one bad trip does not define a
  new driver.

**Incident reports** (from either side, about a trip) have categories. Safety,
accident, harassment and dangerous driving are high priority: they are listed
first in admin and page by ticket after 2 hours open.

### D-072 Promotions

Staff create codes (`promotions.manage`): percent (with an optional cap) or
fixed amount, with these optional limits:

- minimum fare
- vehicle types
- first ride only
- uses per passenger, and in total
- a start and end time

The code's life with a ride:

| When                             | What happens                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| Fare estimate                    | the code is checked, and the discount shown                                               |
| Booking                          | the code is reserved under a row lock, so the total-use limit is never exceeded by a race |
| Completion                       | the code is marked used                                                                   |
| Cancellation, or no driver found | the code is released                                                                      |

**Who pays:** the passenger pays `payableKobo` (the fare less the discount).
The driver is paid on the full fare. The platform funds the difference from a
`promotions` system account (debit-normal, like an expense), so the ledger
shows exactly what promotions cost.

A discount always leaves at least the larger of the booking fee and ₦100 to
pay, so a ride is never free and cash rides still settle sensibly.

### D-073 Notifications and support

**Notifications:**

- One service sends to the in-app inbox (`notifications` table), push (Expo,
  or a logging provider in development) and, for things that must not be
  missed, SMS.
- Texts are in English and Hausa (`apps/api/src/notifications/templates.ts`),
  in the person's language.
- Sending never throws: a failed push must not undo the ride change that caused
  it.
- Push tokens are registered by the apps after sign-in. At sign-out the app
  tells the API to forget its token, so a shared phone stops getting the
  previous person's updates. A token registered by someone else moves to them.
- Passengers get a push once per status for "driver assigned" and "driver
  arrived", deduplicated across API replicas.

**Support tickets:**

- Passengers (app and website) and drivers (app) raise them. The mobile screens
  and their text are shared (`@rideswithme/mobile-core` `support.tsx`, and
  `supportMessages` in `@rideswithme/utilities`).
- A ticket is a thread between the user and staff (`support.read`,
  `support.manage`), optionally linked to a ride.
- The user is notified when staff reply.
- Staff see the tickets that have waited longest first.

### D-074 Account deletion and data retention

NDPA gives people the right to erasure. A user asks for deletion in the app or
website. They have `DELETION_GRACE_DAYS` (7) to change their mind. A sweep every
`DELETION_SWEEP_MINUTES` then processes it.

The request waits ("blocked", with the reason shown) while anything is open:

- an active trip or an upcoming bus trip
- money owed either way (a wallet balance, a driver wallet not at zero, a payout
  in progress)
- managing a fleet or bus operator
- a staff account (staff are removed by another super admin first)

**What is erased:**

- name, phone, email
- sessions and roles
- saved places, push tokens, notifications
- saved cards (marked removed; card data was only ever a Paystack token)
- NIN and bank details
- driver documents, deleted from storage

The account row stays, anonymous, and can never sign in again.

**What is kept,** linked to the anonymous account:

- trips and their events, bus bookings
- payments and the ledger (financial records)
- ride messages, ratings, incident reports and SOS alerts (safety records)

How long these are kept is a legal question (B-33). Staff see requests in admin
→ Deletion requests (`privacy.manage`, super admin only).

### D-075 Dispatcher: one failed offer must not end the search

The load test found this. Two rides were being dispatched at the same moment
and picked the same nearest driver. The second insert hit the
one-open-offer-per-driver index. The code then moved on to the next candidate,
but in PostgreSQL a failed statement aborts the whole transaction. Every later
query failed, and loading the next driver's state threw. That error was treated
as "not eligible", so the dispatcher took those drivers offline.

The fix has two parts:

- The offer insert runs under a savepoint. On a unique violation it rolls back
  to the savepoint and tries the next driver.
- A failure to load a driver's state is now an error, retried on the next tick.
  Only a driver whose state loads and shows them ineligible is taken offline.

A regression test reproduces the race. The other unique-violation handlers in
the API were checked: they all end their transaction by throwing, so they do
not have this problem.

### D-076 Observability and backups

**Metrics:**

- prom-client metrics on `/metrics`, behind a bearer token. The endpoint is a
  404 when the token is unset or wrong, so it does not advertise itself.
- The business gauges (SOS, ledger mismatches, stuck payments and payouts, the
  marketplace, queues) are read from the database at scrape time. That is a few
  cheap counts every 15 seconds, always correct across API replicas.
- The alert rules and their runbooks are in LAUNCH.md.

**Errors:** Sentry is optional (`SENTRY_DSN`). Only 5xx errors are sent, with
request data and user details removed before sending.

**Payout stop:** `PAYOUTS_PAUSED` stops driver payouts (new requests refused,
pending ones held) during a money incident without stopping rides.

**Backups:**

- Our own encrypted format rather than relying on the bucket's encryption, so a
  leaked bucket or a curious storage provider learns nothing.
- The file is `RWMB1` | IV | AES-256-CTR ciphertext of a `pg_dump`
  custom-format dump | HMAC-SHA256 over everything before it. Separate keys are
  derived by HKDF from `BACKUP_ENCRYPTION_KEY`.
- The MAC is checked before anything is restored.
- A weekly restore check proves the newest backup can be restored and is
  consistent: migrations present, ledger balanced.
- A `backup` image carries the PostgreSQL 16 client tools.

### D-077 Store builds and Hausa checks

**Store builds:**

- EAS Build profiles: `development`, `preview` and `production`.
- Each profile reads its variables from the EAS environment of the same name,
  so no API address or project ID is committed.
- `packages/mobile-core/app-config.js` refuses a `preview` or `production`
  build that would point at a non-https API, or that lacks the EAS project
  (push needs it) or the policy version.
- The driver app explains background location in its own words before the
  system prompt, as Google Play requires ("prominent disclosure").

**Hausa checks:**

- Every catalogue (apps, shared, API notifications) has a test. It fails on a
  missing, blank or leftover text, on different `{placeholders}`, and on Hausa
  that is word-for-word the English.
- `pnpm hausa:export` writes everything to a CSV for the native-speaker review
  (HAUSA_REVIEW.md).

### D-078 Error tracking everywhere, one privacy rule

The API, the three websites and the two apps report errors to Sentry, or to a
compatible service such as GlitchTip. Each is off until it is given a DSN.

**One scrubber for all of them** (`scrubErrorEvent` in
`@rideswithme/utilities`, unit-tested):

- **Removed:** headers, cookies, request bodies and query strings, user
  details and the server name.
- **Breadcrumbs:** console breadcrumbs are dropped, since they can contain
  anything.
- **URLs and error messages:** share tokens are replaced with `:token`, and
  phone numbers and email addresses are masked. Errors sometimes quote a URL or
  a value.
- **Kept:** the error, its stack, the route or screen, and record ids (UUIDs),
  which identify records, not people.

**Websites:**

- **Servers:** Next.js `instrumentation.ts` reports errors (`onRequestError`).
- **Browser setting at run time:** the browser learns whether tracking is on
  from a `<meta>` tag the server renders from `SENTRY_DSN`. One Docker image
  therefore serves every environment, with no rebuild to turn tracking on.
- **CSP:** the Content-Security-Policy then allows only the DSN's origin.
- **Download only when on:** the Sentry code is fetched only when tracking is
  on. It is a plain ES module (`web-core/error-tracking-browser.mjs`), so the
  bundler keeps only what is used: 236 KB instead of 1.3 MB.
- **Verified in a browser:** with tracking off, nothing is downloaded or sent.
  With it on, a test error arrived with its share token and phone number
  removed.

**Apps:**

- **SDK:** `@sentry/react-native` 8.28 (the version Expo SDK 58 lists),
  started from each root layout when the app is built with
  `EXPO_PUBLIC_SENTRY_DSN`.
- **Debug ids:** the shared Metro config adds a debug id to each bundle.
- **Source maps:** Sentry's build plugin uploads source maps only when the
  build has `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT`. Without
  them, builds are unchanged.
- **Not yet confirmed:** native crash reporting cannot be checked without a
  device build.
