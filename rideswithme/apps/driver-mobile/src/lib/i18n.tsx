import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
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
import { type MessageKey, messages } from './messages';

const LANGUAGE_KEY = 'rwm.language';

/** Read by the API client so SMS and server text use the same language as the app. */
export let currentLanguage: Language = getLocales()[0]?.languageCode === 'ha' ? 'ha' : 'en';

interface I18n {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  errorText: (err: unknown) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(currentLanguage);

  useEffect(() => {
    void SecureStore.getItemAsync(LANGUAGE_KEY).then((saved) => {
      if (saved === 'en' || saved === 'ha') {
        currentLanguage = saved;
        setLangState(saved);
      }
    });
  }, []);

  const setLang = useCallback((next: Language) => {
    currentLanguage = next;
    setLangState(next);
    void SecureStore.setItemAsync(LANGUAGE_KEY, next);
  }, []);

  const value = useMemo<I18n>(() => {
    const t = (key: MessageKey, params: Record<string, string | number> = {}) =>
      (messages[lang][key] ?? messages.en[key]).replace(/\{(\w+)\}/g, (m, name: string) =>
        name in params ? String(params[name]) : m,
      );
    return {
      lang,
      setLang,
      t,
      errorText: (err) => {
        if (err instanceof ApiError && err.code === 'NETWORK_ERROR') return t('common.offline');
        const code =
          err instanceof ApiError && err.code !== 'UNKNOWN' ? err.code : 'INTERNAL_ERROR';
        return translate(lang, `error.${code}` as SharedKey);
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
