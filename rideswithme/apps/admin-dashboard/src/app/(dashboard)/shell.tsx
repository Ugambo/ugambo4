'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, type ReactNode, useContext, useEffect } from 'react';
import type { MeResponse, PermissionKey } from '@rideswithme/shared-types';
import type { MessageKey } from '@/lib/messages';
import { ErrorState, Loading } from '@/components/states';
import { api, auth, isSignedOut } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useResource, useSidebar, BrandMark } from '@rideswithme/web-core/client';
import {
  Bus,
  Car,
  Gift,
  IdCard,
  KeyRound,
  Languages,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  type LucideIcon,
  Map as MapIcon,
  MapPinned,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings,
  ShieldCheck,
  Siren,
  Tags,
  TriangleAlert,
  Truck,
  UserCheck,
  UserRound,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { SosBanner } from '@/components/sos-banner';

const NAV: { href: string; label: MessageKey; permission: PermissionKey; icon: LucideIcon }[] = [
  { href: '/sos', label: 'nav.sos', permission: 'safety.read', icon: Siren },
  { href: '/overview', label: 'nav.overview', permission: 'rides.read', icon: LayoutDashboard },
  { href: '/live', label: 'nav.live', permission: 'rides.read', icon: MapIcon },
  { href: '/rides', label: 'nav.rides', permission: 'rides.read', icon: Car },
  { href: '/users', label: 'nav.users', permission: 'users.read', icon: Users },
  { href: '/drivers', label: 'nav.drivers', permission: 'drivers.read', icon: IdCard },
  {
    href: '/passengers',
    label: 'nav.passengers',
    permission: 'passengers.verify',
    icon: UserCheck,
  },
  { href: '/fleets', label: 'nav.fleets', permission: 'fleets.read', icon: Truck },
  { href: '/buses', label: 'nav.buses', permission: 'buses.read', icon: Bus },
  { href: '/pricing', label: 'nav.pricing', permission: 'rides.read', icon: Tags },
  { href: '/areas', label: 'nav.areas', permission: 'rides.read', icon: MapPinned },
  { href: '/payments', label: 'nav.payments', permission: 'payments.read', icon: Wallet },
  { href: '/promotions', label: 'nav.promotions', permission: 'rides.read', icon: Gift },
  { href: '/incidents', label: 'nav.incidents', permission: 'safety.read', icon: TriangleAlert },
  { href: '/support', label: 'nav.support', permission: 'support.read', icon: LifeBuoy },
  { href: '/privacy', label: 'nav.privacy', permission: 'privacy.manage', icon: ShieldCheck },
  { href: '/roles', label: 'nav.roles', permission: 'roles.read', icon: KeyRound },
  { href: '/audit', label: 'nav.audit', permission: 'audit_logs.read', icon: ScrollText },
  { href: '/settings', label: 'nav.settings', permission: 'settings.manage', icon: Settings },
];

const MeContext = createContext<MeResponse | null>(null);

/** Whether the signed-in staff member holds a permission (screens hide actions they cannot take). */
export function useCan() {
  const me = useContext(MeContext);
  return (p: PermissionKey) => !!me?.permissions.includes(p);
}
export const useMe = () => useContext(MeContext);

const MeReloadContext = createContext<() => Promise<unknown>>(async () => undefined);
/** Fetches the signed-in user again, after they change their own profile. */
export const useReloadMe = () => useContext(MeReloadContext);

/** Left sidebar and content area. Sends the user to sign-in or two-factor when needed. */
export function Shell({ children }: { children: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const me = useResource(() => api().me.get(), []);
  const { collapsed, toggleCollapsed, menuOpen, toggleMenu } = useSidebar(
    'rwm_admin_sidebar',
    pathname,
  );

  useEffect(() => {
    if (me.error && isSignedOut(me.error)) router.replace('/login');
    const user = me.data;
    if (user && user.mfa.required && !user.mfa.verifiedForSession)
      router.replace('/login?step=mfa');
  }, [me.data, me.error, router]);

  if (me.loading && !me.data) return <Loading />;
  if (me.error) return <ErrorState error={me.error} onRetry={() => void me.reload()} />;
  if (!me.data || (me.data.mfa.required && !me.data.mfa.verifiedForSession)) return <Loading />;

  const signOut = async () => {
    await auth.logout().catch(() => undefined);
    router.replace('/login');
  };

  return (
    <MeReloadContext.Provider value={me.reload}>
      <MeContext.Provider value={me.data}>
        <div
          className={`shell${collapsed ? ' shell-collapsed' : ''}${menuOpen ? ' shell-menu-open' : ''}`}
        >
          <aside className="sidebar">
            <div className="sidebar-top">
              <div className="brand">
                <BrandMark />
                <span className="nav-text">{t('app.name')}</span>
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
                {NAV.filter((n) => me.data!.permissions.includes(n.permission)).map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    title={collapsed ? t(n.label) : undefined}
                    aria-current={pathname.startsWith(n.href) ? 'page' : undefined}
                  >
                    <n.icon className="nav-icon" aria-hidden />
                    <span className="nav-text">{t(n.label)}</span>
                  </Link>
                ))}
              </nav>
              <div className="sidebar-footer">
                <Link
                  href="/profile"
                  className="sidebar-link"
                  title={collapsed ? t('profile.title') : undefined}
                  aria-current={pathname.startsWith('/profile') ? 'page' : undefined}
                >
                  <UserRound className="nav-icon" aria-hidden />
                  <span className="nav-text">
                    {me.data.fullName ?? me.data.phone}
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
                  className="sidebar-link sidebar-signout"
                  title={collapsed ? t('common.signOut') : undefined}
                  onClick={() => void signOut()}
                >
                  <LogOut className="nav-icon" aria-hidden />
                  <span className="nav-text">{t('common.signOut')}</span>
                </button>
              </div>
            </div>
          </aside>
          <main className="content">
            {me.data.permissions.includes('safety.read') && <SosBanner />}
            {children}
          </main>
        </div>
      </MeContext.Provider>
    </MeReloadContext.Provider>
  );
}
