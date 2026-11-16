import * as Sentry from '@sentry/node';
import { scrubBreadcrumb, scrubErrorEvent } from '@rideswithme/utilities';
import type { AppConfig } from '../config/config';

let enabled = false;

/**
 * Error tracking. Sends unhandled errors (5xx) to Sentry when SENTRY_DSN is
 * set. Never sends request bodies, headers, cookies, query strings or user
 * details: only the error, its stack, the route and the request id.
 */
export function initErrorTracking(config: AppConfig) {
  if (!config.SENTRY_DSN || enabled) return;
  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.SENTRY_ENVIRONMENT ?? config.NODE_ENV,
    release: process.env.APP_VERSION,
    tracesSampleRate: 0,
    // The same privacy rules as the websites and apps (@rideswithme/utilities).
    beforeSend: (event) => scrubErrorEvent(event),
    beforeBreadcrumb: (b) => scrubBreadcrumb(b),
  });
  enabled = true;
}

export function reportError(err: unknown, context: { requestId?: string; route?: string } = {}) {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    if (context.requestId) scope.setTag('request_id', context.requestId);
    if (context.route) scope.setTag('route', context.route);
    Sentry.captureException(err);
  });
}
