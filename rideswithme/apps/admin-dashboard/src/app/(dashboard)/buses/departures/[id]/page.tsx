'use client';

import { useParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { formatKobo } from '@rideswithme/utilities';
import { useResource } from '@rideswithme/web-core/client';
import { DepartureStatus, useBusText } from '@/components/bus';
import { Empty, ErrorState, InlineError, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useCan } from '../../../shell';
import Link from 'next/link';

export default function AdminDeparturePage() {
  const { t, formatDate, formatTime } = useI18n();
  const can = useCan();
  const text = useBusText();
  const { id } = useParams<{ id: string }>();
  const d = useResource(() => api().admin.buses.departure(id), [id]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  if (d.loading && !d.data) return <Loading />;
  if (d.error || !d.data) return <ErrorState error={d.error} onRetry={() => void d.reload()} />;
  const dep = d.data;

  const cancel = async (e: FormEvent) => {
    e.preventDefault();
    if (!window.confirm(t('bus.cancelDepartureConfirm'))) return;
    setError(null);
    try {
      d.setData(await api().admin.buses.cancelDeparture(id, reason));
    } catch (err) {
      setError(err);
    }
  };

  return (
    <>
      <p>
        <Link href={`/buses/${dep.operator.id}`}>← {dep.operator.name}</Link>
      </p>
      <div className="page-header">
        <h1>
          {dep.route.originCity} → {dep.route.destinationCity}, {formatDate(dep.departsAt, true)}
        </h1>
        <DepartureStatus status={dep.status} />
      </div>
      {dep.cancelReason && <p className="notice notice-bad">{dep.cancelReason}</p>}
      <div className="card">
        <dl className="facts">
          <div>
            <dt>{t('bus.departure')}</dt>
            <dd>
              {dep.route.originTerminal} → {dep.route.destinationTerminal} (
              {formatTime(dep.arrivesAt)})
            </dd>
          </div>
          <div>
            <dt>{t('bus.col.sold')}</dt>
            <dd>
              {t('bus.summary', {
                sold: dep.seatsSold,
                left: dep.seatsLeft,
                total: dep.seatsTotal,
              })}{' '}
              · {formatKobo(dep.faresKobo)}
            </dd>
          </div>
          <div>
            <dt>{t('col.vehicle')}</dt>
            <dd>
              {dep.layout.name}
              {dep.vehiclePlate && ` · ${dep.vehiclePlate}`}
            </dd>
          </div>
          <div>
            <dt>{t('col.fare')}</dt>
            <dd>{text.fares(dep.fares)}</dd>
          </div>
        </dl>
      </div>
      <h2>{t('bus.manifest')}</h2>
      {dep.manifest.length === 0 ? (
        <Empty message={t('bus.manifestEmpty')} />
      ) : (
        <div className="table-wrap">
          <table data-testid="admin-manifest">
            <thead>
              <tr>
                <th>{t('bus.col.seat')}</th>
                <th>{t('bus.col.passenger')}</th>
                <th>{t('bus.col.class')}</th>
                <th>{t('bus.col.reference')}</th>
                <th>{t('bus.col.boarded')}</th>
              </tr>
            </thead>
            <tbody>
              {dep.manifest.map((m) => (
                <tr key={m.seatLabel}>
                  <td>{m.seatLabel}</td>
                  <td>{m.passengerName}</td>
                  <td>{text.seatClass(m.seatClass)}</td>
                  <td>
                    <code>{m.bookingReference}</code>
                  </td>
                  <td>
                    {m.checkedInAt
                      ? t('bus.boarded', { time: formatTime(m.checkedInAt) })
                      : t('bus.notBoarded')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <InlineError error={error} />
      {can('buses.manage') && dep.status === 'scheduled' && (
        <form className="card" onSubmit={(e) => void cancel(e)}>
          <h2>{t('bus.cancelDeparture')}</h2>
          <div className="field">
            <label htmlFor="dep-reason">{t('bus.reason')}</label>
            <input
              id="dep-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
            />
          </div>
          <button className="btn btn-danger">{t('bus.cancelDeparture')}</button>
        </form>
      )}
    </>
  );
}
