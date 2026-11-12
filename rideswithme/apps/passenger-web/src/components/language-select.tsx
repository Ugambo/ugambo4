'use client';

import { useId } from 'react';
import { useI18n } from '@/lib/i18n';

export function LanguageSelect() {
  const { t, lang, setLang } = useI18n();
  const id = useId();
  return (
    <span className="lang-select">
      <label className="small" htmlFor={id}>
        {t('common.language')}
      </label>
      <select id={id} value={lang} onChange={(e) => setLang(e.target.value as 'en' | 'ha')}>
        <option value="en">English</option>
        <option value="ha">Hausa</option>
      </select>
    </span>
  );
}
