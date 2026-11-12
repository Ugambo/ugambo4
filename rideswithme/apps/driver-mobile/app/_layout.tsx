import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@rideswithme/ui-components';
import { I18nProvider } from '@/lib/i18n';
import { SessionProvider } from '@/lib/session';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <SessionProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.primary },
              headerTintColor: colors.onPrimary,
              headerTitleStyle: { fontWeight: '700' },
              contentStyle: { backgroundColor: colors.surface },
            }}
          >
            <Stack.Screen name="sign-in" options={{ headerShown: false }} />
            <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
          </Stack>
        </SessionProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
