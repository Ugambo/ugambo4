import { NextResponse, type NextRequest } from 'next/server';
import { contentSecurityPolicy } from '@rideswithme/web-core';

const SESSION_COOKIE = 'rwm_session';

/**
 * Sends signed-out visitors to /sign-in (a quick check; the API decides what
 * they may do) and sets a per-request nonce Content-Security-Policy. The API's
 * public address is allowed for the live (WebSocket) connection.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has(SESSION_COOKIE) && request.nextUrl.pathname !== '/sign-in') {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const api = process.env.API_PUBLIC_URL ? new URL(process.env.API_PUBLIC_URL) : null;
  const storage = process.env.STORAGE_ORIGIN;
  const csp = contentSecurityPolicy({
    nonce,
    dev: process.env.NODE_ENV === 'development',
    imgSrc: storage ? [storage] : [],
    connectSrc: api
      ? [api.origin, `${api.protocol === 'https:' ? 'wss' : 'ws'}://${api.host}`]
      : [],
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
