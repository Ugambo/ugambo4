import type { ColumnType, Generated } from 'kysely';
import type { DevicePlatform, Language, UserStatus } from '@rideswithme/shared-types';

type Timestamp = ColumnType<Date, Date | string, Date | string>;
type CreatedAt = ColumnType<Date, Date | string | undefined, never>;

export interface UsersTable {
  id: Generated<string>;
  phone_e164: string | null;
  phone_verified_at: Timestamp | null;
  email: string | null;
  email_verified_at: Timestamp | null;
  full_name: string | null;
  preferred_language: ColumnType<Language, Language | undefined, Language>;
  status: ColumnType<UserStatus, UserStatus | undefined, UserStatus>;
  suspended_reason: string | null;
  totp_secret_encrypted: string | null;
  totp_enabled_at: Timestamp | null;
  totp_last_used_step: ColumnType<string | null, number | null, number | null>;
  last_login_at: Timestamp | null;
  created_at: CreatedAt;
  updated_at: ColumnType<Date, never, never>;
  deleted_at: Timestamp | null;
}

export interface RolesTable {
  id: Generated<string>;
  key: string;
  name: string;
  description: string;
  requires_mfa: boolean;
  is_privileged: boolean;
  is_system: boolean;
  created_at: CreatedAt;
  updated_at: ColumnType<Date, never, never>;
}

export interface PermissionsTable {
  id: Generated<string>;
  key: string;
  description: string;
  created_at: CreatedAt;
}

export interface RolePermissionsTable {
  role_id: string;
  permission_id: string;
}

export interface UserRolesTable {
  user_id: string;
  role_id: string;
  granted_by: string | null;
  granted_at: CreatedAt;
}

export type SessionRevokedReason =
  | 'logout'
  | 'revoked_by_user'
  | 'revoked_by_admin'
  | 'refresh_token_reuse'
  | 'account_suspended'
  | 'account_deleted'
  | 'mfa_reset';

export interface UserSessionsTable {
  id: Generated<string>;
  user_id: string;
  refresh_token_hash: Buffer;
  previous_refresh_token_hash: Buffer | null;
  rotated_at: Timestamp | null;
  rotation_count: ColumnType<number, number | undefined, number>;
  device_name: string | null;
  platform: ColumnType<DevicePlatform, DevicePlatform | undefined, DevicePlatform>;
  ip: string | null;
  user_agent: string | null;
  mfa_verified_at: Timestamp | null;
  created_at: CreatedAt;
  last_used_at: ColumnType<Date, Date | string | undefined, Date | string>;
  idle_expires_at: Timestamp;
  absolute_expires_at: Timestamp;
  revoked_at: Timestamp | null;
  revoked_reason: SessionRevokedReason | null;
}

export interface UserConsentsTable {
  id: Generated<string>;
  user_id: string;
  consent_type: 'terms_and_privacy' | 'marketing';
  version: string;
  granted_at: CreatedAt;
  ip: string | null;
  user_agent: string | null;
  withdrawn_at: Timestamp | null;
}

export interface AuditLogsTable {
  id: Generated<string>;
  actor_user_id: string | null;
  actor_type: 'user' | 'system';
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: ColumnType<Record<string, unknown>, string | undefined, never>;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  created_at: CreatedAt;
}

export interface Database {
  users: UsersTable;
  roles: RolesTable;
  permissions: PermissionsTable;
  role_permissions: RolePermissionsTable;
  user_roles: UserRolesTable;
  user_sessions: UserSessionsTable;
  user_consents: UserConsentsTable;
  audit_logs: AuditLogsTable;
}
