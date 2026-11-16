'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { AdminSosAlertView } from '@rideswithme/shared-types';
import { useResource } from '@rideswithme/web-core/client';
import { Empty, ErrorState, InlineError, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import { useCan } from '../shell';

/** SOS alerts: who, where (with a map link), the ride and both phone numbers to call. */
export default function SosPage() {
  const { t, formatDate } = useI18n();
  const can = useCan();
  const [showResolved, setShowResolved] = useState(false);
  const alerts = useResource(
    () => api().admin.safety.sos(showResolved ? undefined : 'open'),
    [showResolved],
  );
  if (alerts.loading && !alerts.data) return <Loading />;
  if (alerts.error) return <ErrorState error={alerts.error} onRetry={() => void alerts.reload()} />;
  return (
    <>
      <div className="page-header">
        <h1>{t('sos.title')}</h1>
        <label className="small">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
          />{' '}
          {t('sos.showResolved')}
        </label>
      </div>
      {alerts.data!.length === 0 ? (
        <Empty message={t('sos.none')} />
      ) : (
        <div className="cards">
          {alerts.data!.map((a) => (
            <AlertCard
              key={a.id}
              a={a}
              canManage={can('safety.manage')}
              onChange={() => void alerts.reload()}
              formatDate={formatDate}
            />
          ))}
        </div>
      )}
    </>
  );
}

function AlertCard({
  a,
  canManage,
  onChange,
  formatDate,
}: {
  a: AdminSosAlertView;
  canManage: boolean;
  onChange: () => void;
  formatDate: (iso: string | null, withTime?: boolean) => string;
}) {
  const { t } = useI18n();
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      onChange();
    } catch (err) {
      setError(err);
    }
  };
  const person = (p: { name: string | null; phone: string | null }) => (
    <>
      {p.name ?? '—'}{' '}
      {p.phone && (
        <a href={`tel:${p.phone}`} className="small">
          {p.phone}
        </a>
      )}
    </>
  );
  return (
    <section className={`card${a.status === 'open' ? ' card-alert' : ''}`} data-testid="sos-card">
      <div className="page-header">
        <h2>{person(a.user)}</h2>
        <span
          className={`pill pill-${a.status === 'resolved' ? 'muted' : a.status === 'open' ? 'bad' : 'wait'}`}
        >
          {t(`sosStatus.${a.status}` as MessageKey)}
        </span>
      </div>
      <p className="small muted">
        {formatDate(a.createdAt, true)} ·{' '}
        {t('sos.raisedAs', { role: t(`sos.${a.raisedAs}` as MessageKey) })}
        {a.presses > 1 && ` · ${t('sos.presses', { count: a.presses })}`}
      </p>
      <dl className="facts">
        <div>
          <dt>{t('sos.location')}</dt>
          <dd>
            {a.location ? (
              <>
                <a
                  href={`https://maps.google.com/?q=${a.location.lat},${a.location.lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('sos.map')}
                </a>{' '}
                <span className="small muted">
                  {t(`sos.locationSource.${a.location.source}` as MessageKey)}
                  {a.location.recordedAt && ` · ${formatDate(a.location.recordedAt, true)}`}
                </span>
              </>
            ) : (
              t('sos.noLocation')
            )}
          </dd>
        </div>
        {a.note && (
          <div>
            <dt>{t('sos.note')}</dt>
            <dd>{a.note}</dd>
          </div>
        )}
        {a.ride && (
          <>
            <div>
              <dt>{t('sos.ride')}</dt>
              <dd>
                <Link href={`/rides/${a.ride.id}`}>
                  {a.ride.pickupAddress} → {a.ride.dropoffAddress}
                </Link>
              </dd>
            </div>
            <div>
              <dt>{t('sos.passenger')}</dt>
              <dd>{person(a.ride.passenger)}</dd>
            </div>
            {a.ride.driver && (
              <div>
                <dt>{t('sos.driver')}</dt>
                <dd>
                  {person(a.ride.driver)}{' '}
                  {a.ride.driver.plate && <strong>{a.ride.driver.plate}</strong>}
                </dd>
              </div>
            )}
          </>
        )}
      </dl>
      {a.acknowledgedBy && (
        <p className="small">{t('sos.acknowledgedBy', { name: a.acknowledgedBy })}</p>
      )}
      {a.resolutionNote && <p className="small">{a.resolutionNote}</p>}
      <InlineError error={error} />
      {canManage && a.status === 'open' && (
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => void act(() => api().admin.safety.acknowledge(a.id))}
        >
          {t('sos.acknowledge')}
        </button>
      )}
      {canManage && a.status !== 'resolved' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(() => api().admin.safety.resolve(a.id, note));
          }}
        >
          <div className="field">
            <label htmlFor={`resolve-${a.id}`}>{t('sos.resolution')}</label>
            <input
              id={`resolve-${a.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required
              minLength={3}
            />
          </div>
          <button className="btn btn-secondary">{t('sos.resolve')}</button>
        </form>
      )}
    </section>
  );
}
