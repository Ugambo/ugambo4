'use client';

import { type FormEvent, useEffect, useState } from 'react';
import type { Language } from '@rideswithme/shared-types';
import { InlineError, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMe, useReloadMe } from '../shell';

/** The signed-in staff member's own name, email and language. The phone is their sign-in, so only a super admin changes it. */
export default function ProfilePage() {
  const { t } = useI18n();
  const me = useMe();
  const reloadMe = useReloadMe();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [language, setLanguage] = useState<Language>('en');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!me) return;
    setFullName(me.fullName ?? '');
    setEmail(me.email ?? '');
    setLanguage(me.preferredLanguage);
  }, [me]);

  if (!me) return <Loading />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await api().me.update({
        fullName,
        email: email.trim() || null,
        preferredLanguage: language,
      });
      await reloadMe();
      setSaved(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <h1>{t('profile.title')}</h1>
      </div>
      <form className="card" onSubmit={(e) => void submit(e)} data-testid="profile-form">
        <div className="field">
          <label htmlFor="profile-phone">{t('col.phone')}</label>
          <input
            id="profile-phone"
            value={me.phone}
            readOnly
            aria-describedby="profile-phone-note"
          />
          <p id="profile-phone-note" className="small muted">
            {t('profile.phoneNote')}
          </p>
        </div>
        <div className="field">
          <label htmlFor="profile-name">{t('col.name')}</label>
          <input
            id="profile-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
          />
        </div>
        <div className="field">
          <label htmlFor="profile-email">{t('col.email')}</label>
          <input
            id="profile-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        <div className="field">
          <label htmlFor="profile-language">{t('col.language')}</label>
          <select
            id="profile-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
          >
            <option value="en">{t('lang.en')}</option>
            <option value="ha">{t('lang.ha')}</option>
          </select>
        </div>
        {saved && <p className="notice notice-ok">{t('profile.saved')}</p>}
        <InlineError error={error} />
        <button className="btn btn-primary" disabled={busy}>
          {t('common.save')}
        </button>
      </form>
    </>
  );
}
