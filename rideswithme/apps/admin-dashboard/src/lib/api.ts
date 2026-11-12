'use client';

import { type ApiClient, ApiError, createApiClient } from '@rideswithme/api-client';
import type { ApiErrorBody, MeResponse, OtpRequestResponse } from '@rideswithme/shared-types';

let client: ApiClient | null = null;

/**
 * Typed API client that goes through this app's server (/api/proxy), which adds
 * the admin's token from the encrypted session cookie. No tokens in the browser.
 */
export function api(): ApiClient {
  client ??= createApiClient({
    baseUrl: `${window.location.origin}/api/proxy`,
    tokenStore: {
      getAccessToken: () => null,
      getRefreshToken: () => null,
      setTokens: () => undefined,
    },
    headers: { 'x-rwm-csrf': '1' },
    getLanguage: () => (document.cookie.includes('rwm_lang=ha') ? 'ha' : 'en'),
  });
  return client;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-rwm-csrf': '1' },
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

export const auth = {
  requestOtp: (phone: string) => post<OtpRequestResponse>('/api/auth/otp/request', { phone }),
  verifyOtp: (phone: string, code: string) =>
    post<{ user: MeResponse }>('/api/auth/otp/verify', { phone, code }),
  logout: () => post<void>('/api/auth/logout'),
};

export function isSignedOut(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}
