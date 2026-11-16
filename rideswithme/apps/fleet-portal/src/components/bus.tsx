'use client';

import Link from 'next/link';
import type {
  BusDepartureStatus,
  BusFare,
  OperatorDepartureView,
  SeatClass,
} from '@rideswithme/shared-types';
import { formatKobo } from '@rideswithme/utilities';
import { type SeatMapSeat } from '@rideswithme/web-core/client';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';

export { addDays, datesBetween, lagosToday } from '@/lib/dates';

export function useBusText() {
  const { t } = useI18n();
  return {
    seatClass: (c: SeatClass) => t(`seatClass.${c}` as MessageKey),
    describeSeat: (s: SeatMapSeat) =>
      t('seat.describe', {
        label: s.label,
        seatClass: t(`seatClass.${s.seatClass}` as MessageKey),
      }),
    fares: (fares: BusFare[]) =>
      fares
        .map((f) => `${t(`seatClass.${f.seatClass}` as MessageKey)} ${formatKobo(f.fareKobo)}`)
        .join(' · '),
  };
}

export function DepartureStatus({
  status,
  salesOpen,
}: {
  status: BusDepartureStatus;
  salesOpen?: boolean;
}) {
  const { t } = useI18n();
  const tone = status === 'cancelled' ? 'bad' : status === 'departed' ? 'muted' : 'ok';
  return (
    <span className={`pill pill-${tone}`}>
      {status === 'scheduled' && salesOpen === false
        ? t('departure.salesClosed')
        : t(`departureStatus.${status}` as MessageKey)}
    </span>
  );
}

export function DeparturesTable({ departures }: { departures: OperatorDepartureView[] }) {
  const { t, formatDate } = useI18n();
  const text = useBusText();
  return (
    <div className="table-wrap">
      <table data-testid="departures-table">
        <thead>
          <tr>
            <th>{t('col.departs')}</th>
            <th>{t('col.route')}</th>
            <th>{t('col.bus')}</th>
            <th>{t('col.status')}</th>
            <th className="num">{t('col.sold')}</th>
            <th className="num">{t('col.left')}</th>
            <th className="num">{t('col.checkedIn')}</th>
            <th>{t('col.fares')}</th>
          </tr>
        </thead>
        <tbody>
          {departures.map((d) => (
            <tr key={d.id}>
              <td>
                <Link href={`/buses/departures/${d.id}`}>{formatDate(d.departsAt, true)}</Link>
              </td>
              <td>
                {d.route.originCity} → {d.route.destinationCity}
              </td>
              <td>
                {d.layout.name}
                {d.vehiclePlate && <span className="small muted"> · {d.vehiclePlate}</span>}
              </td>
              <td>
                <DepartureStatus status={d.status} salesOpen={d.salesOpen} />
              </td>
              <td className="num">{d.seatsSold}</td>
              <td className="num">{d.seatsLeft}</td>
              <td className="num">{d.checkedIn}</td>
              <td className="small">{text.fares(d.fares)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
