export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000';
/** The passenger website, where identity checks are done (the app opens it in the browser). */
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'http://10.0.2.2:3002';
export const POLICY_VERSION = process.env.EXPO_PUBLIC_POLICY_VERSION ?? '2026-11';
/** Error reporting (off when unset). Public by design: a DSN only allows sending reports. */
export const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
export const SENTRY_ENVIRONMENT = process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT;
