'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { RIDE_STATUSES, type RideStatus, type RideView } from '@rideswithme/shared-types';
import { formatKobo } from '@rideswithme/utilities';
import { RideStatusPill } from '@/components/ride-status';
import { Empty, ErrorState, InlineError, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function RidesPage() {
  const { t, formatDate } = useI18n();
  const [status, setStatus] = useState<RideStatus | ''>('');
  const [items, setItems] = useState<RideView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  async function load(reset: boolean) {
    setError(null);
    if (reset) setLoading(true);
    try {
      const page = await api().admin.rides.list({
        ...(status && { status }),
        ...(!reset && cursor && { cursor }),
      });
      setItems((prev) => (reset ? page.items : [...prev, ...page.items]));
      setCursor(page.nextCursor);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load(true);
  }, [status]);

  return (
    <>
      <div className="page-header">
        <h1>{t('rides.title')}</h1>
      </div>
      <div className="toolbar">
        <label htmlFor="ride-status">{t('rides.status')}</label>
        <select
          id="ride-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as RideStatus | '')}
        >
          <option value="">{t('common.all')}</option>
          {RIDE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`rideStatus.${s}`)}
            </option>
          ))}
        </select>
      </div>
      {loading ? (
        <Loading />
      ) : error && items.length === 0 ? (
        <ErrorState error={error} onRetry={() => void load(true)} />
      ) : items.length === 0 ? (
        <Empty message={t('rides.empty')} />
      ) : (
        <div className="table-wrap">
          <table data-testid="rides-table">
            <thead>
              <tr>
                <th>{t('col.when')}</th>
                <th>{t('col.status')}</th>
                <th>{t('col.vehicle')}</th>
                <th>{t('col.route')}</th>
                <th>{t('col.driver')}</th>
                <th>{t('col.payment')}</th>
                <th className="num">{t('col.fare')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/rides/${r.id}`}>{formatDate(r.requestedAt, true)}</Link>
                  </td>
                  <td>
                    <RideStatusPill status={r.status} />
                  </td>
                  <td>{r.category.name}</td>
                  <td className="clip">
                    {r.pickup.name ?? r.pickup.address} → {r.dropoff.name ?? r.dropoff.address}
                  </td>
                  <td>{r.driver?.firstName ?? '—'}</td>
                  <td>{t(`method.${r.paymentMethod}`)}</td>
                  <td className="num">
                    {formatKobo(r.fare.finalTotalKobo ?? r.fare.quotedTotalKobo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <InlineError error={items.length ? error : null} />
      {cursor && (
        <button type="button" className="btn btn-secondary" onClick={() => void load(false)}>
          {t('common.loadMore')}
        </button>
      )}
    </>
  );
}
