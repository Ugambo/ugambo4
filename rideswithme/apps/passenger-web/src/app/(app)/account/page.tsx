'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';
import type { Language } from '@rideswithme/shared-types';
import { useResource } from '@rideswithme/web-core/client';
import { api } from '@/lib/api';
import { Empty, InlineError, Loading, useI18n } from '@/lib/i18n';

/** Name, email and message language. The phone number is the sign-in, so it is shown, not edited. */
function ProfileSection() {
  const { t } = useI18n();
  const me = useResource(() => api().me.get(), []);
  const kyc = useResource(() => api().me.verification(), []);
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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await api().me.update({ fullName, email: email.trim() || null, preferredLanguage: language });
      await me.reload();
      setSaved(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" data-testid="profile">
      <h1>{t('profile.title')}</h1>
      {kyc.data && (
        <p className="row-between" data-testid="kyc-status">
          <span>
            {t('kyc.accountStatus')}: <strong>{t(`kyc.status.${kyc.data.status}`)}</strong>
          </span>
          {kyc.data.status !== 'approved' && kyc.data.status !== 'pending' && (
            <Link href="/verify" className="btn btn-secondary btn-small">
              {t('kyc.bookAction')}
            </Link>
          )}
        </p>
      )}
      {!me.data ? (
        <Loading />
      ) : (
        <form onSubmit={(e) => void submit(e)}>
          <div className="field">
            <label htmlFor="profile-phone">{t('profile.phone')}</label>
            <input
              id="profile-phone"
              value={me.data.phone}
              readOnly
              aria-describedby="profile-phone-note"
            />
            <p id="profile-phone-note" className="small">
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
      )}
    </section>
  );
}

/** Your details, notifications, and asking for the account to be deleted (NDPA). */
export default function AccountPage() {
  const { t, formatDate } = useI18n();
  const inbox = useResource(() => api().notifications.list(), []);
  const deletion = useResource(() => api().privacy.deletionRequest(), []);
  const [error, setError] = useState<unknown>(null);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await deletion.reload();
    } catch (err) {
      setError(err);
    }
  };
  const pending = deletion.data && deletion.data.id ? deletion.data : null;

  return (
    <>
      <ProfileSection />
      <section className="card">
        <div className="receipt-head">
          <h2>{t('account.notifications')}</h2>
          {(inbox.data?.unread ?? 0) > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() =>
                void api()
                  .notifications.markRead('all')
                  .then(() => inbox.reload())
              }
            >
              {t('account.markRead')}
            </button>
          )}
        </div>
        {!inbox.data ? (
          <Loading />
        ) : inbox.data.items.length === 0 ? (
          <Empty message={t('account.noNotifications')} />
        ) : (
          <ul className="plain-list" data-testid="notifications">
            {inbox.data.items.map((n) => (
              <li key={n.id} className={n.read ? 'muted' : undefined}>
                <strong>{n.title}</strong>{' '}
                <span className="small">{formatDate(n.createdAt, true)}</span>
                <br />
                {n.body}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card" data-testid="deletion">
        <h2>{t('account.delete')}</h2>
        {pending ? (
          <>
            <p className="notice notice-wait">
              {pending.status === 'blocked'
                ? t('account.deleteBlocked', { reason: pending.blockedReason ?? '' })
                : t('account.deleteScheduled', { date: formatDate(pending.scheduledFor) })}
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void act(() => api().privacy.cancelDeletion())}
            >
              {t('account.deleteCancel')}
            </button>
          </>
        ) : (
          <>
            <p className="small">{t('account.deleteExplain', { days: 7 })}</p>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                if (window.confirm(t('account.deleteConfirm')))
                  void act(() => api().privacy.requestDeletion());
              }}
            >
              {t('account.delete')}
            </button>
          </>
        )}
        <InlineError error={error} />
      </section>
    </>
  );
}
