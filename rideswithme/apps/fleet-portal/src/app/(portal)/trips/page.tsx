'use client';

import { useEffect, useState } from 'react';
import type { FleetTripView } from '@rideswithme/shared-types';
import { useResource } from '@rideswithme/web-core/client';
import { TripsTable } from '@/components/trips-table';
import { api } from '@/lib/api';
import { ErrorState, InlineError, Loading, useI18n } from '@/lib/i18n';

/** The fleet's trips, by driver and date (Nigerian days). */
export default function TripsPage() {
  const { t } = useI18n();
  const drivers = useResource(() => api().fleet.drivers(), []);
  const [driverId, setDriverId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [items, setItems] = useState<FleetTripView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  async function load(reset: boolean) {
    setError(null);
    if (reset) setLoading(true);
    try {
      const page = await api().fleet.trips({
        ...(driverId && { driverId }),
        ...(from && { from }),
        ...(to && { to }),
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
  }, [driverId, from, to]);

  return (
    <>
      <div className="page-header">
        <h1>{t('trips.title')}</h1>
      </div>
      <div className="toolbar">
        <label htmlFor="trip-driver">{t('trips.driver')}</label>
        <select id="trip-driver" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
          <option value="">{t('trips.anyDriver')}</option>
          {(drivers.data ?? [])
            .filter((d) => d.membership.status === 'active')
            .map((d) => (
              <option key={d.userId} value={d.userId}>
                {d.name ?? d.phone}
              </option>
            ))}
        </select>
        <label htmlFor="trip-from">{t('trips.from')}</label>
        <input id="trip-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label htmlFor="trip-to">{t('trips.to')}</label>
        <input id="trip-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <p className="small muted">{t('trips.note')}</p>
      {loading ? (
        <Loading />
      ) : error && items.length === 0 ? (
        <ErrorState error={error} onRetry={() => void load(true)} />
      ) : (
        <TripsTable trips={items} />
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
