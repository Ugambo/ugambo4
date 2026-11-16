import { router, useFocusEffect } from 'expo-router';
import { SupportHome } from '@rideswithme/mobile-core';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/session';

const CATEGORIES = ['driver', 'payment', 'ride', 'account', 'other'] as const;

/** Drivers and applicants: contact support (documents, earnings, trips) and follow requests. */
export default function Help() {
  const { t, errorText } = useI18n();
  return (
    <SupportHome
      api={api}
      t={t}
      errorText={errorText}
      categories={CATEGORIES}
      onOpen={(id) => router.push(`/help/${id}`)}
      useFocusEffect={useFocusEffect}
    />
  );
}
