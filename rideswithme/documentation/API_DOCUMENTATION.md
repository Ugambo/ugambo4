# API

Base URL in development: `http://localhost:3000`. All bodies are JSON. Typed
client: `@rideswithme/api-client`.

## Conventions

- **Versioning:** product endpoints are under `/v1`.
- **Authentication:** `Authorization: Bearer <accessToken>` on everything except
  routes marked _public_.
- **Language:** send `Accept-Language: ha` or `en`. It sets the language of SMS
  messages and the language stored for new accounts.
- **Request ids:** send `X-Request-Id` (letters, digits, `.`, `_`, `-`, up to 64) or
  one is generated. It is echoed in the `X-Request-Id` header and in error bodies.
- **Validation:** unknown fields are rejected. Phone numbers may be typed in any
  common Nigerian form and are normalised to E.164.
- **Pagination:** list endpoints take `limit` (1–100, default 25) and `cursor`, and
  return `{ items, nextCursor }`. Pass `nextCursor` back until it is `null`.

### Errors

```json
{
  "error": {
    "code": "OTP_INVALID",
    "message": "Wrong code",
    "details": { "attemptsRemaining": 3 }
  },
  "requestId": "…"
}
```

`message` is English for logs. Show users the translation of `code` (catalogues in
`@rideswithme/utilities`). Rate-limited responses carry `retryAfterSeconds` and a
`Retry-After` header.

| Code                                                       | HTTP      | Meaning                                                                |
| ---------------------------------------------------------- | --------- | ---------------------------------------------------------------------- |
| VALIDATION_FAILED                                          | 422       | Body, query or path is invalid; `details` lists the problems           |
| UNAUTHENTICATED                                            | 401       | Missing, invalid or expired access token. Refresh and retry            |
| SESSION_REVOKED                                            | 401       | Session ended (logout, revoked, suspended). Sign in again              |
| REFRESH_TOKEN_INVALID                                      | 401       | Refresh token rejected. Sign in again                                  |
| FORBIDDEN                                                  | 403       | Missing permission; `details.missing` lists them                       |
| MFA_REQUIRED                                               | 403       | Role needs TOTP; `details.enrolled` says whether to set up or verify   |
| ACCOUNT_SUSPENDED                                          | 403       | Account suspended                                                      |
| NOT_FOUND                                                  | 404       |                                                                        |
| CONFLICT                                                   | 409       | E.g. email already used                                                |
| LAST_SUPER_ADMIN                                           | 409       | Would leave no active super admin                                      |
| TOTP_NOT_ENROLLED / TOTP_ALREADY_ENABLED                   | 409       |                                                                        |
| OTP_INVALID / OTP_EXPIRED / TOTP_INVALID                   | 422       |                                                                        |
| RATE_LIMITED / OTP_RESEND_TOO_SOON / OTP_TOO_MANY_ATTEMPTS | 429       | Wait `retryAfterSeconds`                                               |
| SMS_DELIVERY_FAILED                                        | 502       | SMS vendor failed; retry is allowed straight away                      |
| DRIVER_NOT_REGISTERED                                      | 404       | No driver application yet                                              |
| DRIVER_PROFILE_LOCKED                                      | 409       | Application submitted or approved; details can't change                |
| DRIVER_INCOMPLETE                                          | 422       | `details.gaps` (driver) or `details.blockers` (admin approval)         |
| INVALID_STATE                                              | 409       | Not allowed in the current status (e.g. approving a reviewed document) |
| UPLOAD_INVALID                                             | 422       | `details.reason` says why the file can't be used                       |
| NIN_ALREADY_REGISTERED / PLATE_ALREADY_REGISTERED          | 409       | Already on another driver                                              |
| VEHICLE_CATEGORY_UNAVAILABLE                               | 422       | Vehicle type not enabled                                               |
| STORAGE_UNAVAILABLE                                        | 503       | Object storage unreachable; retry                                      |
| OUTSIDE_SERVICE_AREA / ROUTE_NOT_FOUND                     | 422       | Pickup outside every area / no route                                   |
| QUOTE_EXPIRED                                              | 422       | Ask for a new estimate                                                 |
| PAYMENT_METHOD_UNAVAILABLE                                 | 422       | Payment method not offered                                             |
| WALLET_INSUFFICIENT_FUNDS                                  | 422       | Wallet balance too low (booking by wallet, adjustment)                 |
| WALLET_LIMIT_EXCEEDED                                      | 422       | Top-up would pass the wallet's maximum balance                         |
| OUTSTANDING_BALANCE                                        | 402       | Passenger owes money (`details.owedKobo`); top up before booking       |
| CARD_NOT_FOUND                                             | 422       | Not one of the passenger's saved cards                                 |
| PAYMENT_PROVIDER_UNAVAILABLE                               | 503       | Paystack unreachable or refused; retry                                 |
| PAYOUT_UNAVAILABLE                                         | 422       | Below the minimum, above the balance, or a payout already on its way   |
| PAYOUT_ACCOUNT_RECENTLY_CHANGED                            | 409       | Withdrawals paused after a bank change (`details.pausedUntil`)         |
| REFUND_NOT_ALLOWED                                         | 422       | More than is refundable, or not refundable that way                    |
| DISPUTE_EXISTS                                             | 409       | A problem was already reported for this ride                           |
| WEBHOOK_SIGNATURE_INVALID                                  | 401       | Webhook signature missing or wrong                                     |
| RIDE_ALREADY_ACTIVE                                        | 409       | One ride at a time                                                     |
| OFFER_UNAVAILABLE                                          | 409       | Offer expired or taken                                                 |
| DRIVER_NOT_ELIGIBLE                                        | 403       | `details.blockers`                                                     |
| IDEMPOTENCY_KEY_REQUIRED / IDEMPOTENCY_CONFLICT            | 422 / 409 | See booking                                                            |
| MAPS_UNAVAILABLE                                           | 503       | Maps vendor unreachable; retry                                         |
| INTERNAL_ERROR                                             | 500       | Quote the `requestId` to support                                       |

## Health

| Method | Path            | Notes                                                        |
| ------ | --------------- | ------------------------------------------------------------ |
| GET    | `/health/live`  | _Public._ `{ "status": "ok" }` while the process runs        |
| GET    | `/health/ready` | _Public._ Checks PostgreSQL and Redis; 503 if either is down |

## Authentication

### POST /v1/auth/otp/request — _public_

```json
{ "phone": "0803 123 4567", "language": "ha" }
```

`language` is optional (falls back to `Accept-Language`, then the account's saved
language, then English). Response `200`:

```json
{ "expiresInSeconds": 300, "resendAfterSeconds": 60 }
```

The response is identical whether or not the number has an account.
Errors: `VALIDATION_FAILED`, `OTP_RESEND_TOO_SOON`, `RATE_LIMITED`, `SMS_DELIVERY_FAILED`.

### POST /v1/auth/otp/verify — _public_

Signs in, creating a passenger account on first use.

```json
{
  "phone": "08031234567",
  "code": "123456",
  "acceptedPolicyVersion": "2026-11",
  "device": { "name": "Tecno Spark 10", "platform": "android" }
}
```

