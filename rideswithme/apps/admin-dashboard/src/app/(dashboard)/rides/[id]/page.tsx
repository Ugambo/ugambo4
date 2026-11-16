'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { ACTIVE_RIDE_STATUSES, type PaymentView } from '@rideswithme/shared-types';
import { formatKobo } from '@rideswithme/utilities';
import { useResource } from '@rideswithme/web-core/client';
import { Modal } from '@/components/modal';
import { RefundForm } from '@/components/refund-form';
import { RideStatusPill } from '@/components/ride-status';
import { ErrorState, InlineError, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import { useCan } from '../../shell';

/** One ride: who, where, money, and every event in order. Staff can stop a stuck ride. */
export default function RidePage() {
  const { t, formatDate } = useI18n();
  const can = useCan();
  const { id } = useParams<{ id: string }>();
  const ride = useResource(() => api().admin.rides.get(id), [id]);
  const payments = useResource(() => api().admin.payments.list({ rideId: id }), [id]);
  const [stopping, setStopping] = useState(false);
  const [refunding, setRefunding] = useState<PaymentView | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (ride.loading && !ride.data) return <Loading />;
  if (ride.error || !ride.data)
    return <ErrorState error={ride.error} onRetry={() => void ride.reload()} />;
  const r = ride.data;
  const active = ACTIVE_RIDE_STATUSES.includes(r.status);

  const stop = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api().admin.rides.cancel(r.id, { reason });
      setStopping(false);
      await Promise.all([ride.reload(), payments.reload()]);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <h1>
          {t('ride.title')} · {r.category.name}
        </h1>
        <RideStatusPill status={r.status} />
        {active && can('rides.manage') && (
          <button type="button" className="btn btn-danger" onClick={() => setStopping(true)}>
            {t('ride.stop')}
          </button>
        )}
      </div>
      <div className="card">
        <dl className="facts">
          <div>
            <dt>{t('ride.passenger')}</dt>
            <dd>
              <Link href={`/users/${r.passengerId}`}>{r.passengerId.slice(0, 8)}</Link>
            </dd>
          </div>
          <div>
            <dt>{t('col.driver')}</dt>
            <dd>
              {r.driverId ? (
                <Link href={`/users/${r.driverId}`}>
                  {r.driver?.firstName ?? r.driverId.slice(0, 8)}
                </Link>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt>{t('col.route')}</dt>
            <dd>
              {r.pickup.address} → {r.dropoff.address}
            </dd>
          </div>
          <div>
            <dt>{t('col.fare')}</dt>
            <dd>
              {formatKobo(r.fare.finalTotalKobo ?? r.fare.quotedTotalKobo)} ·{' '}
              {t(`method.${r.paymentMethod}`)}
            </dd>
          </div>
        </dl>
        {r.cancellationReason && (
          <p className="small">
            {t('col.reason')}: {r.cancellationReason}
          </p>
        )}
      </div>

      <h2>{t('ride.payments')}</h2>
      <div className="table-wrap">
        <table data-testid="ride-payments">
          <thead>
            <tr>
              <th>{t('col.purpose')}</th>
              <th>{t('col.method')}</th>
              <th>{t('col.status')}</th>
              <th className="num">{t('col.amount')}</th>
              <th className="num">{t('payment.refunds')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(payments.data ?? []).map((p) => (
              <tr key={p.id}>
                <td>{t(`purpose.${p.purpose}`)}</td>
                <td>{t(`method.${p.method}`)}</td>
                <td>{t(`paymentStatus.${p.status}`)}</td>
                <td className="num">{formatKobo(p.amountKobo)}</td>
                <td className="num">{formatKobo(p.refundedKobo)}</td>
                <td>
                  {can('payments.refund') && (
                    <button
                      type="button"
                      className="btn btn-small btn-secondary"
                      onClick={() => setRefunding(p)}
                    >
                      {t('payment.refund')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>{t('ride.timeline')}</h2>
      <ol className="timeline" data-testid="timeline">
        {r.events.map((e) => (
          <li key={e.id}>
            <span className="small muted">{formatDate(e.createdAt, true)}</span>
            <strong>{e.toStatus ? t(`rideStatus.${e.toStatus}`) : e.eventType}</strong>
            <span className="small muted">
              {e.eventType} · {t('ride.actor', { actor: t(`actor.${e.actorType}` as MessageKey) })}
            </span>
          </li>
        ))}
      </ol>

      <Modal title={t('ride.stopTitle')} open={stopping} onClose={() => setStopping(false)}>
        <form onSubmit={(e) => void stop(e)}>
          <p>{t('ride.stopHint')}</p>
          <div className="field">
            <label htmlFor="stop-reason">{t('col.reason')}</label>
            <textarea
              id="stop-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={3}
              required
              rows={2}
            />
          </div>
          <InlineError error={error} />
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setStopping(false)}>
              {t('common.cancel')}
            </button>
            <button className="btn btn-danger" disabled={busy}>
              {t('ride.stop')}
            </button>
          </div>
        </form>
      </Modal>
      <Modal title={t('payment.refund')} open={!!refunding} onClose={() => setRefunding(null)}>
        {refunding && (
          <RefundForm
            payment={refunding}
            onDone={() => {
              setRefunding(null);
              void payments.reload();
            }}
          />
        )}
      </Modal>
    </>
  );
}
