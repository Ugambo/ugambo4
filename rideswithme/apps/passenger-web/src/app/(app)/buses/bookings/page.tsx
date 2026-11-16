'use client';

import Link from 'next/link';
import { useResource } from '@rideswithme/web-core/client';
import { BookingStatus, formatKobo } from '@/components/bus-parts';
import { api } from '@/lib/api';
import { Empty, ErrorState, Loading, useI18n } from '@/lib/i18n';

export default function BusBookingsPage() {
  const { t, formatDate } = useI18n();
  const list = useResource(() => api().bus.bookings(), []);
  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <ErrorState error={list.error} onRetry={() => void list.reload()} />;
  return (
    <section className="card">
      <p>
        <Link href="/buses">← {t('bus.back')}</Link>
      </p>
      <h1>{t('bus.myTickets')}</h1>
      {list.data!.length === 0 ? (
        <Empty message={t('bus.noTickets')} />
      ) : (
        <ul className="ride-list" data-testid="bus-bookings">
          {list.data!.map((b) => (
            <li key={b.id}>
              <Link href={`/buses/bookings/${b.id}`} className="ride-row">
                <span className="ride-row-main">
                  <strong>
                    {b.departure.route.originCity} → {b.departure.route.destinationCity}
                  </strong>
                  <span className="small muted">
                    {formatDate(b.departure.departsAt, true)} · {b.departure.operator.name} ·{' '}
                    {b.tickets.map((x) => x.seatLabel).join(', ')}
                  </span>
                </span>
                <BookingStatus b={b} />
                <span className="num">{formatKobo(b.totalKobo)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
