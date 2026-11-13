import { Redirect, Stack } from 'expo-router';
import { colors } from '@rideswithme/ui-components';
import { Loading } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { TripDraftProvider } from '@/lib/trip-draft';

export default function MainLayout() {
  const { status } = useSession();
  const { t } = useI18n();
  if (status === 'loading') return <Loading />;
  if (status === 'signedOut') return <Redirect href="/sign-in" />;
  return (
    <TripDraftProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.onPrimary,
          headerTitleStyle: { fontWeight: '700' },
          headerBackTitle: t('common.back'),
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="search" options={{ title: t('home.whereTo') }} />
        <Stack.Screen name="rides/index" options={{ title: t('history.title') }} />
        <Stack.Screen name="rides/[id]" options={{ title: t('receipt.title') }} />
        <Stack.Screen name="account" options={{ title: t('account.title') }} />
        <Stack.Screen name="wallet" options={{ title: t('wallet.title') }} />
      </Stack>
    </TripDraftProvider>
  );
}
