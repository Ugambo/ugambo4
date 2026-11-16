import * as Sentry from '@sentry/react-native';
import { scrubBreadcrumb, scrubErrorEvent } from '@rideswithme/utilities';

let started = false;

/**
 * Crash and error reporting for the apps (Sentry or a compatible service).
 * Off unless the app is built with EXPO_PUBLIC_SENTRY_DSN. Reports carry the
 * error, its stack and the screen, never who it happened to: no user, no
 * console output, and tokens, phone numbers and emails removed (the same rules
 * as the API and websites). Call once, at the top of the root layout.
 */
export function startErrorTracking(o: {
  dsn: string | undefined;
  environment: string | undefined;
  app: 'passenger' | 'driver';
}): void {
  if (!o.dsn || started) return;
  Sentry.init({
    dsn: o.dsn,
    environment: o.environment ?? 'production',
    tracesSampleRate: 0,
    sendDefaultPii: false,
    initialScope: { tags: { app: o.app } },
    beforeSend: (event) => scrubErrorEvent(event),
    beforeBreadcrumb: (b) => scrubBreadcrumb(b),
  });
  started = true;
}
