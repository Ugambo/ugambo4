import { NextResponse, type NextRequest } from 'next/server';
import { contentSecurityPolicy } from '@rideswithme/web-core';

const SESSION_COOKIE = 'rwm_fleet_session';

/** Sends signed-out visitors to /login and sets a nonce Content-Security-Policy on every page. */
export function proxy(request: NextRequest) {
  if (!request.cookies.has(SESSION_COOKIE) && request.nextUrl.pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = contentSecurityPolicy({ nonce, dev: process.env.NODE_ENV === 'development' });
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return response;
}

export const config = {
  matcher: [{ source: '/((?!api|_next/static|_next/image|favicon.ico).*)' }],
};
