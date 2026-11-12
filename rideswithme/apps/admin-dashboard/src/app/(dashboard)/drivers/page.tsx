'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError } from '@rideswithme/api-client';
import {
  type AdminDriverListItem,
  DRIVER_STATUSES,
  type DriverStatus,
} from '@rideswithme/shared-types';
import { DriverStatusPill } from '@/components/status-pill';
import { Empty, ErrorState, InlineError, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';

type Queue = 'review' | 'all';

export default function DriversPage() {
  const { t, formatDate } = useI18n();
  const router = useRouter();
  const [queue, setQueue] = useState<Queue>('review');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<DriverStatus | ''>('');
  const [items, setItems] = useState<AdminDriverListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [moreError, setMoreError] = useState<unknown>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const query = { queue, ...(debounced && { search: debounced }), ...(status && { status }) };

  async function load(reset: boolean) {
    if (reset) {
      setLoading(true);
      setError(null);
    }
    setMoreError(null);
    try {
      const page = await api().admin.drivers.list({
        ...query,
        ...(!reset && cursor && { cursor }),
      });
      setItems((prev) => (reset ? page.items : [...prev, ...page.items]));
      setCursor(page.nextCursor);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return router.replace('/login');
      if (reset) setError(err);
      else setMoreError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(true);
  }, [queue, debounced, status]);

  return (
    <>
      <div className="page-header">
        <h1>{t('drivers.title')}</h1>
      </div>
      <div className="tabs" role="tablist">
        {(['review', 'all'] as const).map((q) => (
          <button
            key={q}
            type="button"
            role="tab"
            aria-selected={queue === q}
            onClick={() => setQueue(q)}
          >
            {t(q === 'review' ? 'drivers.tabReview' : 'drivers.tabAll')}
          </button>
        ))}
      </div>
      <div className="toolbar">
        <input
          type="search"
          aria-label={t('drivers.search')}
          placeholder={t('drivers.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label={t('drivers.col.status')}
          value={status}
          onChange={(e) => setStatus(e.target.value as DriverStatus | '')}
        >
          <option value="">{t('drivers.allStatuses')}</option>
          {DRIVER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`driverStatus.${s}`)}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void load(true)} />
      ) : items.length === 0 ? (
        <Empty message={t(queue === 'review' ? 'drivers.emptyReview' : 'drivers.emptyAll')} />
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('drivers.col.name')}</th>
                <th>{t('drivers.col.phone')}</th>
                <th>{t('drivers.col.vehicle')}</th>
                <th>{t('drivers.col.status')}</th>
                <th className="num">{t('drivers.col.pending')}</th>
                <th>{t('drivers.col.waiting')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.userId} onClick={() => router.push(`/drivers/${d.userId}`)}>
                  <td>
                    <a href={`/drivers/${d.userId}`} onClick={(e) => e.preventDefault()}>
                      {d.fullName ?? t('drivers.unnamed')}
                    </a>
                  </td>
                  <td>{d.phone}</td>
                  <td>
                    {d.vehicleCategory ? t(`category.${d.vehicleCategory}` as MessageKey) : '—'}
                    {d.plateNumber && <span className="muted"> · {d.plateNumber}</span>}
                  </td>
                  <td>
                    <DriverStatusPill status={d.status} />
                  </td>
                  <td className="num">{d.pendingDocuments}</td>
                  <td>{formatDate(d.waitingSince, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {cursor && (
            <div className="toolbar">
              <button type="button" className="btn btn-secondary" onClick={() => void load(false)}>
                {t('common.loadMore')}
              </button>
              <InlineError error={moreError} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
