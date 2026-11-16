import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import type { ReactNode } from 'react';
import type { Language } from '@rideswithme/shared-types';
import { cssVariables } from '@rideswithme/ui-components';
import {
  browserErrorTrackingMeta,
  ERROR_TRACKING_META,
  LANGUAGE_COOKIE,
} from '@rideswithme/web-core';
import { I18nProvider, OfflineBanner } from '@/lib/i18n';
import '@rideswithme/ui-components/web.css';
import './passenger.css';

export const metadata: Metadata = {
  title: 'RideswithMe',
  description: 'Book cars, taxis and Keke Napep across Nigeria.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0F2A43' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const lang: Language = (await cookies()).get(LANGUAGE_COOKIE)?.value === 'ha' ? 'ha' : 'en';
  const tracking = browserErrorTrackingMeta('passenger-web');
  return (
    <html lang={lang}>
      <head>
        <style nonce={nonce}>{cssVariables()}</style>
        {tracking && <meta name={ERROR_TRACKING_META} content={tracking} />}
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
