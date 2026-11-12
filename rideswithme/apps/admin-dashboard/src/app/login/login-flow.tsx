'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { MeResponse, TotpSetupResponse } from '@rideswithme/shared-types';
import { normalizeNigerianPhone } from '@rideswithme/validation';
import { InlineError, Loading } from '@/components/states';
import { api, auth } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

type Step = 'phone' | 'code' | 'mfa-setup' | 'mfa-verify' | 'no-access' | 'resuming';

export function LoginFlow({ resumeMfa }: { resumeMfa: boolean }) {
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState<Step>(resumeMfa ? 'resuming' : 'phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<(TotpSetupResponse & { qr: string }) | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  /** Decides what comes after the SMS code, from what the account needs. */
  async function next(user: MeResponse) {
    setCode('');
    if (user.mfa.required && !user.mfa.enrolled) {
      const s = await api().auth.totpSetup();
      setSetup({ ...s, qr: await QRCode.toDataURL(s.otpauthUrl, { margin: 1, width: 400 }) });
      setStep('mfa-setup');
    } else if (user.mfa.required && !user.mfa.verifiedForSession) {
      setStep('mfa-verify');
    } else if (user.permissions.includes('drivers.read')) {
      router.replace('/drivers');
    } else {
      setStep('no-access');
    }
  }

  useEffect(() => {
    if (step !== 'resuming') return;
    api()
      .me.get()
      .then(next)
      .catch(() => setStep('phone'));
  }, []);

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
    void run(async () => next((await auth.verifyOtp(phone, code)).user));
  };
  const onTotp = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const user =
        step === 'mfa-setup'
          ? await api().auth.totpActivate(code)
          : await api().auth.totpVerify(code);
      await next(user);
    });
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="lang-switch">
          <label className="small muted" htmlFor="lang">
            {t('common.language')}
          </label>
          <select id="lang" value={lang} onChange={(e) => setLang(e.target.value as 'en' | 'ha')}>
            <option value="en">English</option>
            <option value="ha">Hausa</option>
          </select>
        </div>
        <div className="brand">
          <span className="brand-mark">R</span>
          {t('app.name')}
        </div>

        {step === 'resuming' && <Loading />}

        {step === 'phone' && (
          <form onSubmit={onPhone}>
            <h1>{t('login.title')}</h1>
            <div className="field">
              <label htmlFor="phone">{t('login.phone')}</label>
              <input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <span className="hint">{t('login.phoneHint')}</span>
            </div>
            <InlineError error={error} />
            <button
              className="btn btn-primary btn-block"
              disabled={busy || !normalizeNigerianPhone(phone)}
            >
              {t('login.sendCode')}
            </button>
            <p className="small muted">{t('login.consent')}</p>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={onCode}>
            <h1>{t('login.title')}</h1>
            <p>{t('login.codeSent', { phone: normalizeNigerianPhone(phone) ?? phone })}</p>
            <div className="field">
              <label htmlFor="code">{t('login.code')}</label>
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
              {t('login.verify')}
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
              {t('login.changeNumber')}
            </button>
          </form>
        )}

        {(step === 'mfa-setup' || step === 'mfa-verify') && (
          <form onSubmit={onTotp}>
            <h1>{t(step === 'mfa-setup' ? 'login.mfaSetupTitle' : 'login.mfaVerifyTitle')}</h1>
            <p>{t(step === 'mfa-setup' ? 'login.mfaSetupBody' : 'login.mfaVerifyBody')}</p>
            {step === 'mfa-setup' && setup && (
              <>
                <div className="qr">
                  <img src={setup.qr} alt="QR code for your authenticator app" />
                </div>
                <p className="small muted">{t('login.mfaSecret')}</p>
                <p className="secret" data-testid="totp-secret">
                  {setup.secret}
                </p>
              </>
            )}
            <div className="field">
              <label htmlFor="totp">{t('login.mfaCode')}</label>
              <input
                id="totp"
                className="code-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <InlineError error={error} />
            <button className="btn btn-primary btn-block" disabled={busy || code.length !== 6}>
              {t('login.continue')}
            </button>
          </form>
        )}

        {step === 'no-access' && (
          <div>
            <p className="notice notice-bad">{t('login.noAccess')}</p>
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => void auth.logout().then(() => setStep('phone'))}
            >
              {t('common.signOut')}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
