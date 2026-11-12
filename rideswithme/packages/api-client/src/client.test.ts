import { describe, expect, it, vi } from 'vitest';
import type { AuthTokens } from '@rideswithme/shared-types';
import { ApiError, createApiClient, type TokenStore } from './client';

function memoryStore(
  initial: Partial<AuthTokens> = {},
): TokenStore & { tokens: Partial<AuthTokens> | null } {
  const store = {
    tokens: initial as Partial<AuthTokens> | null,
    getAccessToken: () => store.tokens?.accessToken ?? null,
    getRefreshToken: () => store.tokens?.refreshToken ?? null,
    setTokens: (t: AuthTokens | null) => {
      store.tokens = t;
    },
  };
  return store;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const newTokens: AuthTokens = {
  accessToken: 'new-access',
  accessTokenExpiresIn: 900,
  refreshToken: 'new-refresh',
  refreshTokenExpiresAt: '2030-01-01T00:00:00.000Z',
};

describe('api client', () => {
  it('refreshes once for concurrent 401s and retries each request', async () => {
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>)?.Authorization;
      if (url.endsWith('/v1/auth/refresh')) {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 10));
        return json(200, newTokens);
      }
      if (auth === 'Bearer old-access') {
        return json(401, { error: { code: 'UNAUTHENTICATED', message: 'expired' } });
      }
      return json(200, { id: 'u1' });
    });
    const store = memoryStore({ accessToken: 'old-access', refreshToken: 'old-refresh' });
    const client = createApiClient({
      baseUrl: 'http://api',
      tokenStore: store,
      fetch: fetchMock as never,
    });

    const results = await Promise.all([client.me.get(), client.me.get(), client.me.get()]);
    expect(results).toHaveLength(3);
    expect(refreshCalls).toBe(1);
    expect(store.tokens?.accessToken).toBe('new-access');
  });

  it('clears tokens and signals session expiry when refresh is rejected', async () => {
    const onSessionExpired = vi.fn();
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('/refresh')
        ? json(401, { error: { code: 'REFRESH_TOKEN_INVALID', message: 'nope' } })
        : json(401, { error: { code: 'UNAUTHENTICATED', message: 'expired' } }),
    );
    const store = memoryStore({ accessToken: 'a', refreshToken: 'r' });
    const client = createApiClient({
      baseUrl: 'http://api',
      tokenStore: store,
      fetch: fetchMock as never,
      onSessionExpired,
    });
    await expect(client.me.get()).rejects.toBeInstanceOf(ApiError);
    expect(store.tokens).toBeNull();
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it('keeps tokens when the refresh fails because the network is down', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/refresh')) throw new TypeError('Network request failed');
      return json(401, { error: { code: 'UNAUTHENTICATED', message: 'expired' } });
    });
    const store = memoryStore({ accessToken: 'a', refreshToken: 'r' });
    const client = createApiClient({
      baseUrl: 'http://api',
      tokenStore: store,
      fetch: fetchMock as never,
    });
    await expect(client.me.get()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(store.tokens?.refreshToken).toBe('r');
  });

  it('surfaces API error codes and retry hints', async () => {
    const fetchMock = vi.fn(async () =>
      json(429, {
        error: { code: 'OTP_RESEND_TOO_SOON', message: 'wait', retryAfterSeconds: 42 },
        requestId: 'req-1',
      }),
    );
    const client = createApiClient({
      baseUrl: 'http://api/',
      tokenStore: memoryStore(),
      fetch: fetchMock as never,
      getLanguage: () => 'ha',
    });
    const err = await client.auth.requestOtp({ phone: '08031234567' }).catch((e: unknown) => e);
    expect(err).toMatchObject({
      status: 429,
      code: 'OTP_RESEND_TOO_SOON',
      retryAfterSeconds: 42,
      requestId: 'req-1',
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api/v1/auth/otp/request');
    expect((init.headers as Record<string, string>)['Accept-Language']).toBe('ha');
  });
});
