/**
 * Machine-readable error codes returned by the API. Clients translate these
 * into the user's language; the `message` field is English and meant for logs.
 */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  MFA_REQUIRED: 'MFA_REQUIRED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_TOO_MANY_ATTEMPTS: 'OTP_TOO_MANY_ATTEMPTS',
  OTP_RESEND_TOO_SOON: 'OTP_RESEND_TOO_SOON',
  REFRESH_TOKEN_INVALID: 'REFRESH_TOKEN_INVALID',
  SESSION_REVOKED: 'SESSION_REVOKED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  TOTP_INVALID: 'TOTP_INVALID',
  TOTP_NOT_ENROLLED: 'TOTP_NOT_ENROLLED',
  TOTP_ALREADY_ENABLED: 'TOTP_ALREADY_ENABLED',
  LAST_SUPER_ADMIN: 'LAST_SUPER_ADMIN',
  SMS_DELIVERY_FAILED: 'SMS_DELIVERY_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    /** Seconds the client should wait before retrying (rate limits, OTP resend). */
    retryAfterSeconds?: number;
  };
  requestId?: string;
}
