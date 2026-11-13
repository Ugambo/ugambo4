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

| Method | Path                              | Permission      | Notes                                                                                                         |
| ------ | --------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/admin/users`                 | users.read      | Query: `search` (phone in any format, name or email), `role`, `status`, `limit`, `cursor`                     |
| GET    | `/v1/admin/users/:id`             | users.read      | `AdminUserSummary`                                                                                            |
| POST   | `/v1/admin/users/:id/roles`       | roles.assign    | `{ "role": "driver" }`. Privileged roles need roles.assign_privileged. Idempotent                             |
| DELETE | `/v1/admin/users/:id/roles/:role` | roles.assign    | Same rule; `409 LAST_SUPER_ADMIN` protection                                                                  |
| POST   | `/v1/admin/users/:id/suspend`     | users.manage    | `{ "reason": "…" }`. Signs the user out everywhere. Staff accounts need roles.assign_privileged; not yourself |
| POST   | `/v1/admin/users/:id/reactivate`  | users.manage    |                                                                                                               |
| GET    | `/v1/admin/roles`                 | roles.read      | Roles with their permissions                                                                                  |
| GET    | `/v1/admin/audit-logs`            | audit_logs.read | Query: `actorUserId`, `targetId`, `action`, `limit`, `cursor`                                                 |

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

| Event             | To                                                | Payload                                                       |
| ----------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| `ride:updated`    | The passenger, the driver, and the ride's room    | `RideView` for the passenger, `DriverRideView` for the driver |
| `driver:position` | The passenger of the driver's active ride         | `{ rideId, position: { lat, lng, recordedAt, receivedAt } }`  |
| `offer:new`       | The driver offered a ride                         | `DriverOfferView`                                             |
| `offer:closed`    | The driver, when an offer expires or is withdrawn | `{ offerId, reason }`, reason `expired` or `withdrawn`        |
| `session:ended`   | Every connection of a session that has ended      | `{ code: "SESSION_REVOKED" }`; the connection then closes     |

**Client → server messages** (with acknowledgement `{ ok: true, … }` or `{ ok: false, code }`)

| Message           | Who                                                                                   | Body                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `ride:subscribe`  | The ride's passenger or driver; staff with `rides.read` after two-factor verification | `{ rideId }`. Joins the ride's room (`NOT_FOUND` otherwise)                                 |
| `location:update` | Drivers                                                                               | Same as `POST /v1/driver/location`; acknowledgement `{ ok, position, stored }`. 60 a minute |

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

## Command line (operators)

Run from `rideswithme/` after `pnpm build`, with the API's environment set:

```bash
pnpm --filter @rideswithme/api cli grant-role  --phone 0803… --role super_admin
pnpm --filter @rideswithme/api cli revoke-role --phone 0803… --role admin
pnpm --filter @rideswithme/api cli reset-mfa   --phone 0803…
pnpm --filter @rideswithme/api cli seed-city   --key kano --name Kano --bbox 8.40,11.90,8.62,12.10
```

`seed-city` creates a rectangular service area with placeholder fares for
development (DECISIONS D-034).

These are audited as `system` actions.
