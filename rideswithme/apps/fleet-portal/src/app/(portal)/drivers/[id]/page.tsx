'use client';

import { useParams } from 'next/navigation';
import { formatKobo } from '@rideswithme/utilities';
import { useResource } from '@rideswithme/web-core/client';
import { TripsTable } from '@/components/trips-table';
import { api } from '@/lib/api';
import { ErrorState, Loading, useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';

export default function DriverPage() {
  const { t, formatDate } = useI18n();
  const { id } = useParams<{ id: string }>();
  const driver = useResource(() => api().fleet.driver(id), [id]);
  const trips = useResource(() => api().fleet.trips({ driverId: id, limit: 50 }), [id]);
  if (driver.loading && !driver.data) return <Loading />;
  if (driver.error || !driver.data)
    return <ErrorState error={driver.error} onRetry={() => void driver.reload()} />;
  const d = driver.data;
  return (
    <>
      <div className="page-header">
        <h1>{d.name ?? d.phone}</h1>
        <span className={`pill pill-${d.online ? 'ok' : 'muted'}`}>
          {t(d.online ? 'drivers.online' : 'drivers.offline')}
        </span>
      </div>
      <div className="card">
        <dl className="facts">
          <div>
            <dt>{t('col.phone')}</dt>
            <dd>{d.phone}</dd>
          </div>
          <div>
            <dt>{t('driver.application')}</dt>
            <dd>{d.driverStatus ? t(`driverStatus.${d.driverStatus}` as MessageKey) : '—'}</dd>
          </div>
          <div>
            <dt>{t('col.vehicle')}</dt>
            <dd>
              {d.vehicle
                ? `${d.vehicle.colour} ${d.vehicle.make} ${d.vehicle.model} · ${d.vehicle.plateNumber}`
                : '—'}
            </dd>
          </div>
          <div>
            <dt>{t('overview.week')}</dt>
            <dd>
              {formatKobo(d.week.earningsKobo)} · {t('overview.trips', { count: d.week.trips })}
            </dd>
          </div>
        </dl>
        {d.membership.joinedAt && (
          <p className="small muted">
            {t('driver.joined', { date: formatDate(d.membership.joinedAt) })}
          </p>
        )}
      </div>
      <h2>{t('driver.trips')}</h2>
      {trips.data && <TripsTable trips={trips.data.items} showDriver={false} />}
    </>
  );
}
