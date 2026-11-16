import { NextResponse, type NextRequest } from 'next/server';
import { contentSecurityPolicy } from '@rideswithme/web-core';

const SESSION_COOKIE = 'rwm_admin_session';

/**
 * Runs before every page: sends signed-out visitors to /login (a quick check
 * only; the API decides what they may actually do), and sets a strict
 * Content-Security-Policy with a fresh nonce per request.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = request.cookies.has(SESSION_COOKIE);
  if (!signedIn && pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const storage = process.env.STORAGE_ORIGIN;
  // Map tiles (the live map and service areas) and the API's live connection.
  const tiles = new URL(
    (process.env.MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png').replace(
      /\{[a-z]\}/g,
      'a',
    ),
  ).origin;
  const api = process.env.API_PUBLIC_URL ? new URL(process.env.API_PUBLIC_URL) : null;
  const csp = contentSecurityPolicy({
    nonce,
    dev: process.env.NODE_ENV === 'development',
    imgSrc: [...(storage ? [storage] : []), tiles],
    frameSrc: storage ? [storage] : [],
    connectSrc: api
      ? [api.origin, `${api.protocol === 'https:' ? 'wss' : 'ws'}://${api.host}`]
      : [],
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return response;
}

export const config = {
  // Pages only: API routes do their own checks, and static files need no policy.
  matcher: [{ source: '/((?!api|_next/static|_next/image|favicon.ico).*)' }],
};
