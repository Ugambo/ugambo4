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
import type { AuthTokens } from '@rideswithme/shared-types';
import { API_URL, POLICY_VERSION } from './config';
import { currentLanguage } from './i18n';

const ACCESS = 'rwm.accessToken';
const REFRESH = 'rwm.refreshToken';

/** Tokens in the device keychain/keystore, cached in memory for speed. */
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

export const api: ApiClient = createApiClient({
  baseUrl: API_URL,
  tokenStore,
  getLanguage: () => currentLanguage,
  onSessionExpired: () => onExpired(),
});

type Status = 'loading' | 'signedOut' | 'signedIn';

interface Session {
  status: Status;
  signIn: (phone: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');

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
      acceptedPolicyVersion: POLICY_VERSION,
      device: {
        name: Constants.deviceName ?? undefined,
        platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'unknown',
      },
    });
    // Opening the driver app and signing in starts (or resumes) the application.
    await api.driver.register();
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    await api.auth.logout().catch(() => undefined);
    setStatus('signedOut');
  }, []);

  const value = useMemo(() => ({ status, signIn, signOut }), [status, signIn, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}