`acceptedPolicyVersion` must equal the server's current version (the sign-in
screen shows the terms and privacy notice; this records consent). If it does not,
`422 VALIDATION_FAILED` with `details.currentPolicyVersion`. `device.platform` is
`ios`, `android`, `web` or `unknown`.

Response `200`:

```json
{
  "isNewUser": true,
  "tokens": {
    "accessToken": "eyJ…",
    "accessTokenExpiresIn": 900,
    "refreshToken": "8a4c…-….<random>",
    "refreshTokenExpiresAt": "2026-12-12T15:00:00.000Z"
  },
  "user": { "…": "see GET /v1/me" }
}
```

Errors: `OTP_INVALID` (with `attemptsRemaining`), `OTP_EXPIRED`,
`OTP_TOO_MANY_ATTEMPTS`, `ACCOUNT_SUSPENDED`, `RATE_LIMITED`.

### POST /v1/auth/refresh — _public_

```json
{ "refreshToken": "…" }
```

Returns a new `tokens` object (same shape as above). The old refresh token stops
working; reusing it later signs out that device (theft protection). A retry within
60 seconds after a lost response is accepted. Store the new refresh token before
using the new access token. Errors: `REFRESH_TOKEN_INVALID`, `ACCOUNT_SUSPENDED`.

### POST /v1/auth/logout

Ends the current session. `204`.

### GET /v1/auth/sessions

The user's signed-in devices:

```json
[
  {
    "id": "…",
    "deviceName": "Tecno Spark 10",
    "platform": "android",
    "createdAt": "…",
    "lastUsedAt": "…",
    "current": true
  }
]
```

### DELETE /v1/auth/sessions/:id

Signs out one of the user's own devices. `204`, or `404` if it is not theirs.

### POST /v1/auth/realtime-ticket

