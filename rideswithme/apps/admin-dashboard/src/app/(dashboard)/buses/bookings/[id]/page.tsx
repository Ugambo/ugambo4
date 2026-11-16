'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { formatKobo } from '@rideswithme/utilities';
import { useResource } from '@rideswithme/web-core/client';
import { useBusText } from '@/components/bus';
import { ErrorState, InlineError, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import { useCan } from '../../../shell';

export default function AdminBusBookingPage() {
  const { t, formatDate, formatTime } = useI18n();
  const can = useCan();
  const text = useBusText();
  const { id } = useParams<{ id: string }>();
  const b = useResource(() => api().admin.buses.booking(id), [id]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  if (b.loading && !b.data) return <Loading />;
  if (b.error || !b.data) return <ErrorState error={b.error} onRetry={() => void b.reload()} />;
  const booking = b.data;
  const dep = booking.departure;

  const cancel = async (e: FormEvent) => {
    e.preventDefault();
    if (!window.confirm(t('bus.cancelBookingConfirm'))) return;
    setError(null);
    try {
      b.setData(await api().admin.buses.cancelBooking(id, reason));
    } catch (err) {
      setError(err);
    }
  };

  return (
    <>
      <p>
        <Link href="/buses">← {t('common.back')}</Link>
      </p>
      <div className="page-header">
        <h1>{t('bus.booking', { reference: booking.reference })}</h1>
        <span className="pill" data-testid="booking-status">
          {t(`bookingStatus.${booking.status}` as MessageKey)}
        </span>
      </div>
      {booking.cancelledAt && (
        <p className="notice notice-bad">
          {t('bus.cancelledInfo', {
            by: booking.cancelledBy ? t(`cancelledBy.${booking.cancelledBy}` as MessageKey) : '',
            reason: booking.cancelReason ?? '—',
          })}
        </p>
      )}
      <div className="card">
        <dl className="facts">
          <div>
            <dt>{t('bus.col.passenger')}</dt>
            <dd>
              <Link href={`/users/${booking.passenger.id}`}>
                {booking.passenger.name ?? booking.passenger.phone}
              </Link>{' '}
              <span className="small muted">{booking.passenger.phone}</span>
            </dd>
          </div>
          <div>
            <dt>{t('bus.departure')}</dt>
            <dd>
              <Link href={`/buses/departures/${dep.id}`}>
                {dep.route.originCity} → {dep.route.destinationCity},{' '}
                {formatDate(dep.departsAt, true)}
              </Link>{' '}
              · {dep.operator.name}
            </dd>
          </div>
          <div>
            <dt>{t('bus.col.total')}</dt>
            <dd>
              {formatKobo(booking.totalKobo)}
              {booking.paymentMethod &&
                ` · ${t('bus.paidBy', { method: t(`method.${booking.paymentMethod}` as MessageKey) })}`}
              {booking.refundedKobo > 0 &&
                ` · ${t('bus.refunded', { amount: formatKobo(booking.refundedKobo) })}`}
            </dd>
          </div>
        </dl>
      </div>
      <h2>{t('bus.tickets')}</h2>
      <div className="table-wrap">
        <table data-testid="booking-tickets">
          <thead>
            <tr>
              <th>{t('bus.col.seat')}</th>
              <th>{t('bus.col.passenger')}</th>
              <th>{t('bus.col.class')}</th>
              <th className="num">{t('col.fare')}</th>
              <th>{t('bus.col.boarded')}</th>
            </tr>
          </thead>
          <tbody>
            {booking.tickets.map((tk) => (
              <tr key={tk.id}>
                <td>{tk.seatLabel}</td>
                <td>{tk.passengerName}</td>
                <td>{text.seatClass(tk.seatClass)}</td>
                <td className="num">{formatKobo(tk.fareKobo)}</td>
                <td>
                  {tk.checkedInAt
                    ? t('bus.boarded', { time: formatTime(tk.checkedInAt) })
                    : t('bus.notBoarded')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <InlineError error={error} />
      {can('buses.manage') && (booking.status === 'confirmed' || booking.status === 'held') && (
        <form className="card" onSubmit={(e) => void cancel(e)}>
          <h2>{t('bus.cancelBooking')}</h2>
          <div className="field">
            <label htmlFor="booking-reason">{t('bus.reason')}</label>
            <input
              id="booking-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
            />
          </div>
          <button className="btn btn-danger">{t('bus.cancelBooking')}</button>
        </form>
      )}
    </>
  );
}
