'use client';

import { useState } from 'react';
import { useResource } from '@rideswithme/web-core/client';
import { api } from '@/lib/api';
import { Empty, InlineError, Loading, useI18n } from '@/lib/i18n';

/** Notifications, and asking for the account to be deleted (NDPA). */
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
      <section className="card">
        <div className="receipt-head">
          <h1>{t('account.notifications')}</h1>
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
