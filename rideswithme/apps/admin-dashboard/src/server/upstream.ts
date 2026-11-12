import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { ApiErrorBody, AuthTokens } from '@rideswithme/shared-types';
import { serverEnv } from './env';
import {
  type AdminSession,
  clearSession,
  readSession,
  sessionFromTokens,
  writeSession,
} from './session';

/** Headers passed from the browser request to the API (for language, audit and rate limits). */
function forwardedHeaders(req: NextRequest): Record<string, string> {
  const out: Record<string, string> = { Accept: 'application/json' };
  for (const name of ['accept-language', 'user-agent', 'x-request-id']) {
    const v = req.headers.get(name);
    if (v) out[name] = v;
  }
  // The API trusts this only when TRUST_PROXY_HOPS counts this server as a proxy.
  const ip = req.headers.get('x-forwarded-for');
  if (ip) out['x-forwarded-for'] = ip;
  return out;
}

export async function callApi(
  req: NextRequest,
  path: string,
  init: { method: string; body?: string | null; accessToken?: string },
): Promise<Response> {
  const headers = forwardedHeaders(req);
  if (init.body) headers['Content-Type'] = 'application/json';
  if (init.accessToken) headers.Authorization = `Bearer ${init.accessToken}`;
  return fetch(`${serverEnv().API_URL.replace(/\/$/, '')}${path}`, {
    method: init.method,
    headers,
    body: init.body ?? undefined,
    cache: 'no-store',
  });
}

export function errorResponse(
  status: number,
  code: ApiErrorBody['error']['code'],
  message: string,
) {
  return NextResponse.json({ error: { code, message } } satisfies ApiErrorBody, { status });
}

/**
 * One refresh per refresh token at a time in this process. Concurrent page
 * requests share the result instead of each rotating the token (which would
 * leave the cookie holding a dead token). A multi-instance deployment relies on
 * the API's short reuse grace window instead.
 */
const inflight = new Map<string, Promise<AdminSession | null>>();

async function refresh(req: NextRequest, session: AdminSession): Promise<AdminSession | null> {
  let p = inflight.get(session.refreshToken);
  if (!p) {
    p = (async () => {
      const res = await callApi(req, '/v1/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
      if (!res.ok) return null;
      return sessionFromTokens((await res.json()) as AuthTokens);
    })().finally(() => setTimeout(() => inflight.delete(session.refreshToken), 5_000));
    inflight.set(session.refreshToken, p);
  }
  return p;
}

/**
 * Calls the API as the signed-in admin: refreshes the access token when it is
 * about to expire or the API says it has, retries once, and keeps the cookie
 * up to date. Returns 401 when the session is over.
 */
export async function callApiAsAdmin(
  req: NextRequest,
  path: string,
  init: { method: string; body?: string | null },
) {
  let session = await readSession();
  if (!session) return errorResponse(401, 'UNAUTHENTICATED', 'Not signed in');

  if (session.accessExpiresAt - Date.now() < 30_000) {
    const next = await refresh(req, session);
    if (!next) {
      await clearSession();
      return errorResponse(401, 'SESSION_REVOKED', 'Session ended');
    }
    session = next;
    await writeSession(session);
  }

  let res = await callApi(req, path, { ...init, accessToken: session.accessToken });
  if (res.status === 401) {
    const body = (await res
      .clone()
      .json()
      .catch(() => null)) as ApiErrorBody | null;
    if (body?.error.code === 'UNAUTHENTICATED') {
      const next = await refresh(req, session);
      if (!next) {
        await clearSession();
        return errorResponse(401, 'SESSION_REVOKED', 'Session ended');
      }
      await writeSession(next);
      res = await callApi(req, path, { ...init, accessToken: next.accessToken });
    } else {
      await clearSession();
    }
  }
  return passThrough(res);
}

export async function passThrough(res: Response): Promise<NextResponse> {
  const headers = new Headers();
  for (const name of ['content-type', 'retry-after', 'x-request-id']) {
    const v = res.headers.get(name);
    if (v) headers.set(name, v);
  }
  headers.set('Cache-Control', 'no-store');
  return new NextResponse(res.status === 204 ? null : await res.text(), {
    status: res.status,
    headers,
  });
}

/**
 * Cross-site request protection for state-changing calls: the session cookie is
 * SameSite=Strict, and the browser must also send a custom header (which other
 * sites cannot add without a CORS preflight this server never approves).
 */
export function isTrustedMutation(req: NextRequest): boolean {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  if (req.headers.get('x-rwm-csrf') !== '1') return false;
  const origin = req.headers.get('origin');
  if (!origin) return true;
  // Compare with the host the request arrived on (as forwarded by a reverse proxy, if any).
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
