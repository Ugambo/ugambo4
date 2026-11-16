/**
 * Privacy rules for error reports (Sentry or compatible), shared by the API,
 * the websites and the apps: an error report carries the error, its stack and
 * where it happened, never who it happened to or what they typed. Structural
 * types, so this package does not depend on any error-tracking SDK.
 */

export interface ScrubbableRequest {
  url?: string;
  headers?: unknown;
  cookies?: unknown;
  data?: unknown;
  query_string?: unknown;
  env?: unknown;
}

export interface ScrubbableBreadcrumb {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
}

export interface ScrubbableEvent {
  message?: string;
  exception?: { values?: { value?: string }[] };
  request?: ScrubbableRequest;
  user?: unknown;
  transaction?: string;
  breadcrumbs?: ScrubbableBreadcrumb[];
  server_name?: string;
}

/** Path segments after these hold a secret (trip-share tokens). */
const SECRET_AFTER = new Set(['track', 'share']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Long opaque segments (tokens, codes) that are not plain ids. */
const OPAQUE = /^[A-Za-z0-9_-]{24,}$/;

/**
 * A URL or path without its query string and fragment, with secret path
 * segments replaced by ":token". Ids (UUIDs) are kept: they identify records,
 * not people, and staff need them to find the problem.
 */
export function scrubUrl(url: string): string {
  const cut = url.search(/[?#]/);
  const bare = cut === -1 ? url : url.slice(0, cut);
  const m = bare.match(/^([a-z][a-z0-9+.-]*:\/\/[^/]*)?(.*)$/i);
  const origin = m?.[1] ?? '';
  const parts = (m?.[2] ?? '').split('/');
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    const prev = i > 0 ? parts[i - 1]! : '';
    if (p && (SECRET_AFTER.has(prev) || (OPAQUE.test(p) && !UUID.test(p)))) parts[i] = ':token';
  }
  return origin + parts.join('/');
}

/**
 * Free text (error messages) with what may identify someone removed: share
 * tokens in paths, query strings of addresses, phone numbers and email
 * addresses. Error messages sometimes quote a URL or a value.
 */
export function scrubText(text: string): string {
  return text
    .replace(/(https?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>]*/g, '$1')
    .replace(/\/(track|share)\/[A-Za-z0-9_-]+/g, '/$1/:token')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/(\+?234|\b0)[789][01]\d{8}\b/g, '[phone]');
}

/**
 * Keeps a breadcrumb without personal data, or drops it (null). Console
 * output is dropped (it can contain anything); URLs are scrubbed.
 */
export function scrubBreadcrumb<B extends ScrubbableBreadcrumb>(b: B): B | null {
  if (b.category === 'console') return null;
  if (b.data) {
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(b.data))
      data[k] = typeof v === 'string' && ['url', 'from', 'to'].includes(k) ? scrubUrl(v) : v;
    b.data = data;
  }
  if (b.message)
    b.message = b.category === 'navigation' ? scrubUrl(b.message) : scrubText(b.message);
  return b;
}

/** Removes everything personal from an error report before it is sent. */
export function scrubErrorEvent<E extends ScrubbableEvent>(e: E): E {
  if (e.request) {
    delete e.request.headers;
    delete e.request.cookies;
    delete e.request.data;
    delete e.request.query_string;
    delete e.request.env;
    if (e.request.url) e.request.url = scrubUrl(e.request.url);
  }
  delete e.user;
  delete e.server_name;
  if (e.message) e.message = scrubText(e.message);
  for (const v of e.exception?.values ?? []) if (v.value) v.value = scrubText(v.value);
  if (e.transaction) e.transaction = scrubUrl(e.transaction);
  if (e.breadcrumbs)
    e.breadcrumbs = e.breadcrumbs.flatMap((b) => {
      const kept = scrubBreadcrumb(b);
      return kept ? [kept] : [];
    });
  return e;
}
