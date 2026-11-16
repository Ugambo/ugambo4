'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { formatKobo, nairaToKobo } from '@rideswithme/utilities';
import { useResource } from '@rideswithme/web-core/client';
import { DepartureStatus, useBusText } from '@/components/bus';
import { api } from '@/lib/api';
import { Empty, ErrorState, InlineError, Loading, useI18n } from '@/lib/i18n';

const naira = (kobo: number) => (kobo / 100).toFixed(kobo % 100 ? 2 : 0);

export default function DeparturePage() {
  const { t, formatDate, formatTime } = useI18n();
  const text = useBusText();
  const { id } = useParams<{ id: string }>();
  const d = useResource(() => api().operator.departure(id), [id]);
  const [fares, setFares] = useState<Record<string, string>>({});
  const [plate, setPlate] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!d.data) return;
    setFares(Object.fromEntries(d.data.fares.map((f) => [f.seatClass, naira(f.fareKobo)])));
    setPlate(d.data.vehiclePlate ?? '');
  }, [d.data]);

  if (d.loading && !d.data) return <Loading />;
  if (d.error || !d.data) return <ErrorState error={d.error} onRetry={() => void d.reload()} />;
  const dep = d.data;
  const editable = dep.status === 'scheduled';

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      d.setData(
        await api().operator.updateDeparture(id, {
          fares: dep.fares.map((f) => ({
            seatClass: f.seatClass,
            fareKobo: nairaToKobo(fares[f.seatClass] ?? ''),
          })),
          vehiclePlate: plate.trim() ? plate : null,
        }),
      );
      setSaved(true);
    } catch (err) {
      setError(err);
    }
  };

  const cancel = async (e: FormEvent) => {
    e.preventDefault();
    if (!window.confirm(t('departure.cancelConfirm'))) return;
    setError(null);
    try {
      d.setData(await api().operator.cancelDeparture(id, reason));
    } catch (err) {
      setError(err);
    }
  };

  return (
    <>
      <p>
        <Link href="/buses/departures">← {t('common.back')}</Link>
      </p>
      <div className="page-header">
        <h1>
          {dep.route.originCity} → {dep.route.destinationCity}
        </h1>
        <DepartureStatus status={dep.status} salesOpen={dep.salesOpen} />
      </div>
      {dep.cancelReason && (
        <p className="notice notice-bad">
          {t('departure.cancelled', { reason: dep.cancelReason })}
        </p>
      )}
      <div className="card">
        <dl className="facts">
          <div>
            <dt>{t('col.departs')}</dt>
            <dd>{formatDate(dep.departsAt, true)}</dd>
          </div>
          <div>
            <dt>{t('routes.originTerminal')}</dt>
            <dd>{dep.route.originTerminal}</dd>
          </div>
          <div>
            <dt>{t('routes.destinationTerminal')}</dt>
            <dd>
              {dep.route.destinationTerminal} · {formatTime(dep.arrivesAt)}
            </dd>
          </div>
          <div>
            <dt>{t('col.bus')}</dt>
            <dd>
              {dep.layout.name}
              {dep.vehiclePlate && ` · ${dep.vehiclePlate}`}
            </dd>
          </div>
          <div>
            <dt>{t('col.fares')}</dt>
            <dd>{text.fares(dep.fares)}</dd>
          </div>
          <div>
            <dt>{t('col.sold')}</dt>
            <dd data-testid="departure-summary">
              {t('departure.summary', {
                sold: dep.seatsSold,
                held: dep.seatsHeld,
                left: dep.seatsLeft,
                total: dep.seatsTotal,
              })}{' '}
              · {formatKobo(dep.faresKobo)}
            </dd>
          </div>
        </dl>
      </div>

      <h2>{t('departure.manifest')}</h2>
      {dep.manifest.length === 0 ? (
        <Empty message={t('departure.manifestEmpty')} />
      ) : (
        <div className="table-wrap">
          <table data-testid="manifest-table">
            <thead>
              <tr>
                <th>{t('col.seat')}</th>
                <th>{t('col.passenger')}</th>
                <th>{t('col.class')}</th>
                <th>{t('col.reference')}</th>
                <th>{t('col.checkedIn')}</th>
              </tr>
            </thead>
            <tbody>
              {dep.manifest.map((m) => (
                <tr key={m.seatLabel}>
                  <td>
                    <strong>{m.seatLabel}</strong>
                  </td>
                  <td>{m.passengerName}</td>
                  <td>{text.seatClass(m.seatClass)}</td>
                  <td>
                    <code>{m.bookingReference}</code>
                  </td>
                  <td>
                    {m.checkedInAt
                      ? t('departure.boarded', { time: formatTime(m.checkedInAt) })
                      : t('departure.notBoarded')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <InlineError error={error} />
      {editable && (
        <>
          <form className="card" onSubmit={(e) => void save(e)} data-testid="departure-edit">
            <h2>{t('departure.edit')}</h2>
            <div className="form-grid">
              {dep.fares.map((f) => (
                <div className="field" key={f.seatClass}>
                  <label htmlFor={`edit-fare-${f.seatClass}`}>
                    {t('departures.fare', { seatClass: text.seatClass(f.seatClass) })}
                  </label>
                  <input
                    id={`edit-fare-${f.seatClass}`}
                    inputMode="decimal"
                    value={fares[f.seatClass] ?? ''}
                    onChange={(e) => setFares((x) => ({ ...x, [f.seatClass]: e.target.value }))}
                    required
                  />
                </div>
              ))}
              <div className="field">
                <label htmlFor="edit-plate">{t('departures.plate')}</label>
                <input id="edit-plate" value={plate} onChange={(e) => setPlate(e.target.value)} />
              </div>
            </div>
            {saved && <p className="notice notice-ok">{t('departure.saved')}</p>}
            <button className="btn btn-primary">{t('departure.save')}</button>
          </form>
          <form className="card" onSubmit={(e) => void cancel(e)} data-testid="departure-cancel">
            <h2>{t('departure.cancel')}</h2>
            <div className="field">
              <label htmlFor="cancel-reason">{t('departure.cancelReason')}</label>
              <input
                id="cancel-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                minLength={3}
                maxLength={300}
              />
            </div>
            <button className="btn btn-danger">{t('departure.cancel')}</button>
          </form>
        </>
      )}
    </>
  );
}
