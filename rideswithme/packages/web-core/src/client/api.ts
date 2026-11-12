import { type ApiClient, ApiError, createApiClient } from '@rideswithme/api-client';
import type { ApiErrorBody, MeResponse, OtpRequestResponse } from '@rideswithme/shared-types';
import { LANGUAGE_COOKIE } from '../language';

/** Header the app's server requires on state-changing calls (see isTrustedMutation). */
export const CSRF_HEADER = { 'x-rwm-csrf': '1' } as const;

const browserLanguage = () => (document.cookie.includes(`${LANGUAGE_COOKIE}=ha`) ? 'ha' : 'en');

/** POSTs JSON to one of the app's own routes and turns error bodies into ApiError. */
export async function postJson<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...CSRF_HEADER },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    throw new ApiError(0, 'NETWORK_ERROR', (err as Error).message);
  }
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as T & Partial<ApiErrorBody>;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      json.error?.code ?? 'UNKNOWN',
      json.error?.message ?? `HTTP ${res.status}`,
      json.error?.details,
      json.error?.retryAfterSeconds,
      json.requestId,
    );
  }
  return json;
}

let client: ApiClient | null = null;

/**
 * Typed API client that goes through the app's own server (/api/proxy), which
 * adds the user's token from the encrypted session cookie. No tokens in the browser.
 */
export function browserApi(): ApiClient {
  client ??= createApiClient({
    baseUrl: `${window.location.origin}/api/proxy`,
    tokenStore: {
      getAccessToken: () => null,
      getRefreshToken: () => null,
      setTokens: () => undefined,
    },
    headers: CSRF_HEADER,
    getLanguage: browserLanguage,
  });
  return client;
}

/** Sign-in and sign-out through the app's own server, which keeps the tokens. */
export const browserAuth = {
  requestOtp: (phone: string) => postJson<OtpRequestResponse>('/api/auth/otp/request', { phone }),
  verifyOtp: (phone: string, code: string) =>
    postJson<{ user: MeResponse }>('/api/auth/otp/verify', { phone, code }),
  logout: () => postJson<void>('/api/auth/logout'),
};

export function isSignedOut(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}
