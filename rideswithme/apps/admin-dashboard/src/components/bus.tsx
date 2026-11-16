'use client';

import type { BusDepartureStatus, BusFare, SeatClass } from '@rideswithme/shared-types';
import { formatKobo } from '@rideswithme/utilities';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';

export function useBusText() {
  const { t } = useI18n();
  const seatClass = (c: SeatClass) => t(`seatClass.${c}` as MessageKey);
  return {
    seatClass,
    fares: (fares: BusFare[]) =>
      fares.map((f) => `${seatClass(f.seatClass)} ${formatKobo(f.fareKobo)}`).join(' · '),
  };
}

export function DepartureStatus({ status }: { status: BusDepartureStatus }) {
  const { t } = useI18n();
  const tone = status === 'cancelled' ? 'bad' : status === 'departed' ? 'muted' : 'ok';
  return (
    <span className={`pill pill-${tone}`}>{t(`departureStatus.${status}` as MessageKey)}</span>
  );
}

/** Today's date in Nigeria and `days` later (YYYY-MM-DD). */
export const lagosDate = (days = 0) =>
  new Date(Date.now() + 3_600_000 + days * 86_400_000).toISOString().slice(0, 10);
