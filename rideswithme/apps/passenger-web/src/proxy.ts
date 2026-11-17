import { NextResponse, type NextRequest } from 'next/server';
import { contentSecurityPolicy, errorTrackingOrigins } from '@rideswithme/web-core';

const SESSION_COOKIE = 'rwm_session';

/**
 * Sends signed-out visitors to the welcome page (from the home address) or to
 * /sign-in (from any other page) — a quick check; the API decides what they
 * may do — and sets a per-request nonce Content-Security-Policy. The API's
 * public address is allowed for the live (WebSocket) connection.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = request.cookies.has(SESSION_COOKIE);
  // Shared-trip pages (/track/...) are for anyone with the link.
  const open = pathname === '/sign-in' || pathname === '/welcome' || pathname.startsWith('/track/');
  if (!signedIn && !open) {
    if (pathname === '/') return NextResponse.redirect(new URL('/welcome', request.url));
    // Back to the page they wanted after signing in (e.g. /verify from the phone app).
    const to = new URL('/sign-in', request.url);
    to.searchParams.set('next', pathname + request.nextUrl.search);
    return NextResponse.redirect(to);
  }
  // Signed-in passengers go straight to booking.
  if (signedIn && pathname === '/welcome') return NextResponse.redirect(new URL('/', request.url));
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const api = process.env.API_PUBLIC_URL ? new URL(process.env.API_PUBLIC_URL) : null;
  const storage = process.env.STORAGE_ORIGIN;
  // The street map's tile server ({s} and other placeholders do not change the origin).
  const tiles = new URL(
    (process.env.MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png').replace(
      /\{[a-z]\}/g,
      'a',
    ),
  ).origin;
  const csp = contentSecurityPolicy({
    nonce,
    dev: process.env.NODE_ENV === 'development',
    imgSrc: [...(storage ? [storage] : []), tiles],
    connectSrc: [
      ...(api ? [api.origin, `${api.protocol === 'https:' ? 'wss' : 'ws'}://${api.host}`] : []),
      ...errorTrackingOrigins(),
    ],
  });
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  return response;
}

export const config = {
  matcher: [{ source: '/((?!api|_next/static|_next/image|favicon.ico).*)' }],
};
