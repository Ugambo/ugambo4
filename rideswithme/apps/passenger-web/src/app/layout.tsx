import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import { cache, type ReactNode } from 'react';
import { BrandProvider } from '@/lib/brand-provider';
import type { Language } from '@rideswithme/shared-types';
import { cssVariables } from '@rideswithme/ui-components';
import {
  brandLogoPath,
  browserErrorTrackingMeta,
  fetchBrandVersion,
  ERROR_TRACKING_META,
  LANGUAGE_COOKIE,
} from '@rideswithme/web-core';
import { I18nProvider, OfflineBanner } from '@/lib/i18n';
import { DEFAULT_TILES } from '@/lib/map-defaults';
import { MapTilesProvider } from '@/lib/map-tiles';
import '@rideswithme/ui-components/web.css';
import './passenger.css';

const BASE_METADATA: Metadata = {
  title: 'RideswithMe',
  description: 'Book cars, taxis and Keke Napep across Nigeria.',
};

/** The logo set on the Settings page (asked once per request), or null for the built-in mark. */
const brandVersion = cache(() =>
  process.env.API_URL ? fetchBrandVersion(process.env.API_URL) : Promise.resolve(null),
);

export async function generateMetadata(): Promise<Metadata> {
  const v = await brandVersion();
  return { ...BASE_METADATA, ...(v && { icons: { icon: brandLogoPath(v) } }) };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0F2A43' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const version = await brandVersion();
  const logo = version ? brandLogoPath(version) : null;
  const lang: Language = (await cookies()).get(LANGUAGE_COOKIE)?.value === 'ha' ? 'ha' : 'en';
  const tracking = browserErrorTrackingMeta('passenger-web');
  return (
    <html lang={lang}>
      <head>
        <style nonce={nonce}>{cssVariables()}</style>
        {tracking && <meta name={ERROR_TRACKING_META} content={tracking} />}
      </head>
      <body>
        <BrandProvider logoUrl={logo}>
          <I18nProvider lang={lang}>
            <MapTilesProvider
              tiles={{
                url: process.env.MAP_TILE_URL || DEFAULT_TILES.url,
                attribution: process.env.MAP_TILE_ATTRIBUTION || DEFAULT_TILES.attribution,
              }}
            >
              <OfflineBanner />
              {children}
            </MapTilesProvider>
          </I18nProvider>
        </BrandProvider>
      </body>
    </html>
  );
}
