'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { AdminSosAlertView } from '@rideswithme/shared-types';
import { api } from '@/lib/api';
import { useConfig } from '@/lib/config';
import { useI18n } from '@/lib/i18n';
import { staffRealtime } from '@/lib/realtime';

/**
 * Shown above every page while any SOS alert is open: arrives over the live
 * connection at once, and is re-checked every 15 seconds in case it dropped.
 */
export function SosBanner() {
  const { t, formatTime } = useI18n();
  const { apiPublicUrl } = useConfig();
  const pathname = usePathname();
  const [open, setOpen] = useState<AdminSosAlertView[]>([]);

  const load = useCallback(async () => {
    try {
      setOpen(await api().admin.safety.sos('open'));
    } catch {
      // keep the last known state
    }
  }, []);

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), 15_000);
    if (!apiPublicUrl) return () => clearInterval(poll);
    const rt = staffRealtime(apiPublicUrl);
    const offs = [
      rt.onStatus((up) => {
        if (up) void rt.request('ops:subscribe', {}).catch(() => undefined);
      }),
      rt.onReconnect(() => void load()),
      rt.on<AdminSosAlertView>('sos:alert', (a) =>
        setOpen((list) =>
          a.status === 'resolved'
            ? list.filter((x) => x.id !== a.id)
            : [a, ...list.filter((x) => x.id !== a.id)],
        ),
      ),
    ];
    rt.start();
    return () => {
      clearInterval(poll);
      offs.forEach((off) => off());
      rt.stop();
    };
  }, [apiPublicUrl, load]);

  const unanswered = open.filter((a) => a.status === 'open').length;
  useEffect(() => {
    const base = document.title.replace(/^\(SOS\) /, '');
    document.title = unanswered ? `(SOS) ${base}` : base;
  }, [unanswered]);

  if (open.length === 0) return null;
  const latest = open[0]!;
  return (
    <div className="sos-banner" role="alert" data-testid="sos-banner">
      <strong>
        {t('sos.banner', {
          count: open.length,
          name: latest.user.name ?? latest.user.phone ?? '—',
          time: formatTime(latest.createdAt),
        })}
      </strong>
      {pathname !== '/sos' && (
        <Link href="/sos" className="btn btn-danger">
          {t('sos.open')}
        </Link>
      )}
    </div>
  );
}
