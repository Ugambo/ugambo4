import type { ColumnType, Generated } from 'kysely';
import type {
  DevicePlatform,
  DocumentStatus,
  DriverStatus,
  Language,
  PaymentMethod,
  RideStatus,
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
  payout_recipient_code: string | null;
  payout_account_changed_at: Timestamp | null;
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

/**
 * PostGIS geography columns. Selected as hex WKB; read coordinates with
 * ST_Y/ST_X in SQL and write with the `point()` helper in database/geo.ts.
 */
type Geography = string;

export interface ServiceAreasTable {
  id: Generated<string>;
  key: string;
  name: string;
  boundary: Geography;
  is_active: ColumnType<boolean, boolean | undefined, boolean>;
  created_at: CreatedAt;
  updated_at: ColumnType<Date, never, never>;
}

/** bigint columns come back as strings (see database.module.ts); convert with Number() after range checks. */
type Kobo = ColumnType<string, number | bigint | string, number | bigint | string>;

export interface FareRulesTable {
  id: Generated<string>;
  service_area_id: string;
  vehicle_category_id: string;
  base_fare_kobo: Kobo;
  per_km_kobo: Kobo;
  per_minute_kobo: Kobo;
  minimum_fare_kobo: Kobo;
  booking_fee_kobo: Kobo;
  cancellation_fee_kobo: Kobo;
  cancellation_grace_seconds: number;
  waiting_free_minutes: number;
  waiting_per_minute_kobo: Kobo;
  commission_bps: number;
  rounding_increment_kobo: Kobo;
  peak_windows: ColumnType<unknown, string, string>;
  is_active: ColumnType<boolean, boolean | undefined, boolean>;
  created_by: string | null;
  created_at: CreatedAt;
}

export interface FareQuotesTable {
  id: Generated<string>;
  passenger_id: string;
  service_area_id: string;
  vehicle_category_id: string;
  fare_rule_id: string;
  pickup: Geography;
  pickup_address: string;
  dropoff: Geography;
  dropoff_address: string;
  distance_meters: number;
  duration_seconds: number;
  route_polyline: string | null;
  breakdown: ColumnType<unknown, string, never>;
  total_kobo: Kobo;
  expires_at: Timestamp;
  created_at: CreatedAt;
}

export interface RidesTable {
  id: Generated<string>;
  passenger_id: string;
  driver_id: string | null;
  vehicle_id: string | null;
  vehicle_category_id: string;
  service_area_id: string;
  fare_quote_id: string;
  status: ColumnType<RideStatus, RideStatus | undefined, RideStatus>;
  pickup: Geography;
  pickup_address: string;
  dropoff: Geography;
  dropoff_address: string;
  scheduled_for: Timestamp | null;
  fare_snapshot: ColumnType<unknown, string, never>;
  quoted_total_kobo: Kobo;
  waiting_charge_kobo: ColumnType<string, number | undefined, number>;
  final_total_kobo: ColumnType<string | null, number | null | undefined, number | null>;
  commission_kobo: ColumnType<string | null, number | null | undefined, number | null>;
  cancellation_fee_kobo: ColumnType<string, number | undefined, number>;
  payment_method: PaymentMethod;
  card_id: string | null;
  search_started_at: Timestamp | null;
  search_deadline: Timestamp | null;
  search_radius_meters: ColumnType<number, number | undefined, number>;
  requested_at: CreatedAt;
  assigned_at: Timestamp | null;
  arrived_at: Timestamp | null;
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
  cancelled_at: Timestamp | null;
  cancellation_reason: string | null;
  actual_distance_meters: number | null;
  created_at: CreatedAt;
  updated_at: ColumnType<Date, never, never>;
}

export interface TripLocationsTable {
  id: ColumnType<string, never, never>;
  ride_id: string;
  driver_id: string;
  location: Geography;
  accuracy_meters: number | null;
  heading: number | null;
  speed_mps: number | null;
  recorded_at: Timestamp;
  received_at: ColumnType<Date, Date | undefined, never>;
}

export interface RideRequestsTable {
  id: Generated<string>;
  ride_id: string;
  driver_id: string;
  status: ColumnType<
    'offered' | 'accepted' | 'rejected' | 'expired' | 'withdrawn',
    'offered' | undefined,
    'accepted' | 'rejected' | 'expired' | 'withdrawn'
  >;
  distance_to_pickup_meters: number;
  offered_at: CreatedAt;
  expires_at: Timestamp;
  responded_at: Timestamp | null;
}

export interface RideEventsTable {
  id: Generated<string>;
  seq: ColumnType<string, never, never>;
  ride_id: string;
  event_type: string;
  from_status: RideStatus | null;
  to_status: RideStatus | null;
  actor_type: 'passenger' | 'driver' | 'admin' | 'system';
  actor_id: string | null;
  location: Geography | null;
  metadata: ColumnType<Record<string, unknown>, string | undefined, never>;
  created_at: CreatedAt;
}

export type PaymentPurpose = 'ride_fare' | 'cancellation_fee' | 'wallet_topup' | 'card_link';
export type PaymentStatus =
  'pending' | 'succeeded' | 'collected' | 'outstanding' | 'failed' | 'abandoned';
export type ProviderName = 'paystack' | 'fake';
export type WalletKind = 'passenger' | 'driver';

export interface PaymentsTable {
  id: Generated<string>;
  ride_id: string | null;
  payer_id: string;
  method: PaymentMethod;
  purpose: PaymentPurpose;
  amount_kobo: Kobo;
  status: PaymentStatus;
  collected_by: string | null;
  collected_at: Timestamp | null;
  wallet_kind: WalletKind | null;
  provider: ProviderName | null;
  provider_reference: string | null;
  card_id: string | null;
  fee_kobo: ColumnType<string, number | undefined, number>;
  outstanding_kobo: ColumnType<string, number | undefined, number>;
  refunded_kobo: ColumnType<string, number | undefined, number>;
  failure_reason: string | null;
  paid_at: Timestamp | null;
  created_at: CreatedAt;
  updated_at: ColumnType<Date, never, never>;
}

export interface CommissionsTable {
  id: Generated<string>;
  ride_id: string;
  driver_id: string;
  fare_kobo: Kobo;
  booking_fee_kobo: Kobo;
  commission_bps: number;
  commission_kobo: Kobo;
  status: ColumnType<
    'pending_settlement' | 'settled' | 'waived',
    'pending_settlement' | undefined,
    'pending_settlement' | 'settled' | 'waived'
  >;
  journal_id: string | null;
  created_at: CreatedAt;
}

export type LedgerAccountKind = 'passenger' | 'driver' | 'system';
export type SystemAccountKey =
  | 'paystack_balance'
  | 'passenger_receivables'
  | 'provider_fees'
  | 'platform_revenue'
  | 'ride_holds'
  | 'payouts_in_transit'
  | 'refunds_in_transit';

export interface WalletsTable {
  id: Generated<string>;
  owner_id: string | null;
  kind: LedgerAccountKind;
  system_key: SystemAccountKey | null;
  normal_side: 'debit' | 'credit';
  currency: ColumnType<'NGN', 'NGN' | undefined, never>;
  /** Written only by the database trigger that posts ledger lines. */
  balance_kobo: ColumnType<string, never, never>;
  min_balance_kobo: ColumnType<string | null, number | null | undefined, never>;
  created_at: CreatedAt;
}

export type JournalKind =
  | 'wallet_topup'
  | 'ride_hold'
  | 'ride_hold_release'
  | 'ride_settlement'
  | 'cash_commission'
  | 'cancellation_fee'
  | 'card_charge'
  | 'outstanding_collection'
  | 'payout'
  | 'payout_completed'
  | 'payout_returned'
  | 'refund'
  | 'refund_completed'
  | 'refund_returned'
  | 'chargeback'
  | 'adjustment'
  | 'opening_balance';

export interface LedgerJournalsTable {
  id: Generated<string>;
  kind: JournalKind;
  reference: string;
  ride_id: string | null;
  payment_id: string | null;
  payout_id: string | null;
  refund_id: string | null;
  dispute_id: string | null;
  memo: string | null;
  created_by: string | null;
  tx_id: ColumnType<string, never, never>;
  created_at: CreatedAt;
}

export interface WalletTransactionsTable {
  id: Generated<string>;
  seq: ColumnType<string, never, never>;
  journal_id: string;
  wallet_id: string;
  /** Debit positive, credit negative. */
  amount_kobo: Kobo;
  /** Set by the posting trigger. */
  balance_after_kobo: ColumnType<string, never, never>;
  created_at: CreatedAt;
}

export interface PaymentCardsTable {
  id: Generated<string>;
  user_id: string;
  authorization_code_encrypted: string;
  signature: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  bank: string | null;
  created_at: CreatedAt;
  removed_at: Timestamp | null;
}

export type PayoutStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'reversed';

export interface PayoutsTable {
  id: Generated<string>;
  driver_id: string;
  amount_kobo: Kobo;
  fee_kobo: ColumnType<string, number | undefined, number>;
  status: ColumnType<PayoutStatus, PayoutStatus | undefined, PayoutStatus>;
  bank_code: string;
  account_last4: string;
  account_name: string;
  provider: ProviderName;
  provider_reference: string;
  transfer_code: string | null;
  failure_reason: string | null;
  requested_at: ColumnType<Date, Date | string | undefined, never>;
  completed_at: Timestamp | null;
  updated_at: ColumnType<Date, never, never>;
}

export type DisputeStatus = 'open' | 'refunded' | 'rejected' | 'won' | 'lost';

export interface PaymentDisputesTable {
  id: Generated<string>;
  ride_id: string | null;
  payment_id: string | null;
  source: 'passenger' | 'provider';
  raised_by: string | null;
  status: ColumnType<DisputeStatus, DisputeStatus | undefined, DisputeStatus>;
  reason: string;
  details: string | null;
  amount_kobo: ColumnType<string | null, number | null | undefined, number | null>;
  provider_dispute_id: string | null;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: Timestamp | null;
  created_at: CreatedAt;
  updated_at: ColumnType<Date, never, never>;
}

export type RefundStatus = 'pending' | 'succeeded' | 'failed';

export interface RefundsTable {
  id: Generated<string>;
  payment_id: string;
  amount_kobo: Kobo;
  destination: 'wallet' | 'card';
  funded_by: 'platform' | 'driver';
  status: RefundStatus;
  reason: string;
  dispute_id: string | null;
  provider_reference: string | null;
  failure_reason: string | null;
  created_by: string;
  created_at: CreatedAt;
  completed_at: Timestamp | null;
  updated_at: ColumnType<Date, never, never>;
}

export interface PaymentWebhookEventsTable {
  id: Generated<string>;
  provider: ProviderName;
  event: string;
  event_key: string;
  payload: ColumnType<unknown, string, never>;
  received_at: CreatedAt;
  processed_at: Timestamp | null;
  attempts: ColumnType<number, number | undefined, number>;
  last_error: string | null;
}

export interface SavedPlacesTable {
  id: Generated<string>;
  user_id: string;
  label: 'home' | 'work' | 'other';
  name: string;
  address: string;
  location: Geography;
  place_id: string | null;
  created_at: CreatedAt;
}

export interface IdempotencyKeysTable {
  user_id: string;
  key: string;
  scope: string;
  request_hash: string;
  status: ColumnType<'in_progress' | 'completed', 'in_progress' | undefined, 'completed'>;
  response_status: number | null;
  response_body: ColumnType<unknown, string | null | undefined, string>;
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
  vehicle_categories: VehicleCategoriesTable;
  document_types: DocumentTypesTable;
  vehicle_category_document_requirements: VehicleCategoryDocumentRequirementsTable;
  driver_profiles: DriverProfilesTable;
  vehicles: VehiclesTable;
  file_uploads: FileUploadsTable;
  driver_documents: DriverDocumentsTable;
  service_areas: ServiceAreasTable;
  fare_rules: FareRulesTable;
  fare_quotes: FareQuotesTable;
  rides: RidesTable;
  ride_requests: RideRequestsTable;
  ride_events: RideEventsTable;
  payments: PaymentsTable;
  commissions: CommissionsTable;
  saved_places: SavedPlacesTable;
  idempotency_keys: IdempotencyKeysTable;
  trip_locations: TripLocationsTable;
  wallets: WalletsTable;
  ledger_journals: LedgerJournalsTable;
  wallet_transactions: WalletTransactionsTable;
  payment_cards: PaymentCardsTable;
  payouts: PayoutsTable;
  payment_disputes: PaymentDisputesTable;
  refunds: RefundsTable;
  payment_webhook_events: PaymentWebhookEventsTable;
}
