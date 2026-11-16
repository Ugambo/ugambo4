/** Error tracking for this app's server (off unless SENTRY_DSN is set). */
export async function register() {
  const { registerErrorTracking } = await import('@rideswithme/web-core/error-tracking');
  registerErrorTracking('admin-dashboard');
}

export { onRequestError } from '@rideswithme/web-core/error-tracking';
