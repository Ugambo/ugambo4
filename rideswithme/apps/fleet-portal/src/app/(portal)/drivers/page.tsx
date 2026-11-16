'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { formatKobo } from '@rideswithme/utilities';
import { useResource } from '@rideswithme/web-core/client';
import { api } from '@/lib/api';
import { Empty, ErrorState, InlineError, Loading, useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';

/** The fleet's drivers and invitations. Drivers accept invitations in the driver app. */
export default function DriversPage() {
  const { t, formatDate } = useI18n();
  const drivers = useResource(() => api().fleet.drivers(), []);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await api().fleet.invite(phone);
      setPhone('');
      setNotice(t('drivers.invited'));
      await drivers.reload();
    } catch (err) {
      setError(err);
    }
  };
  const remove = async (id: string) => {
    if (!window.confirm(t('drivers.removeConfirm'))) return;
    try {
      await api().fleet.remove(id);
      await drivers.reload();
    } catch (err) {
      setError(err);
    }
  };

  if (drivers.loading && !drivers.data) return <Loading />;
  if (drivers.error)
    return <ErrorState error={drivers.error} onRetry={() => void drivers.reload()} />;
  return (
    <>
      <div className="page-header">
        <h1>{t('drivers.title')}</h1>
      </div>
      <form onSubmit={(e) => void invite(e)} className="card" data-testid="invite-form">
        <h2>{t('drivers.invite')}</h2>
        <div className="toolbar">
          <input
            aria-label={t('drivers.invitePhone')}
            placeholder={t('drivers.invitePhone')}
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          <button className="btn btn-primary">{t('drivers.invite')}</button>
        </div>
        <p className="small muted">{t('drivers.inviteHint')}</p>
        <InlineError error={error} />
        {notice && <p className="notice notice-ok">{notice}</p>}
      </form>
      {drivers.data!.length === 0 ? (
        <Empty message={t('drivers.empty')} />
      ) : (
        <div className="table-wrap">
          <table data-testid="drivers-table">
            <thead>
              <tr>
                <th>{t('col.name')}</th>
                <th>{t('col.phone')}</th>
                <th>{t('col.status')}</th>
                <th>{t('col.vehicle')}</th>
                <th className="num">{t('col.today')}</th>
                <th className="num">{t('col.week')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {drivers.data!.map((d) => (
                <tr key={d.userId}>
                  <td>
                    {d.membership.status === 'active' ? (
                      <Link href={`/drivers/${d.userId}`}>{d.name ?? '—'}</Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{d.phone}</td>
                  <td>
                    {d.membership.status === 'invited' ? (
                      <span className="pill pill-muted">{t('drivers.pending')}</span>
                    ) : (
                      <>
                        <span className={`pill pill-${d.online ? 'ok' : 'muted'}`}>
                          {t(d.online ? 'drivers.online' : 'drivers.offline')}
                        </span>
                        {d.driverStatus && d.driverStatus !== 'approved' && (
                          <div className="small muted">
                            {t(`driverStatus.${d.driverStatus}` as MessageKey)}
                          </div>
                        )}
                        {!d.online && d.lastSeenAt && (
                          <div className="small muted">
                            {t('drivers.lastSeen', { time: formatDate(d.lastSeenAt, true) })}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  <td>
                    {d.vehicle
                      ? `${d.vehicle.colour} ${d.vehicle.make} ${d.vehicle.model} · ${d.vehicle.plateNumber}`
                      : '—'}
                  </td>
                  <td className="num">
                    {t('overview.trips', { count: d.today.trips })}
                    <div className="small muted">{formatKobo(d.today.earningsKobo)}</div>
                  </td>
                  <td className="num">
                    {t('overview.trips', { count: d.week.trips })}
                    <div className="small muted">{formatKobo(d.week.earningsKobo)}</div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => void remove(d.userId)}
                    >
                      {t('drivers.remove')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
