'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { ApiError, newIdempotencyKey } from '@rideswithme/api-client';
import { ROLE_KEYS, type RoleKey, type WalletEntryView } from '@rideswithme/shared-types';
import { formatKobo, nairaToKobo } from '@rideswithme/utilities';
import { useResource } from '@rideswithme/web-core/client';
import { Modal } from '@/components/modal';
import { RideStatusPill } from '@/components/ride-status';
import { ErrorState, InlineError, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useCan } from '../../shell';

/** One person: roles, account status, wallets (with adjustments) and recent rides. Every change is audited. */
export default function UserPage() {
  const { t, formatDate } = useI18n();
  const can = useCan();
  const { id } = useParams<{ id: string }>();
  const user = useResource(() => api().admin.getUser(id), [id]);
  const wallets = useResource(
    () => (can('payments.read') ? api().admin.payments.userWallets(id) : Promise.resolve(null)),
    [id],
  );
  const rides = useResource(async () => {
    const [asPassenger, asDriver] = await Promise.all([
      api().admin.rides.list({ passengerId: id, limit: 10 }),
      api().admin.rides.list({ driverId: id, limit: 10 }),
    ]);
    return [...asPassenger.items, ...asDriver.items]
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
      .slice(0, 10);
  }, [id]);
  const [role, setRole] = useState<RoleKey>('driver');
  const [suspending, setSuspending] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<'passenger' | 'driver'>('passenger');
  const [adjustKey, setAdjustKey] = useState(newIdempotencyKey);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (user.loading && !user.data) return <Loading />;
  if (user.error || !user.data)
    return <ErrorState error={user.error} onRetry={() => void user.reload()} />;
  const u = user.data;

  async function act(fn: () => Promise<unknown>, after?: () => void) {
    setError(null);
    setNotice(null);
    try {
      await fn();
      after?.();
      await Promise.all([user.reload(), wallets.reload()]);
    } catch (err) {
      setError(err);
    }
  }

  const suspend = (e: FormEvent) => {
    e.preventDefault();
    void act(
      () => api().admin.suspendUser(u.id, reason),
      () => setSuspending(false),
    );
  };

  const adjust = (e: FormEvent) => {
    e.preventDefault();
    void act(async () => {
      let amountKobo: number;
      try {
        amountKobo = nairaToKobo(amount);
      } catch {
        throw new ApiError(0, 'VALIDATION_FAILED', 'Not an amount');
      }
      await api().admin.payments.adjustWallet(u.id, { amountKobo, kind, reason }, adjustKey);
      setAdjusting(false);
      setAdjustKey(newIdempotencyKey());
      setNotice(t('user.adjustDone'));
    });
  };

  const Entries = ({ entries }: { entries: WalletEntryView[] }) => (
    <ul className="plain-list small">
      {entries.slice(0, 5).map((e) => (
        <li key={e.id}>
          {formatDate(e.createdAt, true)} · {e.kind} · {e.amountKobo > 0 ? '+' : '−'}
          {formatKobo(Math.abs(e.amountKobo))}
          {e.memo ? ` · ${e.memo}` : ''}
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <div className="page-header">
        <h1>{u.fullName ?? t('drivers.unnamed')}</h1>
        <span
          className={`pill pill-${u.status === 'active' ? 'ok' : 'bad'}`}
          data-testid="user-status"
        >
          {t(`userStatus.${u.status}`)}
        </span>
        {can('users.manage') &&
          (u.status === 'active' ? (
            <button type="button" className="btn btn-danger" onClick={() => setSuspending(true)}>
              {t('user.suspend')}
            </button>
          ) : u.status === 'suspended' ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void act(() => api().admin.reactivateUser(u.id))}
            >
              {t('user.reactivate')}
            </button>
          ) : null)}
      </div>
      {notice && <p className="notice notice-ok">{notice}</p>}
      <InlineError error={error} />
      <div className="card">
        <dl className="facts">
          <div>
            <dt>{t('col.phone')}</dt>
            <dd>{u.phone ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('col.joined')}</dt>
            <dd>{formatDate(u.createdAt)}</dd>
          </div>
        </dl>
      </div>

      <h2>{t('user.roles')}</h2>
      <div className="card">
        <ul className="plain-list" data-testid="user-roles">
          {u.roles.map((r) => (
            <li key={r} className="row-between">
              {t(`role.${r}`)}
              {can('roles.assign') && (
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => void act(() => api().admin.removeRole(u.id, r))}
                >
                  {t('user.removeRole')}
                </button>
              )}
            </li>
          ))}
        </ul>
        {can('roles.assign') && (
          <div className="toolbar">
            <select
              aria-label={t('user.addRole')}
              value={role}
              onChange={(e) => setRole(e.target.value as RoleKey)}
            >
              {ROLE_KEYS.filter((r) => !u.roles.includes(r)).map((r) => (
                <option key={r} value={r}>
                  {t(`role.${r}`)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void act(() => api().admin.assignRole(u.id, role))}
            >
              {t('user.addRole')}
            </button>
          </div>
        )}
      </div>

      {wallets.data && (
        <>
          <h2>{t('user.wallets')}</h2>
          <div className="charts">
            <div className="card" data-testid="passenger-wallet">
              <h3>{t('user.passengerWallet')}</h3>
              <p className="kpi-value">{formatKobo(wallets.data.passenger.balanceKobo)}</p>
              {wallets.data.passenger.owedKobo > 0 && (
                <p className="inline-error">
                  {t('user.owes', { amount: formatKobo(wallets.data.passenger.owedKobo) })}
                </p>
              )}
              <Entries entries={wallets.data.passenger.recent} />
            </div>
            <div className="card" data-testid="driver-wallet">
              <h3>{t('user.driverWallet')}</h3>
              <p className="kpi-value">{formatKobo(wallets.data.driver.balanceKobo)}</p>
              <Entries entries={wallets.data.driver.recent} />
            </div>
          </div>
          {can('wallets.adjust') && (
            <button type="button" className="btn btn-secondary" onClick={() => setAdjusting(true)}>
              {t('user.adjust')}
            </button>
          )}
        </>
      )}

      <h2>{t('user.rides')}</h2>
      <ul className="plain-list">
        {(rides.data ?? []).map((r) => (
          <li key={r.id} className="row-between">
            <Link href={`/rides/${r.id}`}>
              {formatDate(r.requestedAt, true)} · {r.dropoff.name ?? r.dropoff.address}
            </Link>
            <RideStatusPill status={r.status} />
          </li>
        ))}
      </ul>

      <Modal title={t('user.suspend')} open={suspending} onClose={() => setSuspending(false)}>
        <form onSubmit={suspend}>
          <div className="field">
            <label htmlFor="suspend-reason">{t('user.suspendReason')}</label>
            <textarea
              id="suspend-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
              rows={2}
            />
          </div>
          <InlineError error={error} />
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setSuspending(false)}
            >
              {t('common.cancel')}
            </button>
            <button className="btn btn-danger">{t('user.suspend')}</button>
          </div>
        </form>
      </Modal>
      <Modal title={t('user.adjust')} open={adjusting} onClose={() => setAdjusting(false)}>
        <form onSubmit={adjust}>
          <div className="field">
            <label htmlFor="adjust-kind">{t('user.wallets')}</label>
            <select
              id="adjust-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as 'passenger' | 'driver')}
            >
              <option value="passenger">{t('user.passengerWallet')}</option>
              <option value="driver">{t('user.driverWallet')}</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="adjust-amount">{t('user.adjustAmount')}</label>
            <input
              id="adjust-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="adjust-reason">{t('col.reason')}</label>
            <textarea
              id="adjust-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
              rows={2}
            />
          </div>
          <InlineError error={error} />
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setAdjusting(false)}>
              {t('common.cancel')}
            </button>
            <button className="btn btn-primary">{t('common.save')}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
