# Database

PostgreSQL 16 with PostGIS 3.4. Migrations are plain SQL in
`infrastructure/database/migrations`, applied in order by
`infrastructure/database/src/migrator.ts`.

## Working with migrations

```bash
pnpm db:migrate     # apply pending migrations (uses DATABASE_URL)
pnpm db:status      # list applied and pending migrations
```

- Name files `NNNN_short_name.sql`, the next number after the last file.
- Never edit a migration that has been applied anywhere; the runner rejects
  changed checksums. Write a new migration.
- Each file runs in one transaction. Start a file with `-- migrate:no-transaction`
  for statements that cannot run in a transaction (`CREATE INDEX CONCURRENTLY`).
- Update `apps/api/src/database/types.ts` to match.

## Conventions

- `uuid` primary keys from `gen_random_uuid()`.
- `timestamptz` everywhere, stored in UTC.
- Money is `bigint` kobo (from Phase 3). Never `numeric`/`float` in application code.
- `created_at` / `updated_at` on mutable tables; `set_updated_at()` trigger keeps
  `updated_at` current.
- Status columns use PostgreSQL enums or `CHECK` constraints, so invalid states
  cannot be stored.
- Personal data is anonymised, not deleted, so money and audit records keep their
  references (see DECISIONS D-013).
- Sensitive values (TOTP secrets now; ID numbers and payout accounts later) are
  encrypted by the application before they reach the database (D-015).

## Applied migrations

| Migration                   | Contents                                                                                                                                                                                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0001_extensions             | `postgis`, `citext`; helper functions `set_updated_at()` and `forbid_update_delete()`                                                                                                                                                                                            |
| 0002_identity               | users, roles, permissions, role_permissions, user_roles, user_sessions, user_consents                                                                                                                                                                                            |
| 0003_audit_logs             | audit_logs (append-only)                                                                                                                                                                                                                                                         |
| 0004_seed_roles_permissions | system roles and Phase 1 permissions                                                                                                                                                                                                                                             |
| 0005_driver_onboarding      | vehicle_categories, document_types, requirements per category, driver_profiles, vehicles, file_uploads, driver_documents; driver permissions                                                                                                                                     |
| 0006_core_ride_flow         | service_areas, fare_rules, fare_quotes, rides, ride_requests (offers), ride_events, payments, commissions, saved_places, idempotency_keys; ride permissions                                                                                                                      |
| 0007_trip_locations         | trip_locations (partitioned by day) with partition create/drop functions; rides.actual_distance_meters                                                                                                                                                                           |
| 0008_payments               | wallets, ledger_journals, wallet_transactions (double-entry ledger with database-enforced rules), payment_cards, payouts, refunds, payment_disputes, payment_webhook_events; payments extended; payment permissions; Phase 3 commissions and unpaid fees brought into the ledger |

## Identity domain

```
users 1───* user_roles *───1 roles 1───* role_permissions *───1 permissions
  │
  ├──* user_sessions
  └──* user_consents
audit_logs.actor_user_id ──> users
```

### users

| Column                                            | Type                                | Notes                                                |
| ------------------------------------------------- | ----------------------------------- | ---------------------------------------------------- |
| id                                                | uuid PK                             |                                                      |
| phone_e164                                        | text, unique when not null          | E.164. Null only for deleted (anonymised) accounts   |
| phone_verified_at                                 | timestamptz                         | Set on first successful OTP                          |
| email                                             | citext, unique when not null        | Case-insensitive                                     |
| email_verified_at                                 | timestamptz                         | Null until email verification exists (DECISIONS B-4) |
| full_name                                         | text (1–120)                        |                                                      |
| preferred_language                                | enum `en`/`ha`                      | Drives SMS language                                  |
| status                                            | enum `active`/`suspended`/`deleted` |                                                      |
| suspended_reason                                  | text                                |                                                      |
| totp_secret_encrypted                             | text                                | AES-256-GCM, bound to the row                        |
| totp_enabled_at                                   | timestamptz                         | Null while enrolment is pending                      |
| totp_last_used_step                               | bigint                              | Replay protection                                    |
| last_login_at, created_at, updated_at, deleted_at | timestamptz                         |                                                      |

### roles, permissions, role_permissions, user_roles

`roles.requires_mfa` makes holders pass TOTP before using any permission.
`roles.is_privileged` means managing that role needs `roles.assign_privileged`.
`user_roles.granted_by` records who granted it (null when granted by the system).

Seeded roles and permissions:

| Role          | MFA | Privileged | Permissions                                                                                                               |
| ------------- | --- | ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| passenger     | no  | no         | none                                                                                                                      |
| driver        | no  | no         | none: drivers act on their own application, checked by ownership, not permission                                          |
| fleet_manager | yes | no         | none yet (Phase 6, scoped to one fleet)                                                                                   |
| support_agent | yes | yes        | users.read, drivers.read                                                                                                  |
| admin         | yes | yes        | users.read, users.manage, roles.read, roles.assign, audit_logs.read, drivers.read, drivers.documents_view, drivers.verify |
| super_admin   | yes | yes        | all                                                                                                                       |

