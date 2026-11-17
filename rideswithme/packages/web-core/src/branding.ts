/**
 * The system's logo, for the websites' servers. Each site serves the image
 * from its own address (/api/brand/logo), so pages need nothing new in their
 * Content Security Policy and the API's address stays private.
 */

/** Where a site serves the logo; the version makes a new logo show at once. */
export const brandLogoPath = (version: string) =>
  `/api/brand/logo?v=${encodeURIComponent(version)}`;

/** The current logo's version, or null for the built-in mark (also when the API cannot be reached). */
export async function fetchBrandVersion(apiUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`${apiUrl}/v1/branding`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { logoVersion?: string | null };
    return typeof body.logoVersion === 'string' ? body.logoVersion : null;
  } catch {
    return null;
  }
}

/** GET handler for a site's /api/brand/logo route: the API's logo image, passed through. */
export function brandLogoRoute(apiUrl: () => string) {
  return async function GET(): Promise<Response> {
    try {
      const res = await fetch(`${apiUrl()}/v1/branding/logo`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok)
        return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
      return new Response(await res.arrayBuffer(), {
        headers: {
          'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream',
          // The address carries the version, so a day is safe.
          'Cache-Control': 'public, max-age=86400',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox",
        },
      });
    } catch {
      return new Response(null, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }
  };
}
