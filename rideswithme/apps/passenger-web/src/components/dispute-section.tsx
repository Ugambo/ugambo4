'use client';

import { type FormEvent, useEffect, useState } from 'react';
import {
  DISPUTE_REASONS,
  type DisputeReason,
  type DisputeView,
  type RideView,
} from '@rideswithme/shared-types';
import { api } from '@/lib/api';
import { InlineError, useI18n } from '@/lib/i18n';

/** "Report a problem with the fare" on a past ride, or what happened to the report. */
export function DisputeSection({ ride, onRaised }: { ride: RideView; onRaised: () => void }) {
  const { t } = useI18n();
  const [dispute, setDispute] = useState<DisputeView | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<DisputeReason>('overcharged');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!ride.payment.disputed) return;
    api()
      .rides.getDispute(ride.id)
      .then(setDispute, () => undefined);
  }, [ride.id, ride.payment.disputed]);

  const charged = ride.status === 'completed' || ride.fare.cancellationFeeKobo > 0;
  if (!charged) return null;

  if (dispute) {
    return (
      <p className="notice notice-wait" data-testid="dispute-status">
        {t(`dispute.status.${dispute.status}`, { note: dispute.resolutionNote ?? '' })}
      </p>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setDispute(
        await api().rides.dispute(ride.id, {
          reason,
          ...(details.trim() && { details: details.trim() }),
        }),
      );
      onRaised();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
        {t('dispute.title')}
      </button>
    );
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="dispute-form" data-testid="dispute-form">
      <h2>{t('dispute.title')}</h2>
      <fieldset>
        <legend>{t('dispute.reason')}</legend>
        {DISPUTE_REASONS.map((r) => (
          <label key={r} className="radio-row">
            <input
              type="radio"
              name="reason"
              value={r}
              checked={reason === r}
              onChange={() => setReason(r)}
            />
            {t(`dispute.reason.${r}`)}
          </label>
        ))}
      </fieldset>
      <div className="field">
        <label htmlFor="details">{t('dispute.details')}</label>
        <textarea
          id="details"
          maxLength={1000}
          rows={3}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
      </div>
      <InlineError error={error} />
      <button className="btn btn-primary" disabled={busy}>
        {t('dispute.send')}
      </button>
    </form>
  );
}
