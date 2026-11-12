import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createBff, isAllowedPath, isTrustedMutation } from './bff';

const secret = randomBytes(32).toString('base64');
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const tokens = (n: number, ttl = 900) => ({
  accessToken: `access-${n}`,
  accessTokenExpiresIn: ttl,
  refreshToken: `refresh-${n}`,
  refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
});

function bff(fetchMock: typeof fetch) {
  return createBff({
    cookieName: 'sess',
    apiUrl: () => 'http://api',
    sessionSecret: () => secret,
    cookieSecure: () => true,
    policyVersion: () => '2026-11',
    deviceName: 'Test web',
    allow: [/^v1\/me$/],
    fetch: fetchMock,
  });
}

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'x-rwm-csrf': '1', host: 'app', origin: 'http://app', ...headers },
  });

/** Signs in through the BFF and returns the Set-Cookie value. */
async function signIn(b: ReturnType<typeof bff>) {
  const res = await b.otpVerify(
    post('http://app/api/auth/otp/verify', { phone: '08031234567', code: '123456' }),
  );
  expect(res.status).toBe(200);
  const cookie = res.headers.get('set-cookie')!;
  expect(cookie).toMatch(/^sess=.+; Path=\/; HttpOnly; SameSite=Strict; Secure; Expires=/);
  return cookie.split(';')[0]!;
}

describe('web BFF', () => {
  it('keeps tokens out of the browser: the response has the user only', async () => {
    const fetchMock = vi.fn(async () =>
      json(200, { tokens: tokens(1), user: { id: 'u1' }, isNewUser: false }),
    );
    const b = bff(fetchMock as never);
    const res = await b.otpVerify(
      post('http://app/api/auth/otp/verify', { phone: '08031234567', code: '123456' }),
    );
    const text = await res.clone().text();
    expect(text).not.toContain('access-1');
    expect(text).not.toContain('refresh-1');
    expect(res.headers.get('set-cookie')).not.toContain('access-1');
    const sent = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(sent).toMatchObject({
      acceptedPolicyVersion: '2026-11',
      device: { platform: 'web', name: 'Test web' },
    });
  });

  it('proxies allow-listed calls with the token and refreshes once for concurrent expired requests', async () => {
    let refreshes = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/v1/auth/otp/verify'))
        return json(200, { tokens: tokens(1), user: {}, isNewUser: false });
      if (url.endsWith('/v1/auth/refresh')) {
        refreshes++;
        return json(200, tokens(2));
      }
      const auth = (init?.headers as Record<string, string>).Authorization;
      return auth === 'Bearer access-1'
        ? json(401, { error: { code: 'UNAUTHENTICATED', message: 'expired' } })
        : json(200, { id: 'u1' });
    });
    const b = bff(fetchMock as never);
    const cookie = await signIn(b);
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        b.proxy(new Request('http://app/api/proxy/v1/me', { headers: { cookie } }), 'v1/me'),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(refreshes).toBe(1);
    expect(results[0]!.headers.get('set-cookie')).toMatch(/^sess=/);
  });

  it('ends the session cookie when the refresh token is refused', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/v1/auth/otp/verify'))
        return json(200, { tokens: tokens(1, 1), user: {}, isNewUser: false });
      return json(401, { error: { code: 'REFRESH_TOKEN_INVALID', message: 'no' } });
    });
    const b = bff(fetchMock as never);
    const cookie = await signIn(b);
    const res = await b.proxy(
      new Request('http://app/api/proxy/v1/me', { headers: { cookie } }),
      'v1/me',
    );
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toMatch(/^sess=; .*Max-Age=0/);
  });

  it('refuses unknown paths, signed-out calls and tampered cookies', async () => {
    const b = bff(vi.fn() as never);
    expect(
      (await b.proxy(new Request('http://app/api/proxy/v1/auth/refresh'), 'v1/auth/refresh'))
        .status,
    ).toBe(404);
    expect((await b.proxy(new Request('http://app/api/proxy/v1/me'), 'v1/me')).status).toBe(401);
    expect(
      (
        await b.proxy(
          new Request('http://app/api/proxy/v1/me', { headers: { cookie: 'sess=forged' } }),
          'v1/me',
        )
      ).status,
    ).toBe(401);
  });
});

describe('request checks', () => {
  it('needs the custom header and a same-host origin for state-changing calls', () => {
    expect(isTrustedMutation(new Request('http://app/x'))).toBe(true);
    expect(isTrustedMutation(new Request('http://app/x', { method: 'POST' }))).toBe(false);
    expect(isTrustedMutation(post('http://app/x', {}, { origin: 'http://evil' }))).toBe(false);
    expect(isTrustedMutation(post('http://app/x', {}))).toBe(true);
  });

  it('allows only listed paths and no traversal', () => {
    expect(isAllowedPath('v1/me', [/^v1\/me$/])).toBe(true);
    expect(isAllowedPath('v1/me/../auth', [/^v1\/me.*$/])).toBe(false);
    expect(isAllowedPath('v1/auth/refresh', [/^v1\/me$/])).toBe(false);
  });
});
