import { EncryptJWT, jwtDecrypt } from 'jose';
import type { ApiErrorBody, AuthTokens, VerifyOtpResponse } from '@rideswithme/shared-types';

/**
 * Backend-for-frontend for the Next.js apps. The browser never holds API
 * tokens: they live in an encrypted (AES-256-GCM), httpOnly, SameSite=Strict
 * cookie on the app's own server, which calls the API for the browser through
 * an allow-listed proxy and refreshes the access token when needed.
 *
 * Written against standard Request/Response so it has no dependency on Next.
 */
export interface BffOptions {
  cookieName: string;
  apiUrl: () => string;
  /** Base64 of 32 random bytes. */
  sessionSecret: () => string;
  cookieSecure: () => boolean;
  policyVersion: () => string;
  /** Shown in the user's list of signed-in devices. */
  deviceName: string;
  /** API paths (without leading slash) the browser may reach, e.g. /^v1\/me$/. */
  allow: RegExp[];
  fetch?: typeof fetch;
}

export interface WebSession {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
}

export function sessionFromTokens(tokens: AuthTokens): WebSession {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    accessExpiresAt: Date.now() + tokens.accessTokenExpiresIn * 1000,
    refreshExpiresAt: new Date(tokens.refreshTokenExpiresAt).getTime(),
  };
}

export function isAllowedPath(path: string, allow: RegExp[]): boolean {
  if (path.includes('..') || path.includes('//')) return false;
  return allow.some((re) => re.test(path));
}

export function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/**
 * Protection against cross-site requests for state-changing calls: the cookie
 * is SameSite=Strict, and the browser must also send a custom header (which
 * other sites cannot add without a CORS preflight) from the same host.
 */
