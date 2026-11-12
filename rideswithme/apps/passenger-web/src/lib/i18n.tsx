'use client';

import { createWebI18n } from '@rideswithme/web-core/client';
import { messages } from './messages';

export const { I18nProvider, useI18n, Loading, Empty, ErrorState, InlineError, OfflineBanner } =
  createWebI18n(messages);
