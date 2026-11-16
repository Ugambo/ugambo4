'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { useResource } from '@rideswithme/web-core/client';
import { api, auth, isSignedOut } from '@/lib/api';
import { ErrorState, Loading, useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';

const NAV: { href: string; label: MessageKey }[] = [
  { href: '/overview', label: 'nav.overview' },
  { href: '/drivers', label: 'nav.drivers' },
  { href: '/vehicles', label: 'nav.vehicles' },
  { href: '/trips', label: 'nav.trips' },
];

/** Sidebar with the fleet's name. Sends people to sign-in, or to two-factor, when needed. */
export function Shell({ children }: { children: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const me = useResource(() => api().me.get(), []);
  const fleet = useResource(() => api().fleet.overview(), []);

  useEffect(() => {
    if (me.error && isSignedOut(me.error)) router.replace('/login');
    const user = me.data;
    if (user && user.mfa.required && !user.mfa.verifiedForSession)
      router.replace('/login?step=mfa');
  }, [me.data, me.error, router]);

  if ((me.loading && !me.data) || (fleet.loading && !fleet.data && !fleet.error))
    return <Loading />;
  if (me.error) return <ErrorState error={me.error} onRetry={() => void me.reload()} />;
  if (fleet.error)
    return (
      <main className="auth-page">
        <div className="auth-card">
          <ErrorState error={fleet.error} onRetry={() => void fleet.reload()} />
          <button
            type="button"
            className="btn btn-secondary btn-block"
            onClick={() => void auth.logout().then(() => router.replace('/login'))}
          >
            {t('common.signOut')}
          </button>
        </div>
      </main>
    );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">R</span>
          <span>
            {fleet.data!.fleet.name}
            <span className="small sidebar-sub">{t('app.name')}</span>
          </span>
        </div>
        <nav aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={pathname.startsWith(n.href) ? 'page' : undefined}
            >
              {t(n.label)}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="small">{me.data?.fullName ?? me.data?.phone}</span>
          <label className="small" htmlFor="shell-lang">
            {t('common.language')}
          </label>
          <select
            id="shell-lang"
            value={lang}
            onChange={(e) => setLang(e.target.value as 'en' | 'ha')}
          >
            <option value="en">English</option>
            <option value="ha">Hausa</option>
          </select>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void auth.logout().then(() => router.replace('/login'))}
          >
            {t('common.signOut')}
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
