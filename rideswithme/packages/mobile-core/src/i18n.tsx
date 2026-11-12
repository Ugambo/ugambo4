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
import { type CommonKey, commonEn, commonHa } from './messages';

const LANGUAGE_KEY = 'rwm.language';

export interface I18n<K extends string> {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: K | CommonKey, params?: Record<string, string | number>) => string;
  /** A sentence for any error: API error codes are translated, network failures say "offline". */
  errorText: (err: unknown) => string;
}

/**
 * Creates the app's translation layer from its own English and Hausa catalogues
 * plus the shared ones. The language follows the phone (Hausa if the phone is
 * set to Hausa) until the user picks one, which is remembered.
 */
export function createI18n<K extends string>(own: {
  en: Record<K, string>;
  ha: Record<K, string>;
}) {
  const catalogs: Record<Language, Record<string, string>> = {
    en: { ...commonEn, ...own.en },
    ha: { ...commonHa, ...own.ha },
  };
  let current: Language = getLocales()[0]?.languageCode === 'ha' ? 'ha' : 'en';
  const Ctx = createContext<I18n<K> | null>(null);

  function I18nProvider({ children }: { children: ReactNode }) {
    const [lang, setLangState] = useState<Language>(current);
    useEffect(() => {
      void SecureStore.getItemAsync(LANGUAGE_KEY).then((saved) => {
        if (saved === 'en' || saved === 'ha') {
          current = saved;
          setLangState(saved);
        }
      });
    }, []);
    const setLang = useCallback((next: Language) => {
      current = next;
      setLangState(next);
      void SecureStore.setItemAsync(LANGUAGE_KEY, next);
    }, []);
    const value = useMemo<I18n<K>>(() => {
      const t = (key: K | CommonKey, params: Record<string, string | number> = {}) =>
        (catalogs[lang][key] ?? catalogs.en[key] ?? key).replace(/\{(\w+)\}/g, (m, name: string) =>
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

  function useI18n(): I18n<K> {
    const v = useContext(Ctx);
    if (!v) throw new Error('useI18n outside I18nProvider');
    return v;
  }

  return { I18nProvider, useI18n, currentLanguage: () => current };
}
