import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { cache, type ReactNode } from 'react';
import { BrandProvider } from '@/lib/brand-provider';
import { cssVariables } from '@rideswithme/ui-components';
import type { Language } from '@rideswithme/shared-types';
import { OfflineBanner } from '@/components/states';
import { I18nProvider } from '@/lib/i18n';
import {
  brandLogoPath,
  browserErrorTrackingMeta,
  fetchBrandVersion,
  ERROR_TRACKING_META,
  LANGUAGE_COOKIE,
} from '@rideswithme/web-core';
import '@rideswithme/ui-components/web.css';

const BASE_METADATA: Metadata = {
  title: 'RideswithMe Admin',
  robots: { index: false, follow: false },
};

/** The logo set on the Settings page (asked once per request), or null for the built-in mark. */
const brandVersion = cache(() =>
  process.env.API_URL ? fetchBrandVersion(process.env.API_URL) : Promise.resolve(null),
);

export async function generateMetadata(): Promise<Metadata> {
  const v = await brandVersion();
  return { ...BASE_METADATA, ...(v && { icons: { icon: brandLogoPath(v) } }) };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const version = await brandVersion();
  const logo = version ? brandLogoPath(version) : null;
  const lang: Language = (await cookies()).get(LANGUAGE_COOKIE)?.value === 'ha' ? 'ha' : 'en';
  const tracking = browserErrorTrackingMeta('admin-dashboard');
  return (
    <html lang={lang}>
      <head>
        <style nonce={nonce}>{cssVariables()}</style>
        {tracking && <meta name={ERROR_TRACKING_META} content={tracking} />}
      </head>
      <body>
        <BrandProvider logoUrl={logo}>
          <I18nProvider lang={lang}>
            <OfflineBanner />
            {children}
          </I18nProvider>
        </BrandProvider>
      </body>
    </html>
  );
}
