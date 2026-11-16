import { useLocalSearchParams } from 'expo-router';
import { RideChat } from '@rideswithme/mobile-core';
import type { RideMessageView } from '@rideswithme/shared-types';
import { Screen } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { api, useRealtimeEvent } from '@/lib/session';

/** Messages with the driver (while they are on the way or on the trip). */
export default function Chat() {
  const { t, errorText } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen>
      <RideChat
        api={api}
        rideId={id}
        errorText={errorText}
        useMessageEvent={(h) => useRealtimeEvent<RideMessageView>('ride:message', h)}
        labels={{
          placeholder: t('chat.placeholder'),
          send: t('chat.send'),
          empty: t('chat.empty'),
          privacy: t('chat.privacy'),
          quick: [t('chat.quick.here'), t('chat.quick.coming'), t('chat.quick.wait')],
        }}
      />
    </Screen>
  );
}
