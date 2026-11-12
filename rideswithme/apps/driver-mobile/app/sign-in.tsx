import { Redirect } from 'expo-router';
import { SignInHero, SignInScreen } from '@rideswithme/mobile-core';
import { LanguageSwitch } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { api, useSession } from '@/lib/session';

export default function SignIn() {
  const { t, errorText } = useI18n();
  const { status, signIn } = useSession();
  if (status === 'signedIn') return <Redirect href="/" />;
  return (
    <SignInScreen
      api={api}
      signIn={signIn}
      t={t}
      errorText={errorText}
      hero={
        <SignInHero
          title={t('signIn.title')}
          subtitle={t('signIn.subtitle')}
          languageSwitch={<LanguageSwitch light />}
        />
      }
    />
  );
}
