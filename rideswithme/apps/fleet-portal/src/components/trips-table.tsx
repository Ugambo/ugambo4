'use client';

import type { FleetTripView } from '@rideswithme/shared-types';
import { formatKobo } from '@rideswithme/utilities';
import { Empty, useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';

const money = (k: number | null) => (k === null ? '—' : formatKobo(k));

export function TripsTable({
  trips,
  showDriver = true,
}: {
  trips: FleetTripView[];
  showDriver?: boolean;
}) {
  const { t, formatDate } = useI18n();
  if (trips.length === 0) return <Empty message={t('trips.empty')} />;
  return (
    <div className="table-wrap">
      <table data-testid="trips-table">
        <thead>
          <tr>
            <th>{t('col.when')}</th>
            {showDriver && <th>{t('col.driver')}</th>}
            <th>{t('col.status')}</th>
            <th>{t('col.route')}</th>
            <th>{t('col.payment')}</th>
            <th className="num">{t('col.fare')}</th>
            <th className="num">{t('col.fees')}</th>
            <th className="num">{t('col.kept')}</th>
          </tr>
        </thead>
        <tbody>
          {trips.map((r) => (
            <tr key={r.id}>
              <td>{formatDate(r.requestedAt, true)}</td>
              {showDriver && <td>{r.driver.name ?? '—'}</td>}
              <td>{t(`rideStatus.${r.status}` as MessageKey)}</td>
              <td className="clip">
                {r.pickupAddress} → {r.dropoffAddress}
              </td>
              <td>{t(`method.${r.paymentMethod}`)}</td>
              <td className="num">{money(r.fareKobo)}</td>
              <td className="num">{money(r.commissionKobo)}</td>
              <td className="num">{money(r.earningsKobo)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
