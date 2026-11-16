'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { formatKobo } from '@rideswithme/utilities';
import { useResource } from '@rideswithme/web-core/client';
import { Empty, ErrorState, InlineError, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useCan } from '../../shell';

export default function FleetPage() {
  const { t } = useI18n();
  const can = useCan();
  const { id } = useParams<{ id: string }>();
  const fleet = useResource(() => api().admin.fleets.get(id), [id]);
  const drivers = useResource(() => api().admin.fleets.drivers(id), [id]);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<unknown>(null);

  if (fleet.loading && !fleet.data) return <Loading />;
  if (fleet.error || !fleet.data)
    return <ErrorState error={fleet.error} onRetry={() => void fleet.reload()} />;
  const f = fleet.data;

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await fleet.reload();
    } catch (err) {
      setError(err);
    }
  };
  const addManager = (e: FormEvent) => {
    e.preventDefault();
    void act(() => api().admin.fleets.addManager(f.id, phone)).then(() => setPhone(''));
  };

  return (
    <>
      <div className="page-header">
        <h1>{f.name}</h1>
        <span
          className={`pill pill-${f.status === 'active' ? 'ok' : 'bad'}`}
          data-testid="fleet-status"
        >
          {t(`fleetStatus.${f.status}`)}
        </span>
        {can('fleets.manage') && (
          <button
            type="button"
            className={`btn ${f.status === 'active' ? 'btn-danger' : 'btn-secondary'}`}
            onClick={() =>
              void act(() =>
                api().admin.fleets.setStatus(f.id, f.status === 'active' ? 'suspended' : 'active'),
              )
            }
          >
            {t(f.status === 'active' ? 'fleets.suspend' : 'fleets.reactivate')}
          </button>
        )}
      </div>
      <InlineError error={error} />
      <h2>{t('fleets.managers')}</h2>
      <ul className="plain-list card">
        {f.managers.map((m) => (
          <li key={m.userId}>
            <Link href={`/users/${m.userId}`}>{m.name ?? m.phone}</Link>{' '}
            <span className="small muted">{m.phone}</span>
          </li>
        ))}
      </ul>
      {can('fleets.manage') && (
        <form onSubmit={addManager} className="toolbar">
          <input
            aria-label={t('fleets.managerPhone')}
            placeholder={t('fleets.managerPhone')}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          <button className="btn btn-secondary">{t('fleets.addManager')}</button>
        </form>
      )}
      <h2>{t('fleets.drivers')}</h2>
      {(drivers.data ?? []).length === 0 ? (
        <Empty message={t('fleets.noDrivers')} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('col.name')}</th>
                <th>{t('col.phone')}</th>
                <th>{t('col.status')}</th>
                <th className="num">{t('kpi.trips')}</th>
                <th className="num">{t('col.fare')}</th>
              </tr>
            </thead>
            <tbody>
              {drivers.data!.map((d) => (
                <tr key={d.userId}>
                  <td>{d.name ? <Link href={`/users/${d.userId}`}>{d.name}</Link> : '—'}</td>
                  <td>{d.phone}</td>
                  <td>
                    {t(d.membership.status === 'active' ? 'member.active' : 'member.invited')}
                  </td>
                  <td className="num">{d.today.trips}</td>
                  <td className="num">{formatKobo(d.week.faresKobo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
