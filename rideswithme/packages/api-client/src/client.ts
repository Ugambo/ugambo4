import type {
  AdminUserSummary,
  ApiErrorBody,
  AuditLogEntry,
  AuthTokens,
  ErrorCode,
  Language,
  MeResponse,
  OtpRequestResponse,
  Paginated,
  RoleKey,
  RoleSummary,
  SessionSummary,
  TotpSetupResponse,
  VerifyOtpResponse,
} from '@rideswithme/shared-types';
import type {
  ListAuditLogsQuery,
  ListUsersQuery,
  RequestOtpInput,
  UpdateMeInput,
  VerifyOtpInput,
} from '@rideswithme/validation';

export type ClientErrorCode = ErrorCode | 'NETWORK_ERROR' | 'UNKNOWN';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ClientErrorCode,
    message: string,
    public readonly details?: unknown,
    public readonly retryAfterSeconds?: number,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Where the app keeps tokens (SecureStore on mobile, memory + httpOnly cookie on web). */
export interface TokenStore {
  getAccessToken(): string | null | Promise<string | null>;
  getRefreshToken(): string | null | Promise<string | null>;
  setTokens(tokens: AuthTokens | null): void | Promise<void>;
}

export interface ApiClientOptions {
  baseUrl: string;
  tokenStore: TokenStore;
  fetch?: typeof fetch;
  /** Sent as Accept-Language so server-generated text (SMS) uses the right language. */
  getLanguage?: () => Language;
  /** Called when the refresh token is rejected and the user must sign in again. */
  onSessionExpired?: () => void;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  auth?: boolean;
  idempotencyKey?: string;
}

export function createApiClient(options: ApiClientOptions) {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const baseUrl = options.baseUrl.replace(/\/$/, '');
  let refreshInFlight: Promise<boolean> | null = null;

  async function rawRequest<T>(
    path: string,
    req: RequestOptions,
    accessToken?: string | null,
  ): Promise<T> {
    const url = new URL(baseUrl + path);
    for (const [k, v] of Object.entries(req.query ?? {})) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (req.body !== undefined) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (options.getLanguage) headers['Accept-Language'] = options.getLanguage();
    if (req.idempotencyKey) headers['Idempotency-Key'] = req.idempotencyKey;

    let res: Response;
    try {
      res = await fetchImpl(url.toString(), {
        method: req.method ?? 'GET',
        headers,
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
      });
    } catch (err) {
      throw new ApiError(0, 'NETWORK_ERROR', err instanceof Error ? err.message : 'Network error');
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const json: unknown = text ? safeJson(text) : undefined;
    if (!res.ok) {
      const body = json as Partial<ApiErrorBody> | undefined;
      throw new ApiError(
        res.status,
        body?.error?.code ?? 'UNKNOWN',
        body?.error?.message ?? `HTTP ${res.status}`,
        body?.error?.details,
        body?.error?.retryAfterSeconds,
        body?.requestId,
      );
    }
    return json as T;
  }

  /** Refreshes tokens once even if many requests hit 401 at the same time. */
  async function refreshTokens(): Promise<boolean> {
    refreshInFlight ??= (async () => {
      try {
        const refreshToken = await options.tokenStore.getRefreshToken();
        if (!refreshToken) return false;
        const tokens = await rawRequest<AuthTokens>('/v1/auth/refresh', {
          method: 'POST',
          body: { refreshToken },
        });
        await options.tokenStore.setTokens(tokens);
        return true;
      } catch (err) {
        // Keep tokens on network failure so the app can retry when back online.
        if (err instanceof ApiError && err.status !== 0) {
          await options.tokenStore.setTokens(null);
          options.onSessionExpired?.();
        }
        if (err instanceof ApiError && err.status === 0) throw err;
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
  }

  async function request<T>(path: string, req: RequestOptions = {}): Promise<T> {
    if (req.auth === false) return rawRequest<T>(path, req);
    const token = await options.tokenStore.getAccessToken();
    try {
      return await rawRequest<T>(path, req, token);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && err.code === 'UNAUTHENTICATED') {
        if (await refreshTokens()) {
          return rawRequest<T>(path, req, await options.tokenStore.getAccessToken());
        }
      } else if (err instanceof ApiError && err.code === 'SESSION_REVOKED') {
        await options.tokenStore.setTokens(null);
        options.onSessionExpired?.();
      }
      throw err;
    }
  }

  return {
    auth: {
      requestOtp: (input: RequestOtpInput) =>
        request<OtpRequestResponse>('/v1/auth/otp/request', {
          method: 'POST',
          body: input,
          auth: false,
        }),
      verifyOtp: async (input: VerifyOtpInput) => {
        const res = await request<VerifyOtpResponse>('/v1/auth/otp/verify', {
          method: 'POST',
          body: input,
          auth: false,
        });
        await options.tokenStore.setTokens(res.tokens);
        return res;
      },
      refresh: refreshTokens,
      logout: async () => {
        try {
          await request<void>('/v1/auth/logout', { method: 'POST' });
        } finally {
          await options.tokenStore.setTokens(null);
        }
      },
      listSessions: () => request<SessionSummary[]>('/v1/auth/sessions'),
      revokeSession: (sessionId: string) =>
        request<void>(`/v1/auth/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }),
      totpSetup: () => request<TotpSetupResponse>('/v1/auth/mfa/totp/setup', { method: 'POST' }),
      /** Marks the current session as two-factor verified; tokens are unchanged. */
      totpActivate: (code: string) =>
        request<MeResponse>('/v1/auth/mfa/totp/activate', { method: 'POST', body: { code } }),
      /** Marks the current session as two-factor verified; tokens are unchanged. */
      totpVerify: (code: string) =>
        request<MeResponse>('/v1/auth/mfa/totp/verify', { method: 'POST', body: { code } }),
    },
    me: {
      get: () => request<MeResponse>('/v1/me'),
      update: (input: UpdateMeInput) =>
        request<MeResponse>('/v1/me', { method: 'PATCH', body: input }),
    },
    admin: {
      listUsers: (query: Partial<ListUsersQuery> = {}) =>
        request<Paginated<AdminUserSummary>>('/v1/admin/users', { query }),
      listRoles: () => request<RoleSummary[]>('/v1/admin/roles'),
      assignRole: (userId: string, role: RoleKey) =>
        request<AdminUserSummary>(`/v1/admin/users/${encodeURIComponent(userId)}/roles`, {
          method: 'POST',
          body: { role },
        }),
      removeRole: (userId: string, role: RoleKey) =>
        request<AdminUserSummary>(
          `/v1/admin/users/${encodeURIComponent(userId)}/roles/${encodeURIComponent(role)}`,
          { method: 'DELETE' },
        ),
      suspendUser: (userId: string, reason: string) =>
        request<AdminUserSummary>(`/v1/admin/users/${encodeURIComponent(userId)}/suspend`, {
          method: 'POST',
          body: { reason },
        }),
      reactivateUser: (userId: string) =>
        request<AdminUserSummary>(`/v1/admin/users/${encodeURIComponent(userId)}/reactivate`, {
          method: 'POST',
        }),
      listAuditLogs: (query: Partial<ListAuditLogsQuery> = {}) =>
        request<Paginated<AuditLogEntry>>('/v1/admin/audit-logs', { query }),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
