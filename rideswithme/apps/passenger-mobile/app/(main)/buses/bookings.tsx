import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatDateTime } from '@rideswithme/mobile-core';
import type { BusBookingView } from '@rideswithme/shared-types';
import { spacing } from '@rideswithme/ui-components';
import { formatKobo } from '@rideswithme/utilities';
import { BookingPill } from '@/components/bus';
import { Body, Card, Empty, ErrorView, Loading, Screen } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/session';

export default function BusBookings() {
  const { t } = useI18n();
  const [list, setList] = useState<BusBookingView[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(() => {
    api.bus.bookings().then((l) => {
      setList(l);
      setError(null);
    }, setError);
  }, []);
  useFocusEffect(load);
  if (error) return <ErrorView error={error} onRetry={load} />;
  if (!list) return <Loading />;
  return (
    <Screen onRefresh={load}>
      {list.length === 0 && <Empty message={t('bus.noTickets')} />}
      {list.map((b) => (
        <Pressable
          key={b.id}
          accessibilityRole="button"
          onPress={() => router.push(`/buses/booking/${b.id}`)}
        >
          <Card>
            <View style={styles.row}>
              <Body bold>
                {b.departure.route.originCity} → {b.departure.route.destinationCity}
              </Body>
              <BookingPill b={b} />
            </View>
            <Body muted>
              {formatDateTime(b.departure.departsAt)} · {b.departure.operator.name} ·{' '}
              {b.tickets.map((x) => x.seatLabel).join(', ')} · {formatKobo(b.totalKobo)}
            </Body>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing[2],
  },
});
