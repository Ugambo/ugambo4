import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@rideswithme/shared-types';

const DEFAULT_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: HttpStatus.UNPROCESSABLE_ENTITY,
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  MFA_REQUIRED: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  OTP_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  OTP_EXPIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  OTP_TOO_MANY_ATTEMPTS: HttpStatus.TOO_MANY_REQUESTS,
  OTP_RESEND_TOO_SOON: HttpStatus.TOO_MANY_REQUESTS,
  REFRESH_TOKEN_INVALID: HttpStatus.UNAUTHORIZED,
  SESSION_REVOKED: HttpStatus.UNAUTHORIZED,
  ACCOUNT_SUSPENDED: HttpStatus.FORBIDDEN,
  TOTP_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  TOTP_NOT_ENROLLED: HttpStatus.CONFLICT,
  TOTP_ALREADY_ENABLED: HttpStatus.CONFLICT,
  LAST_SUPER_ADMIN: HttpStatus.CONFLICT,
  SMS_DELIVERY_FAILED: HttpStatus.BAD_GATEWAY,
  DRIVER_NOT_REGISTERED: HttpStatus.NOT_FOUND,
  DRIVER_PROFILE_LOCKED: HttpStatus.CONFLICT,
  DRIVER_INCOMPLETE: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_STATE: HttpStatus.CONFLICT,
  UPLOAD_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  NIN_ALREADY_REGISTERED: HttpStatus.CONFLICT,
  PLATE_ALREADY_REGISTERED: HttpStatus.CONFLICT,
  VEHICLE_CATEGORY_UNAVAILABLE: HttpStatus.UNPROCESSABLE_ENTITY,
  STORAGE_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  OUTSIDE_SERVICE_AREA: HttpStatus.UNPROCESSABLE_ENTITY,
  QUOTE_EXPIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  PAYMENT_METHOD_UNAVAILABLE: HttpStatus.UNPROCESSABLE_ENTITY,
  RIDE_ALREADY_ACTIVE: HttpStatus.CONFLICT,
  OFFER_UNAVAILABLE: HttpStatus.CONFLICT,
  DRIVER_NOT_ELIGIBLE: HttpStatus.FORBIDDEN,
  IDEMPOTENCY_KEY_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  IDEMPOTENCY_CONFLICT: HttpStatus.CONFLICT,
  MAPS_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  ROUTE_NOT_FOUND: HttpStatus.UNPROCESSABLE_ENTITY,
  INTERNAL_ERROR: HttpStatus.INTERNAL_SERVER_ERROR,
};

/** The only exception type application code should throw for expected failures. */
export class AppException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    options: { status?: number; details?: unknown; retryAfterSeconds?: number } = {},
  ) {
    super(message, options.status ?? DEFAULT_STATUS[code]);
    this.details = options.details;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
  readonly details: unknown;
  readonly retryAfterSeconds: number | undefined;
}
