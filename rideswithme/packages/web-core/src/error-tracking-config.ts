/**
 * How the browser learns whether error tracking is on, at run time rather
 * than build time (one Docker image serves every environment): the root
 * layout renders a <meta name="rwm-error-tracking"> tag from SENTRY_DSN, and
 * the browser reads it before starting.
 */

export interface BrowserErrorTracking {
  dsn: string;
  environment: string;
  app: string;
}

export const ERROR_TRACKING_META = 'rwm-error-tracking';

/** For the root layout: the meta tag's content, or null when tracking is off. */
export function browserErrorTrackingMeta(
  app: string,
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (!env.SENTRY_DSN) return null;
  const config: BrowserErrorTracking = {
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV ?? 'production',
    app,
  };
  return JSON.stringify(config);
}

/** For the Content-Security-Policy: where the browser sends reports, if anywhere. */
export function errorTrackingOrigins(
  env: Record<string, string | undefined> = process.env,
): string[] {
  if (!env.SENTRY_DSN) return [];
  try {
    return [new URL(env.SENTRY_DSN).origin];
  } catch {
    return [];
  }
}

/** In the browser: the settings from the page, or null when tracking is off. */
export function errorTrackingFromPage(
  doc: Pick<Document, 'querySelector'> = document,
): BrowserErrorTracking | null {
  const content = doc.querySelector(`meta[name="${ERROR_TRACKING_META}"]`)?.getAttribute('content');
  if (!content) return null;
  try {
    const c = JSON.parse(content) as Partial<BrowserErrorTracking>;
    return c.dsn && c.environment && c.app
      ? { dsn: c.dsn, environment: c.environment, app: c.app }
      : null;
  } catch {
    return null;
  }
}
