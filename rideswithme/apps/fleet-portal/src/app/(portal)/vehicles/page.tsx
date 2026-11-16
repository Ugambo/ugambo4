'use client';

import { useResource } from '@rideswithme/web-core/client';
import { api } from '@/lib/api';
import { Empty, ErrorState, Loading, useI18n } from '@/lib/i18n';

/** The active vehicle of each driver in the fleet. */
export default function VehiclesPage() {
  const { t } = useI18n();
  const vehicles = useResource(() => api().fleet.vehicles(), []);
  if (vehicles.loading && !vehicles.data) return <Loading />;
  if (vehicles.error)
    return <ErrorState error={vehicles.error} onRetry={() => void vehicles.reload()} />;
  return (
    <>
      <div className="page-header">
        <h1>{t('vehicles.title')}</h1>
      </div>
      {vehicles.data!.length === 0 ? (
        <Empty message={t('vehicles.empty')} />
      ) : (
        <div className="table-wrap">
          <table data-testid="vehicles-table">
            <thead>
              <tr>
                <th>{t('col.plate')}</th>
                <th>{t('col.category')}</th>
                <th>{t('col.vehicle')}</th>
                <th>{t('col.year')}</th>
                <th>{t('col.driver')}</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.data!.map((v) => (
                <tr key={v.plateNumber}>
                  <td>
                    <strong>{v.plateNumber}</strong>
                  </td>
                  <td>{v.category}</td>
                  <td>
                    {v.colour} {v.make} {v.model}
                  </td>
                  <td>{v.year}</td>
                  <td>{v.driver.name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
