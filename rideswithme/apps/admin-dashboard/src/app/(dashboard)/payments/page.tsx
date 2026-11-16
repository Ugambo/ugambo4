'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import type { DisputeView, PaymentStatus, PaymentView } from '@rideswithme/shared-types';
import { formatKobo, nairaToKobo } from '@rideswithme/utilities';
import { useResource } from '@rideswithme/web-core/client';
import { Modal } from '@/components/modal';
import { RefundForm } from '@/components/refund-form';
import { Empty, ErrorState, InlineError, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import { useCan } from '../shell';

type Tab = 'payments' | 'disputes' | 'payouts' | 'ledger';
const STATUSES: PaymentStatus[] = [
  'pending',
  'succeeded',
  'collected',
  'outstanding',
  'failed',
  'abandoned',
];

/** Payments, refunds, disputes, payouts and the ledger check. */
export default function PaymentsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('payments');
  return (
    <>
      <div className="page-header">
        <h1>{t('payments.title')}</h1>
      </div>
      <div className="tabs" role="tablist">
        {(['payments', 'disputes', 'payouts', 'ledger'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
          >
            {t(`tab.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'payments' && <Payments />}
      {tab === 'disputes' && <Disputes />}
      {tab === 'payouts' && <Payouts />}
      {tab === 'ledger' && <Ledger />}
    </>
  );
}

function Payments() {
  const { t, formatDate } = useI18n();
  const can = useCan();
  const [status, setStatus] = useState<PaymentStatus | ''>('');
  const list = useResource(() => api().admin.payments.list(status ? { status } : {}), [status]);
  const [refunding, setRefunding] = useState<PaymentView | null>(null);
  return (
    <>
      <div className="toolbar">
        <label htmlFor="pay-status">{t('payments.filter')}</label>
        <select
          id="pay-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as PaymentStatus | '')}
        >
          <option value="">{t('common.all')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`paymentStatus.${s}`)}
            </option>
          ))}
        </select>
      </div>
      {list.loading && !list.data ? (
        <Loading />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => void list.reload()} />
      ) : list.data!.length === 0 ? (
        <Empty message={t('payments.empty')} />
      ) : (
        <div className="table-wrap">
          <table data-testid="payments-table">
            <thead>
              <tr>
                <th>{t('col.when')}</th>
                <th>{t('col.purpose')}</th>
                <th>{t('col.method')}</th>
                <th>{t('col.status')}</th>
                <th className="num">{t('col.amount')}</th>
                <th className="num">{t('payment.refunds')}</th>
                <th>{t('col.ride')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data!.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.createdAt, true)}</td>
                  <td>{t(`purpose.${p.purpose}`)}</td>
                  <td>{t(`method.${p.method}`)}</td>
                  <td>
                    {t(`paymentStatus.${p.status}`)}
                    {p.outstandingKobo > 0 && ` (${formatKobo(p.outstandingKobo)})`}
                  </td>
                  <td className="num">{formatKobo(p.amountKobo)}</td>
                  <td className="num">{formatKobo(p.refundedKobo)}</td>
                  <td>
                    {p.rideId ? (
                      <Link href={`/rides/${p.rideId}`}>{p.rideId.slice(0, 8)}</Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {can('payments.refund') && p.rideId && (
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
      )}
      <Modal title={t('payment.refund')} open={!!refunding} onClose={() => setRefunding(null)}>
        {refunding && (
          <RefundForm
            payment={refunding}
            onDone={() => {
              setRefunding(null);
              void list.reload();
            }}
          />
        )}
      </Modal>
    </>
  );
}

function Disputes() {
  const { t, formatDate } = useI18n();
  const can = useCan();
  const list = useResource(() => api().admin.payments.disputes('open'), []);
  const [resolving, setResolving] = useState<DisputeView | null>(null);
  const [outcome, setOutcome] = useState<'refund' | 'reject'>('refund');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);

  const resolve = async (e: FormEvent) => {
    e.preventDefault();
    if (!resolving) return;
    setError(null);
    try {
      await api().admin.payments.resolveDispute(
        resolving.id,
        outcome === 'refund'
          ? { outcome, amountKobo: nairaToKobo(amount), note }
          : { outcome, note },
      );
      setResolving(null);
      await list.reload();
    } catch (err) {
      setError(err);
    }
  };

  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <ErrorState error={list.error} onRetry={() => void list.reload()} />;
  if (list.data!.length === 0) return <Empty message={t('disputes.empty')} />;
  return (
    <>
      <div className="table-wrap">
        <table data-testid="disputes-table">
          <thead>
            <tr>
              <th>{t('col.when')}</th>
              <th>{t('col.purpose')}</th>
              <th>{t('col.reason')}</th>
              <th className="num">{t('col.amount')}</th>
              <th>{t('col.ride')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.data!.map((d) => (
              <tr key={d.id}>
                <td>{formatDate(d.createdAt, true)}</td>
                <td>{t(`dispute.source.${d.source}` as MessageKey)}</td>
                <td>
                  {d.reason}
                  {d.details && <div className="small muted">{d.details}</div>}
                </td>
                <td className="num">{d.amountKobo === null ? '—' : formatKobo(d.amountKobo)}</td>
                <td>
                  {d.rideId ? <Link href={`/rides/${d.rideId}`}>{d.rideId.slice(0, 8)}</Link> : '—'}
                </td>
                <td>
                  {can('payments.refund') && d.source === 'passenger' && (
                    <button
                      type="button"
                      className="btn btn-small btn-secondary"
                      onClick={() => {
                        setResolving(d);
                        setAmount(d.amountKobo ? String(d.amountKobo / 100) : '');
                        setNote('');
                      }}
                    >
                      {t('dispute.resolve')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal title={t('dispute.resolve')} open={!!resolving} onClose={() => setResolving(null)}>
        <form onSubmit={(e) => void resolve(e)}>
          <div className="tabs" role="radiogroup">
            {(['refund', 'reject'] as const).map((o) => (
              <label key={o} className="checkbox">
                <input
                  type="radio"
                  name="outcome"
                  checked={outcome === o}
                  onChange={() => setOutcome(o)}
                />
                {t(`dispute.${o}`)}
              </label>
            ))}
          </div>
          {outcome === 'refund' && (
            <div className="field">
              <label htmlFor="dispute-amount">{t('refund.amount')}</label>
              <input
                id="dispute-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="dispute-note">{t('dispute.note')}</label>
            <textarea
              id="dispute-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required
              minLength={3}
              rows={3}
            />
          </div>
          <InlineError error={error} />
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setResolving(null)}>
              {t('common.cancel')}
            </button>
            <button className="btn btn-primary">{t('dispute.resolve')}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function Payouts() {
  const { t, formatDate } = useI18n();
  const can = useCan();
  const list = useResource(() => api().admin.payments.payouts(), []);
  const [error, setError] = useState<unknown>(null);
  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <ErrorState error={list.error} onRetry={() => void list.reload()} />;
  if (list.data!.length === 0) return <Empty message={t('payouts.empty')} />;
  return (
    <>
      <InlineError error={error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('col.when')}</th>
              <th>{t('col.account')}</th>
              <th>{t('col.status')}</th>
              <th className="num">{t('col.amount')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.data!.map((p) => (
              <tr key={p.id}>
                <td>{formatDate(p.requestedAt, true)}</td>
                <td>
                  {p.account.name} · •••• {p.account.last4}
                </td>
                <td>
                  {t(`payoutStatus.${p.status}`)}
                  {p.failureReason && <div className="small muted">{p.failureReason}</div>}
                </td>
                <td className="num">{formatKobo(p.amountKobo)}</td>
                <td>
                  {can('payouts.manage') && p.status === 'pending' && (
                    <button
                      type="button"
                      className="btn btn-small btn-secondary"
                      onClick={() =>
                        void api()
                          .admin.payments.retryPayout(p.id)
                          .then(() => list.reload(), setError)
                      }
                    >
                      {t('payouts.retry')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Ledger() {
  const { t } = useI18n();
  const ledger = useResource(() => api().admin.payments.ledger(), []);
  if (ledger.loading && !ledger.data) return <Loading />;
  if (ledger.error || !ledger.data)
    return <ErrorState error={ledger.error} onRetry={() => void ledger.reload()} />;
  const { accounts, mismatchedWallets } = ledger.data;
  return (
    <>
      <p
        className={`notice ${mismatchedWallets === 0 ? 'notice-ok' : 'notice-bad'}`}
        data-testid="ledger-check"
      >
        {mismatchedWallets === 0 ? t('ledger.ok') : t('ledger.bad', { count: mismatchedWallets })}
      </p>
      <h2>{t('ledger.accounts')}</h2>
      <section className="kpis">
        {Object.entries(accounts).map(([k, v]) => (
          <div className="kpi" key={k}>
            <span className="kpi-label">{t(`account.${k}` as MessageKey)}</span>
            <span className="kpi-value">{formatKobo(v)}</span>
          </div>
        ))}
      </section>
    </>
  );
}
