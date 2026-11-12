import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ApiError } from '@rideswithme/api-client';
import type { Language } from '@rideswithme/shared-types';
import { type MessageKey as SharedKey, translate } from '@rideswithme/utilities';
import { LANGUAGE_COOKIE } from '../language';

/** Keys every web app's catalogue must have; the shared state components use them. */
export type CommonWebKey = 'common.loading' | 'common.retry' | 'common.offline';

export interface WebI18n<K extends string> {
  lang: Language;
  t: (key: K, params?: Record<string, string | number>) => string;
  /** A user-facing sentence for any error: API error codes are translated, anything else is generic. */
  errorText: (err: unknown) => string;
  setLang: (lang: Language) => void;
  /** Dates and times in Nigerian time. Plain YYYY-MM-DD values are calendar days. */
  formatDate: (iso: string | null, withTime?: boolean) => string;
  formatTime: (iso: string) => string;
}

/**
 * Builds a web app's translation provider and the loading, empty, error and
 * offline states that use it. Call it from a 'use client' module.
 */
export function createWebI18n<K extends string>(
  messages: Record<Language, Record<K | CommonWebKey, string>>,
) {
  const Ctx = createContext<WebI18n<K | CommonWebKey> | null>(null);

  function I18nProvider({ lang, children }: { lang: Language; children: ReactNode }) {
    const setLang = useCallback((next: Language) => {
      document.cookie = `${LANGUAGE_COOKIE}=${next}; path=/; max-age=31536000; samesite=strict`;
      window.location.reload();
    }, []);

    const value = useMemo<WebI18n<K | CommonWebKey>>(() => {
      const t = (key: K | CommonWebKey, params: Record<string, string | number> = {}) =>
        (messages[lang][key] ?? messages.en[key]).replace(/\{(\w+)\}/g, (m, name: string) =>
          name in params ? String(params[name]) : m,
        );
      const locale = lang === 'ha' ? 'ha-NG' : 'en-NG';
      const dateFmt = new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeZone: 'Africa/Lagos',
      });
      const dateTimeFmt = new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Africa/Lagos',
      });
      const timeFmt = new Intl.DateTimeFormat(locale, {
        timeStyle: 'short',
        timeZone: 'Africa/Lagos',
      });
      return {
        lang,
        t,
        setLang,
        errorText: (err) => {
          const code = err instanceof ApiError ? err.code : 'INTERNAL_ERROR';
          if (code === 'NETWORK_ERROR') return t('common.offline');
          const seconds = err instanceof ApiError ? (err.retryAfterSeconds ?? '') : '';
          return translate(
            lang,
            `error.${code === 'UNKNOWN' ? 'INTERNAL_ERROR' : code}` as SharedKey,
            { seconds },
          );
        },
        formatDate: (iso, withTime = false) => {
          if (!iso) return '—';
          const date = /^\d{4}-\d{2}-\d{2}$/.test(iso)
            ? new Date(`${iso}T12:00:00+01:00`)
            : new Date(iso);
          return (withTime ? dateTimeFmt : dateFmt).format(date);
        },
        formatTime: (iso) => timeFmt.format(new Date(iso)),
      };
    }, [lang, setLang]);

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
  }

  function useI18n(): WebI18n<K | CommonWebKey> {
    const v = useContext(Ctx);
    if (!v) throw new Error('useI18n outside I18nProvider');
    return v;
  }

  function Loading() {
    const { t } = useI18n();
    return (
      <div className="state" role="status" aria-live="polite">
        <span className="spinner" aria-hidden />
        {t('common.loading')}
      </div>
    );
  }

  function Empty({ message }: { message: string }) {
    return <div className="state state-empty">{message}</div>;
  }

  function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
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

  function InlineError({ error }: { error: unknown }) {
    const { errorText } = useI18n();
    if (!error) return null;
    return (
      <p className="inline-error" role="alert">
        {errorText(error)}
      </p>
    );
  }

  /** Shown while the browser reports no network connection. */
  function OfflineBanner() {
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

  return { I18nProvider, useI18n, Loading, Empty, ErrorState, InlineError, OfflineBanner };
}
