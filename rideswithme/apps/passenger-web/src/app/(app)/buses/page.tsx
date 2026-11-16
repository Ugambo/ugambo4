'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useEffect, useState } from 'react';
import { useResource } from '@rideswithme/web-core/client';
import { cheapest, DepartureHeader, formatKobo, lagosDate } from '@/components/bus-parts';
import { api } from '@/lib/api';
import { Empty, ErrorState, Loading, useI18n } from '@/lib/i18n';

export default function BusesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <BusSearch />
    </Suspense>
  );
}

/** Search by cities and day; the search lives in the address so Back returns to it. */
function BusSearch() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const cities = useResource(() => api().bus.cities(), []);
  const [from, setFrom] = useState(params.get('from') ?? '');
  const [to, setTo] = useState(params.get('to') ?? '');
  const [date, setDate] = useState(params.get('date') ?? lagosDate(1));
  const query = params.get('from') && params.get('to') && params.get('date');
  const results = useResource(
    () =>
      query
        ? api().bus.search({
            from: params.get('from')!,
            to: params.get('to')!,
            date: params.get('date')!,
          })
        : Promise.resolve(null),
    [params.toString()],
  );

  const pairs = cities.data ?? [];
  const origins = [...new Set(pairs.map((p) => p.originCity))];
  const destinations = pairs.filter((p) => p.originCity === from).map((p) => p.destinationCity);
  useEffect(() => {
    if (!from && origins[0]) setFrom(origins[0]);
  }, [from, origins]);
  useEffect(() => {
    if (from && !destinations.includes(to) && destinations[0]) setTo(destinations[0]);
  }, [from, to, destinations]);

  const search = (e: FormEvent) => {
    e.preventDefault();
    router.replace(`/buses?${new URLSearchParams({ from, to, date }).toString()}`);
  };

  if (cities.loading && !cities.data) return <Loading />;
  if (cities.error) return <ErrorState error={cities.error} onRetry={() => void cities.reload()} />;
  return (
    <>
      <section className="card">
        <div className="page-header">
          <h1>{t('bus.title')}</h1>
          <Link href="/buses/bookings" className="btn btn-secondary btn-small">
            {t('bus.myTickets')}
          </Link>
        </div>
        <p className="muted">{t('bus.subtitle')}</p>
        {pairs.length === 0 ? (
          <Empty message={t('bus.noRoutes')} />
        ) : (
          <form className="bus-search" onSubmit={search} data-testid="bus-search">
            <div className="field">
              <label htmlFor="bus-from">{t('bus.from')}</label>
              <select id="bus-from" value={from} onChange={(e) => setFrom(e.target.value)}>
                {origins.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="bus-to">{t('bus.to')}</label>
              <select id="bus-to" value={to} onChange={(e) => setTo(e.target.value)}>
                {destinations.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="bus-date">{t('bus.date')}</label>
              <input
                id="bus-date"
                type="date"
                min={lagosDate()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-primary">{t('bus.search')}</button>
          </form>
        )}
      </section>
      {query && (
        <section className="card" aria-live="polite">
          {results.error ? (
            <ErrorState error={results.error} onRetry={() => void results.reload()} />
          ) : !results.data ? (
            <Loading />
          ) : results.data.length === 0 ? (
            <Empty message={t('bus.noResults')} />
          ) : (
            <ul className="ride-list" data-testid="bus-results">
              {results.data.map((d) => (
                <li key={d.id} className="bus-result">
                  <DepartureHeader d={d} />
                  <span className="bus-result-end">
                    <strong>{t('bus.fromPrice', { amount: formatKobo(cheapest(d)) })}</strong>
                    <span className="small muted">
                      {d.seatsLeft === 0
                        ? t('bus.full')
                        : t('bus.seatsLeft', { count: d.seatsLeft })}
                    </span>
                    {d.salesOpen && d.seatsLeft > 0 ? (
                      <Link
                        className="btn btn-primary btn-small"
                        href={`/buses/departures/${d.id}`}
                      >
                        {t('bus.choose')}
                      </Link>
                    ) : (
                      <span className="pill pill-muted">
                        {d.salesOpen ? t('bus.full') : t('bus.closed')}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