### user_sessions

One row per signed-in device. Stores the SHA-256 of the current refresh token and
of the previous one (for reuse detection), `rotated_at`, device name, platform,
last IP and user agent, `mfa_verified_at`, idle and absolute expiry, and
`revoked_at` with a reason (`logout`, `revoked_by_user`, `revoked_by_admin`,
`refresh_token_reuse`, `account_suspended`, `account_deleted`, `mfa_reset`).

### user_consents

One row per accepted policy version per user, with IP, user agent and
`withdrawn_at`. Unique on (user, type, version).

### audit_logs

`actor_type` (`user`/`system`), `actor_user_id`, dotted `action`
(e.g. `admin.user.role_assigned`), `target_type`/`target_id`, `metadata` jsonb, IP,
user agent, request id. UPDATE and DELETE raise an error. Indexed by time, actor
and target.

Actions recorded so far: `admin.user.role_assigned`, `admin.user.role_removed`,
`admin.user.suspended`, `admin.user.reactivated`, `auth.mfa.enabled`,
`auth.mfa.verified`, `auth.mfa.reset`, `auth.session.refresh_token_reused`,
`driver.registration.started`, `driver.document.uploaded`,
`driver.application.submitted`, `admin.driver_document.viewed`,
`admin.driver_document.approved`, `admin.driver_document.rejected`,
`admin.driver.approved`, `admin.driver.rejected`, `driver_document.expired`.

## Drivers domain (Phase 2)

```
users 1───1 driver_profiles 1───* vehicles *───1 vehicle_categories *───* document_types
                    │                                (vehicle_category_document_requirements)
                    └──* driver_documents ───1 file_uploads
```

### vehicle_categories

`key` (`car`, `keke_napep`, `taxi`, `motorcycle`), name, description, passenger
`seats`, `is_enabled` (car and Keke Napep on at launch), `sort_order`.

### document_types and vehicle_category_document_requirements

Each document kind: `scope` (`driver` or `vehicle`), `media` (`photo` = JPEG/PNG,
`document` = also PDF), `requires_expiry`, `requires_number`. The requirement table
says which kinds each category needs (defaults in DECISIONS D-026).

### driver_profiles

One per driver, keyed by `user_id`. `status` (`onboarding`, `pending_review`,
`approved`, `rejected`, `suspended`), NIN (encrypted, keyed lookup hash with a
unique index, last 4), payout bank code / encrypted account number / last 4 /
account name, `submitted_at`, `reviewed_at`, `reviewed_by`, `rejection_reason`,
`approved_at`. Check constraints keep the NIN and payout fields all-or-nothing and
require a reason on rejection.

### vehicles

`driver_user_id`, category, `plate_number` (upper case letters and digits, unique
among active vehicles), make, model, colour, year, `status` (`active`/`retired`).
At most one active vehicle per driver. Fleets (Phase 6) will own vehicles too.

### file_uploads

An upload the API authorised: owner, purpose, object key, declared type and size,
`pending`/`completed`, expiry. A document can only be created from a pending
upload of the same user, once.

### driver_documents

One row per upload (history is kept). Type, vehicle (for vehicle documents),
`status` (`pending`, `approved`, `rejected`, `expired`), object key, verified
content type and size, encrypted document number and last 4, `expires_on` (last
valid day, Nigerian time), reviewer, review time, rejection reason. Indexed for
the latest per driver and type, the pending queue, and the expiry sweep.

## Rides domain (Phase 3)

```
service_areas 1──* fare_rules *──1 vehicle_categories
fare_quotes ──1 fare_rules           (a price shown to a passenger)
rides ──1 fare_quotes                (fare_snapshot frozen at booking)
rides 1──* ride_requests             (offers to drivers, one open at a time)
rides 1──* ride_events               (append-only timeline, ordered by seq)
rides 1──* payments                  (cash fare, outstanding cancellation fee)
rides 1──1 commissions               (owed by the driver for cash rides)
```

- **service_areas:** `key`, `name`, `boundary` (PostGIS MultiPolygon, GiST
  index), `is_active`. A pickup must be inside an active area.
- **fare_rules:** per area and vehicle type, all money in bigint kobo: base, per
  km, per minute, minimum, booking fee, cancellation fee and grace, waiting free
  minutes and per-minute charge, commission (basis points), rounding increment,
  peak windows (jsonb). One active row per area and type; changes add a row.
- **fare_quotes:** pickup/dropoff points and addresses, route distance, duration
  and polyline, the price breakdown and total, expiry.
- **rides:** passenger, driver, vehicle, type, area, status (enum of the 9 states),
  pickup/dropoff, `scheduled_for`, `fare_snapshot` (rule values, breakdown, route),
  quoted, waiting, final and cancellation amounts, commission, payment method,
  search radius and deadline, and a timestamp per step. Partial unique indexes: one
  active immediate ride per passenger; one assigned ride per driver.
- **ride_requests:** ride, driver, status (`offered`, `accepted`, `rejected`,
  `expired`, `withdrawn`), distance to pickup, expiry. Unique per (ride, driver);
  at most one `offered` per driver.
