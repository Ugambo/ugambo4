'use client';

import { useRouter } from 'next/navigation';
import { StaffSignIn } from '@rideswithme/web-core/client';
import { InlineError, Loading, useI18n } from '@/lib/i18n';

/** The shared staff sign-in; only fleet managers get past it. */
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
      destination={(user) => (user.permissions.includes('fleet.portal') ? '/overview' : null)}
      Loading={Loading}
      InlineError={InlineError}
    />
  );
}
