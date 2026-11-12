import type { ColumnType, Generated } from 'kysely';
import type {
  DevicePlatform,
  DocumentStatus,
  DriverStatus,
  Language,
  UserStatus,
} from '@rideswithme/shared-types';

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

export interface VehicleCategoriesTable {
  id: Generated<string>;
  key: string;
  name: string;
  description: string;
  seats: number;
  is_enabled: boolean;
  sort_order: number;
  created_at: CreatedAt;
  updated_at: ColumnType<Date, never, never>;
}

export interface DocumentTypesTable {
  key: string;
  name: string;
  scope: 'driver' | 'vehicle';
  media: 'photo' | 'document';
  requires_expiry: boolean;
  requires_number: boolean;
  sort_order: number;
}

export interface VehicleCategoryDocumentRequirementsTable {
  vehicle_category_id: string;
  document_type: string;
}

export interface DriverProfilesTable {
  user_id: string;
  status: ColumnType<DriverStatus, DriverStatus | undefined, DriverStatus>;
  nin_encrypted: string | null;
  nin_lookup_hash: Buffer | null;
  nin_last4: string | null;
  payout_bank_code: string | null;
  payout_account_number_encrypted: string | null;
  payout_account_last4: string | null;
  payout_account_name: string | null;
  submitted_at: Timestamp | null;
  reviewed_at: Timestamp | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  approved_at: Timestamp | null;
  created_at: CreatedAt;
  updated_at: ColumnType<Date, never, never>;
}

export interface VehiclesTable {
  id: Generated<string>;
  driver_user_id: string | null;
  vehicle_category_id: string;
  plate_number: string;
  make: string;
  model: string;
  colour: string;
  year: number;
  status: ColumnType<'active' | 'retired', 'active' | 'retired' | undefined, 'active' | 'retired'>;
  created_at: CreatedAt;
  updated_at: ColumnType<Date, never, never>;
}

export interface FileUploadsTable {
  id: Generated<string>;
  owner_user_id: string;
  purpose: 'driver_document';
  object_key: string;
  content_type: string;
  declared_size: number;
  status: ColumnType<
    'pending' | 'completed',
    'pending' | 'completed' | undefined,
    'pending' | 'completed'
  >;
  metadata: ColumnType<Record<string, unknown>, string | undefined, string>;
  expires_at: Timestamp;
  completed_at: Timestamp | null;
  created_at: CreatedAt;
}

/** `date` columns are returned as YYYY-MM-DD strings (see database.module.ts). */
export interface DriverDocumentsTable {
  id: ColumnType<string, string | undefined, never>;
  driver_user_id: string;
  vehicle_id: string | null;
  document_type: string;
  status: ColumnType<DocumentStatus, DocumentStatus | undefined, DocumentStatus>;
  file_upload_id: string;
  object_key: string;
  content_type: string;
  size_bytes: number;
  document_number_encrypted: string | null;
  document_number_last4: string | null;
  expires_on: string | null;
  reviewed_by: string | null;
  reviewed_at: Timestamp | null;
  rejection_reason: string | null;
  created_at: CreatedAt;
  updated_at: ColumnType<Date, never, never>;
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
  vehicle_categories: VehicleCategoriesTable;
  document_types: DocumentTypesTable;
  vehicle_category_document_requirements: VehicleCategoryDocumentRequirementsTable;
  driver_profiles: DriverProfilesTable;
  vehicles: VehiclesTable;
  file_uploads: FileUploadsTable;
  driver_documents: DriverDocumentsTable;
}
