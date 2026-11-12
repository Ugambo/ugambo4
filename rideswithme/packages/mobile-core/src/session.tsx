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
    const value = useMemo(() => ({ status, signIn, signOut }), [status, signIn, signOut]);
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
  }

  function useSession(): Session {
    const v = useContext(Ctx);
    if (!v) throw new Error('useSession outside SessionProvider');
    return v;
  }

  return { api, SessionProvider, useSession };
}
