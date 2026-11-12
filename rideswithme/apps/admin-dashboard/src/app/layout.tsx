import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import type { ReactNode } from 'react';
import { colors, radius, spacing, typography } from '@rideswithme/ui-components';
import type { Language } from '@rideswithme/shared-types';
import { OfflineBanner } from '@/components/states';
import { I18nProvider } from '@/lib/i18n';
import { LANGUAGE_COOKIE } from '@/lib/language';
import './globals.css';

export const metadata: Metadata = {
  title: 'RideswithMe Admin',
  robots: { index: false, follow: false },
};

/** Design tokens from @rideswithme/ui-components as CSS variables, so the web and mobile apps share one palette. */
function tokenCss(): string {
  const vars: Record<string, string | number> = {
    '--c-primary': colors.primary,
    '--c-primary-pressed': colors.primaryPressed,
    '--c-on-primary': colors.onPrimary,
    '--c-accent': colors.accent,
    '--c-on-accent': colors.onAccent,
    '--c-success': colors.success,
    '--c-danger': colors.danger,
    '--c-warning': colors.warning,
    '--c-bg': colors.background,
    '--c-surface': colors.surface,
    '--c-border': colors.border,
    '--c-text': colors.text,
    '--c-muted': colors.textMuted,
    '--c-disabled': colors.textDisabled,
    '--c-grey-100': colors.grey[100],
    '--r-sm': `${radius.sm}px`,
    '--r-md': `${radius.md}px`,
    '--r-lg': `${radius.lg}px`,
    '--s-1': `${spacing[1]}px`,
    '--s-2': `${spacing[2]}px`,
    '--s-3': `${spacing[3]}px`,
    '--s-4': `${spacing[4]}px`,
    '--s-6': `${spacing[6]}px`,
    '--s-8': `${spacing[8]}px`,
    '--fs-sm': `${typography.size.sm}px`,
    '--fs-md': `${typography.size.md}px`,
    '--fs-lg': `${typography.size.lg}px`,
    '--fs-xl': `${typography.size.xl}px`,
    '--fs-2xl': `${typography.size['2xl']}px`,
  };
  return `:root{${Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')}}`;
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const lang: Language = (await cookies()).get(LANGUAGE_COOKIE)?.value === 'ha' ? 'ha' : 'en';
  return (
    <html lang={lang}>
      <head>
        <style nonce={nonce}>{tokenCss()}</style>
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