`{ ticket, expiresIn: 60 }`: a short-lived credential for opening a live
connection (see [Live updates](#live-updates-phase-4)), for web apps whose
browsers do not hold an access token. It cannot be used on the HTTP API.

### Two-factor authentication (TOTP)

Needed by fleet managers, support agents, admins and super admins before any
admin endpoint. Each session must verify; verification lasts 12 hours.

| Method | Path                         | Body                   | Response                                                                                                      |
| ------ | ---------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| POST   | `/v1/auth/mfa/totp/setup`    | –                      | `{ otpauthUrl, secret }`. Show `otpauthUrl` as a QR code. Calling again before activation replaces the secret |
| POST   | `/v1/auth/mfa/totp/activate` | `{ "code": "123456" }` | `MeResponse`. Turns TOTP on and verifies this session                                                         |
| POST   | `/v1/auth/mfa/totp/verify`   | `{ "code": "123456" }` | `MeResponse`. Verifies this session                                                                           |

Errors: `TOTP_INVALID`, `TOTP_NOT_ENROLLED`, `TOTP_ALREADY_ENABLED`, `RATE_LIMITED`
(5 attempts per 15 minutes).

## Current user

### GET /v1/me

```json
{
  "id": "…",
  "phone": "+2348031234567",
  "email": null,
  "emailVerified": false,
  "fullName": "Amina Bello",
  "preferredLanguage": "ha",
  "status": "active",
  "roles": ["passenger"],
  "permissions": [],
  "mfa": { "required": false, "enrolled": false, "verifiedForSession": false },
  "createdAt": "…"
}
```

### PATCH /v1/me

Any of `fullName` (2–120), `email` (or `null` to remove), `preferredLanguage`
(`en`/`ha`). A changed email starts unverified. `409 CONFLICT` if the email
belongs to another account.

## Admin

All need the listed permission, and TOTP verification for the session.

| Method | Path                              | Permission      | Notes                                                                                                              |
| ------ | --------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------ |
| GET    | `/v1/admin/users`                 | users.read      | Query: `search` (phone in any format, name or email), `role`, `status`, `limit`, `cursor`                          |
| GET    | `/v1/admin/users/:id`             | users.read      | `AdminUserSummary`                                                                                                 |
| POST   | `/v1/admin/users/:id/roles`       | roles.assign    | `{ "role": "driver" }`. Privileged roles need roles.assign_privileged. Idempotent                                  |
| DELETE | `/v1/admin/users/:id/roles/:role` | roles.assign    | Same rule; `409 LAST_SUPER_ADMIN` protection                                                                       |
| POST   | `/v1/admin/users/:id/suspend`     | users.manage    | `{ "reason": "…" }`. Signs the user out everywhere. Staff accounts need roles.assign_privileged; not yourself      |
| POST   | `/v1/admin/users/:id/reactivate`  | users.manage    |                                                                                                                    |
| GET    | `/v1/admin/roles`                 | roles.read      | Roles with their permissions                                                                                       |
| GET    | `/v1/admin/audit-logs`            | audit_logs.read | Query: `actorUserId`, `targetId`, `action` (a prefix: `payments.` matches every payment action), `limit`, `cursor` |

`AdminUserSummary`:

```json
{
  "id": "…",
  "phone": "+234…",
  "email": null,
  "fullName": "…",
  "status": "active",
  "roles": ["driver", "passenger"],
  "createdAt": "…",
  "lastLoginAt": "…"
}
```

Every role change, suspension and reactivation is written to the audit log with
the actor, IP, user agent and request id.

## Drivers (Phase 2)

### GET /v1/vehicle-categories — _public_

Enabled vehicle types with the documents each requires:

```json
[
  {
    "key": "car",
    "name": "Car",
    "description": "…",
    "seats": 4,
    "requiredDocuments": ["profile_photo", "national_id", "…"]
  }
]
```

### The driver's application

Any signed-in user can start an application; it gives them the `driver` role. All
of these act on the caller's own application and return the full
`DriverOnboardingView` (below) unless noted.

| Method | Path                        | Body                                                                  | Notes                                                                                              |
| ------ | --------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| POST   | `/v1/driver/registration`   | –                                                                     | Starts or resumes. Idempotent                                                                      |
| GET    | `/v1/driver/onboarding`     | –                                                                     | `404 DRIVER_NOT_REGISTERED` before registration                                                    |
| PATCH  | `/v1/driver/profile`        | `{ "fullName"?, "nin"? }`                                             | NIN: 11 digits, spaces allowed. `409 NIN_ALREADY_REGISTERED`                                       |
| PUT    | `/v1/driver/vehicle`        | `{ "categoryKey", "plateNumber", "make", "model", "colour", "year" }` | Plate normalised to `ABC123DE`. `409 PLATE_ALREADY_REGISTERED`, `422 VEHICLE_CATEGORY_UNAVAILABLE` |
| PUT    | `/v1/driver/payout-account` | `{ "bankCode", "accountNumber", "accountName" }`                      | 10-digit NUBAN                                                                                     |
| POST   | `/v1/driver/submit`         | –                                                                     | `422 DRIVER_INCOMPLETE` with `details.gaps` until everything is in                                 |

Profile, vehicle and payout changes return `409 DRIVER_PROFILE_LOCKED` once the
application is submitted or approved.

### Uploading a document (three steps)

1. **Ask to upload.** `POST /v1/driver/documents/uploads`
   ```json
   { "documentType": "drivers_licence", "contentType": "application/pdf", "sizeBytes": 183402 }
   ```
   `contentType` is `image/jpeg`, `image/png` or `application/pdf` (photos:
   images only); `sizeBytes` at most 10 MB. Returns a ticket:
   ```json
   {
     "uploadId": "…",
     "uploadUrl": "https://storage…",
     "method": "PUT",
     "headers": { "Content-Type": "application/pdf", "x-amz-server-side-encryption": "AES256" },
     "expiresAt": "…"
   }
   ```
   Vehicle documents need the vehicle first (`422 DRIVER_INCOMPLETE`). Limited to
   40 per hour.
2. **Upload the file** with `PUT uploadUrl`, sending exactly `headers` and the
   exact number of bytes declared. No API token: the URL is the permission.
3. **Attach it.** `POST /v1/driver/documents` → `201` `DriverDocumentView`
   ```json
   { "uploadId": "…", "documentNumber": "KTN-12345-AB67", "expiresOn": "2027-09-30" }
   ```
   `documentNumber` is required where the type needs one (driver's licence);
   `expiresOn` (last valid day, `YYYY-MM-DD`) where the type expires, and it must
   not be in the past. `422 UPLOAD_INVALID` with `details.reason`:
   `not_found` (file not uploaded), `already_used`, `expired`, `too_large`,
   `size_mismatch`, `wrong_type` (the bytes are not the declared type).

### DriverOnboardingView

```json
{
  "userId": "…",
  "status": "onboarding | pending_review | approved | rejected | suspended",
  "rejectionReason": null,
  "submittedAt": null,
  "approvedAt": null,
  "profile": { "fullName": "Musa Abdullahi", "ninLast4": "8901" },
  "payoutAccount": {
    "bankCode": "058",
    "accountName": "Musa Abdullahi",
    "accountNumberLast4": "6789"
  },
  "vehicle": {
    "id": "…",
    "category": { "key": "car", "name": "Car" },
    "plateNumber": "KTN452XA",
    "make": "Toyota",
    "model": "Corolla",
    "colour": "Silver",
    "year": 2016
  },
  "requirements": [
    {
      "key": "drivers_licence",
      "name": "Driver's licence",
      "scope": "driver",
      "media": "document",
      "requiresExpiry": true,
      "requiresNumber": true,
      "status": "missing | pending | approved | rejected | expired",
      "latest": {
        "id": "…",
        "documentType": "drivers_licence",
        "status": "pending",
        "contentType": "application/pdf",
        "sizeBytes": 183402,
        "numberLast4": "AB67",
        "expiresOn": "2027-09-30",
        "rejectionReason": null,
        "createdAt": "…",
        "reviewedAt": null
      },
      "hasValidApproval": false
    }
  ],
  "editable": true,
  "submission": {
    "ready": false,
    "gaps": [{ "code": "NIN" }, { "code": "DOCUMENT", "documentType": "insurance_certificate" }]
  },
  "eligibility": {
    "canGoOnline": false,
    "blockers": [
      { "code": "DRIVER_NOT_APPROVED" },
      { "code": "DOCUMENT_EXPIRED", "documentType": "drivers_licence" }
    ]
  }
}
```

`eligibility` decides whether the driver may go online (Phase 3). Blocker codes:
`ACCOUNT_NOT_ACTIVE`, `DRIVER_NOT_APPROVED`, `NO_ACTIVE_VEHICLE`,
`VEHICLE_CATEGORY_DISABLED`, `DOCUMENT_NOT_APPROVED`, `DOCUMENT_EXPIRED`.

## Admin: driver verification

| Method | Path                                                   | Permission             | Notes                                                                                                                                                           |
| ------ | ------------------------------------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/admin/drivers`                                    | drivers.read           | `queue=review` (default: waiting on a reviewer, oldest first) or `all` (newest first); `status`, `search` (name, phone in any format, plate), `limit`, `cursor` |
| GET    | `/v1/admin/drivers/:id`                                | drivers.read           | `DriverOnboardingView` plus `phone`, `accountStatus`, `documentHistory` (every upload), `reviewedBy`, `reviewedAt`                                              |
| POST   | `/v1/admin/drivers/:id/documents/:documentId/view-url` | drivers.documents_view | `{ url, contentType, expiresAt }`: a 60-second link. Audited                                                                                                    |
| POST   | `/v1/admin/drivers/:id/documents/:documentId/approve`  | drivers.verify         | `{ "expiresOn"? }` to set or correct the expiry. Pending documents only                                                                                         |
| POST   | `/v1/admin/drivers/:id/documents/:documentId/reject`   | drivers.verify         | `{ "reason", "withdrawApproval"? }`. Rejecting an approved document needs `withdrawApproval: true`                                                              |
| POST   | `/v1/admin/drivers/:id/approve`                        | drivers.verify         | Only `pending_review`, and only when every required document is approved and in date (`422 DRIVER_INCOMPLETE` lists blockers). Sends an SMS                     |
| POST   | `/v1/admin/drivers/:id/reject`                         | drivers.verify         | `{ "reason" }`. Back to the driver to fix; sends an SMS                                                                                                         |

Reviewers cannot act on their own application (`403`). Conflicting decisions on
the same item get `409 INVALID_STATE`. Every view and decision is audited.

## Rides (Phase 3)

### Places and saved places

| Method | Path                                                 | Notes                                                                                                       |
| ------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/places/autocomplete?q=&lat=&lng=&sessionToken=` | Nigeria only, biased near `lat,lng`. Returns `[{ placeId, primaryText, secondaryText }]`. 120 per minute    |
| GET    | `/v1/places/details/:placeId?sessionToken=`          | `{ placeId, name, address, location: { lat, lng } }`                                                        |
| GET    | `/v1/places/reverse?lat=&lng=`                       | Address for a point                                                                                         |
| GET    | `/v1/me/saved-places`                                | Home, work and others                                                                                       |
| POST   | `/v1/me/saved-places`                                | `{ label: home\|work\|other, name, address, location, placeId? }`. Saving home or work replaces the old one |
| DELETE | `/v1/me/saved-places/:id`                            |                                                                                                             |

### POST /v1/fares/estimate

```json
{
  "pickup": { "location": { "lat": 12.0, "lng": 8.5167 }, "address": "Kurmi Market, Kano" },
  "dropoff": { "location": { "lat": 12.0476, "lng": 8.5246 }, "address": "Kano Airport" }
}
```

Returns the route and one option per available vehicle type, each with a
`quoteId` (valid 10 minutes), the total, the full `breakdown` (base, distance,
time, peak surcharge, minimum top-up, booking fee, rounding) and `etaSeconds` of
the nearest available driver (`null` when none is near).
`422 OUTSIDE_SERVICE_AREA` when the pickup is outside every active area.

### Booking and the passenger's rides

| Method | Path                         | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/v1/rides`                  | **`Idempotency-Key` header required.** `{ quoteId, paymentMethod: "cash" \| "wallet" \| "card", cardId?, scheduledFor? }` → `201 RideView`. `cardId` (a saved card) is required for card and only then. Wallet holds the quoted price at once. `scheduledFor` 15 minutes to 7 days ahead. Errors: `QUOTE_EXPIRED`, `OUTSTANDING_BALANCE`, `WALLET_INSUFFICIENT_FUNDS`, `CARD_NOT_FOUND`, `RIDE_ALREADY_ACTIVE`, `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_CONFLICT` |
| GET    | `/v1/rides/active`           | Current ride and scheduled rides                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| GET    | `/v1/rides`                  | History, newest first, `cursor` paging                                                                                                                                                                                                                                                                                                                                                                                                                             |
| GET    | `/v1/rides/:id`              | `RideView`. Changes also arrive live as `ride:updated`                                                                                                                                                                                                                                                                                                                                                                                                             |
| POST   | `/v1/rides/:id/cancel`       | `{ reason? }`. Until the trip starts. Free while searching and for 2 minutes after a driver accepts; then the fee in `fare.cancellationPolicy`                                                                                                                                                                                                                                                                                                                     |
| GET    | `/v1/rides/:id/driver-photo` | 60-second link to the assigned driver's approved photo, while the ride is active                                                                                                                                                                                                                                                                                                                                                                                   |

`RideView`: `id`, `status`, `category`, `pickup`, `dropoff`, `route` (distance,
duration, polyline), `scheduledFor`, `paymentMethod`, `fare` (`quotedTotalKobo`,
`waitingChargeKobo`, `finalTotalKobo`, `cancellationFeeKobo`,
`cancellationPolicy`, `breakdown`), `driver` (`firstName`, vehicle make, model,
colour and plate, `position` with `recordedAt`/`receivedAt` while the ride is
active, `hasPhoto`), `payment` (`method`, `status`, `card` brand and last 4,
`outstandingKobo`, `refundedKobo`, `disputed`), `actualDistanceMeters` (distance driven, from the trip's
location history, once completed), and a timestamp per step.

Statuses: `requested` (scheduled) → `searching` → `driver_assigned` →
`driver_arrived` → `in_progress` → `completed`, or `cancelled_by_passenger`,
`cancelled_by_driver`, `no_driver_found`.

### Driver: availability, requests and trips

| Method | Path                            | Notes                                                                                                                                                                                                                                                                                                    |
| ------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/driver/availability`       | `{ online, blockers, position }`                                                                                                                                                                                                                                                                         |
| POST   | `/v1/driver/availability`       | `{ online: true, location: { lat, lng, recordedAt, accuracy?, heading?, speed? } }` or `{ online: false }`. `403 DRIVER_NOT_ELIGIBLE` with `blockers` (including `WALLET_DEBT` with `owedKobo` and `limitKobo`)                                                                                          |
| POST   | `/v1/driver/location`           | `{ points: [...] }` (1–500, e.g. buffered while offline) → `{ position, stored }`. The newest reading becomes the position; older ones never move the driver back. Readings taken during a ride are kept as its history (`stored` counts them); readings over 48 h old are dropped. 60 requests a minute |
| GET    | `/v1/driver/offers/current`     | `{ offer }`: pickup, dropoff, distance to pickup, trip distance and time, fare, estimated earnings, `expiresAt` (15 s)                                                                                                                                                                                   |
| POST   | `/v1/driver/offers/:id/accept`  | `DriverRideView`. `409 OFFER_UNAVAILABLE` if expired, answered, or another driver got the ride                                                                                                                                                                                                           |
| POST   | `/v1/driver/offers/:id/reject`  | `204`; the next driver is asked                                                                                                                                                                                                                                                                          |
| GET    | `/v1/driver/rides/active`       | `{ ride }`                                                                                                                                                                                                                                                                                               |
| GET    | `/v1/driver/rides`              | History with `earnings` (fare, booking fee, commission, net)                                                                                                                                                                                                                                             |
| POST   | `/v1/driver/rides/:id/arrived`  |                                                                                                                                                                                                                                                                                                          |
| POST   | `/v1/driver/rides/:id/start`    | Adds the waiting charge if the driver waited beyond the free minutes                                                                                                                                                                                                                                     |
| POST   | `/v1/driver/rides/:id/complete` | `{ cashCollectedKobo }` (cash trips; send 0 otherwise). Settles the fare: on cash trips the booking fee and commission come from the driver's wallet; wallet and card trips credit the driver's earnings to it                                                                                           |
| POST   | `/v1/driver/rides/:id/cancel`   | `{ reason: passenger_no_show\|vehicle_problem\|safety_concern\|other, note? }`. A no-show needs 5 minutes' wait at the pickup and charges the passenger the cancellation fee                                                                                                                             |

Steps out of order return `409 INVALID_STATE`; other drivers' rides return `404`.

### Admin

| Method | Path                                   | Permission           | Notes                                                                                                                    |
| ------ | -------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/v1/admin/service-areas`              | rides.read           | GeoJSON boundaries                                                                                                       |
| PUT    | `/v1/admin/service-areas`              | service_areas.manage | `{ key, name, boundary: GeoJSON Polygon or MultiPolygon, isActive }`; create or replace by key; invalid polygons refused |
| GET    | `/v1/admin/fare-rules`                 | rides.read           | Active rule per area and vehicle type                                                                                    |
| PUT    | `/v1/admin/fare-rules/:area/:category` | pricing.manage       | All rule fields in kobo/basis points, `peakWindows`. Audited with old and new values                                     |
| GET    | `/v1/admin/rides`                      | rides.read           | Filter by `status`, `passengerId`, `driverId`                                                                            |
| GET    | `/v1/admin/rides/:id`                  | rides.read           | Ride plus its full event timeline                                                                                        |

## Live updates (Phase 4)

Socket.IO at path `/realtime` on the API's address (websocket transport). Browser
origins must be listed in `CORS_ORIGINS`.

**Connecting:** pass `auth: { token }`, an access token or a realtime ticket. A
refused handshake fails with the error message `UNAUTHENTICATED` (refresh the
token and reconnect) or `SESSION_REVOKED` (signed out or suspended: sign in again).
Each user is in a private room from the start; nothing needs subscribing for their
own rides.

**Server → client events**

| Event             | To                                                | Payload                                                                                 |
| ----------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `ride:updated`    | The passenger, the driver, and the ride's room    | `RideView` for the passenger, `DriverRideView` for the driver                           |
| `driver:position` | The passenger of the driver's active ride         | `{ rideId, position: { lat, lng, recordedAt, receivedAt } }`                            |
| `offer:new`       | The driver offered a ride                         | `DriverOfferView`                                                                       |
| `offer:closed`    | The driver, when an offer expires or is withdrawn | `{ offerId, reason }`, reason `expired` or `withdrawn`                                  |
| `session:ended`   | Every connection of a session that has ended      | `{ code: "SESSION_REVOKED" }`; the connection then closes                               |
| `ops:ride`        | Staff in the `ops` room (Phase 6)                 | `{ id, status, category, pickup, dropoff, driverId, requestedAt }` on every ride change |
| `ops:driver`      | Staff in the `ops` room (Phase 6)                 | `{ driverId, lat, lng, receivedAt, rideId }` for every driver position                  |

**Client → server messages** (with acknowledgement `{ ok: true, … }` or `{ ok: false, code }`)

| Message           | Who                                                                                   | Body                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `ride:subscribe`  | The ride's passenger or driver; staff with `rides.read` after two-factor verification | `{ rideId }`. Joins the ride's room (`NOT_FOUND` otherwise)                                 |
| `location:update` | Drivers                                                                               | Same as `POST /v1/driver/location`; acknowledgement `{ ok, position, stored }`. 60 a minute |
| `ops:subscribe`   | Staff with `rides.read` after two-factor verification                                 | No body. Joins the `ops` room (`FORBIDDEN` otherwise); load `GET /v1/admin/live` first      |

Events sent while a client is offline are not replayed: refetch state (for
example `GET /v1/rides/active`) after reconnecting.

## Payments (Phase 5)

All amounts are kobo. Paying happens on the provider's page: create a checkout,
open `checkoutUrl` (browser or in-app browser), and when the payer comes back
check the payment with `GET /v1/payments/:id?refresh=1`. The app's return is never
taken as proof of payment; the provider's answer is.

### Passenger wallet, cards and disputes

| Method | Path                      | Notes                                                                                                                                                                                         |
| ------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/wallet`              | `{ balanceKobo, owedKobo, heldKobo, limits }`                                                                                                                                                 |
| GET    | `/v1/wallet/transactions` | Lines, newest first, `cursor` paging: `{ kind, amountKobo (+ in / − out), balanceAfterKobo, rideId, memo, createdAt }`                                                                        |
| POST   | `/v1/wallet/topups`       | **`Idempotency-Key` required.** `{ amountKobo, returnTo: "web" \| "app" }` → `201 { payment, checkoutUrl }`. Errors: `VALIDATION_FAILED` (`details.minKobo/maxKobo`), `WALLET_LIMIT_EXCEEDED` |
| GET    | `/v1/payments/:id`        | The payer's payment. `?refresh=1` asks the provider first if it is still pending                                                                                                              |
| GET    | `/v1/payment-cards`       | Saved cards: `{ id, brand, last4, expMonth, expYear, bank, expired }`                                                                                                                         |
| POST   | `/v1/payment-cards`       | **`Idempotency-Key` required.** `{ returnTo }` → checkout for a small charge (₦50) that saves the card and goes into the wallet                                                               |
| DELETE | `/v1/payment-cards/:id`   | `204`                                                                                                                                                                                         |
| POST   | `/v1/rides/:id/dispute`   | `{ reason: overcharged \| wrong_route \| ride_did_not_happen \| driver_behaviour \| charged_twice \| other, details? }` → `201 DisputeView`. Once per ride, within 30 days                    |
| GET    | `/v1/rides/:id/dispute`   | The passenger's report and its outcome                                                                                                                                                        |

Payment statuses: `pending` (waiting for the provider), `succeeded`, `collected`
(cash), `outstanding` (owed: `outstandingKobo`), `failed`, `abandoned`.

### Driver wallet and payouts

| Method | Path                             | Notes                                                                                                                                                        |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/v1/driver/wallet`              | `{ balanceKobo (negative = owed), debtLimitKobo, canGoOnline, payout: { minKobo, availableKobo, pausedUntil, account }, earnings: { today, week }, limits }` |
| GET    | `/v1/driver/wallet/transactions` | As for passengers                                                                                                                                            |
| POST   | `/v1/driver/wallet/topups`       | **`Idempotency-Key` required.** As for passengers (to clear what is owed)                                                                                    |
| GET    | `/v1/driver/payouts`             | `{ id, amountKobo, feeKobo, status: pending \| processing \| succeeded \| failed \| reversed, account, failureReason, requestedAt, completedAt }`            |
| POST   | `/v1/driver/payouts`             | **`Idempotency-Key` required.** `{ amountKobo }`. Errors: `PAYOUT_UNAVAILABLE`, `PAYOUT_ACCOUNT_RECENTLY_CHANGED`                                            |

`earnings.today` and `.week` (Nigerian time, weeks from Monday): `trips`,
`earningsKobo` (kept), `commissionKobo`, `bookingFeesKobo`, `cashCollectedKobo`.

### Webhooks

`POST /v1/webhooks/paystack` (public). Set it as the webhook URL in the Paystack
dashboard. Requests must carry `x-paystack-signature`, the HMAC-SHA512 of the raw
body with the secret key, or are refused with `401 WEBHOOK_SIGNATURE_INVALID`.
Handled events: `charge.success`, `transfer.success`, `transfer.failed`,
`transfer.reversed`, `refund.processed`, `refund.failed`, `charge.dispute.create`,
`charge.dispute.resolve`; others are stored and ignored. Repeats are ignored.

With `PAYMENT_PROVIDER=fake`, `GET /v1/dev/fake-checkout/:reference` is a test
payment page (buttons: pay, pay with a card that declines later charges, decline,
cancel). It answers 404 otherwise.

### Admin

| Method | Path                                     | Permission      | Notes                                                                                                                                       |
| ------ | ---------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/admin/payments`                     | payments.read   | Filter by `payerId`, `rideId`, `status`                                                                                                     |
| GET    | `/v1/admin/payments/:id/refunds`         | payments.read   |                                                                                                                                             |
| POST   | `/v1/admin/payments/:id/refunds`         | payments.refund | **`Idempotency-Key` required.** `{ amountKobo, destination: wallet \| card, fundedBy: platform \| driver, reason, disputeId? }`. Audited    |
| GET    | `/v1/admin/disputes`                     | payments.read   | `?status=open\|refunded\|rejected\|won\|lost`                                                                                               |
| POST   | `/v1/admin/disputes/:id/resolve`         | payments.refund | `{ outcome: "refund", amountKobo, destination?, fundedBy?, note }` or `{ outcome: "reject", note }`. Audited                                |
| GET    | `/v1/admin/payouts`                      | payments.read   | `?status=`                                                                                                                                  |
| POST   | `/v1/admin/payouts/:id/retry`            | payouts.manage  | Sends a payout that never reached the provider. Audited                                                                                     |
| GET    | `/v1/admin/users/:id/wallets`            | payments.read   | Both wallets with recent lines                                                                                                              |
| POST   | `/v1/admin/users/:id/wallet-adjustments` | wallets.adjust  | **`Idempotency-Key` required.** `{ amountKobo (+ credit / − debit), kind: passenger \| driver, reason }`, against platform revenue. Audited |
| GET    | `/v1/admin/ledger`                       | payments.read   | Platform account balances and the number of wallets whose balance differs from their lines (should be 0)                                    |

## Admin and fleet (Phase 6)

### Admin operations

| Method | Path                         | Permission   | Notes                                                                                                                                                                                                                                 |
| ------ | ---------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/admin/dashboard`        | rides.read   | `{ kpis: { riders, newRidersToday, drivers, driversOnline, activeRides, tripsToday, faresTodayKobo, revenueTodayKobo, openDisputes }, days: [{ date, trips, faresKobo, revenueKobo }] }`, the last 14 Nigerian days (DECISIONS D-056) |
| GET    | `/v1/admin/live`             | rides.read   | `{ drivers: [{ driverId, name, lat, lng, receivedAt, rideId }], rides: [{ id, status, category, pickup, dropoff, driverId, requestedAt }] }`: online drivers and rides in progress                                                    |
| POST   | `/v1/admin/rides/:id/cancel` | rides.manage | `{ reason }` (3–300 characters). Stops a ride that has not ended (`cancelled_by_admin`), no fee, any wallet hold returned. `409 INVALID_STATE` if it has ended. Audited (D-059)                                                       |

### Fleets (staff)

| Method | Path                              | Permission    | Notes                                                                                                                                                                                    |
| ------ | --------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/admin/fleets`                | fleets.read   | `FleetSummary[]`: `{ id, name, status, contactPhone, contactEmail, drivers, managers: [{ userId, name, phone }], createdAt }`                                                            |
| POST   | `/v1/admin/fleets`                | fleets.manage | `{ name, managerPhone, contactPhone?, contactEmail? }` → `201 FleetSummary`. Creates the manager's account if needed. `409` for a duplicate name or a person who already manages a fleet |
| GET    | `/v1/admin/fleets/:id`            | fleets.read   | `FleetSummary`                                                                                                                                                                           |
| GET    | `/v1/admin/fleets/:id/drivers`    | fleets.read   | `FleetDriverView[]`, as the fleet sees them                                                                                                                                              |
| POST   | `/v1/admin/fleets/:id/managers`   | fleets.manage | `{ phone }`                                                                                                                                                                              |
| POST   | `/v1/admin/fleets/:id/suspend`    | fleets.manage | The fleet's managers can no longer use the portal; drivers keep working                                                                                                                  |
| POST   | `/v1/admin/fleets/:id/reactivate` | fleets.manage |                                                                                                                                                                                          |

All are audited (`fleets.*`).

### Fleet portal (managers)

Need `fleet.portal` (the `fleet_manager` role) and two-factor verification. Every
call is limited to the fleet the caller manages (`403` if none, or if it is
suspended). Trips and totals only include rides assigned while the driver was in
the fleet (DECISIONS D-058).

| Method | Path                    | Notes                                                                                                                                                                                                                                               |
| ------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/fleet`             | `{ fleet, drivers: { active, invited, online, onTrip }, today, week }`; totals `{ trips, faresKobo, earningsKobo, commissionKobo }`                                                                                                                 |
| GET    | `/v1/fleet/drivers`     | `FleetDriverView[]`: `{ userId, name, phone, membership: { status, invitedAt, joinedAt }, driverStatus, online, lastSeenAt, vehicle, today, week }`. Invited drivers show only the phone                                                            |
| GET    | `/v1/fleet/drivers/:id` | One driver. `404` if not in the fleet                                                                                                                                                                                                               |
| POST   | `/v1/fleet/drivers`     | `{ phone }` → `201`: invites a registered driver. `404 DRIVER_NOT_REGISTERED`, `409 CONFLICT` (already invited or in a fleet)                                                                                                                       |
| DELETE | `/v1/fleet/drivers/:id` | Removes a driver or withdraws an invitation. Past trips stay visible                                                                                                                                                                                |
| GET    | `/v1/fleet/vehicles`    | `[{ driver: { userId, name }, category, make, model, colour, year, plateNumber }]` for drivers in the fleet                                                                                                                                         |
| GET    | `/v1/fleet/trips`       | `FleetTripView` page: `{ id, status, driver, category, pickupAddress, dropoffAddress, paymentMethod, fareKobo, earningsKobo, commissionKobo, requestedAt, completedAt }`. Query: `driverId`, `from`, `to` (dates, Nigerian time), `cursor`, `limit` |

### Driver: fleet membership

| Method | Path                                       | Notes                                                                                                |
| ------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| GET    | `/v1/driver/fleet`                         | `{ current: { id, name, joinedAt } \| null, invitations: [{ id, fleet: { id, name }, invitedAt }] }` |
| POST   | `/v1/driver/fleet-invitations/:id/accept`  | Joins the fleet. `409` if already in one (leave it first)                                            |
| POST   | `/v1/driver/fleet-invitations/:id/decline` |                                                                                                      |
| POST   | `/v1/driver/fleet/leave`                   | Leaves the current fleet                                                                             |

## Buses (Phase 7)

All amounts are kobo; dates are Nigerian calendar days (YYYY-MM-DD) and times are
ISO instants. A departure's `status` is `scheduled`, `departed` (its time has passed)
or `cancelled`; `salesOpen` is false from `BUS_SALES_CLOSE_MINUTES` before departure.

### Passengers

| Method | Path                          | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/bus/cities`              | `[{ originCity, destinationCity }]` with an active route                                                                                                                                                                                                                                                                                                                                                                                  |
| GET    | `/v1/bus/search`              | `?from=Kano&to=Abuja&date=2026-11-20` (cities ignore case) → `BusDepartureSummary[]`: `{ id, operator, route, departsAt, arrivesAt, vehiclePlate, status, salesOpen, seatsTotal, seatsLeft, fares: [{ seatClass, fareKobo }] }`                                                                                                                                                                                                           |
| GET    | `/v1/bus/departures/:id`      | The summary plus `layout: { rows, columns, seats: [{ id, label, row, col, seatClass, fareKobo, state: available \| taken \| yours }] }`                                                                                                                                                                                                                                                                                                   |
| POST   | `/v1/bus/bookings`            | **`Idempotency-Key` required.** `{ scheduleId, seats: [{ seatId, passengerName }] }` (1–6 seats) → `201 BusBookingView` with `status: held` and `holdExpiresAt`. Replaces the passenger's earlier unpaid booking on the same departure. Errors: `409 SEAT_UNAVAILABLE` (`details.seatIds`), `409 BOOKING_CLOSED`, `402 OUTSTANDING_BALANCE`. 30 an hour                                                                                   |
| GET    | `/v1/bus/bookings`            | The passenger's bookings, newest first (not expired ones)                                                                                                                                                                                                                                                                                                                                                                                 |
| GET    | `/v1/bus/bookings/:id`        | `BusBookingView`                                                                                                                                                                                                                                                                                                                                                                                                                          |
| POST   | `/v1/bus/bookings/:id/pay`    | **`Idempotency-Key` required.** `{ method: "wallet" }`, `{ method: "card", cardId }` or `{ method: "checkout", returnTo: "web" \| "app" }` → `{ booking, checkoutUrl, payment }`. For checkout, open `checkoutUrl`, then check `payment.id` with `GET /v1/payments/:id?refresh=1`. Errors: `422 WALLET_INSUFFICIENT_FUNDS`, `409 HOLD_EXPIRED` (seats taken meanwhile), `409 CONFLICT` (already paid), `503 PAYMENT_PROVIDER_UNAVAILABLE` |
| POST   | `/v1/bus/bookings/:id/cancel` | Unpaid: releases the seats. Paid: full refund to the wallet until `cancelUntil`; afterwards `409 INVALID_STATE`                                                                                                                                                                                                                                                                                                                           |

`BusBookingView`: `{ id, reference (8 characters), status: held | confirmed | expired | cancelled, holdExpiresAt, totalKobo, paymentMethod, paymentPending, departure, tickets: [{ id, seatLabel, seatClass, passengerName, fareKobo, ticketCode, qrPayload, checkedInAt }], cancelUntil, cancelledAt, cancelledBy, cancelReason, refundedKobo, createdAt, confirmedAt }`. `ticketCode` and `qrPayload` (`RWMBUS:<code>`) are null until paid. A held booking whose hold has lapsed reads as `expired`. Payments now carry `busBookingId`.

### Bus operators (portal)

Need `bus.operator` (the `bus_operator` role) and two-factor verification. Every
call is limited to the operator the caller manages (`403` if none, or suspended).

| Method     | Path                                 | Notes                                                                                                                                                                                                                                                                                                   |
| ---------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET        | `/v1/operator`                       | `{ operator: { id, name, status, serviceFeeBps }, upcomingDepartures, today, week, balanceKobo }`; totals `{ seatsSold, faresKobo, earningsKobo }` (the operator's share)                                                                                                                               |
| GET / POST | `/v1/operator/routes`                | `{ originCity, originTerminal, destinationCity, destinationTerminal, durationMinutes }`                                                                                                                                                                                                                 |
| PATCH      | `/v1/operator/routes/:id`            | `{ originTerminal?, destinationTerminal?, durationMinutes?, isActive? }`                                                                                                                                                                                                                                |
| GET / POST | `/v1/operator/layouts`               | `{ name, rows (1–30), columns (1–8), seats: [{ label, row, col, seatClass: standard \| executive \| vip }] }`; each layout has `inUse`                                                                                                                                                                  |
| GET        | `/v1/operator/departures`            | `?from&to&routeId&limit` (default from today) → `OperatorDepartureView[]`: the summary plus `{ routeId, layout, seatsSold, seatsHeld, checkedIn, faresKobo, cancelReason }`                                                                                                                             |
| POST       | `/v1/operator/departures`            | `{ routeId, layoutId, dates: [YYYY-MM-DD] (1–62), departureTime: "HH:MM", fares: [{ seatClass, fareKobo }], vehiclePlate? }` → `201` the departures created (days that already have one are skipped; `409` if all exist). Fares must cover every class on the bus (`422`, `details.missingSeatClasses`) |
| GET        | `/v1/operator/departures/:id`        | Plus `manifest: [{ seatLabel, seatClass, passengerName, bookingReference, checkedInAt }]`                                                                                                                                                                                                               |
| PATCH      | `/v1/operator/departures/:id`        | `{ fares?, vehiclePlate? }` (new bookings only)                                                                                                                                                                                                                                                         |
| POST       | `/v1/operator/departures/:id/cancel` | `{ reason }`: refunds every passenger to their wallet                                                                                                                                                                                                                                                   |
| POST       | `/v1/operator/check-in`              | `{ code }` (`RWMBUS:` prefix, case and spaces ignored) → `{ seatLabel, passengerName, bookingReference, departure, alreadyCheckedIn, checkedInAt }`. `404 TICKET_INVALID` for another operator's, cancelled or unpaid tickets, or outside 24 h before to 12 h after departure                           |
| GET        | `/v1/operator/statement`             | The operator's account lines: `bus_booking` (+), `bus_refund` and `operator_settlement` (−)                                                                                                                                                                                                             |

### Staff

| Method      | Path                                                                          | Permission                | Notes                                                                                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET / POST  | `/v1/admin/bus-operators`                                                     | buses.read / buses.manage | Create: `{ name, managerPhone, serviceFeeBps?, contactPhone?, contactEmail? }` → `BusOperatorSummary` `{ id, name, status, serviceFeeBps, contactPhone, contactEmail, managers, balanceKobo, createdAt }` |
| GET / PATCH | `/v1/admin/bus-operators/:id`                                                 | buses.read / buses.manage | Patch `{ serviceFeeBps?, contactPhone?, contactEmail? }`. Audited                                                                                                                                         |
| POST        | `/v1/admin/bus-operators/:id/managers`                                        | buses.manage              | `{ phone }`                                                                                                                                                                                               |
| POST        | `/v1/admin/bus-operators/:id/suspend` and `/reactivate`                       | buses.manage              | A suspended operator's departures are hidden and its managers cannot use the portal                                                                                                                       |
| POST        | `/v1/admin/bus-operators/:id/settlements`                                     | buses.manage              | `{ amountKobo, note }`: money paid to the operator outside the app. Audited                                                                                                                               |
| GET         | `/v1/admin/bus-operators/:id/statement`, `/routes`, `/layouts`, `/departures` | buses.read                | As the portal sees them                                                                                                                                                                                   |
| GET         | `/v1/admin/bus-departures/:id`                                                | buses.read                | With the passenger list                                                                                                                                                                                   |
| POST        | `/v1/admin/bus-departures/:id/cancel`                                         | buses.manage              | `{ reason }`                                                                                                                                                                                              |
| GET         | `/v1/admin/bus-bookings`                                                      | buses.read                | `?reference=` or `?phone=` or `?scheduleId=` → `AdminBusBookingView[]` (with `passenger: { id, name, phone }`)                                                                                            |
| GET         | `/v1/admin/bus-bookings/:id`                                                  | buses.read                |                                                                                                                                                                                                           |
| POST        | `/v1/admin/bus-bookings/:id/cancel`                                           | buses.manage              | `{ reason }`: full refund to the wallet at any time. Audited                                                                                                                                              |

## Safety, engagement and launch (Phase 8)

New error codes:

| Code               | HTTP | When                                                                            |
| ------------------ | ---- | ------------------------------------------------------------------------------- |
| `PROMO_INVALID`    | 422  | The promotion code is unknown, expired, used up, or does not apply to this trip |
| `RATING_CLOSED`    | 409  | The trip was already rated in that direction, or the 7-day window has passed    |
| `DELETION_BLOCKED` | 409  | An account deletion request cannot be accepted (for example a staff account)    |

### Promotion codes in fares

`POST /v1/fares/estimate` and `POST /v1/rides` accept an optional `promoCode`.
An invalid code fails the estimate with `PROMO_INVALID`. Each option and each
ride's `fare` then carries:

- `discountKobo`
- `promotionCode`
- `payableKobo`: what the passenger pays, the total less the discount. For cash
  rides it is what the driver collects.

The driver is paid on the full fare (DECISIONS D-072).

### SOS, trip sharing, messages and incidents

| Method        | Path                     | Notes                                                                                                                                                                                                           |
| ------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST          | `/v1/sos`                | `{ rideId?, location?: { lat, lng, recordedAt? }, note? }` → `SosAlertView`. Never refused or rate-limited. Presses within 30 minutes add to the same alert                                                     |
| GET           | `/v1/sos/current`        | The caller's open alert (with whether staff have acknowledged), or `null`                                                                                                                                       |
| POST / DELETE | `/v1/rides/:id/share`    | Passenger only. Create (or replace) the share link: `{ url, expiresWhen: 'trip_ends' }`. The link works until `TRIP_SHARE_AFTER_END_MINUTES` after the trip. Delete revokes it                                  |
| GET           | `/v1/share/:token`       | _Public_, 240 an hour per IP. `PublicTripView`: `{ status, active, driver: { firstName, vehicle } \| null, pickupAddress, dropoffAddress, position, updatedAt }`. No phone numbers. 404 when revoked or expired |
| GET / POST    | `/v1/rides/:id/messages` | Passenger and driver of the ride. Post `{ body }` (1–500 characters) only while the driver is assigned, arrived or on the trip. The other party gets a push                                                     |
| POST          | `/v1/incidents`          | `{ rideId?, category, description }`. Categories: `safety`, `accident`, `harassment`, `dangerous_driving` (high priority), `lost_item`, `vehicle`, `other`. 10 an hour                                          |
| GET           | `/v1/incidents`          | The caller's own reports and their status                                                                                                                                                                       |

Staff:

| Method | Path                                             | Permission    | Notes                                                                                                 |
| ------ | ------------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------- |
| GET    | `/v1/admin/sos`                                  | safety.read   | `?status=open\|acknowledged\|resolved`. Newest first, with the person, ride, other party and location |
| GET    | `/v1/admin/sos/:id`                              | safety.read   |                                                                                                       |
| POST   | `/v1/admin/sos/:id/acknowledge`                  | safety.manage | The person gets a push ("help is coming"). Audited                                                    |
| POST   | `/v1/admin/sos/:id/resolve`                      | safety.manage | `{ note }` (what happened). Audited                                                                   |
| GET    | `/v1/admin/incidents`, `/v1/admin/incidents/:id` | safety.read   | High priority first                                                                                   |
| PATCH  | `/v1/admin/incidents/:id`                        | safety.manage | `{ status: 'investigating' \| 'resolved', note? }`. A note is required to resolve                     |
| GET    | `/v1/admin/rides/:id/messages`                   | safety.read   | The ride's messages                                                                                   |

Live updates: staff in the `ops` room (with `rides.read` or `safety.read`)
receive `sos:alert` with the `SosAlertView` whenever an alert is raised or
pressed again. Ride participants receive `ride:message`.

### Ratings and support

| Method | Path                                             | Notes                                                                                                                                            |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/v1/rides/:id/rating`                           | Passenger rates driver, or driver rates passenger: `{ stars: 1–5, tags?: RatingTag[], comment? }`. Within 7 days of the trip, once per direction |
| GET    | `/v1/driver/ratings`                             | The driver's average (once there are 3 ratings), count and recent comments                                                                       |
| POST   | `/v1/support/tickets`                            | `{ category, subject, body, rideId?, busBookingId? }` → `SupportTicketView`                                                                      |
| GET    | `/v1/support/tickets`, `/v1/support/tickets/:id` | The caller's tickets, and one with its messages                                                                                                  |
| POST   | `/v1/support/tickets/:id/messages`               | `{ body }`. Reopens a ticket waiting on the user                                                                                                 |

Ride views carry `rating: { given, canRate }`, and `driver.rating` (the
average, or `null` under 3 ratings).

Staff:

| Method | Path                                     | Permission     | Notes                                                   |
| ------ | ---------------------------------------- | -------------- | ------------------------------------------------------- |
| GET    | `/v1/admin/users/:id/ratings`            | users.read     | Ratings the user received, with average and count       |
| GET    | `/v1/admin/support/tickets`              | support.read   | `?status=&userId=&limit=`. Waiting longest first        |
| GET    | `/v1/admin/support/tickets/:id`          | support.read   |                                                         |
| POST   | `/v1/admin/support/tickets/:id/messages` | support.manage | `{ body }`. The user is notified                        |
| POST   | `/v1/admin/support/tickets/:id/status`   | support.manage | `{ status: 'open' \| 'waiting_on_user' \| 'resolved' }` |

### Promotions (staff)

| Method | Path                       | Permission        | Notes                                                                                                                                                                                                                                                      |
| ------ | -------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/admin/promotions`     | rides.read        | With redemption counts                                                                                                                                                                                                                                     |
| POST   | `/v1/admin/promotions`     | promotions.manage | `{ code, description, discountType: 'percent' \| 'fixed', percentBps?, amountKobo?, maxDiscountKobo?, minFareKobo?, categoryKeys?, firstRideOnly?, perUserLimit?, maxRedemptions?, startsAt, endsAt }`. Codes are 4–20 capital letters and digits. Audited |
| PATCH  | `/v1/admin/promotions/:id` | promotions.manage | `{ description?, endsAt?, maxRedemptions?, isActive? }`. Audited                                                                                                                                                                                           |

### Notifications and devices

| Method | Path                        | Notes                                                                                                               |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/me/notifications`      | `{ items: NotificationView[], unread }`, newest first                                                               |
| POST   | `/v1/me/notifications/read` | `{ ids: string[] }` or `{ all: true }`                                                                              |
| PUT    | `/v1/me/push-token`         | `{ token, app: 'passenger' \| 'driver', platform: 'ios' \| 'android' }`. A token moves to whoever registers it last |
| DELETE | `/v1/me/push-token`         | `{ token }`. Sent by the apps at sign-out                                                                           |

### Account deletion (NDPA)

| Method | Path                          | Permission     | Notes                                                                                                                                             |
| ------ | ----------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/me/deletion-request`     |                | The open request, or `null`                                                                                                                       |
| POST   | `/v1/me/deletion-request`     |                | `{ reason? }`. Personal data is erased after `DELETION_GRACE_DAYS`, once nothing is open (DECISIONS D-074). `DELETION_BLOCKED` for staff accounts |
| DELETE | `/v1/me/deletion-request`     |                | Cancel during the grace period                                                                                                                    |
| GET    | `/v1/admin/deletion-requests` | privacy.manage | All requests, with the reason any are blocked                                                                                                     |

### Metrics

`GET /metrics`: Prometheus text format, only with
`Authorization: Bearer $METRICS_TOKEN`. It is a 404 otherwise, and when
`METRICS_TOKEN` is unset. The gauges are listed in LAUNCH.md.

## Command line (operators)

Run from `rideswithme/` after `pnpm build`, with the API's environment set:

```bash
pnpm --filter @rideswithme/api cli grant-role  --phone 0803… --role super_admin
pnpm --filter @rideswithme/api cli revoke-role --phone 0803… --role admin
pnpm --filter @rideswithme/api cli reset-mfa   --phone 0803…
pnpm --filter @rideswithme/api cli seed-city   --key katsina --name Katsina --bbox 7.52,12.93,7.68,13.06
```

`seed-city` creates a rectangular service area with placeholder fares for
development (DECISIONS D-034).

These are audited as `system` actions.
