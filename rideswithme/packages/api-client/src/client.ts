import type {
  AdminDeletionRequestView,
  AdminIncidentView,
  AdminSosAlertView,
  AdminTicketView,
  DeletionRequestView,
  IncidentView,
  NotificationView,
  PromotionView,
  PublicTripView,
  RatingSummary,
  RatingView,
  RideMessageView,
  SosAlertView,
  TicketStatus,
  TicketView,
  TripShareView,
  AdminBusBookingView,
  BusBookingView,
  BusCityPair,
  BusDepartureDetail,
  BusDepartureSummary,
  BusOperatorSummary,
  BusPayResult,
  BusRouteView,
  BusSeatLayoutView,
  CheckInResult,
  OperatorDepartureDetail,
  OperatorDepartureView,
  OperatorOverview,
  AdminRideDetail,
  DashboardView,
  DriverFleetView,
  FareRuleView,
  FleetDriverView,
  FleetOverview,
  FleetSummary,
  FleetTripView,
  LiveView,
  RefundView,
  ServiceAreaView,
  CheckoutView,
  DisputeView,
  DriverWalletView,
  PaymentView,
  PayoutView,
  SavedCardView,
  WalletEntryView,
  WalletView,
  DriverAvailabilityView,
  DriverOfferView,
  DriverPosition,
  DriverRideView,
  FareEstimateResponse,
  Place,
  PlaceSuggestion,
  RideView,
  SavedPlace,
  AdminDriverDetail,
  AdminDriverListItem,
  AdminUserSummary,
  DocumentUploadTicket,
  DocumentViewUrl,
  DriverDocumentView,
  DriverOnboardingView,
  VehicleCategorySummary,
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
  AdminTicketsQuery,
  CreateTicketInput,
  PromotionInput,
  PushTokenInput,
  RaiseSosInput,
  RateRideInput,
  ReportIncidentInput,
  UpdateIncidentInput,
  UpdatePromotionInput,
  AdminBusBookingsQuery,
  BusRouteInput,
  BusSearchQuery,
  BusSeatLayoutInput,
  CreateBusBookingInput,
  CreateBusDeparturesInput,
  CreateBusOperatorInput,
  OperatorDeparturesQuery,
  OperatorSettlementInput,
  PayBusBookingInput,
  UpdateBusDepartureInput,
  UpdateBusOperatorInput,
  UpdateBusRouteInput,
  AdminCancelRideInput,
  CreateFleetInput,
  FareRuleInput,
  FleetTripsQuery,
  ListAdminRidesQuery,
  RefundInput,
  ResolveDisputeInput,
  ServiceAreaInput,
  WalletAdjustmentInput,
  AddCardInput,
  PayoutRequestInput,
  RaiseDisputeInput,
  TopUpInput,
  AvailabilityInput,
  CreateRideInput,
  DriverCancelInput,
  FareEstimateInput,
  LocationUpdateInput,
  SavedPlaceInput,
  ApproveDocumentInput,
  ListAuditLogsQuery,
  ListDriversQuery,
  ListUsersQuery,
  CreateUserInput,
  AdminUpdateUserInput,
  PayoutAccountInput,
  RejectDocumentInput,
  RequestDocumentUploadInput,
  RequestOtpInput,
  SubmitDocumentInput,
  UpdateDriverProfileInput,
  UpdateMeInput,
  UpsertVehicleInput,
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
  /** Extra headers on every API request (e.g. the admin dashboard's anti-forgery header). */
  headers?: Record<string, string>;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
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
    const headers: Record<string, string> = { ...options.headers, Accept: 'application/json' };
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
      getUser: (userId: string) =>
        request<AdminUserSummary>(`/v1/admin/users/${encodeURIComponent(userId)}`),
      createUser: (input: CreateUserInput) =>
        request<AdminUserSummary>('/v1/admin/users', { method: 'POST', body: input }),
      updateUser: (userId: string, input: AdminUpdateUserInput) =>
        request<AdminUserSummary>(`/v1/admin/users/${encodeURIComponent(userId)}`, {
          method: 'PATCH',
          body: input,
        }),
      deleteUser: (userId: string, reason: string) =>
        request<AdminUserSummary>(`/v1/admin/users/${encodeURIComponent(userId)}/delete`, {
          method: 'POST',
          body: { reason },
        }),
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
      dashboard: () => request<DashboardView>('/v1/admin/dashboard'),
      live: () => request<LiveView>('/v1/admin/live'),
      rides: {
        list: (query: Partial<ListAdminRidesQuery> = {}) =>
          request<Paginated<RideView>>('/v1/admin/rides', { query: { ...query } }),
        get: (id: string) => request<AdminRideDetail>(`/v1/admin/rides/${encodeURIComponent(id)}`),
        cancel: (id: string, input: AdminCancelRideInput) =>
          request<RideView>(`/v1/admin/rides/${encodeURIComponent(id)}/cancel`, {
            method: 'POST',
            body: input,
          }),
      },
      pricing: {
        serviceAreas: () => request<ServiceAreaView[]>('/v1/admin/service-areas'),
        saveServiceArea: (input: ServiceAreaInput) =>
          request<ServiceAreaView[]>('/v1/admin/service-areas', { method: 'PUT', body: input }),
        fareRules: () => request<FareRuleView[]>('/v1/admin/fare-rules'),
        saveFareRule: (area: string, category: string, input: FareRuleInput) =>
          request<FareRuleView[]>(
            `/v1/admin/fare-rules/${encodeURIComponent(area)}/${encodeURIComponent(category)}`,
            { method: 'PUT', body: input },
          ),
      },
      payments: {
        list: (query: { payerId?: string; rideId?: string; status?: string } = {}) =>
          request<PaymentView[]>('/v1/admin/payments', { query: { ...query } }),
        refunds: (paymentId: string) =>
          request<RefundView[]>(`/v1/admin/payments/${encodeURIComponent(paymentId)}/refunds`),
        refund: (paymentId: string, input: RefundInput, idempotencyKey: string) =>
          request<RefundView>(`/v1/admin/payments/${encodeURIComponent(paymentId)}/refunds`, {
            method: 'POST',
            body: input,
            idempotencyKey,
          }),
        disputes: (status?: string) =>
          request<DisputeView[]>('/v1/admin/disputes', { query: { status } }),
        resolveDispute: (id: string, input: ResolveDisputeInput) =>
          request<DisputeView>(`/v1/admin/disputes/${encodeURIComponent(id)}/resolve`, {
            method: 'POST',
            body: input,
          }),
        payouts: (status?: string) =>
          request<PayoutView[]>('/v1/admin/payouts', { query: { status } }),
        retryPayout: (id: string) =>
          request<PayoutView>(`/v1/admin/payouts/${encodeURIComponent(id)}/retry`, {
            method: 'POST',
          }),
        userWallets: (userId: string) =>
          request<{
            passenger: { balanceKobo: number; owedKobo: number; recent: WalletEntryView[] };
            driver: { balanceKobo: number; recent: WalletEntryView[] };
          }>(`/v1/admin/users/${encodeURIComponent(userId)}/wallets`),
        adjustWallet: (userId: string, input: WalletAdjustmentInput, idempotencyKey: string) =>
          request<{ balanceKobo: number }>(
            `/v1/admin/users/${encodeURIComponent(userId)}/wallet-adjustments`,
            { method: 'POST', body: input, idempotencyKey },
          ),
        ledger: () =>
          request<{ accounts: Record<string, number>; mismatchedWallets: number }>(
            '/v1/admin/ledger',
          ),
      },
      fleets: {
        list: () => request<FleetSummary[]>('/v1/admin/fleets'),
        create: (input: CreateFleetInput) =>
          request<FleetSummary>('/v1/admin/fleets', { method: 'POST', body: input }),
        get: (id: string) => request<FleetSummary>(`/v1/admin/fleets/${encodeURIComponent(id)}`),
        drivers: (id: string) =>
          request<FleetDriverView[]>(`/v1/admin/fleets/${encodeURIComponent(id)}/drivers`),
        addManager: (id: string, phone: string) =>
          request<FleetSummary>(`/v1/admin/fleets/${encodeURIComponent(id)}/managers`, {
            method: 'POST',
            body: { phone },
          }),
        setStatus: (id: string, status: 'active' | 'suspended') =>
          request<FleetSummary>(
            `/v1/admin/fleets/${encodeURIComponent(id)}/${status === 'active' ? 'reactivate' : 'suspend'}`,
            { method: 'POST' },
          ),
      },
      safety: {
        sos: (status?: 'open' | 'resolved') =>
          request<AdminSosAlertView[]>('/v1/admin/sos', { query: { status } }),
        sosAlert: (id: string) =>
          request<AdminSosAlertView>(`/v1/admin/sos/${encodeURIComponent(id)}`),
        acknowledge: (id: string) =>
          request<AdminSosAlertView>(`/v1/admin/sos/${encodeURIComponent(id)}/acknowledge`, {
            method: 'POST',
          }),
        resolve: (id: string, note: string) =>
          request<AdminSosAlertView>(`/v1/admin/sos/${encodeURIComponent(id)}/resolve`, {
            method: 'POST',
            body: { note },
          }),
        incidents: (status?: 'open' | 'resolved') =>
          request<AdminIncidentView[]>('/v1/admin/incidents', { query: { status } }),
        incident: (id: string) =>
          request<AdminIncidentView>(`/v1/admin/incidents/${encodeURIComponent(id)}`),
        updateIncident: (id: string, input: UpdateIncidentInput) =>
          request<AdminIncidentView>(`/v1/admin/incidents/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: input,
          }),
        rideMessages: (rideId: string) =>
          request<RideMessageView[]>(`/v1/admin/rides/${encodeURIComponent(rideId)}/messages`),
      },
      support: {
        tickets: (query: Partial<AdminTicketsQuery> = {}) =>
          request<AdminTicketView[]>('/v1/admin/support/tickets', { query: { ...query } }),
        ticket: (id: string) =>
          request<AdminTicketView>(`/v1/admin/support/tickets/${encodeURIComponent(id)}`),
        reply: (id: string, body: string) =>
          request<AdminTicketView>(`/v1/admin/support/tickets/${encodeURIComponent(id)}/messages`, {
            method: 'POST',
            body: { body },
          }),
        setStatus: (id: string, status: TicketStatus) =>
          request<AdminTicketView>(`/v1/admin/support/tickets/${encodeURIComponent(id)}/status`, {
            method: 'POST',
            body: { status },
          }),
      },
      promotions: {
        list: () => request<PromotionView[]>('/v1/admin/promotions'),
        create: (input: PromotionInput) =>
          request<PromotionView>('/v1/admin/promotions', { method: 'POST', body: input }),
        update: (id: string, input: UpdatePromotionInput) =>
          request<PromotionView>(`/v1/admin/promotions/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: input,
          }),
      },
      userRatings: (userId: string) =>
        request<{ asDriver: RatingSummary; asPassenger: RatingSummary }>(
          `/v1/admin/users/${encodeURIComponent(userId)}/ratings`,
        ),
      deletionRequests: () => request<AdminDeletionRequestView[]>('/v1/admin/deletion-requests'),
      buses: {
        operators: () => request<BusOperatorSummary[]>('/v1/admin/bus-operators'),
        createOperator: (input: CreateBusOperatorInput) =>
          request<BusOperatorSummary>('/v1/admin/bus-operators', { method: 'POST', body: input }),
        operator: (id: string) =>
          request<BusOperatorSummary>(`/v1/admin/bus-operators/${encodeURIComponent(id)}`),
        updateOperator: (id: string, input: UpdateBusOperatorInput) =>
          request<BusOperatorSummary>(`/v1/admin/bus-operators/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: input,
          }),
        addManager: (id: string, phone: string) =>
          request<BusOperatorSummary>(
            `/v1/admin/bus-operators/${encodeURIComponent(id)}/managers`,
            { method: 'POST', body: { phone } },
          ),
        setStatus: (id: string, status: 'active' | 'suspended') =>
          request<BusOperatorSummary>(
            `/v1/admin/bus-operators/${encodeURIComponent(id)}/${status === 'active' ? 'reactivate' : 'suspend'}`,
            { method: 'POST' },
          ),
        settle: (id: string, input: OperatorSettlementInput) =>
          request<BusOperatorSummary>(
            `/v1/admin/bus-operators/${encodeURIComponent(id)}/settlements`,
            { method: 'POST', body: input },
          ),
        statement: (id: string) =>
          request<WalletEntryView[]>(`/v1/admin/bus-operators/${encodeURIComponent(id)}/statement`),
        routes: (id: string) =>
          request<BusRouteView[]>(`/v1/admin/bus-operators/${encodeURIComponent(id)}/routes`),
        departures: (id: string, query: Partial<OperatorDeparturesQuery> = {}) =>
          request<OperatorDepartureView[]>(
            `/v1/admin/bus-operators/${encodeURIComponent(id)}/departures`,
            { query: { ...query } },
          ),
        departure: (id: string) =>
          request<OperatorDepartureDetail>(`/v1/admin/bus-departures/${encodeURIComponent(id)}`),
        cancelDeparture: (id: string, reason: string) =>
          request<OperatorDepartureDetail>(
            `/v1/admin/bus-departures/${encodeURIComponent(id)}/cancel`,
            { method: 'POST', body: { reason } },
          ),
        bookings: (query: Partial<AdminBusBookingsQuery>) =>
          request<AdminBusBookingView[]>('/v1/admin/bus-bookings', { query: { ...query } }),
        booking: (id: string) =>
          request<AdminBusBookingView>(`/v1/admin/bus-bookings/${encodeURIComponent(id)}`),
        cancelBooking: (id: string, reason: string) =>
          request<AdminBusBookingView>(`/v1/admin/bus-bookings/${encodeURIComponent(id)}/cancel`, {
            method: 'POST',
            body: { reason },
          }),
      },
      drivers: {
        list: (query: Partial<ListDriversQuery> = {}) =>
          request<Paginated<AdminDriverListItem>>('/v1/admin/drivers', { query }),
        detail: (driverId: string) =>
          request<AdminDriverDetail>(`/v1/admin/drivers/${encodeURIComponent(driverId)}`),
        documentUrl: (driverId: string, documentId: string) =>
          request<DocumentViewUrl>(
            `/v1/admin/drivers/${encodeURIComponent(driverId)}/documents/${encodeURIComponent(documentId)}/view-url`,
            { method: 'POST' },
          ),
        approveDocument: (driverId: string, documentId: string, input: ApproveDocumentInput = {}) =>
          request<DriverDocumentView>(
            `/v1/admin/drivers/${encodeURIComponent(driverId)}/documents/${encodeURIComponent(documentId)}/approve`,
            { method: 'POST', body: input },
          ),
        rejectDocument: (driverId: string, documentId: string, input: RejectDocumentInput) =>
          request<DriverDocumentView>(
            `/v1/admin/drivers/${encodeURIComponent(driverId)}/documents/${encodeURIComponent(documentId)}/reject`,
            { method: 'POST', body: input },
          ),
        approve: (driverId: string) =>
          request<AdminDriverDetail>(`/v1/admin/drivers/${encodeURIComponent(driverId)}/approve`, {
            method: 'POST',
          }),
        reject: (driverId: string, reason: string) =>
          request<AdminDriverDetail>(`/v1/admin/drivers/${encodeURIComponent(driverId)}/reject`, {
            method: 'POST',
            body: { reason },
          }),
      },
    },
    fares: {
      estimate: (input: FareEstimateInput) =>
        request<FareEstimateResponse>('/v1/fares/estimate', { method: 'POST', body: input }),
    },
    rides: {
      /** Reuse the same idempotencyKey when retrying the same booking, so it is never booked twice. */
      book: (input: CreateRideInput, idempotencyKey: string) =>
        request<RideView>('/v1/rides', { method: 'POST', body: input, idempotencyKey }),
      active: () => request<RideView[]>('/v1/rides/active'),
      history: (cursor?: string) =>
        request<Paginated<RideView>>('/v1/rides', { query: { cursor } }),
      get: (id: string) => request<RideView>(`/v1/rides/${encodeURIComponent(id)}`),
      cancel: (id: string, reason?: string) =>
        request<RideView>(`/v1/rides/${encodeURIComponent(id)}/cancel`, {
          method: 'POST',
          body: reason ? { reason } : {},
        }),
      driverPhoto: (id: string) =>
        request<DocumentViewUrl>(`/v1/rides/${encodeURIComponent(id)}/driver-photo`),
      /** Reports a problem with what was paid for a ride (once per ride). */
      dispute: (id: string, input: RaiseDisputeInput) =>
        request<DisputeView>(`/v1/rides/${encodeURIComponent(id)}/dispute`, {
          method: 'POST',
          body: input,
        }),
      getDispute: (id: string) =>
        request<DisputeView>(`/v1/rides/${encodeURIComponent(id)}/dispute`),
    },
    fleet: {
      overview: () => request<FleetOverview>('/v1/fleet'),
      drivers: () => request<FleetDriverView[]>('/v1/fleet/drivers'),
      driver: (id: string) =>
        request<FleetDriverView>(`/v1/fleet/drivers/${encodeURIComponent(id)}`),
      invite: (phone: string) =>
        request<FleetDriverView>('/v1/fleet/drivers', { method: 'POST', body: { phone } }),
      remove: (id: string) =>
        request<void>(`/v1/fleet/drivers/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      vehicles: () =>
        request<
          {
            driver: { userId: string; name: string | null };
            category: string;
            make: string;
            model: string;
            colour: string;
            year: number;
            plateNumber: string;
          }[]
        >('/v1/fleet/vehicles'),
      trips: (query: Partial<FleetTripsQuery> = {}) =>
        request<Paginated<FleetTripView>>('/v1/fleet/trips', { query: { ...query } }),
    },
    safety: {
      sos: (input: RaiseSosInput = {}) =>
        request<SosAlertView>('/v1/sos', { method: 'POST', body: input }),
      currentSos: () => request<SosAlertView | null>('/v1/sos/current'),
      share: (rideId: string) =>
        request<TripShareView>(`/v1/rides/${encodeURIComponent(rideId)}/share`, { method: 'POST' }),
      stopSharing: (rideId: string) =>
        request<void>(`/v1/rides/${encodeURIComponent(rideId)}/share`, { method: 'DELETE' }),
      messages: (rideId: string) =>
        request<RideMessageView[]>(`/v1/rides/${encodeURIComponent(rideId)}/messages`),
      sendMessage: (rideId: string, body: string) =>
        request<RideMessageView>(`/v1/rides/${encodeURIComponent(rideId)}/messages`, {
          method: 'POST',
          body: { body },
        }),
      report: (input: ReportIncidentInput) =>
        request<IncidentView>('/v1/incidents', { method: 'POST', body: input }),
      reports: () => request<IncidentView[]>('/v1/incidents'),
    },
    /** Anyone with a share link (no account needed). */
    sharedTrip: (token: string) =>
      request<PublicTripView>(`/v1/share/${encodeURIComponent(token)}`),
    ratings: {
      rate: (rideId: string, input: RateRideInput) =>
        request<RatingView>(`/v1/rides/${encodeURIComponent(rideId)}/rating`, {
          method: 'POST',
          body: input,
        }),
      mineAsDriver: () => request<RatingSummary>('/v1/driver/ratings'),
    },
    support: {
      create: (input: CreateTicketInput) =>
        request<TicketView>('/v1/support/tickets', { method: 'POST', body: input }),
      list: () => request<TicketView[]>('/v1/support/tickets'),
      get: (id: string) => request<TicketView>(`/v1/support/tickets/${encodeURIComponent(id)}`),
      reply: (id: string, body: string) =>
        request<TicketView>(`/v1/support/tickets/${encodeURIComponent(id)}/messages`, {
          method: 'POST',
          body: { body },
        }),
    },
    notifications: {
      list: () => request<{ items: NotificationView[]; unread: number }>('/v1/me/notifications'),
      markRead: (ids: string[] | 'all') =>
        request<void>('/v1/me/notifications/read', {
          method: 'POST',
          body: ids === 'all' ? { all: true } : { ids },
        }),
      registerPushToken: (input: PushTokenInput) =>
        request<void>('/v1/me/push-token', { method: 'PUT', body: input }),
      forgetPushToken: (token: string) =>
        request<void>('/v1/me/push-token', { method: 'DELETE', body: { token } }),
    },
    privacy: {
      deletionRequest: () => request<DeletionRequestView | null>('/v1/me/deletion-request'),
      requestDeletion: (reason?: string) =>
        request<DeletionRequestView>('/v1/me/deletion-request', {
          method: 'POST',
          body: reason ? { reason } : {},
        }),
      cancelDeletion: () => request<void>('/v1/me/deletion-request', { method: 'DELETE' }),
    },
    bus: {
      cities: () => request<BusCityPair[]>('/v1/bus/cities'),
      search: (query: BusSearchQuery) =>
        request<BusDepartureSummary[]>('/v1/bus/search', { query: { ...query } }),
      departure: (id: string) =>
        request<BusDepartureDetail>(`/v1/bus/departures/${encodeURIComponent(id)}`),
      /** Holds seats while you pay. Reuse the idempotencyKey when retrying the same choice. */
      hold: (input: CreateBusBookingInput, idempotencyKey: string) =>
        request<BusBookingView>('/v1/bus/bookings', {
          method: 'POST',
          body: input,
          idempotencyKey,
        }),
      bookings: () => request<BusBookingView[]>('/v1/bus/bookings'),
      booking: (id: string) =>
        request<BusBookingView>(`/v1/bus/bookings/${encodeURIComponent(id)}`),
      pay: (id: string, input: PayBusBookingInput, idempotencyKey: string) =>
        request<BusPayResult>(`/v1/bus/bookings/${encodeURIComponent(id)}/pay`, {
          method: 'POST',
          body: input,
          idempotencyKey,
        }),
      cancel: (id: string) =>
        request<BusBookingView>(`/v1/bus/bookings/${encodeURIComponent(id)}/cancel`, {
          method: 'POST',
        }),
    },
    operator: {
      overview: () => request<OperatorOverview>('/v1/operator'),
      routes: () => request<BusRouteView[]>('/v1/operator/routes'),
      createRoute: (input: BusRouteInput) =>
        request<BusRouteView>('/v1/operator/routes', { method: 'POST', body: input }),
      updateRoute: (id: string, input: UpdateBusRouteInput) =>
        request<BusRouteView>(`/v1/operator/routes/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: input,
        }),
      layouts: () => request<BusSeatLayoutView[]>('/v1/operator/layouts'),
      createLayout: (input: BusSeatLayoutInput) =>
        request<BusSeatLayoutView>('/v1/operator/layouts', { method: 'POST', body: input }),
      departures: (query: Partial<OperatorDeparturesQuery> = {}) =>
        request<OperatorDepartureView[]>('/v1/operator/departures', { query: { ...query } }),
      createDepartures: (input: CreateBusDeparturesInput) =>
        request<OperatorDepartureView[]>('/v1/operator/departures', {
          method: 'POST',
          body: input,
        }),
      departure: (id: string) =>
        request<OperatorDepartureDetail>(`/v1/operator/departures/${encodeURIComponent(id)}`),
      updateDeparture: (id: string, input: UpdateBusDepartureInput) =>
        request<OperatorDepartureDetail>(`/v1/operator/departures/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: input,
        }),
      cancelDeparture: (id: string, reason: string) =>
        request<OperatorDepartureDetail>(
          `/v1/operator/departures/${encodeURIComponent(id)}/cancel`,
          { method: 'POST', body: { reason } },
        ),
      checkIn: (code: string) =>
        request<CheckInResult>('/v1/operator/check-in', { method: 'POST', body: { code } }),
      statement: () => request<WalletEntryView[]>('/v1/operator/statement'),
    },
    driverFleet: {
      get: () => request<DriverFleetView>('/v1/driver/fleet'),
      accept: (invitationId: string) =>
        request<DriverFleetView>(
          `/v1/driver/fleet-invitations/${encodeURIComponent(invitationId)}/accept`,
          { method: 'POST' },
        ),
      decline: (invitationId: string) =>
        request<DriverFleetView>(
          `/v1/driver/fleet-invitations/${encodeURIComponent(invitationId)}/decline`,
          { method: 'POST' },
        ),
      leave: () => request<DriverFleetView>('/v1/driver/fleet/leave', { method: 'POST' }),
    },
    wallet: {
      get: () => request<WalletView>('/v1/wallet'),
      transactions: (cursor?: string) =>
        request<Paginated<WalletEntryView>>('/v1/wallet/transactions', { query: { cursor } }),
      /** Open checkoutUrl, then check the payment with payments.get(id, true). */
      topUp: (input: TopUpInput, idempotencyKey: string) =>
        request<CheckoutView>('/v1/wallet/topups', { method: 'POST', body: input, idempotencyKey }),
    },
    payments: {
      /** With refresh, a pending payment is checked with the payment provider first. */
      get: (id: string, refresh = false) =>
        request<PaymentView>(`/v1/payments/${encodeURIComponent(id)}`, {
          query: { refresh: refresh ? '1' : undefined },
        }),
      cards: () => request<SavedCardView[]>('/v1/payment-cards'),
      addCard: (input: AddCardInput, idempotencyKey: string) =>
        request<CheckoutView>('/v1/payment-cards', { method: 'POST', body: input, idempotencyKey }),
      removeCard: (id: string) =>
        request<void>(`/v1/payment-cards/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    },
    driverWallet: {
      get: () => request<DriverWalletView>('/v1/driver/wallet'),
      transactions: (cursor?: string) =>
        request<Paginated<WalletEntryView>>('/v1/driver/wallet/transactions', {
          query: { cursor },
        }),
      topUp: (input: TopUpInput, idempotencyKey: string) =>
        request<CheckoutView>('/v1/driver/wallet/topups', {
          method: 'POST',
          body: input,
          idempotencyKey,
        }),
      payouts: () => request<PayoutView[]>('/v1/driver/payouts'),
      requestPayout: (input: PayoutRequestInput, idempotencyKey: string) =>
        request<PayoutView>('/v1/driver/payouts', { method: 'POST', body: input, idempotencyKey }),
    },
    places: {
      autocomplete: (q: string, near?: { lat: number; lng: number }, sessionToken?: string) =>
        request<PlaceSuggestion[]>('/v1/places/autocomplete', {
          query: { q, lat: near?.lat, lng: near?.lng, sessionToken },
        }),
      details: (placeId: string, sessionToken?: string) =>
        request<Place>(`/v1/places/details/${encodeURIComponent(placeId)}`, {
          query: { sessionToken },
        }),
      reverse: (at: { lat: number; lng: number }) =>
        request<Place>('/v1/places/reverse', { query: { lat: at.lat, lng: at.lng } }),
      saved: () => request<SavedPlace[]>('/v1/me/saved-places'),
      save: (input: SavedPlaceInput) =>
        request<SavedPlace>('/v1/me/saved-places', { method: 'POST', body: input }),
      removeSaved: (id: string) =>
        request<void>(`/v1/me/saved-places/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    },
    trips: {
      availability: () => request<DriverAvailabilityView>('/v1/driver/availability'),
      setAvailability: (input: AvailabilityInput) =>
        request<DriverAvailabilityView>('/v1/driver/availability', { method: 'POST', body: input }),
      sendLocation: (input: LocationUpdateInput) =>
        request<{ position: DriverPosition | null }>('/v1/driver/location', {
          method: 'POST',
          body: input,
        }),
      currentOffer: () => request<{ offer: DriverOfferView | null }>('/v1/driver/offers/current'),
      accept: (offerId: string) =>
        request<DriverRideView>(`/v1/driver/offers/${encodeURIComponent(offerId)}/accept`, {
          method: 'POST',
        }),
      reject: (offerId: string) =>
        request<void>(`/v1/driver/offers/${encodeURIComponent(offerId)}/reject`, {
          method: 'POST',
        }),
      active: () => request<{ ride: DriverRideView | null }>('/v1/driver/rides/active'),
      history: (cursor?: string) =>
        request<Paginated<DriverRideView>>('/v1/driver/rides', { query: { cursor } }),
      arrived: (rideId: string) =>
        request<DriverRideView>(`/v1/driver/rides/${encodeURIComponent(rideId)}/arrived`, {
          method: 'POST',
        }),
      start: (rideId: string) =>
        request<DriverRideView>(`/v1/driver/rides/${encodeURIComponent(rideId)}/start`, {
          method: 'POST',
        }),
      complete: (rideId: string, cashCollectedKobo: number) =>
        request<DriverRideView>(`/v1/driver/rides/${encodeURIComponent(rideId)}/complete`, {
          method: 'POST',
          body: { cashCollectedKobo },
        }),
      cancel: (rideId: string, input: DriverCancelInput) =>
        request<DriverRideView>(`/v1/driver/rides/${encodeURIComponent(rideId)}/cancel`, {
          method: 'POST',
          body: input,
        }),
    },
    vehicleCategories: () =>
      request<VehicleCategorySummary[]>('/v1/vehicle-categories', { auth: false }),
    driver: {
      register: () => request<DriverOnboardingView>('/v1/driver/registration', { method: 'POST' }),
      onboarding: () => request<DriverOnboardingView>('/v1/driver/onboarding'),
      updateProfile: (input: UpdateDriverProfileInput) =>
        request<DriverOnboardingView>('/v1/driver/profile', { method: 'PATCH', body: input }),
      upsertVehicle: (input: UpsertVehicleInput) =>
        request<DriverOnboardingView>('/v1/driver/vehicle', { method: 'PUT', body: input }),
      setPayoutAccount: (input: PayoutAccountInput) =>
        request<DriverOnboardingView>('/v1/driver/payout-account', { method: 'PUT', body: input }),
      requestUpload: (input: RequestDocumentUploadInput) =>
        request<DocumentUploadTicket>('/v1/driver/documents/uploads', {
          method: 'POST',
          body: input,
        }),
      /**
       * PUTs the file to the signed storage URL. No API token is sent: the URL
       * itself is the permission. `body` is a Blob in browsers and React Native.
       */
      uploadToStorage: async (
        ticket: DocumentUploadTicket,
        body: Blob | ArrayBuffer | Uint8Array,
      ) => {
        let res: Response;
        try {
          res = await fetchImpl(ticket.uploadUrl, {
            method: ticket.method,
            headers: ticket.headers,
            body: body as NonNullable<RequestInit['body']>,
          });
        } catch (err) {
          throw new ApiError(
            0,
            'NETWORK_ERROR',
            err instanceof Error ? err.message : 'Upload failed',
          );
        }
        if (!res.ok)
          throw new ApiError(
            res.status,
            'UPLOAD_INVALID',
            `Storage rejected the upload (HTTP ${res.status})`,
          );
      },
      submitDocument: (input: SubmitDocumentInput) =>
        request<DriverDocumentView>('/v1/driver/documents', { method: 'POST', body: input }),
      submitForReview: () => request<DriverOnboardingView>('/v1/driver/submit', { method: 'POST' }),
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

/**
 * A random key for Idempotency-Key headers. Not a security token: it only has
 * to be unique per user action. Works without crypto APIs (Hermes on older phones).
 */
export function newIdempotencyKey(): string {
  const random = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${random()}-${random()}`;
}
