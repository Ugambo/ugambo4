'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { useResource } from '@rideswithme/web-core/client';
import { api, auth, isSignedOut } from '@/lib/api';
import { ErrorState, Loading, useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';

type NavItem = { href: string; label: MessageKey; exact?: boolean };

const FLEET_NAV: NavItem[] = [
  { href: '/overview', label: 'nav.overview' },
  { href: '/drivers', label: 'nav.drivers' },
  { href: '/vehicles', label: 'nav.vehicles' },
  { href: '/trips', label: 'nav.trips' },
];

const BUS_NAV: NavItem[] = [
  { href: '/buses', label: 'nav.busOverview', exact: true },
  { href: '/buses/departures', label: 'nav.departures' },
  { href: '/buses/check-in', label: 'nav.checkIn' },
  { href: '/buses/routes', label: 'nav.routes' },
  { href: '/buses/layouts', label: 'nav.layouts' },
  { href: '/buses/statement', label: 'nav.statement' },
];

/**
 * Sidebar for a fleet manager, a bus operator's manager, or someone who is
 * both. Sends people to sign-in, or to two-factor, when needed.
 */
export function Shell({ children }: { children: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const me = useResource(() => api().me.get(), []);
  const perms = me.data?.permissions ?? [];
  const isFleet = perms.includes('fleet.portal');
  const isBus = perms.includes('bus.operator');
  const fleet = useResource(
    () => (isFleet ? api().fleet.overview() : Promise.resolve(null)),
    [isFleet],
  );
  const operator = useResource(
    () => (isBus ? api().operator.overview() : Promise.resolve(null)),
    [isBus],
  );
  const onBusPage = pathname.startsWith('/buses');

  useEffect(() => {
    if (me.error && isSignedOut(me.error)) router.replace('/login');
    const user = me.data;
    if (!user) return;
    if (user.mfa.required && !user.mfa.verifiedForSession) router.replace('/login?step=mfa');
    else if (onBusPage && !isBus && isFleet) router.replace('/overview');
    else if (!onBusPage && !isFleet && isBus) router.replace('/buses');
  }, [me.data, me.error, router, onBusPage, isBus, isFleet]);

  const signOut = () => void auth.logout().then(() => router.replace('/login'));
  const loading =
    (me.loading && !me.data) ||
    (isFleet && fleet.loading && !fleet.data && !fleet.error) ||
    (isBus && operator.loading && !operator.data && !operator.error);
  if (loading) return <Loading />;
  if (me.error) return <ErrorState error={me.error} onRetry={() => void me.reload()} />;
  const failed = (isFleet && fleet.error) || (isBus && operator.error);
  if (failed || (!isFleet && !isBus))
    return (
      <main className="auth-page">
        <div className="auth-card">
          {failed ? (
            <ErrorState
              error={failed}
              onRetry={() => void (fleet.error ? fleet.reload() : operator.reload())}
            />
          ) : (
            <p className="notice notice-bad">{t('login.noAccess')}</p>
          )}
          <button type="button" className="btn btn-secondary btn-block" onClick={signOut}>
            {t('common.signOut')}
          </button>
        </div>
      </main>
    );

  const link = (n: NavItem) => (
    <Link
      key={n.href}
      href={n.href}
      aria-current={
        (n.exact ? pathname === n.href : pathname.startsWith(n.href)) ? 'page' : undefined
      }
    >
      {t(n.label)}
    </Link>
  );
  const name = fleet.data?.fleet.name ?? operator.data?.operator.name ?? '';
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">R</span>
          <span>
            {name}
            <span className="small sidebar-sub">{t('app.name')}</span>
          </span>
        </div>
        <nav aria-label="Main">
          {isFleet && isBus && <span className="nav-group">{t('nav.fleet')}</span>}
          {isFleet && FLEET_NAV.map(link)}
          {isFleet && isBus && (
            <span className="nav-group">
              {t('nav.buses')} · {operator.data?.operator.name}
            </span>
          )}
          {isBus && BUS_NAV.map(link)}
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
          <button type="button" className="btn btn-secondary" onClick={signOut}>
            {t('common.signOut')}
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
