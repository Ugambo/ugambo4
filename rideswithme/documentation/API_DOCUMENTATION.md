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

| Code                                                       | HTTP | Meaning                                                              |
| ---------------------------------------------------------- | ---- | -------------------------------------------------------------------- |
| VALIDATION_FAILED                                          | 422  | Body, query or path is invalid; `details` lists the problems         |
| UNAUTHENTICATED                                            | 401  | Missing, invalid or expired access token. Refresh and retry          |
| SESSION_REVOKED                                            | 401  | Session ended (logout, revoked, suspended). Sign in again            |
| REFRESH_TOKEN_INVALID                                      | 401  | Refresh token rejected. Sign in again                                |
| FORBIDDEN                                                  | 403  | Missing permission; `details.missing` lists them                     |
| MFA_REQUIRED                                               | 403  | Role needs TOTP; `details.enrolled` says whether to set up or verify |
| ACCOUNT_SUSPENDED                                          | 403  | Account suspended                                                    |
| NOT_FOUND                                                  | 404  |                                                                      |
| CONFLICT                                                   | 409  | E.g. email already used                                              |
| LAST_SUPER_ADMIN                                           | 409  | Would leave no active super admin                                    |
| TOTP_NOT_ENROLLED / TOTP_ALREADY_ENABLED                   | 409  |                                                                      |
| OTP_INVALID / OTP_EXPIRED / TOTP_INVALID                   | 422  |                                                                      |
| RATE_LIMITED / OTP_RESEND_TOO_SOON / OTP_TOO_MANY_ATTEMPTS | 429  | Wait `retryAfterSeconds`                                             |
| SMS_DELIVERY_FAILED                                        | 502  | SMS vendor failed; retry is allowed straight away                    |
| INTERNAL_ERROR                                             | 500  | Quote the `requestId` to support                                     |

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

## Command line (operators)

Run from `rideswithme/` after `pnpm build`, with the API's environment set:

```bash
pnpm --filter @rideswithme/api cli grant-role  --phone 0803… --role super_admin
pnpm --filter @rideswithme/api cli revoke-role --phone 0803… --role admin
pnpm --filter @rideswithme/api cli reset-mfa   --phone 0803…
```

These are audited as `system` actions.
