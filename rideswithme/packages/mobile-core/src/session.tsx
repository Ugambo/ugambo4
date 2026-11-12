import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { type ApiClient, createApiClient, type TokenStore } from '@rideswithme/api-client';
import type { AuthTokens, Language } from '@rideswithme/shared-types';
import { createRealtime } from './realtime';

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

export interface Session {
  status: SessionStatus;
  signIn: (phone: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
}

/**
 * The app's API client and session. Tokens live in the phone's secure keystore
 * (Keychain / Android Keystore via expo-secure-store), cached in memory.
 */
export function createMobileSession(options: {
  apiUrl: string;
  policyVersion: string;
  getLanguage: () => Language;
  /** Runs after a successful sign-in (e.g. the driver app starts the application). */
  afterSignIn?: (api: ApiClient) => Promise<unknown>;
}) {
  const ACCESS = 'rwm.accessToken';
  const REFRESH = 'rwm.refreshToken';
  const cache: { access: string | null; refresh: string | null } = { access: null, refresh: null };
  const tokenStore: TokenStore = {
    getAccessToken: async () => (cache.access ??= await SecureStore.getItemAsync(ACCESS)),
    getRefreshToken: async () => (cache.refresh ??= await SecureStore.getItemAsync(REFRESH)),
    setTokens: async (tokens: AuthTokens | null) => {
      cache.access = tokens?.accessToken ?? null;
      cache.refresh = tokens?.refreshToken ?? null;
      if (tokens) {
        await SecureStore.setItemAsync(ACCESS, tokens.accessToken);
        await SecureStore.setItemAsync(REFRESH, tokens.refreshToken);
      } else {
        await SecureStore.deleteItemAsync(ACCESS);
        await SecureStore.deleteItemAsync(REFRESH);
      }
    },
  };

  let onExpired: () => void = () => undefined;
  const api = createApiClient({
    baseUrl: options.apiUrl,
    tokenStore,
    getLanguage: options.getLanguage,
    onSessionExpired: () => onExpired(),
  });

  const realtime = createRealtime({
    url: options.apiUrl,
    getToken: async () => tokenStore.getAccessToken(),
    refresh: () => api.auth.refresh().catch(() => false),
    onSessionEnded: () => {
      void Promise.resolve(tokenStore.setTokens(null)).then(() => onExpired());
    },
  });

  const Ctx = createContext<Session | null>(null);

  function SessionProvider({ children }: { children: ReactNode }) {
    const [status, setStatus] = useState<SessionStatus>('loading');
    useEffect(() => {
      onExpired = () => setStatus('signedOut');
      void Promise.resolve(tokenStore.getRefreshToken()).then((t) =>
        setStatus(t ? 'signedIn' : 'signedOut'),
      );
    }, []);
    const signIn = useCallback(async (phone: string, code: string) => {
      await api.auth.verifyOtp({
        phone,
        code,
        acceptedPolicyVersion: options.policyVersion,
        device: {
          name: Constants.deviceName ?? undefined,
          platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'unknown',
        },
      });
      if (options.afterSignIn) await options.afterSignIn(api);
      setStatus('signedIn');
    }, []);
    const signOut = useCallback(async () => {
      await api.auth.logout().catch(() => undefined);
      setStatus('signedOut');
    }, []);
    // Live updates run while signed in.
    useEffect(() => {
      if (status === 'signedIn') realtime.start();
      else realtime.stop();
    }, [status]);
    const value = useMemo(() => ({ status, signIn, signOut }), [status, signIn, signOut]);
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
  }

  function useSession(): Session {
    const v = useContext(Ctx);
    if (!v) throw new Error('useSession outside SessionProvider');
    return v;
  }

  /** Calls the handler for each realtime event of this name while the component is mounted. */
  function useRealtimeEvent<T>(event: string, handler: (payload: T) => void) {
    useEffect(() => realtime.on<T>(event, handler), [event, handler]);
  }

  /** Runs after the realtime connection comes back (refetch anything that may have changed). */
  function useOnReconnect(handler: () => void) {
    useEffect(() => realtime.onReconnect(handler), [handler]);
  }

  function useRealtimeConnected(): boolean {
    const [connected, setConnected] = useState(realtime.isConnected());
    useEffect(() => realtime.onStatus(setConnected), []);
    return connected;
  }

  return {
    api,
    SessionProvider,
    useSession,
    realtime,
    useRealtimeEvent,
    useOnReconnect,
    useRealtimeConnected,
  };
}
