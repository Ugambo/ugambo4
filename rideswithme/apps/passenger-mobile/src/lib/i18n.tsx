import { createI18n } from '@rideswithme/mobile-core';
import { messages } from './messages';

export const { I18nProvider, useI18n, currentLanguage } = createI18n(messages);
