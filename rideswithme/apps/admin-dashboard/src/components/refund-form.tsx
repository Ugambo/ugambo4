'use client';

import { type FormEvent, useState } from 'react';
import { ApiError, newIdempotencyKey } from '@rideswithme/api-client';
import type { PaymentView } from '@rideswithme/shared-types';
import { formatKobo, nairaToKobo } from '@rideswithme/utilities';
import { InlineError } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/** Refund part or all of a ride payment. Card refunds only for card payments. */
export function RefundForm({ payment, onDone }: { payment: PaymentView; onDone: () => void }) {
  const { t } = useI18n();
  const refundable = payment.amountKobo - payment.outstandingKobo - payment.refundedKobo;
  const [amount, setAmount] = useState(String(refundable / 100));
  const [destination, setDestination] = useState<'wallet' | 'card'>('wallet');
  const [fundedBy, setFundedBy] = useState<'platform' | 'driver'>('platform');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [key] = useState(newIdempotencyKey);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let amountKobo: number;
      try {
        amountKobo = nairaToKobo(amount);
      } catch {
        throw new ApiError(0, 'VALIDATION_FAILED', 'Not an amount');
      }
      await api().admin.payments.refund(
        payment.id,
        { amountKobo, destination, fundedBy, reason },
        key,
      );
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="stack" data-testid="refund-form">
      <p className="small muted">
        {formatKobo(payment.amountKobo)} · {t(`method.${payment.method}`)} · {t('payment.refunds')}:{' '}
        {formatKobo(payment.refundedKobo)}
      </p>
      <div className="field">
        <label htmlFor="refund-amount">{t('refund.amount')}</label>
        <input
          id="refund-amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="refund-dest">{t('refund.destination')}</label>
        <select
          id="refund-dest"
          value={destination}
          onChange={(e) => setDestination(e.target.value as 'wallet' | 'card')}
        >
          <option value="wallet">{t('refund.wallet')}</option>
          {payment.method === 'card' && <option value="card">{t('refund.card')}</option>}
        </select>
      </div>
      <div className="field">
        <label htmlFor="refund-funded">{t('refund.fundedBy')}</label>
        <select
          id="refund-funded"
          value={fundedBy}
          onChange={(e) => setFundedBy(e.target.value as 'platform' | 'driver')}
        >
          <option value="platform">{t('refund.platform')}</option>
          <option value="driver">{t('refund.driver')}</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="refund-reason">{t('refund.reason')}</label>
        <textarea
          id="refund-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={3}
          required
          rows={2}
        />
      </div>
      <InlineError error={error} />
      <button className="btn btn-primary" disabled={busy || refundable <= 0}>
        {t('payment.refund')}
      </button>
    </form>
  );
}
