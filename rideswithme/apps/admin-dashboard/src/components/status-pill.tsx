'use client';

import type { DriverStatus, RequirementStatus } from '@rideswithme/shared-types';
import { useI18n } from '@/lib/i18n';

const tone: Record<string, string> = {
  approved: 'ok',
  pending: 'wait',
  pending_review: 'wait',
  onboarding: 'muted',
  missing: 'muted',
  rejected: 'bad',
  expired: 'bad',
  suspended: 'bad',
};

export function DriverStatusPill({ status }: { status: DriverStatus }) {
  const { t } = useI18n();
  return <span className={`pill pill-${tone[status]}`}>{t(`driverStatus.${status}`)}</span>;
}

export function DocumentStatusPill({ status }: { status: RequirementStatus }) {
  const { t } = useI18n();
  return <span className={`pill pill-${tone[status]}`}>{t(`docStatus.${status}`)}</span>;
}
