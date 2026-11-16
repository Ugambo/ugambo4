'use client';

import type { BusBookingView, BusDepartureSummary, SeatClass } from '@rideswithme/shared-types';
import { formatKobo, type PassengerMessageKey } from '@rideswithme/utilities';
import { useI18n } from '@/lib/i18n';

export const lagosDate = (days = 0) =>
  new Date(Date.now() + 3_600_000 + days * 86_400_000).toISOString().slice(0, 10);

export function useSeatClass() {
  const { t } = useI18n();
  return (c: SeatClass) => t(`bus.class.${c}` as PassengerMessageKey);
}

/** Times, terminals, operator and bus for one departure. */
export function DepartureHeader({ d }: { d: BusDepartureSummary }) {
  const { t, formatDate, formatTime } = useI18n();
  return (
    <div className="bus-head">
      <strong>
        {formatDate(d.departsAt, true)} · {d.route.originCity} → {d.route.destinationCity}
      </strong>
      <span className="small muted">
        {d.route.originTerminal} → {d.route.destinationTerminal} ·{' '}
        {t('bus.arrives', { time: formatTime(d.arrivesAt) })}
      </span>
      <span className="small muted">
        {d.operator.name}
        {d.vehiclePlate && ` · ${t('bus.plate', { plate: d.vehiclePlate })}`}
      </span>
    </div>
  );
}

const TONE: Record<BusBookingView['status'], string> = {
  held: 'pill-wait',
  confirmed: 'pill-ok',
  expired: 'pill-muted',
  cancelled: 'pill-bad',
};

export function BookingStatus({ b }: { b: BusBookingView }) {
  const { t } = useI18n();
  if (b.status === 'confirmed' && b.departure.status === 'departed')
    return <span className="pill pill-muted">{t('bus.departed')}</span>;
  return (
    <span className={`pill ${TONE[b.status]}`} data-testid="booking-status">
      {t(`bus.status.${b.status}` as PassengerMessageKey)}
    </span>
  );
}

export function cheapest(d: BusDepartureSummary) {
  return Math.min(...d.fares.map((f) => f.fareKobo));
}

export { formatKobo };
