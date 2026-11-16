'use client';

import { useRouter } from 'next/navigation';
import { StaffSignIn } from '@rideswithme/web-core/client';
import { InlineError, Loading } from '@/components/states';
import { useI18n } from '@/lib/i18n';

/** The shared staff sign-in, sending staff to the first screen they may use. */
export function LoginFlow({ resumeMfa }: { resumeMfa: boolean }) {
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  return (
    <StaffSignIn
      t={t}
      lang={lang}
      setLang={setLang}
      appName={t('app.name')}
      resumeMfa={resumeMfa}
      navigate={(path) => router.replace(path)}
      destination={(user) =>
        user.permissions.includes('rides.read')
          ? '/overview'
          : user.permissions.includes('drivers.read')
            ? '/drivers'
            : null
      }
      Loading={Loading}
      InlineError={InlineError}
    />
  );
}
