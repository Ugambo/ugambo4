'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import type { MeResponse } from '@rideswithme/shared-types';
import { useResource } from '@rideswithme/web-core/client';
import { LanguageSelect } from '@/components/language-select';
import { api, auth, isSignedOut } from '@/lib/api';
import { ErrorState, Loading, useI18n } from '@/lib/i18n';
import { useRealtimeConnected } from '@/lib/realtime';

const MeContext = createContext<MeResponse | null>(null);
export const useMe = () => useContext(MeContext);

export function Shell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const me = useResource(() => api().me.get(), []);
  const connected = useRealtimeConnected();
  // Only mention the live connection when it has been down for a few seconds.
  const [showReconnecting, setShowReconnecting] = useState(false);
  useEffect(() => {
    if (connected) {
      setShowReconnecting(false);
      return;
    }
    const timer = setTimeout(() => setShowReconnecting(true), 4000);
    return () => clearTimeout(timer);
  }, [connected]);

  useEffect(() => {
    if (me.error && isSignedOut(me.error)) router.replace('/sign-in');
  }, [me.error, router]);

  if (me.loading && !me.data) return <Loading />;
  if (me.error) return <ErrorState error={me.error} onRetry={() => void me.reload()} />;
  if (!me.data) return <Loading />;

  const signOut = async () => {
    await auth.logout().catch(() => undefined);
    router.replace('/sign-in');
  };

  return (
    <MeContext.Provider value={me.data}>
      <header className="topbar">
        <Link href="/" className="brand">
          <span className="brand-mark">R</span>
          {t('app.name')}
        </Link>
        <nav aria-label="Main" className="topnav">
          <Link href="/" aria-current={pathname === '/' ? 'page' : undefined}>
            {t('nav.book')}
          </Link>
          <Link href="/rides" aria-current={pathname.startsWith('/rides') ? 'page' : undefined}>
            {t('nav.rides')}
          </Link>
          <Link href="/wallet" aria-current={pathname.startsWith('/wallet') ? 'page' : undefined}>
            {t('wallet.title')}
          </Link>
        </nav>
        <div className="topbar-end">
          <LanguageSelect />
          <button type="button" className="btn btn-ghost btn-small" onClick={() => void signOut()}>
            {t('common.signOut')}
          </button>
        </div>
      </header>
      {showReconnecting && (
        <div className="live-status" role="status" data-testid="reconnecting">
          {t('common.reconnecting')}
        </div>
      )}
      <main className="page">{children}</main>
    </MeContext.Provider>
  );
}
