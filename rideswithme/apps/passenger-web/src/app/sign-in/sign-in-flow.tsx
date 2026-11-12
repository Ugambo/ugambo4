'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { normalizeNigerianPhone } from '@rideswithme/validation';
import { LanguageSelect } from '@/components/language-select';
import { auth } from '@/lib/api';
import { InlineError, useI18n } from '@/lib/i18n';

export function SignInFlow() {
  const { t } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const onPhone = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await auth.requestOtp(phone);
      setStep('code');
    });
  };
  const onCode = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await auth.verifyOtp(phone, code);
      router.replace('/');
    });
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="lang-switch">
          <LanguageSelect />
        </div>
        <div className="brand">
          <span className="brand-mark">R</span>
          {t('app.name')}
        </div>
        <h1>{t('signIn.title')}</h1>
        {step === 'phone' ? (
          <form onSubmit={onPhone}>
            <p className="muted">{t('signIn.subtitle')}</p>
            <div className="field">
              <label htmlFor="phone">{t('signIn.phone')}</label>
              <input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <span className="hint">{t('signIn.phoneHint')}</span>
            </div>
            <InlineError error={error} />
            <button
              className="btn btn-primary btn-block"
              disabled={busy || !normalizeNigerianPhone(phone)}
            >
              {t('signIn.sendCode')}
            </button>
            <p className="small muted">{t('signIn.consent')}</p>
          </form>
        ) : (
          <form onSubmit={onCode}>
            <p>{t('signIn.codeSent', { phone: normalizeNigerianPhone(phone) ?? phone })}</p>
            <div className="field">
              <label htmlFor="code">{t('signIn.code')}</label>
              <input
                id="code"
                className="code-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <InlineError error={error} />
            <button className="btn btn-primary btn-block" disabled={busy || code.length !== 6}>
              {t('signIn.verify')}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={() => {
                setStep('phone');
                setCode('');
                setError(null);
              }}
            >
              {t('signIn.changeNumber')}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
