'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';

export function Loading() {
  const { t } = useI18n();
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden />
      {t('common.loading')}
    </div>
  );
}

export function Empty({ message }: { message: string }) {
  return <div className="state state-empty">{message}</div>;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t, errorText } = useI18n();
  return (
    <div className="state state-error" role="alert">
      <p>{errorText(error)}</p>
      {onRetry && (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

export function InlineError({ error }: { error: unknown }) {
  const { errorText } = useI18n();
  if (!error) return null;
  return (
    <p className="inline-error" role="alert">
      {errorText(error)}
    </p>
  );
}

/** Shown while the browser reports no network connection. */
export function OfflineBanner() {
  const { t } = useI18n();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div className="offline-banner" role="status">
      {t('common.offline')}
    </div>
  );
}
