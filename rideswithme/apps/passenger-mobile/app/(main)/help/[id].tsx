import { useLocalSearchParams } from 'expo-router';
import { SupportTicket } from '@rideswithme/mobile-core';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/session';

export default function Ticket() {
  const { t, errorText } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SupportTicket api={api} id={id} t={t} errorText={errorText} />;
}
