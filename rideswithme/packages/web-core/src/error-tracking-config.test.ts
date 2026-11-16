import { describe, expect, it } from 'vitest';
import {
  browserErrorTrackingMeta,
  errorTrackingFromPage,
  errorTrackingOrigins,
} from './error-tracking-config';

const DSN = 'https://abc123@o1.ingest.sentry.io/42';
const page = (content: string | null) => ({
  querySelector: () => (content === null ? null : { getAttribute: () => content }),
});

describe('error tracking settings', () => {
  it('is off without SENTRY_DSN', () => {
    expect(browserErrorTrackingMeta('admin', {})).toBeNull();
    expect(errorTrackingOrigins({})).toEqual([]);
    expect(errorTrackingFromPage(page(null) as never)).toBeNull();
  });

  it('passes the DSN from the server to the browser, and allows only its origin', () => {
    const meta = browserErrorTrackingMeta('passenger-web', {
      SENTRY_DSN: DSN,
      SENTRY_ENVIRONMENT: 'staging',
    });
    expect(errorTrackingFromPage(page(meta) as never)).toEqual({
      dsn: DSN,
      environment: 'staging',
      app: 'passenger-web',
    });
    expect(errorTrackingOrigins({ SENTRY_DSN: DSN })).toEqual(['https://o1.ingest.sentry.io']);
  });

  it('ignores a malformed DSN or tag', () => {
    expect(errorTrackingOrigins({ SENTRY_DSN: 'not a url' })).toEqual([]);
    expect(errorTrackingFromPage(page('{oops') as never)).toBeNull();
    expect(errorTrackingFromPage(page('{"dsn":"x"}') as never)).toBeNull();
  });
});
