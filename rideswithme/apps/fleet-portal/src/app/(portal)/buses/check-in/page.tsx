'use client';

import { type FormEvent, useRef, useState } from 'react';
import type { CheckInResult } from '@rideswithme/shared-types';
import { api } from '@/lib/api';
import { InlineError, useI18n } from '@/lib/i18n';

/** Boarding: type the code under a passenger's QR code, or use a QR scanner that types into the box. */
export default function CheckInPage() {
  const { t, formatDate, formatTime } = useI18n();
  const [code, setCode] = useState('');
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api().operator.checkIn(code));
      setCode('');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  };

  return (
    <>
      <div className="page-header">
        <h1>{t('checkIn.title')}</h1>
      </div>
      <form className="card" onSubmit={(e) => void submit(e)} data-testid="check-in-form">
        <div className="field">
          <label htmlFor="ticket-code">{t('checkIn.code')}</label>
          <input
            id="ticket-code"
            ref={input}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
          />
          <span className="hint">{t('checkIn.hint')}</span>
        </div>
        <button className="btn btn-primary" disabled={busy}>
          {t('checkIn.submit')}
        </button>
      </form>
      <div aria-live="polite" data-testid="check-in-result">
        <InlineError error={error} />
        {result && (
          <div className={`notice ${result.alreadyCheckedIn ? 'notice-wait' : 'notice-ok'}`}>
            <p>
              <strong>
                {result.alreadyCheckedIn
                  ? t('checkIn.already', {
                      time: formatTime(result.checkedInAt),
                      seat: result.seatLabel,
                      name: result.passengerName,
                    })
                  : t('checkIn.ok', { seat: result.seatLabel, name: result.passengerName })}
              </strong>
            </p>
            <p className="small">
              {t('checkIn.trip', {
                from: result.departure.originCity,
                to: result.departure.destinationCity,
                time: formatDate(result.departure.departsAt, true),
                reference: result.bookingReference,
              })}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
