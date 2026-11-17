'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, type ReactNode, useContext, useEffect } from 'react';
import { useResource, useSidebar, BrandMark } from '@rideswithme/web-core/client';
import {
  Armchair,
  Bus,
  CalendarClock,
  Car,
  Languages,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Route,
  Signpost,
  ScanLine,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { api, auth, isSignedOut } from '@/lib/api';
import { ErrorState, Loading, useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';

type NavItem = { href: string; label: MessageKey; icon: LucideIcon; exact?: boolean };

const MeReloadContext = createContext<() => Promise<unknown>>(async () => undefined);
/** Fetches the signed-in user again (the sidebar shows their name), after they edit their profile. */
export const useReloadMe = () => useContext(MeReloadContext);

const FLEET_NAV: NavItem[] = [
  { href: '/overview', label: 'nav.overview', icon: LayoutDashboard },
  { href: '/drivers', label: 'nav.drivers', icon: Users },
  { href: '/vehicles', label: 'nav.vehicles', icon: Car },
  { href: '/trips', label: 'nav.trips', icon: Route },
];

const BUS_NAV: NavItem[] = [
  { href: '/buses', label: 'nav.busOverview', icon: Bus, exact: true },
  { href: '/buses/departures', label: 'nav.departures', icon: CalendarClock },
  { href: '/buses/check-in', label: 'nav.checkIn', icon: ScanLine },
  { href: '/buses/routes', label: 'nav.routes', icon: Signpost },
  { href: '/buses/layouts', label: 'nav.layouts', icon: Armchair },
  { href: '/buses/statement', label: 'nav.statement', icon: Receipt },
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
  const onProfile = pathname.startsWith('/profile');
  const { collapsed, toggleCollapsed, menuOpen, toggleMenu } = useSidebar(
    'rwm_portal_sidebar',
    pathname,
  );

  useEffect(() => {
    if (me.error && isSignedOut(me.error)) router.replace('/login');
    const user = me.data;
    if (!user) return;
    if (user.mfa.required && !user.mfa.verifiedForSession) router.replace('/login?step=mfa');
    else if (onProfile) return;
    else if (onBusPage && !isBus && isFleet) router.replace('/overview');
    else if (!onBusPage && !isFleet && isBus) router.replace('/buses');
  }, [me.data, me.error, router, onBusPage, onProfile, isBus, isFleet]);

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
      title={collapsed ? t(n.label) : undefined}
      aria-current={
        (n.exact ? pathname === n.href : pathname.startsWith(n.href)) ? 'page' : undefined
      }
    >
      <n.icon className="nav-icon" aria-hidden />
      <span className="nav-text">{t(n.label)}</span>
    </Link>
  );
  const name = fleet.data?.fleet.name ?? operator.data?.operator.name ?? '';
  return (
    <div
      className={`shell${collapsed ? ' shell-collapsed' : ''}${menuOpen ? ' shell-menu-open' : ''}`}
    >
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand">
            <BrandMark />
            <span className="nav-text">
              {name}
              <span className="small sidebar-sub">{t('app.name')}</span>
            </span>
          </div>
          <button
            type="button"
            className="sidebar-toggle sidebar-collapse"
            aria-label={t(collapsed ? 'nav.expand' : 'nav.collapse')}
            title={t(collapsed ? 'nav.expand' : 'nav.collapse')}
            aria-expanded={!collapsed}
            onClick={toggleCollapsed}
          >
            {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
          </button>
          <button
            type="button"
            className="sidebar-toggle sidebar-menu"
            aria-label={t(menuOpen ? 'nav.closeMenu' : 'nav.openMenu')}
            aria-expanded={menuOpen}
            aria-controls="sidebar-body"
            onClick={toggleMenu}
          >
            {menuOpen ? <X aria-hidden /> : <Menu aria-hidden />}
          </button>
        </div>
        <div className="sidebar-body" id="sidebar-body">
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
            <Link
              href="/profile"
              className="sidebar-link"
              title={collapsed ? t('profile.title') : undefined}
              aria-current={onProfile ? 'page' : undefined}
            >
              <UserRound className="nav-icon" aria-hidden />
              <span className="nav-text">
                {me.data?.fullName ?? me.data?.phone}
                <span className="sidebar-sub">{t('profile.title')}</span>
              </span>
            </Link>
            {/* Collapsed: the icon switches language; expanded: a labelled list. */}
            <button
              type="button"
              className="sidebar-link sidebar-lang-switch"
              title={t('nav.switchLanguage')}
              aria-label={t('nav.switchLanguage')}
              onClick={() => setLang(lang === 'en' ? 'ha' : 'en')}
            >
              <Languages className="nav-icon" aria-hidden />
              <span className="lang-code" aria-hidden>
                {lang === 'en' ? 'EN' : 'HA'}
              </span>
            </button>
            <div className="sidebar-lang">
              <Languages className="nav-icon" aria-hidden />
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
            </div>
            <button
              type="button"
              className="sidebar-link"
              title={collapsed ? t('common.signOut') : undefined}
              onClick={signOut}
            >
              <LogOut className="nav-icon" aria-hidden />
              <span className="nav-text">{t('common.signOut')}</span>
            </button>
          </div>
        </div>
      </aside>
      <main className="content">
        <MeReloadContext.Provider value={me.reload}>{children}</MeReloadContext.Provider>
      </main>
    </div>
  );
}
