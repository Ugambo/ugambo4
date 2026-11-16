import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider } from '@/lib/i18n';
import { SessionProvider } from '@/lib/session';
import { startErrorTracking } from '@rideswithme/mobile-core';
import { SENTRY_DSN, SENTRY_ENVIRONMENT } from '@/lib/config';

startErrorTracking({ dsn: SENTRY_DSN, environment: SENTRY_ENVIRONMENT, app: 'passenger' });

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <SessionProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
        </SessionProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
