'use client';

import Link from 'next/link';
import type { BusPeriodTotals } from '@rideswithme/shared-types';
import { formatKobo } from '@rideswithme/utilities';
import { useResource } from '@rideswithme/web-core/client';
import { addDays, DeparturesTable, lagosToday } from '@/components/bus';
import { api } from '@/lib/api';
import { Empty, ErrorState, Loading, useI18n } from '@/lib/i18n';

export default function BusOverviewPage() {
  const { t } = useI18n();
  const o = useResource(() => api().operator.overview(), []);
  const next = useResource(
    () => api().operator.departures({ from: lagosToday(), to: addDays(lagosToday(), 7) }),
    [],
  );
  if (o.loading && !o.data) return <Loading />;
  if (o.error || !o.data) return <ErrorState error={o.error} onRetry={() => void o.reload()} />;
  const { operator, today, week, balanceKobo, upcomingDepartures } = o.data;
  const Period = ({ label, p, id }: { label: string; p: BusPeriodTotals; id: string }) => (
    <div className="kpi" data-testid={id}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{formatKobo(p.earningsKobo)}</span>
      <span className="kpi-sub">
        {t('bus.earnings')} · {t('bus.seatsSold', { count: p.seatsSold })}
      </span>
      <span className="kpi-sub">{t('bus.fares', { amount: formatKobo(p.faresKobo) })}</span>
    </div>
  );
  return (
    <>
      <div className="page-header">
        <h1>{operator.name}</h1>
        <Link className="btn btn-primary" href="/buses/departures#add">
          {t('departures.add')}
        </Link>
      </div>
      {operator.status === 'suspended' && <p className="notice notice-bad">{t('bus.suspended')}</p>}
      <p className="small muted">
        {t('bus.fee', { percent: String(operator.serviceFeeBps / 100) })}
      </p>
      <section className="kpis">
        <div className="kpi" data-testid="kpi-upcoming">
          <span className="kpi-label">{t('bus.upcoming')}</span>
          <span className="kpi-value">{upcomingDepartures}</span>
        </div>
        <Period label={t('overview.today')} p={today} id="kpi-bus-today" />
        <Period label={t('overview.week')} p={week} id="kpi-bus-week" />
        <div className="kpi" data-testid="kpi-balance">
          <span className="kpi-label">{t('bus.balance')}</span>
          <span className="kpi-value">{formatKobo(balanceKobo)}</span>
          <span className="kpi-sub">{t('bus.balanceSub')}</span>
        </div>
      </section>
      <h2>{t('bus.nextDepartures')}</h2>
      {next.error ? (
        <ErrorState error={next.error} onRetry={() => void next.reload()} />
      ) : !next.data ? (
        <Loading />
      ) : next.data.length === 0 ? (
        <Empty message={t('departures.empty')} />
      ) : (
        <DeparturesTable departures={next.data} />
      )}
    </>
  );
}
