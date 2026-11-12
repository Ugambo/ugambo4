import { createMobileSession } from '@rideswithme/mobile-core';
import { API_URL, POLICY_VERSION } from './config';
import { currentLanguage } from './i18n';

export const {
  api,
  SessionProvider,
  useSession,
  realtime,
  useRealtimeEvent,
  useOnReconnect,
  useRealtimeConnected,
} = createMobileSession({
  apiUrl: API_URL,
  policyVersion: POLICY_VERSION,
  getLanguage: currentLanguage,
  // Signing in to the driver app starts (or resumes) the driver application.
  afterSignIn: (api) => api.driver.register(),
});
