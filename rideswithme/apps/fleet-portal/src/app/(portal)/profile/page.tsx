'use client';

import { type FormEvent, useEffect, useState } from 'react';
import type { Language } from '@rideswithme/shared-types';
import { useResource } from '@rideswithme/web-core/client';
import { api } from '@/lib/api';
import { InlineError, Loading, useI18n } from '@/lib/i18n';
import { useReloadMe } from '../shell';

/** The manager's own name, email and message language. The phone is their sign-in, so RideswithMe changes it. */
export default function ProfilePage() {
  const { t } = useI18n();
  const me = useResource(() => api().me.get(), []);
  const reloadShell = useReloadMe();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [language, setLanguage] = useState<Language>('en');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!me.data) return;
    setFullName(me.data.fullName ?? '');
    setEmail(me.data.email ?? '');
    setLanguage(me.data.preferredLanguage);
  }, [me.data]);

  if (!me.data) return <Loading />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await api().me.update({ fullName, email: email.trim() || null, preferredLanguage: language });
      await Promise.all([me.reload(), reloadShell()]);
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
          <label htmlFor="profile-phone">{t('profile.phone')}</label>
          <input
            id="profile-phone"
            value={me.data.phone}
            readOnly
            aria-describedby="profile-phone-note"
          />
          <p id="profile-phone-note" className="small muted">
            {t('profile.phoneNote')}
          </p>
        </div>
        <div className="field">
          <label htmlFor="profile-name">{t('profile.name')}</label>
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
          <label htmlFor="profile-email">{t('profile.email')}</label>
          <input
            id="profile-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        <div className="field">
          <label htmlFor="profile-language">{t('profile.language')}</label>
          <select
            id="profile-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
          >
            <option value="en">English</option>
            <option value="ha">Hausa</option>
          </select>
        </div>
        {saved && <p className="notice notice-ok">{t('profile.saved')}</p>}
        <InlineError error={error} />
        <button className="btn btn-primary" disabled={busy}>
          {t('profile.save')}
        </button>
      </form>
    </>
  );
}
