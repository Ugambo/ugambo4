import { createMobileSession } from '@rideswithme/mobile-core';
import { API_URL, POLICY_VERSION } from './config';
import { currentLanguage } from './i18n';

export const { api, SessionProvider, useSession, useRealtimeEvent, useOnReconnect } =
  createMobileSession({
    apiUrl: API_URL,
    policyVersion: POLICY_VERSION,
    getLanguage: currentLanguage,
  });