export function isTrustedMutation(req: Request): boolean {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  if (req.headers.get('x-rwm-csrf') !== '1') return false;
  const origin = req.headers.get('origin');
  if (!origin) return true;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function errorResponse(
  status: number,
  code: ApiErrorBody['error']['code'],
  message: string,
): Response {
  return Response.json({ error: { code, message } } satisfies ApiErrorBody, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function createBff(o: BffOptions) {
  const fetchImpl = o.fetch ?? globalThis.fetch.bind(globalThis);
  const key = () => Buffer.from(o.sessionSecret(), 'base64');
  const inflight = new Map<string, Promise<WebSession | null>>();

  async function seal(s: WebSession): Promise<string> {
    return new EncryptJWT({ s })
      .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
      .setIssuedAt()
      .setExpirationTime(Math.floor(s.refreshExpiresAt / 1000))
      .encrypt(key());
  }

  async function unseal(value: string | undefined): Promise<WebSession | null> {
    if (!value) return null;
    try {
      return ((await jwtDecrypt(value, key())).payload.s as WebSession) ?? null;
    } catch {
      return null;
    }
  }

  async function setCookie(headers: Headers, s: WebSession | null) {
    const base = `${o.cookieName}=${s ? encodeURIComponent(await seal(s)) : ''}; Path=/; HttpOnly; SameSite=Strict${o.cookieSecure() ? '; Secure' : ''}`;
    headers.append(
      'Set-Cookie',
      s ? `${base}; Expires=${new Date(s.refreshExpiresAt).toUTCString()}` : `${base}; Max-Age=0`,
    );
  }

  function forwarded(req: Request): Record<string, string> {
    const out: Record<string, string> = { Accept: 'application/json' };
    for (const name of [
      'accept-language',
      'user-agent',
      'x-request-id',
      'x-forwarded-for',
      'idempotency-key',
    ]) {
      const v = req.headers.get(name);
      if (v) out[name] = v;
    }
    return out;
  }

  function callApi(
    req: Request,
    path: string,
    init: { method: string; body?: string | null; token?: string },
  ) {
    const headers = forwarded(req);
    if (init.body) headers['Content-Type'] = 'application/json';
    if (init.token) headers.Authorization = `Bearer ${init.token}`;
    return fetchImpl(`${o.apiUrl().replace(/\/$/, '')}${path}`, {
      method: init.method,
      headers,
      body: init.body ?? undefined,
      cache: 'no-store',
    });
  }

  async function passThrough(res: Response, extra?: Headers): Promise<Response> {
    const headers = new Headers(extra);
    for (const name of ['content-type', 'retry-after', 'x-request-id']) {
      const v = res.headers.get(name);
      if (v) headers.set(name, v);
    }
    headers.set('Cache-Control', 'no-store');
    return new Response(res.status === 204 ? null : await res.text(), {
      status: res.status,
      headers,
    });
  }

  /** One refresh per refresh token at a time in this process (concurrent requests share it). */
  function refresh(req: Request, s: WebSession): Promise<WebSession | null> {
    let p = inflight.get(s.refreshToken);
    if (!p) {
      p = (async () => {
        const res = await callApi(req, '/v1/auth/refresh', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: s.refreshToken }),
        });
        return res.ok ? sessionFromTokens((await res.json()) as AuthTokens) : null;
      })().finally(() => setTimeout(() => inflight.delete(s.refreshToken), 5_000));
      inflight.set(s.refreshToken, p);
    }
    return p;
  }

  /** Calls the API as the signed-in user, refreshing the token once if needed. */
  async function callAsUser(
    req: Request,
    path: string,
    init: { method: string; body?: string | null },
  ): Promise<Response> {
    let session = await unseal(readCookie(req, o.cookieName));
    if (!session) return errorResponse(401, 'UNAUTHENTICATED', 'Not signed in');
    const headers = new Headers();
    const ended = async () => {
      const r = errorResponse(401, 'SESSION_REVOKED', 'Session ended');
      await setCookie(r.headers, null);
      return r;
    };

    if (session.accessExpiresAt - Date.now() < 30_000) {
      const next = await refresh(req, session);
      if (!next) return ended();
      session = next;
      await setCookie(headers, session);
    }
    let res = await callApi(req, path, { ...init, token: session.accessToken });
    if (res.status === 401) {
      const body = (await res
        .clone()
        .json()
        .catch(() => null)) as ApiErrorBody | null;
      if (body?.error.code !== 'UNAUTHENTICATED') return ended();
      const next = await refresh(req, session);
      if (!next) return ended();
      headers.delete('Set-Cookie');
      await setCookie(headers, next);
      res = await callApi(req, path, { ...init, token: next.accessToken });
    }
    return passThrough(res, headers);
  }

  return {
    callAsUser,

    async otpRequest(req: Request): Promise<Response> {
      if (!isTrustedMutation(req))
        return errorResponse(403, 'FORBIDDEN', 'Cross-site request refused');
      const body = (await req.json().catch(() => ({}))) as { phone?: unknown };
      return passThrough(
        await callApi(req, '/v1/auth/otp/request', {
          method: 'POST',
          body: JSON.stringify({ phone: body.phone }),
        }),
      );
    },

    /** Signs in with the SMS code. Tokens go into the cookie; the browser only gets the user. */
    async otpVerify(req: Request): Promise<Response> {
      if (!isTrustedMutation(req))
        return errorResponse(403, 'FORBIDDEN', 'Cross-site request refused');
      const body = (await req.json().catch(() => ({}))) as { phone?: unknown; code?: unknown };
      const res = await callApi(req, '/v1/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({
          phone: body.phone,
          code: body.code,
          acceptedPolicyVersion: o.policyVersion(),
          device: { name: o.deviceName, platform: 'web' },
        }),
      });
      if (!res.ok) return passThrough(res);
      const data = (await res.json()) as VerifyOtpResponse;
      const out = Response.json({ user: data.user }, { headers: { 'Cache-Control': 'no-store' } });
      await setCookie(out.headers, sessionFromTokens(data.tokens));
      return out;
    },

    async logout(req: Request): Promise<Response> {
      if (!isTrustedMutation(req))
        return errorResponse(403, 'FORBIDDEN', 'Cross-site request refused');
      await callAsUser(req, '/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
      const out = new Response(null, { status: 204 });
      await setCookie(out.headers, null);
      return out;
    },

    /** Forwards an allow-listed API call (path like "v1/me") with the user's token. */
    async proxy(req: Request, path: string): Promise<Response> {
      if (!isAllowedPath(path, o.allow)) return errorResponse(404, 'NOT_FOUND', 'Not found');
      if (!isTrustedMutation(req))
        return errorResponse(403, 'FORBIDDEN', 'Cross-site request refused');
      const body = req.method === 'GET' || req.method === 'DELETE' ? null : await req.text();
      return callAsUser(req, `/${path}${new URL(req.url).search}`, {
        method: req.method,
        body: body || null,
      });
    },

    /** For tests and pages: whether the request carries a readable session cookie. */
    hasSession: async (req: Request) => (await unseal(readCookie(req, o.cookieName))) !== null,
  };
}

export type Bff = ReturnType<typeof createBff>;

/** Content-Security-Policy with a per-request nonce (only this site's scripts run). */
export function contentSecurityPolicy(o: {
  nonce: string;
  dev: boolean;
  imgSrc?: string[];
  connectSrc?: string[];
  frameSrc?: string[];
}): string {
  const list = (xs: string[] | undefined) => (xs ?? []).filter(Boolean).join(' ');
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${o.nonce}' 'strict-dynamic'${o.dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${o.nonce}'`,
    `img-src 'self' blob: data: ${list(o.imgSrc)}`.trim(),
    `frame-src ${list(o.frameSrc) || "'none'"}`,
    "font-src 'self'",
    `connect-src 'self' ${list(o.connectSrc)}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
