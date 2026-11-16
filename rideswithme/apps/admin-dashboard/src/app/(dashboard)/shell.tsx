'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, type ReactNode, useContext, useEffect } from 'react';
import type { MeResponse, PermissionKey } from '@rideswithme/shared-types';
import type { MessageKey } from '@/lib/messages';
import { ErrorState, Loading } from '@/components/states';
import { api, auth, isSignedOut } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useResource } from '@rideswithme/web-core/client';

const NAV: { href: string; label: MessageKey; permission: PermissionKey }[] = [
  { href: '/overview', label: 'nav.overview', permission: 'rides.read' },
  { href: '/live', label: 'nav.live', permission: 'rides.read' },
  { href: '/rides', label: 'nav.rides', permission: 'rides.read' },
  { href: '/users', label: 'nav.users', permission: 'users.read' },
  { href: '/drivers', label: 'nav.drivers', permission: 'drivers.read' },
  { href: '/fleets', label: 'nav.fleets', permission: 'fleets.read' },
  { href: '/pricing', label: 'nav.pricing', permission: 'rides.read' },
  { href: '/areas', label: 'nav.areas', permission: 'rides.read' },
  { href: '/payments', label: 'nav.payments', permission: 'payments.read' },
  { href: '/roles', label: 'nav.roles', permission: 'roles.read' },
  { href: '/audit', label: 'nav.audit', permission: 'audit_logs.read' },
];

const MeContext = createContext<MeResponse | null>(null);

/** Whether the signed-in staff member holds a permission (screens hide actions they cannot take). */
export function useCan() {
  const me = useContext(MeContext);
  return (p: PermissionKey) => !!me?.permissions.includes(p);
}
export const useMe = () => useContext(MeContext);

/** Left sidebar and content area. Sends the user to sign-in or two-factor when needed. */
export function Shell({ children }: { children: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const me = useResource(() => api().me.get(), []);

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
    <MeContext.Provider value={me.data}>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-mark">R</span>
            {t('app.name')}
          </div>
          <nav aria-label="Main">
            {NAV.filter((n) => me.data!.permissions.includes(n.permission)).map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={pathname.startsWith(n.href) ? 'page' : undefined}
              >
                {t(n.label)}
              </Link>
            ))}
          </nav>
          <p className="later">{t('nav.laterPhases')}</p>
          <div className="sidebar-footer">
            <span className="small">{me.data.fullName ?? me.data.phone}</span>
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
            <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>
              {t('common.signOut')}
            </button>
          </div>
        </aside>
        <main className="content">{children}</main>
      </div>
    </MeContext.Provider>
  );
}
