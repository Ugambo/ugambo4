import type { Language } from './i18n';
import type { PermissionKey, RoleKey } from './roles';

export type UserStatus = 'active' | 'suspended' | 'deleted';
export type DevicePlatform = 'ios' | 'android' | 'web' | 'unknown';

export interface OtpRequestResponse {
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

export interface AuthTokens {
  accessToken: string;
  /** Seconds until the access token expires. */
  accessTokenExpiresIn: number;
  refreshToken: string;
  /** ISO timestamp after which the refresh token is no longer accepted if unused. */
  refreshTokenExpiresAt: string;
}

export interface MeResponse {
  id: string;
  phone: string;
  email: string | null;
  emailVerified: boolean;
  fullName: string | null;
  preferredLanguage: Language;
  status: UserStatus;
  roles: RoleKey[];
  permissions: PermissionKey[];
  mfa: {
    /** True when any of the user's roles requires two-factor authentication. */
    required: boolean;
    enrolled: boolean;
    /** True when the current session has passed a TOTP check. */
    verifiedForSession: boolean;
  };
  createdAt: string;
}

export interface VerifyOtpResponse {
  tokens: AuthTokens;
  user: MeResponse;
  isNewUser: boolean;
}

export interface SessionSummary {
  id: string;
  deviceName: string | null;
  platform: DevicePlatform;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

export interface TotpSetupResponse {
  /** otpauth:// URI for QR code rendering. */
  otpauthUrl: string;
  /** Base32 secret for manual entry. Shown once. */
  secret: string;
}

export interface AdminUserSummary {
  id: string;
  phone: string | null;
  email: string | null;
  fullName: string | null;
  status: UserStatus;
  roles: RoleKey[];
  createdAt: string;
  lastLoginAt: string | null;
}

export interface RoleSummary {
  key: RoleKey;
  name: string;
  description: string;
  requiresMfa: boolean;
  permissions: PermissionKey[];
}

export interface AuditLogEntry {
  id: string;
  actorUserId: string | null;
  actorType: 'user' | 'system';
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  requestId: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  /** Opaque cursor for the next page, or null when there are no more items. */
  nextCursor: string | null;
}
