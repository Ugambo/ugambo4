// @ts-check
/**
 * Error tracking in the browser. Loaded with import() by each app's
 * src/instrumentation-client.ts only when the page says it is on, so visitors
 * download nothing extra otherwise.
 *
 * Plain ES module JavaScript (not compiled by tsc, which emits CommonJS here)
 * so the bundler keeps only the Sentry code this uses, not the whole SDK.
 */
import { init } from '@sentry/nextjs';
import { scrubBreadcrumb, scrubErrorEvent } from '@rideswithme/utilities';

/** @param {import('./dist/error-tracking-config').BrowserErrorTracking} config */
export function initBrowserErrorTracking(config) {
  init({
    dsn: config.dsn,
    environment: config.environment,
    tracesSampleRate: 0,
    initialScope: { tags: { app: config.app } },
    beforeSend: (event) => scrubErrorEvent(event),
    beforeBreadcrumb: (b) => scrubBreadcrumb(b),
  });
}
