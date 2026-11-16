'use client';

import { useState } from 'react';
import { useResource } from '@rideswithme/web-core/client';
import { addDays, DeparturesTable, lagosToday } from '@/components/bus';
import { api } from '@/lib/api';
import { Empty, ErrorState, Loading, useI18n } from '@/lib/i18n';
import { AddDepartures } from './add-departures';

export default function DeparturesPage() {
  const { t } = useI18n();
  const [from, setFrom] = useState(lagosToday());
  const [to, setTo] = useState(addDays(lagosToday(), 30));
  const [routeId, setRouteId] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const setup = useResource(
    () => Promise.all([api().operator.routes(), api().operator.layouts()]),
    [],
  );
  const list = useResource(
    () => api().operator.departures({ from, to, ...(routeId && { routeId }) }),
    [from, to, routeId],
  );
  if (setup.loading && !setup.data) return <Loading />;
  if (setup.error) return <ErrorState error={setup.error} onRetry={() => void setup.reload()} />;
  const [routes, layouts] = setup.data!;
  return (
    <>
      <div className="page-header">
        <h1>{t('departures.title')}</h1>
      </div>
      <div className="toolbar">
        <label className="small" htmlFor="f-from">
          {t('trips.from')}
        </label>
        <input id="f-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label className="small" htmlFor="f-to">
          {t('trips.to')}
        </label>
        <input id="f-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <select
          aria-label={t('departures.route')}
          value={routeId}
          onChange={(e) => setRouteId(e.target.value)}
        >
          <option value="">{t('common.all')}</option>
          {routes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.originCity} → {r.destinationCity}
            </option>
          ))}
        </select>
      </div>
      {notice && <p className="notice notice-ok">{notice}</p>}
      {list.error ? (
        <ErrorState error={list.error} onRetry={() => void list.reload()} />
      ) : !list.data ? (
        <Loading />
      ) : list.data.length === 0 ? (
        <Empty message={t('departures.empty')} />
      ) : (
        <DeparturesTable departures={list.data} />
      )}
      {routes.some((r) => r.isActive) && layouts.length > 0 ? (
        <AddDepartures
          routes={routes}
          layouts={layouts}
          onCreated={(count) => {
            setNotice(t('departures.created', { count }));
            void list.reload();
          }}
        />
      ) : (
        <p className="notice notice-wait">{t('departures.needSetup')}</p>
      )}
    </>
  );
}
