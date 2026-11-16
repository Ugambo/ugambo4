# Launch

How RideswithMe goes live and how it is kept running:

- the go-live checklist
- monitoring and the alert runbooks
- backups and restores
- load-test results
- store builds of the two apps
- the Hausa review

Deployment basics (images, migrations, replicas, health checks) are in
`infrastructure/deployment/README.md`. Every setting is documented in each
app's `.env.example`.

## Go-live checklist

Items marked **you** need accounts, money or decisions that only the business
can provide (see DECISIONS, section B).

| #   | Item                                                                                                         | Where           | Owner     |
| --- | ------------------------------------------------------------------------------------------------------------ | --------------- | --------- |
| 1   | Domain names and TLS for the API, website, admin and partner portal                                          | reverse proxy   | you       |
| 2   | Production PostgreSQL 16 + PostGIS, Redis and S3 bucket (server-side encryption on)                          | hosting         | you       |
| 3   | Secrets: JWT, OTP pepper, lookup hash, field encryption keys, `BACKUP_ENCRYPTION_KEY`, `METRICS_TOKEN`       | secret store    | you       |
| 4   | Termii (SMS) account and sender ID; `SMS_PROVIDER=termii`                                                    | `apps/api/.env` | you       |
| 5   | Paystack live keys, webhook URL and IP allow-list; `PAYMENT_PROVIDER=paystack`                               | `apps/api/.env` | you       |
| 6   | Google Maps keys (server, Android, browser)                                                                  | env files, EAS  | you       |
| 7   | Launch city polygon and fares, entered in admin (Areas, Pricing)                                             | admin dashboard | you       |
| 8   | **SOS on-call phones** in `SOS_ALERT_PHONES`, with a staffed rota covering every hour of service             | `apps/api/.env` | you       |
| 9   | Staff accounts: `grant-role` for the first super admin, then roles in admin                                  | API CLI, admin  | you       |
| 10  | Monitoring stack running, alerts reaching a phone (test with a fake SOS, below)                              | monitoring host | you + dev |
| 11  | Sentry (or GlitchTip) projects; `SENTRY_DSN` for the API and websites, `EXPO_PUBLIC_SENTRY_DSN` for the apps | env files, EAS  | you       |
| 12  | Nightly backup and weekly restore check scheduled; first restore check passed                                | scheduler       | dev       |
| 13  | Hausa reviewed and signed off (`documentation/HAUSA_REVIEW.md`)                                              |                 | you       |
| 14  | Privacy policy and terms published; `CURRENT_POLICY_VERSION` matches the apps                                | website, env    | you       |
| 15  | Store accounts, EAS project, Firebase and APNs credentials; store listings                                   | below           | you       |
| 16  | Load test at expected launch volume against staging (below)                                                  | staging         | dev       |
| 17  | NDPA: data protection officer named, deletion requests checked weekly (admin, Privacy)                       |                 | you       |

## Monitoring

**Metrics.** The API serves Prometheus metrics at `/metrics`, but only with
`Authorization: Bearer $METRICS_TOKEN` (the endpoint is a 404 without the token,
or when the token is unset). Besides the HTTP latency histogram
(`rwm_http_request_duration_seconds`) and Node process metrics
(`rwm_api_*`), it exposes these business gauges, each read from the database
at scrape time:

| Gauge                                                           | Meaning                                                           |
| --------------------------------------------------------------- | ----------------------------------------------------------------- |
| `rwm_sos_open_alerts`                                           | SOS alerts not yet resolved                                       |
| `rwm_sos_oldest_unacknowledged_seconds`                         | how long the oldest unacknowledged SOS has waited                 |
| `rwm_incidents_open_high`                                       | high-priority incident reports open                               |
| `rwm_ledger_mismatched_wallets`                                 | wallets whose balance differs from their ledger lines (must be 0) |
| `rwm_payments_pending_stale`                                    | payments pending at Paystack for over 30 minutes                  |
| `rwm_payouts_stuck`                                             | driver payouts unfinished after 2 hours                           |
| `rwm_rides_searching`, `rwm_rides_active`, `rwm_drivers_online` | the live marketplace                                              |
| `rwm_support_tickets_waiting`, `rwm_deletion_requests_blocked`  | queues for the team                                               |

