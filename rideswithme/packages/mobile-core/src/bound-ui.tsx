import type { ReactNode } from 'react';
import {
  ErrorMessage,
  ErrorView as BaseErrorView,
  Loading as BaseLoading,
  Screen as BaseScreen,
  Segmented,
} from '@rideswithme/ui-components/native';
import type { Language } from '@rideswithme/shared-types';
import type { CommonKey } from './messages';

interface BindableI18n {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: CommonKey) => string;
  errorText: (err: unknown) => string;
}

/**
 * The shared native components bound to an app's translations, so screens
 * pass errors and get translated text without repeating the wiring.
 */
export function createBoundUi(useI18n: () => BindableI18n) {
  function Screen(props: { children: ReactNode; onRefresh?: () => void; refreshing?: boolean }) {
    const { t } = useI18n();
    return <BaseScreen offlineMessage={t('common.offline')} {...props} />;
  }
  function ErrorText({ error }: { error: unknown }) {
    const { errorText } = useI18n();
    return <ErrorMessage message={error ? errorText(error) : null} />;
  }
  function Loading() {
    const { t } = useI18n();
    return <BaseLoading label={t('common.loading')} />;
  }
  function ErrorView({ error, onRetry }: { error: unknown; onRetry: () => void }) {
    const { t, errorText } = useI18n();
    return (
      <BaseErrorView message={errorText(error)} retryLabel={t('common.retry')} onRetry={onRetry} />
    );
  }
  function LanguageSwitch({ light = false }: { light?: boolean }) {
    const { lang, setLang, t } = useI18n();
    return (
      <Segmented
        label={t('common.language')}
        light={light}
        value={lang}
        onChange={setLang}
        options={[
          { value: 'en', label: 'English' },
          { value: 'ha', label: 'Hausa' },
        ]}
      />
    );
  }
  return { Screen, ErrorText, Loading, ErrorView, LanguageSwitch };
}
