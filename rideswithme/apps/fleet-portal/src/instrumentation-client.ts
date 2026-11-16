/**
 * Error tracking in the browser, when the page says it is on (SENTRY_DSN set
 * on the server). The tracking code is only downloaded then.
 */
// The small settings module only; not the whole client package.
import { errorTrackingFromPage } from '@rideswithme/web-core/error-tracking-config';

const config = errorTrackingFromPage();
if (config)
  void import('@rideswithme/web-core/error-tracking-browser').then((m) =>
    m.initBrowserErrorTracking(config),
  );