**Prometheus, Alertmanager and a blackbox prober** run beside the app
servers. The configuration is in `infrastructure/deployment/monitoring/`.

1. Edit the API address in `prometheus.yml`.
2. Edit the receivers in `alertmanager.yml`: a paging service or SMS gateway
   for `page`, and email for `ticket`.
3. Put the token in `metrics-token`, then run
   `docker compose -f docker-compose.monitoring.yml up -d`.

| Alert                        | Severity | When                                                           | Runbook               |
| ---------------------------- | -------- | -------------------------------------------------------------- | --------------------- |
| SosNotAcknowledged           | page     | an SOS waits over 2 minutes                                    | [SOS](#sos)           |
| LedgerMismatch               | page     | any wallet differs from its ledger                             | [Ledger](#ledger)     |
| PaymentsStuckAtProvider      | page     | over 20 payments pending for 30+ minutes                       | [Payments](#payments) |
| ApiDown                      | page     | API or `/health/ready` down for 2 minutes                      | [API down](#api-down) |
| HighErrorRate                | page     | over 2% server errors for 5 minutes                            | [Errors](#errors)     |
| RidesNotMatching             | ticket   | over 10 rides searching with 5+ drivers online, for 10 minutes | [Matching](#matching) |
| HighPriorityIncidentsWaiting | ticket   | a high-priority incident open over 2 hours                     | admin, Incidents      |
| PayoutsStuck                 | ticket   | a payout unfinished after 2 hours                              | [Payments](#payments) |
| SlowApi                      | ticket   | p95 latency over 1 s for 10 minutes                            | [Errors](#errors)     |
| SupportBacklog               | ticket   | over 50 support requests waiting for an hour                   | admin, Support        |

**Errors.** Errors go to Sentry, or a compatible service such as GlitchTip.
Each part is off until it has a DSN. Before sending, every report has removed:

- request data and user details
- console output
- share tokens, phone numbers and email addresses (DECISIONS D-078)

| Part         | Setting                                         | What is reported                                                                                                             |
| ------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| API          | `SENTRY_DSN` in `apps/api/.env`                 | unexpected server errors (5xx, never 4xx)                                                                                    |
| Each website | `SENTRY_DSN` in its `.env.local`                | server errors, and errors in visitors' browsers (Sentry's code is downloaded only when this is set)                          |
| Each app     | `EXPO_PUBLIC_SENTRY_DSN` in the EAS environment | crashes and errors; add `SENTRY_AUTH_TOKEN` (secret), `SENTRY_ORG` and `SENTRY_PROJECT` so release builds upload source maps |

Use one Sentry project per part, or one project with the `app` tag to tell
them apart. `SENTRY_ENVIRONMENT` (`EXPO_PUBLIC_SENTRY_ENVIRONMENT` in the apps)
separates staging from production.

**Logs.** Logs are JSON on stdout, one line per request with its request id.
Authorization headers, OTP codes and tokens are redacted. Ship them with the
host's log driver (for example Loki or CloudWatch). When a user reports a
problem, the `requestId` in the error they saw finds the line.

**Backups** report to a heartbeat monitor (for example healthchecks.io), which
alerts when a ping does not arrive. Point `BACKUP_HEARTBEAT_URL` and
`BACKUP_VERIFY_HEARTBEAT_URL` at it.

## Runbooks

### SOS

_Alert: SosNotAcknowledged._ Someone pressed SOS more than 2 minutes ago and
no staff member has acknowledged it. **This comes before everything else.**

1. Open admin → **SOS**. Every open alert shows:
   - who pressed it (passenger or driver) and how many times
   - their latest location, with an "Open in maps" link
   - the ride, with the other person and vehicle
   - any note they typed
2. Press **Acknowledge**. The person gets a push notification ("Help is
   coming"), and the alert stops paging.
3. Call them on the phone number shown on their user page. If they don't
   answer, or are in danger, call the emergency services (**112**) with the
   location and the vehicle details. Then call the other party on the ride.
4. Keep watching the ride page: the live position and the in-ride messages
   (admin can read them).
5. Press **Resolve** and write what happened and what was done. This is kept
   for the record. If action against an account is needed, suspend it from
   the user page and open an incident.

The on-call phones in `SOS_ALERT_PHONES` get an SMS for every new alert, with
a map link. Repeated presses are texted at most once every 5 minutes. Staff
with the admin dashboard open also get the red banner and a live alert at once.

**Test before launch, and monthly:** sign in to the passenger app with a staff
test account and press SOS. Then check that:

- the SMS reaches every on-call phone
- the admin banner appears
- the page fires after 2 minutes

Acknowledge and resolve it as a test.

### Ledger

_Alert: LedgerMismatch._ A wallet's stored balance differs from the sum of its
ledger lines. Every money movement is double-entry, so this should never
happen. Treat it as a possible bug or tampering.

1. **Stop payouts.** Set `PAYOUTS_PAUSED=true` and restart the API. Drivers'
   withdrawal requests are refused, and any already pending wait. Rides,
   payments and earnings carry on.
2. List the wallets affected:
   `SELECT * FROM ledger_balance_mismatches();`
   (it shows each wallet's stored balance and its ledger sum).
3. For each wallet, read its recent `wallet_transactions` and the matching
   `ledger_entries`. Look for a balance changed outside the ledger, such as a
   manual SQL update. The admin audit log (admin → Audit) shows staff
   adjustments.
4. Correct balances only with an **adjustment** in admin (super admin, with a
   reason). Adjustments are posted to the ledger. Never use SQL.
5. When `ledger_balance_mismatches()` returns nothing, set `PAYOUTS_PAUSED=false`
   and restart the API. Write up the cause.

### Payments

_Alerts: PaymentsStuckAtProvider, PayoutsStuck._ Payments or payouts are
waiting for Paystack.

- Check Paystack's status page and dashboard.
- Check that webhooks arrive: look for `/v1/webhooks/paystack` in the logs. A
  wrong `PAYSTACK_WEBHOOK_IPS` list or a changed secret key rejects them.
- Reconciliation asks Paystack about anything pending every
  `PAYMENT_RECONCILE_INTERVAL_MINUTES`, so items settle once Paystack answers.
  Nothing needs replaying by hand.
- A payout Paystack refused returns the money to the driver's wallet. The
  driver sees it as failed in the payout list. Staff see the reason in admin
  → Payments.

### API down

_Alert: ApiDown._

1. Check the containers (`docker ps`, `docker logs api`).
2. Check `/health/ready`: it reports the database and Redis separately.
3. Check disk space, and whether PostgreSQL or Redis restarted.
4. A failed deploy: roll back to the previous image tag (see
   [Rolling back](#rolling-back)).

### Errors

_Alerts: HighErrorRate, SlowApi._

1. Open Sentry for the newest error groups.
2. Find the request ids in the logs.
3. If it started with a deploy, roll back.
4. Slow requests with a busy database: check `pg_stat_activity` for long
   queries and locks.

### Matching

_Alert: RidesNotMatching._ Drivers are online, but rides stay searching.

1. In admin → Live map, see where the drivers and the waiting rides are. The
   search widens to 3, then 5, then 8 km.
2. Drivers whose last location is over a minute old are not offered rides (bad
   signal, or the app killed in the background).
3. Drivers who owe more than `DRIVER_DEBT_LIMIT_KOBO` are taken offline by the
   dispatcher until they settle up.
4. Check the API logs for "Dispatcher tick failed".

### Backups

_Heartbeat missed._

1. Run the job by hand:
   `docker run --rm --env-file backup.env rideswithme-backup backup`
2. Check the error: database reachable? S3 credentials? Is `pg_dump` older than
   the server (the image must use PostgreSQL 16 or newer)?

## Backups and restores

The `backup` image (`infrastructure/docker/api.Dockerfile`, `--target backup`)
holds the PostgreSQL 16 client tools and the database tool.

**What a backup is.** A `pg_dump` custom-format dump of the whole database,
encrypted with AES-256-CTR and authenticated with HMAC-SHA256. The keys are
derived from `BACKUP_ENCRYPTION_KEY`. It is uploaded to S3 as
`<prefix>YYYY-MM-DD/rideswithme-<time>.dump.enc`. Backups older than
`BACKUP_RETENTION_DAYS` are deleted after each successful backup, but the
newest is always kept. A tampered or truncated file is refused on restore.

**Schedule:**

| Job           | Command         | When                                                     |
| ------------- | --------------- | -------------------------------------------------------- |
| Backup        | `backup`        | nightly at 02:00 Africa/Lagos; hourly once traffic grows |
| Restore check | `verify-backup` | weekly, and after every schema change                    |

A cron entry on the database host or a scheduled container works. For example:

```sh
docker run --rm --env-file /etc/rideswithme/backup.env rideswithme-backup backup
docker run --rm --env-file /etc/rideswithme/backup.env rideswithme-backup verify-backup
```

**The restore check** (`verify-backup`):

1. Restores the newest backup into a new scratch database on the same server.
2. Checks it:
   - every migration is present
   - the users table can be read
   - no wallet differs from its ledger
3. Drops the scratch database and pings `BACKUP_VERIFY_HEARTBEAT_URL`.

The database user needs `CREATEDB` for this.

**Settings** (in `backup.env`; never commit it):

| Variable                                              | Required | Meaning                                                                                                         |
| ----------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                        | yes      | the database to back up. For `verify-backup`, any database on the server; for `restore`, the empty target       |
| `BACKUP_ENCRYPTION_KEY`                               | yes      | 32 random bytes, base64 (`openssl rand -base64 32`). **Store a copy offline: without it no backup can be read** |
| `BACKUP_S3_BUCKET`                                    | yes      | bucket for backups, ideally in another account or region from the app's bucket, with versioning on              |
| `BACKUP_S3_PREFIX`                                    | no       | key prefix (default `postgres/`)                                                                                |
| `BACKUP_S3_REGION`                                    | no       | default `us-east-1`                                                                                             |
| `BACKUP_S3_ENDPOINT`                                  | no       | for S3-compatible storage (Cloudflare R2, Backblaze B2, MinIO)                                                  |
| `BACKUP_S3_FORCE_PATH_STYLE`                          | no       | `true` for MinIO and some S3-compatible services                                                                |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`          | yes*     | credentials allowed to put, get, list and delete under the prefix (*or an instance role)                        |
| `BACKUP_RETENTION_DAYS`                               | no       | default 30                                                                                                      |
| `BACKUP_HEARTBEAT_URL`, `BACKUP_VERIFY_HEARTBEAT_URL` | no       | pinged after each success                                                                                       |

**Restoring for real** (data loss or a new server):

1. Stop the API so nothing writes.
2. Create an empty database with PostGIS available.
3. Run:
   `docker run --rm --env-file backup.env -e DATABASE_URL=<empty db> rideswithme-backup restore latest --yes`
   (or name a key).
4. Run the `migrate` image. A backup taken before the latest release may lack
   the newest migrations.
5. Run `SELECT * FROM ledger_balance_mismatches();`. It must return nothing.
6. Point the API at the restored database and start it.

Anything after the backup is lost. Card payments, top-ups and payouts made in
that window exist at Paystack but not in the database. Compare them against
the Paystack dashboard for that period and put them right with staff
adjustments.

The round trip (backup, list, restore, tamper detection, verify) is tested by
`infrastructure/database/src/backup.test.ts` against real PostgreSQL and S3
storage.

## Load tests

`infrastructure/load-tests` drives a local API with simulated passengers and
drivers (README there). On a development container (one API process, database
and Redis on the same machine), the default run gave:

| Operation                             | Calls | p50 ms | p95 ms | p99 ms |
| ------------------------------------- | ----: | -----: | -----: | -----: |
| Fare estimate                         |   251 |     11 |    202 |    211 |
| Driver location update                |   202 |      8 |    124 |    200 |
| Driver polls for an offer             |   136 |      7 |    119 |    146 |
| Book a ride                           |    30 |     77 |    103 |    104 |
| Accept an offer                       |    30 |     35 |    107 |    109 |
| Matching: booking to driver accepting |    30 |    433 |  1,121 |  1,297 |
| Arrive, start and complete (4 calls)  |    30 |     97 |    261 |    266 |
| Bus seat hold: winner                 |    16 |     29 |     58 |     58 |
| Bus seat hold: seat taken             |   176 |     45 |     80 |     97 |

The run used 30 passengers and 15 drivers:

- Two rounds of 15 simultaneous bookings: all 30 rides were matched and
  completed.
- 16 seat races with 12 passengers each: exactly one winner every time, and no
  seat ever held twice.
- No errors, and no wallet differing from its ledger afterwards.

**Found and fixed by it** (DECISIONS D-075): when two rides were offered to the
same driver at the same moment, the losing transaction was aborted. The
dispatcher then treated the remaining candidates as ineligible and took them
offline. A regression test is in `apps/api/test/rides-matching.e2e.test.ts`.

**Before launch:** run it against staging sized like production, at the
expected peak. For example:
`--passengers 300 --drivers 100 --rounds 3 --estimate-seconds 120`, with two
API replicas. Record the results here.

## Store builds

Both apps build with EAS Build (`eas.json` in each app). The profiles are:

| Profile       | Use                             | Output                                          |
| ------------- | ------------------------------- | ----------------------------------------------- |
| `development` | developers' phones (dev client) | APK / iOS internal build                        |
| `preview`     | testers, pointing at staging    | APK / iOS internal build                        |
| `production`  | the stores                      | AAB / IPA; build numbers increase automatically |

Each profile takes its variables from the EAS environment of the same name
(expo.dev → project → Environment variables):

| Variable                                                     | Notes                                                    |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`                                        | `https://` API address (staging for `preview`)           |
| `EXPO_PUBLIC_POLICY_VERSION`                                 | must equal the API's `CURRENT_POLICY_VERSION`            |
| `EAS_PROJECT_ID`                                             | from `eas init`; push notifications need it              |
| `EXPO_OWNER`                                                 | the Expo account or organisation                         |
| `GOOGLE_SERVICES_JSON`                                       | Firebase config for Android push, as a **file** variable |
| `GOOGLE_MAPS_ANDROID_API_KEY`                                | passenger app (maps)                                     |
| `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_SENTRY_ENVIRONMENT`   | crash reports (optional)                                 |
| `SENTRY_AUTH_TOKEN` (secret), `SENTRY_ORG`, `SENTRY_PROJECT` | source map upload during the build (optional)            |

A `preview` or `production` build stops at once if the API address is not
https, or the project ID or policy version is missing
(`packages/mobile-core/app-config.js`).

**Steps:**

1. Create the Expo organisation, then run `eas init` in each app. Put the
   project IDs in the EAS environments.
2. Run `eas credentials` to give EAS the keys it needs:
   - Firebase Cloud Messaging (Android push)
   - an APNs key (iOS push)
   - the Android upload key, iOS certificates and provisioning profiles
3. Build each app (run from its folder):
   `eas build --profile production --platform all`.
4. Submit: `eas submit --profile production`. Android goes to the internal
   testing track as a draft.

**For the store listings:**

- the privacy policy URL
- the Google Play data safety form and the App Store privacy labels: location,
  phone number, name, photos (driver documents), payment information via
  Paystack
- screenshots in English and Hausa
- app icon and splash screen (DECISIONS B-28)

**The driver app shares location in the background.** Google Play then also
requires:

- the in-app disclosure, which the app shows before asking
- a short video of it in use
- the declaration form

Apple asks for the same explanation in review. The permission texts are in
each app's `app.config.ts`.

The bundle IDs `com.rideswithme.app` and `com.rideswithme.driver` are
placeholders until the store accounts exist (DECISIONS B-27). They cannot be
changed after the first store release.

## Hausa

See `documentation/HAUSA_REVIEW.md`: automatic checks, the export for the
reviewer, the order of review and the sign-off.

## Rolling back

Tag every image with its release when you push it to the registry (CI
builds the images but does not push them). Roll back by starting the previous
API and web images.

Migrations are forward-only and additive within a release, so the previous
API runs against the newer schema. A migration that is not additive (such as a
dropped column) is called out in its release notes, and then a rollback means
a restore.

Mobile apps cannot be rolled back. Ship a fixed build, and keep the API
compatible with the oldest app version still in use.
