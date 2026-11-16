/**
 * Error tracking for the Next.js apps' servers (Sentry or a compatible
 * service such as GlitchTip). Off unless SENTRY_DSN is set. Reports carry the
 * error, its stack and the route, never request data or who it happened to
 * (scrubErrorEvent). Used from each app's src/instrumentation.ts.
 */
import * as Sentry from '@sentry/nextjs';
import { scrubBreadcrumb, scrubErrorEvent } from '@rideswithme/utilities';

let started = false;

export function registerErrorTracking(app: string): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || started) return;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.APP_VERSION,
    tracesSampleRate: 0,
    initialScope: { tags: { app } },
    beforeSend: (event) => scrubErrorEvent(event),
    beforeBreadcrumb: (b) => scrubBreadcrumb(b),
  });
  started = true;
}

/** Next.js calls this for errors in server components, route handlers and the proxy. */
export const onRequestError = Sentry.captureRequestError;
