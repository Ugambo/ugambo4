'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { RideView } from '@rideswithme/shared-types';
import { formatKobo } from '@rideswithme/utilities';
import { useResource } from '@rideswithme/web-core/client';
import { StatusPill } from '@/components/ride-parts';
import { api } from '@/lib/api';
import { Empty, ErrorState, InlineError, Loading, useI18n } from '@/lib/i18n';

const shownTotal = (r: RideView) =>
  r.status === 'cancelled_by_passenger' || r.status === 'cancelled_by_driver'
    ? r.fare.cancellationFeeKobo
    : (r.fare.finalTotalKobo ?? r.fare.quotedTotalKobo);

export default function RidesPage() {
  const { t, formatDate } = useI18n();
  const first = useResource(() => api().rides.history(), []);
  const [more, setMore] = useState<RideView[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);

  if (first.loading && !first.data) return <Loading />;
  if (first.error) return <ErrorState error={first.error} onRetry={() => void first.reload()} />;
  const rides = [...(first.data?.items ?? []), ...more];
  const next = cursor === undefined ? first.data?.nextCursor : cursor;

  const loadMore = async () => {
    if (!next) return;
    try {
      const page = await api().rides.history(next);
      setMore((m) => [...m, ...page.items]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(err);
    }
  };

  return (
    <section className="card">
      <h1>{t('history.title')}</h1>
      {rides.length === 0 ? (
        <Empty message={t('history.empty')} />
      ) : (
        <ul className="ride-list" data-testid="ride-list">
          {rides.map((r) => (
            <li key={r.id}>
              <Link href={`/rides/${r.id}`} className="ride-row">
                <span className="ride-row-main">
                  <strong>{r.dropoff.name ?? r.dropoff.address}</strong>
                  <span className="small muted">
                    {formatDate(r.scheduledFor ?? r.requestedAt, true)} · {r.category.name}
                  </span>
                </span>
                <StatusPill status={r.status} />
                <span className="num">{formatKobo(shownTotal(r))}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <InlineError error={error} />
      {next && (
        <button type="button" className="btn btn-secondary" onClick={() => void loadMore()}>
          {t('common.loadMore')}
        </button>
      )}
    </section>
  );
}
