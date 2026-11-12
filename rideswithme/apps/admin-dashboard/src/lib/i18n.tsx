'use client';

import { createContext, type ReactNode, useCallback, useContext, useMemo } from 'react';
import type { Language } from '@rideswithme/shared-types';
import { ApiError } from '@rideswithme/api-client';
import { type MessageKey as SharedKey, translate } from '@rideswithme/utilities';
import { LANGUAGE_COOKIE } from './language';
import { type MessageKey, messages } from './messages';

interface I18n {
  lang: Language;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  /** A user-facing sentence for any error: API error codes are translated, anything else is generic. */
  errorText: (err: unknown) => string;
  setLang: (lang: Language) => void;
  formatDate: (iso: string | null, withTime?: boolean) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ lang, children }: { lang: Language; children: ReactNode }) {
  const setLang = useCallback((next: Language) => {
    document.cookie = `${LANGUAGE_COOKIE}=${next}; path=/; max-age=31536000; samesite=strict`;
    window.location.reload();
  }, []);

  const value = useMemo<I18n>(() => {
    const t = (key: MessageKey, params: Record<string, string | number> = {}) =>
      (messages[lang][key] ?? messages.en[key]).replace(/\{(\w+)\}/g, (m, name: string) =>
        name in params ? String(params[name]) : m,
      );
    const dateFmt = new Intl.DateTimeFormat(lang === 'ha' ? 'ha-NG' : 'en-NG', {
      dateStyle: 'medium',
      timeZone: 'Africa/Lagos',
    });
    const dateTimeFmt = new Intl.DateTimeFormat(lang === 'ha' ? 'ha-NG' : 'en-NG', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Africa/Lagos',
    });
    return {
      lang,
      t,
      setLang,
      errorText: (err) => {
        const code = err instanceof ApiError ? err.code : 'INTERNAL_ERROR';
        const key = (code === 'NETWORK_ERROR' ? 'common.offline' : null) as MessageKey | null;
        if (key) return t(key);
        return translate(
          lang,
          `error.${code === 'UNKNOWN' ? 'INTERNAL_ERROR' : code}` as SharedKey,
        );
      },
      formatDate: (iso, withTime = false) => {
        if (!iso) return '—';
        // Plain dates (YYYY-MM-DD) are calendar days, not instants.
        const date = /^\d{4}-\d{2}-\d{2}$/.test(iso)
          ? new Date(`${iso}T12:00:00+01:00`)
          : new Date(iso);
        return (withTime ? dateTimeFmt : dateFmt).format(date);
      },
    };
  }, [lang, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside I18nProvider');
  return v;
}
