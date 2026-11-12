'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, type ReactNode, useContext, useEffect } from 'react';
import type { MeResponse } from '@rideswithme/shared-types';
import { ErrorState, Loading } from '@/components/states';
import { api, auth, isSignedOut } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useResource } from '@rideswithme/web-core/client';

const MeContext = createContext<MeResponse | null>(null);
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
            <Link
              href="/drivers"
              aria-current={pathname.startsWith('/drivers') ? 'page' : undefined}
            >
              {t('nav.drivers')}
            </Link>
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
