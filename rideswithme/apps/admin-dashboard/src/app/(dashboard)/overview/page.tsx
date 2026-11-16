'use client';

import { formatKobo } from '@rideswithme/utilities';
import { useResource } from '@rideswithme/web-core/client';
import { BarChart } from '@/components/bar-chart';
import { Kpi } from '@/components/kpi';
import { ErrorState, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/** KPI tiles and the last 14 days. Trips and revenue are separate charts (never two scales on one). */
export default function OverviewPage() {
  const { t } = useI18n();
  const dash = useResource(() => api().admin.dashboard(), []);
  if (dash.loading && !dash.data) return <Loading />;
  if (dash.error || !dash.data)
    return <ErrorState error={dash.error} onRetry={() => void dash.reload()} />;
  const { kpis, days } = dash.data;
  return (
    <>
      <div className="page-header">
        <h1>{t('overview.title')}</h1>
      </div>
      <section className="kpis" aria-label={t('overview.title')}>
        <Kpi
          label={t('kpi.riders')}
          value={kpis.riders.toLocaleString('en-NG')}
          sub={t('kpi.newToday', { count: kpis.newRidersToday })}
        />
        <Kpi
          label={t('kpi.drivers')}
          value={kpis.drivers.toLocaleString('en-NG')}
          sub={t('kpi.online', { count: kpis.driversOnline })}
        />
        <Kpi
          label={t('kpi.trips')}
          value={kpis.tripsToday.toLocaleString('en-NG')}
          sub={t('kpi.active', { count: kpis.activeRides })}
        />
        <Kpi
          label={t('kpi.revenue')}
          value={formatKobo(kpis.revenueTodayKobo)}
          sub={t('kpi.fares', { amount: formatKobo(kpis.faresTodayKobo) })}
        />
        <Kpi
          label={t('kpi.disputes')}
          value={kpis.openDisputes}
          tone={kpis.openDisputes > 0 ? 'bad' : undefined}
        />
      </section>
      <section className="charts">
        <BarChart
          title={t('chart.trips')}
          valueLabel={t('chart.colTrips')}
          data={days.map((d) => ({ date: d.date, value: d.trips }))}
          format={(v) => Math.round(v).toLocaleString('en-NG')}
          integer
        />
        <BarChart
          title={t('chart.revenue')}
          valueLabel={t('chart.colRevenue')}
          data={days.map((d) => ({ date: d.date, value: d.revenueKobo }))}
          format={(v) => formatKobo(Math.round(v))}
        />
      </section>
    </>
  );
}
