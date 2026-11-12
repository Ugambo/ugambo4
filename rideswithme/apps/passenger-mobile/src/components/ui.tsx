/** Shared native components bound to this app's translations. */
import { createBoundUi } from '@rideswithme/mobile-core';
import { useI18n } from '@/lib/i18n';

export {
  Body,
  Button,
  Card,
  Empty,
  Field,
  Pill,
  styles,
  Title,
  type Tone,
} from '@rideswithme/ui-components/native';
export const { Screen, ErrorText, Loading, ErrorView, LanguageSwitch } = createBoundUi(useI18n);