- **ride_events:** `seq` (strict order), event type, from/to status, actor, location,
  metadata. UPDATE and DELETE are refused.
- **payments:** ride, payer, method, purpose (`ride_fare`, `cancellation_fee`),
  amount, status (`collected`, `outstanding`, …), who collected it and when.
- **commissions:** fare, booking fee, basis points, commission,
  `pending_settlement` until Phase 5 settles it from the driver's wallet.
- **saved_places:** home, work (one each) and up to 20 others per user.
- **idempotency_keys:** user, key, scope, request hash, stored response (24 h).

## Trip location history (Phase 4)

- **trip_locations:** ride, driver, point (geography), accuracy, heading, speed,
  `recorded_at` (phone time) and `received_at` (server time). Partitioned by range
  on `recorded_at`, one partition per UTC day (`trip_locations_pYYYYMMDD`); primary
  key `(recorded_at, id)`; index on `(ride_id, recorded_at)`. Only readings taken
  during a ride are stored, attributed by phone time to the ride active then.
- `ensure_trip_location_partitions(from_day, to_day)` creates missing partitions;
  `drop_trip_location_partitions(before_day)` drops whole days older than the
  retention period. The API's maintenance job calls both every 6 hours (2 days
  back to 7 ahead; 90-day retention). There is no default partition.
- **rides.actual_distance_meters:** distance driven between start and completion,
  from readings with accuracy of 50 m or better.

## Payments (Phase 5)

- **wallets:** every account: one per user and kind (`passenger`, `driver`) and the
  platform's own (`system_key`: paystack_balance, passenger_receivables,
  provider_fees, platform_revenue, ride_holds, payouts_in_transit,
  refunds_in_transit). `normal_side` says whether debits or credits increase it;
  `balance_kobo` is in that direction and is written only by the posting trigger
  (an UPDATE that changes it is refused). `min_balance_kobo` is 0 for passenger
  wallets and NULL (no minimum) otherwise. Created by `ensure_system_wallets()`.
- **ledger_journals:** one per money movement: `kind`, unique `reference` (the
  business event, for idempotency), links to the ride, payment, payout, refund or
  dispute, `memo`, `created_by`, and the creating transaction id. Append-only.
- **wallet_transactions:** the journal lines: `amount_kobo` (debit positive, credit
  negative, never zero) and `balance_after_kobo`, ordered by `seq`. Append-only.
  `wallet_transactions_post()` (before insert) locks the wallet, enforces its
  minimum (SQLSTATE `RWM01`), updates the balance and records it; a deferred
  constraint trigger checks at commit that every journal touched sums to zero with
  at least two lines (`RWM02`); lines may only be added in the journal's own
  transaction. `ledger_balance_mismatches()` lists wallets whose balance differs
  from the sum of their lines.
- **payments:** extended for top-ups (`wallet_topup`, `card_link`, with
  `wallet_kind`) and provider payments: `provider`, unique `provider_reference`
  (our payment id), `card_id`, `fee_kobo`, `outstanding_kobo` (still owed),
  `refunded_kobo`, `failure_reason`, `paid_at`. Statuses: pending, succeeded,
  collected (cash), outstanding, failed, abandoned.
- **payment_cards:** saved cards: Paystack authorization code (field-encrypted),
  card `signature` (one live card per user and signature), brand, last 4, expiry,
  bank, `removed_at`. `rides.card_id` is set exactly when a ride is paid by card.
- **payouts:** driver withdrawals: amount, fee, status (pending, processing,
  succeeded, failed, reversed), a snapshot of the bank account, unique
  `provider_reference`, `transfer_code`. `driver_profiles` gains
  `payout_recipient_code` and `payout_account_changed_at`.
- **refunds:** amount, destination (wallet or card), who funds it (platform or
  driver), status, reason, dispute, provider reference, who made it. A payment's
  `refunded_kobo` can never exceed its amount (CHECK).
- **payment_disputes:** passenger reports (one per ride) and provider chargebacks
  (unique `provider_dispute_id`): reason, details, amount, status (open, refunded,
  rejected, won, lost), resolution note, who resolved it and when.
- **payment_webhook_events:** every correctly signed webhook, unique per
  (provider, event key), with its payload, processing time, attempts and last error.
- **commissions:** now settled into the ledger at completion; `journal_id` links the
  journal that moved the money.

## Not in the database

- One-time codes, rate-limit counters, job locks, cached routes: Redis, with expiry.
- Driver online state and live positions (with device and server time) and the
  per-vehicle-type geo index used for matching: Redis.
- Document files: private S3-compatible storage (keys in `driver_documents.object_key`).
- Location readings not yet uploaded: a SQLite buffer on the driver's phone.

## Planned domains

Tables listed in the brief for later phases (passenger_profiles, fleets, bus_*, emergency_alerts,
incident_reports, ratings, reviews, promotions, notifications, support_tickets)
are added by the phase that first needs them. `driver_locations` is not needed:
the live position is in Redis and the history in `trip_locations` (DECISIONS D-042).
