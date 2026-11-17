/**
 * System settings super admins change from the dashboard. Each one replaces the
 * API's .env value of the same name while the API runs; resetting returns to it.
 */
export const SETTING_GROUPS = ['wallets', 'trips', 'safety', 'buses'] as const;
export type SettingGroup = (typeof SETTING_GROUPS)[number];

/** How a value is entered and shown. Money is in kobo; 'bps' is hundredths of a percent. */
export type SettingUnit =
  'kobo' | 'seconds' | 'minutes' | 'hours' | 'days' | 'bps' | 'phones' | 'phone' | 'email';

export const SETTING_DEFINITIONS = {
  WALLET_TOPUP_MIN_KOBO: { group: 'wallets', unit: 'kobo' },
  WALLET_TOPUP_MAX_KOBO: { group: 'wallets', unit: 'kobo' },
  WALLET_MAX_BALANCE_KOBO: { group: 'wallets', unit: 'kobo' },
  DRIVER_DEBT_LIMIT_KOBO: { group: 'wallets', unit: 'kobo' },
  PAYOUT_MIN_KOBO: { group: 'wallets', unit: 'kobo' },
  ADMIN_WALLET_FUND_LIMIT_KOBO: { group: 'wallets', unit: 'kobo' },
  OFFER_TIMEOUT_SECONDS: { group: 'trips', unit: 'seconds' },
  SEARCH_TIMEOUT_SECONDS: { group: 'trips', unit: 'seconds' },
  NO_SHOW_WAIT_MINUTES: { group: 'trips', unit: 'minutes' },
  QUOTE_TTL_SECONDS: { group: 'trips', unit: 'seconds' },
  SOS_ALERT_PHONES: { group: 'safety', unit: 'phones' },
  SUPPORT_PHONE: { group: 'safety', unit: 'phone' },
  SUPPORT_EMAIL: { group: 'safety', unit: 'email' },
  TRIP_SHARE_AFTER_END_MINUTES: { group: 'safety', unit: 'minutes' },
  BUS_HOLD_MINUTES: { group: 'buses', unit: 'minutes' },
  BUS_SALES_CLOSE_MINUTES: { group: 'buses', unit: 'minutes' },
  BUS_CANCEL_CUTOFF_HOURS: { group: 'buses', unit: 'hours' },
  BUS_DEFAULT_SERVICE_FEE_BPS: { group: 'buses', unit: 'bps' },
  DELETION_GRACE_DAYS: { group: 'buses', unit: 'days' },
} as const satisfies Record<string, { group: SettingGroup; unit: SettingUnit }>;

export type SettingKey = keyof typeof SETTING_DEFINITIONS;
export const SETTING_KEYS = Object.keys(SETTING_DEFINITIONS) as SettingKey[];

/** A number, a list of phone numbers, text, or null for "not set". */
export type SettingValue = number | string | string[] | null;

export interface SettingView {
  key: SettingKey;
  group: SettingGroup;
  unit: SettingUnit;
  value: SettingValue;
  /** The .env value, used when the setting is reset. */
  defaultValue: SettingValue;
  /** True when a super admin has changed it from the .env value. */
  changed: boolean;
  updatedAt: string | null;
  updatedBy: { id: string; name: string | null } | null;
}

export interface AdminVehicleCategoryView {
  id: string;
  key: string;
  name: string;
  description: string;
  seats: number;
  isEnabled: boolean;
  /** Service areas with an active fare for this vehicle type; passengers cannot book where there is none. */
  areasWithFares: number;
}

/** What passengers and drivers see as the way to reach support. */
export interface SupportContactView {
  phone: string | null;
  email: string | null;
}
