import { describe, expect, it } from 'vitest';
import { ErrorCode, LANGUAGES } from '@rideswithme/shared-types';
import { catalogs, translate, type MessageKey } from './i18n';

describe('i18n', () => {
  it('has a translation for every error code in every language', () => {
    for (const lang of LANGUAGES) {
      for (const code of Object.values(ErrorCode)) {
        const value = catalogs[lang][`error.${code}` as MessageKey];
        expect(value, `${lang} error.${code}`).toBeTruthy();
      }
    }
  });

  it('keeps the same placeholders in every language', () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const key of Object.keys(catalogs.en) as MessageKey[]) {
      expect(placeholders(catalogs.ha[key]), key).toBe(placeholders(catalogs.en[key]));
    }
  });

  it('fills placeholders', () => {
    expect(translate('en', 'sms.otp', { code: '123456', minutes: 5 })).toContain('123456');
    expect(translate('ha', 'sms.otp', { code: '123456', minutes: 5 })).toContain('minti 5');
  });
});
