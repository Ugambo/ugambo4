import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import type { RideView } from '@rideswithme/shared-types';
import { formatDistance, formatDuration } from '@rideswithme/mobile-core';
import { FareLines, StatusLabel } from '@/components/ride-parts';
import { Body, Card, ErrorView, Loading, Screen, Title } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/session';

/** Receipt for one ride. */
export default function Receipt() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const [ride, setRide] = useState<RideView | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(() => {
    setError(null);
    api.rides.get(id).then(setRide, setError);
  }, [id]);
  useEffect(load, [load]);

  if (!ride) return error ? <ErrorView error={error} onRetry={load} /> : <Loading />;
  return (
    <Screen>
      <Title>{ride.category.name}</Title>
      <StatusLabel ride={ride} />
      <Card>
        <Body bold>{ride.pickup.address}</Body>
        <Body muted>↓</Body>
        <Body bold>{ride.dropoff.address}</Body>
        <Body muted>
          {formatDistance(ride.route.distanceMeters)} · {formatDuration(ride.route.durationSeconds)}
        </Body>
      </Card>
      {ride.driver && (
        <Body>
          {ride.driver.firstName} · {ride.driver.vehicle.colour} {ride.driver.vehicle.make}{' '}
          {ride.driver.vehicle.model} · {ride.driver.vehicle.plateNumber}
        </Body>
      )}
      <Card>
        <FareLines ride={ride} />
        {ride.status === 'completed' && <Body muted>{t('receipt.paidCash')}</Body>}
      </Card>
    </Screen>
  );
}
