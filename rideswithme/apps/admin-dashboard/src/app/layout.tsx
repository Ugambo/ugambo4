import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import type { ReactNode } from 'react';
import { cssVariables } from '@rideswithme/ui-components';
import type { Language } from '@rideswithme/shared-types';
import { OfflineBanner } from '@/components/states';
import { I18nProvider } from '@/lib/i18n';
import { LANGUAGE_COOKIE } from '@rideswithme/web-core';
import '@rideswithme/ui-components/web.css';

export const metadata: Metadata = {
  title: 'RideswithMe Admin',
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const lang: Language = (await cookies()).get(LANGUAGE_COOKIE)?.value === 'ha' ? 'ha' : 'en';
  return (
    <html lang={lang}>
      <head>
        <style nonce={nonce}>{cssVariables()}</style>
      </head>
      <body>
        <I18nProvider lang={lang}>
          <OfflineBanner />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
