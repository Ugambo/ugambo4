'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { formatKobo, nairaToKobo } from '@rideswithme/utilities';
import { useResource } from '@rideswithme/web-core/client';
import { DepartureStatus, lagosDate } from '@/components/bus';
import { Empty, ErrorState, InlineError, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import { useCan } from '../../shell';

export default function BusOperatorPage() {
  const { t, formatDate } = useI18n();
  const can = useCan();
  const { id } = useParams<{ id: string }>();
  const op = useResource(() => api().admin.buses.operator(id), [id]);
  const departures = useResource(
    () => api().admin.buses.departures(id, { from: lagosDate(), to: lagosDate(30) }),
    [id],
  );
  const statement = useResource(() => api().admin.buses.statement(id), [id]);
  const [fee, setFee] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (op.data) setFee(String(op.data.serviceFeeBps / 100));
  }, [op.data]);

  if (op.loading && !op.data) return <Loading />;
  if (op.error || !op.data) return <ErrorState error={op.error} onRetry={() => void op.reload()} />;
  const o = op.data;
  const manage = can('buses.manage');

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setError(null);
    setNotice(null);
    try {
      await fn();
      await Promise.all([op.reload(), statement.reload()]);
      if (done) setNotice(done);
      return true;
    } catch (err) {
      setError(err);
      return false;
    }
  };

  return (
    <>
      <p>
        <Link href="/buses">← {t('common.back')}</Link>
      </p>
      <div className="page-header">
        <h1>{o.name}</h1>
        <span
          className={`pill pill-${o.status === 'active' ? 'ok' : 'bad'}`}
          data-testid="operator-status"
        >
          {t(`busStatus.${o.status}` as MessageKey)}
        </span>
        {manage && (
          <button
            type="button"
            className={`btn ${o.status === 'active' ? 'btn-danger' : 'btn-secondary'}`}
            onClick={() =>
              void act(() =>
                api().admin.buses.setStatus(o.id, o.status === 'active' ? 'suspended' : 'active'),
              )
            }
          >
            {t(o.status === 'active' ? 'buses.suspend' : 'buses.reactivate')}
          </button>
        )}
      </div>
      <InlineError error={error} />
      {notice && <p className="notice notice-ok">{notice}</p>}
      <section className="kpis">
        <div className="kpi" data-testid="operator-balance">
          <span className="kpi-label">{t('buses.balance')}</span>
          <span className="kpi-value">{formatKobo(o.balanceKobo)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">{t('buses.fee')}</span>
          <span className="kpi-value">{o.serviceFeeBps / 100}%</span>
        </div>
      </section>

      <h2>{t('buses.managers')}</h2>
      <ul className="plain-list card">
        {o.managers.map((m) => (
          <li key={m.userId}>
            <Link href={`/users/${m.userId}`}>{m.name ?? m.phone}</Link>{' '}
            <span className="small muted">{m.phone}</span>
          </li>
        ))}
      </ul>
      {manage && (
        <div className="cards">
          <form
            className="card"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void act(() => api().admin.buses.addManager(o.id, phone)).then(
                (ok) => ok && setPhone(''),
              );
            }}
          >
            <div className="field">
              <label htmlFor="op-manager">{t('buses.managerPhone')}</label>
              <input
                id="op-manager"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-secondary">{t('buses.addManager')}</button>
          </form>
          <form
            className="card"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void act(
                () =>
                  api().admin.buses.updateOperator(o.id, {
                    serviceFeeBps: Math.round(Number(fee) * 100),
                  }),
                t('buses.feeSaved'),
              );
            }}
          >
            <div className="field">
              <label htmlFor="op-fee">{t('buses.fee')}</label>
              <input
                id="op-fee"
                type="number"
                min={0}
                max={50}
                step={0.01}
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                required
              />
              <span className="hint">{t('buses.feeHint')}</span>
            </div>
            <button className="btn btn-secondary">{t('buses.saveFee')}</button>
          </form>
          <form
            className="card"
            data-testid="settle-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void act(() =>
                api().admin.buses.settle(o.id, { amountKobo: nairaToKobo(amount), note }),
              ).then((ok) => {
                if (ok) {
                  setAmount('');
                  setNote('');
                }
              });
            }}
          >
            <h3>{t('buses.settle')}</h3>
            <p className="small muted">{t('buses.settleHint')}</p>
            <div className="field">
              <label htmlFor="op-amount">{t('buses.settleAmount')}</label>
              <input
                id="op-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="op-note">{t('buses.settleNote')}</label>
              <input
                id="op-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                required
                minLength={3}
              />
            </div>
            <button className="btn btn-primary">{t('buses.settleSubmit')}</button>
          </form>
        </div>
      )}

      <h2>{t('buses.departures')}</h2>
      {(departures.data ?? []).length === 0 ? (
        <Empty message={t('buses.noDepartures')} />
      ) : (
        <div className="table-wrap">
          <table data-testid="operator-departures">
            <thead>
              <tr>
                <th>{t('bus.col.departs')}</th>
                <th>{t('bus.col.route')}</th>
                <th>{t('col.status')}</th>
                <th className="num">{t('bus.col.sold')}</th>
                <th className="num">{t('bus.col.left')}</th>
                <th className="num">{t('bus.col.total')}</th>
              </tr>
            </thead>
            <tbody>
              {departures.data!.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link href={`/buses/departures/${d.id}`}>{formatDate(d.departsAt, true)}</Link>
                  </td>
                  <td>
                    {d.route.originCity} → {d.route.destinationCity}
                  </td>
                  <td>
                    <DepartureStatus status={d.status} />
                  </td>
                  <td className="num">{d.seatsSold}</td>
                  <td className="num">{d.seatsLeft}</td>
                  <td className="num">{formatKobo(d.faresKobo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>{t('buses.statement')}</h2>
      {(statement.data ?? []).length === 0 ? (
        <Empty message={t('common.none')} />
      ) : (
        <div className="table-wrap">
          <table data-testid="operator-statement">
            <tbody>
              {statement.data!.map((l) => (
                <tr key={l.id}>
                  <td>{formatDate(l.createdAt, true)}</td>
                  <td>
                    {t(`entry.${l.kind}` as MessageKey)}
                    {l.memo && <span className="small muted"> · {l.memo}</span>}
                  </td>
                  <td className="num">
                    {l.amountKobo > 0 ? '+' : '−'}
                    {formatKobo(Math.abs(l.amountKobo))}
                  </td>
                  <td className="num">{formatKobo(l.balanceAfterKobo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
