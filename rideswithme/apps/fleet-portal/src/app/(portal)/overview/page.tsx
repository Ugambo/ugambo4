'use client';

import type { FleetPeriodTotals } from '@rideswithme/shared-types';
import { formatKobo } from '@rideswithme/utilities';
import { useResource } from '@rideswithme/web-core/client';
import { api } from '@/lib/api';
import { ErrorState, Loading, useI18n } from '@/lib/i18n';

export default function OverviewPage() {
  const { t } = useI18n();
  const o = useResource(() => api().fleet.overview(), []);
  if (o.loading && !o.data) return <Loading />;
  if (o.error || !o.data) return <ErrorState error={o.error} onRetry={() => void o.reload()} />;
  const { drivers, today, week, fleet } = o.data;
  const Period = ({ label, p, id }: { label: string; p: FleetPeriodTotals; id: string }) => (
    <div className="kpi" data-testid={id}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{formatKobo(p.earningsKobo)}</span>
      <span className="kpi-sub">
        {t('overview.earnings')} · {t('overview.trips', { count: p.trips })}
      </span>
      <span className="kpi-sub">
        {t('overview.fares', { amount: formatKobo(p.faresKobo) })} ·{' '}
        {t('overview.commission', { amount: formatKobo(p.commissionKobo) })}
      </span>
    </div>
  );
  return (
    <>
      <div className="page-header">
        <h1>{fleet.name}</h1>
      </div>
      {fleet.status === 'suspended' && (
        <p className="notice notice-bad">{t('overview.suspended')}</p>
      )}
      <section className="kpis">
        <div className="kpi" data-testid="kpi-drivers">
          <span className="kpi-label">{t('overview.drivers')}</span>
          <span className="kpi-value">{drivers.active}</span>
          <span className="kpi-sub">
            {t('overview.driversSub', {
              online: drivers.online,
              onTrip: drivers.onTrip,
              invited: drivers.invited,
            })}
          </span>
        </div>
        <Period label={t('overview.today')} p={today} id="kpi-today" />
        <Period label={t('overview.week')} p={week} id="kpi-week" />
      </section>
    </>
  );
}
