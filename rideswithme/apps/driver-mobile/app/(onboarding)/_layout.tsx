import { Redirect, Stack } from 'expo-router';
import { colors } from '@rideswithme/ui-components';
import { Loading } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { OnboardingProvider } from '@/lib/onboarding-context';
import { useSession } from '@/lib/session';

export default function OnboardingLayout() {
  const { status } = useSession();
  const { t } = useI18n();
  if (status === 'loading') return <Loading />;
  if (status === 'signedOut') return <Redirect href="/sign-in" />;
  return (
    <OnboardingProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.onPrimary,
          headerTitleStyle: { fontWeight: '700' },
          headerBackTitle: t('common.back'),
        }}
      >
        <Stack.Screen name="index" options={{ title: t('home.title') }} />
        <Stack.Screen name="profile" options={{ title: t('profile.title') }} />
        <Stack.Screen name="vehicle" options={{ title: t('vehicle.title') }} />
        <Stack.Screen name="payout" options={{ title: t('payout.title') }} />
        <Stack.Screen name="document/[type]" options={{ title: '' }} />
        <Stack.Screen name="drive" options={{ title: t('drive.title') }} />
        <Stack.Screen name="earnings" options={{ title: t('earnings.title') }} />
      </Stack>
    </OnboardingProvider>
  );
}
