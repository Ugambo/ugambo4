'use client';

import type { RideStatus } from '@rideswithme/shared-types';
import { useI18n } from '@/lib/i18n';

const tone: Record<RideStatus, string> = {
  requested: 'muted',
  searching: 'wait',
  driver_assigned: 'wait',
  driver_arrived: 'wait',
  in_progress: 'wait',
  completed: 'ok',
  cancelled_by_passenger: 'muted',
  cancelled_by_driver: 'bad',
  no_driver_found: 'bad',
  cancelled_by_admin: 'bad',
};

export function RideStatusPill({ status }: { status: RideStatus }) {
  const { t } = useI18n();
  return <span className={`pill pill-${tone[status]}`}>{t(`rideStatus.${status}`)}</span>;
}
