import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import type { DriverFleetView } from '@rideswithme/shared-types';
import { Body, Button, Card, ErrorText } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/session';

/**
 * Invitations from fleet operators, and the fleet the driver is in. Joining
 * lets the fleet see the driver's trips and earnings from then on, so it needs
 * the driver's own yes.
 */
export function FleetCard() {
  const { t } = useI18n();
  const [fleet, setFleet] = useState<DriverFleetView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useFocusEffect(
    useCallback(() => {
      api.driverFleet.get().then(setFleet, () => undefined);
    }, []),
  );

  async function run(fn: () => Promise<DriverFleetView>) {
    setBusy(true);
    setError(null);
    try {
      setFleet(await fn());
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!fleet || (!fleet.current && fleet.invitations.length === 0)) return null;
  const current = fleet.current;
  return (
    <View>
      {fleet.invitations.map((inv) => (
        <Card key={inv.id} tone="wait">
          <Body bold>{t('fleet.invited', { fleet: inv.fleet.name })}</Body>
          <Body>{t('fleet.inviteBody', { fleet: inv.fleet.name })}</Body>
          <Button
            title={t('fleet.accept')}
            onPress={() => void run(() => api.driverFleet.accept(inv.id))}
            busy={busy}
          />
          <Button
            title={t('fleet.decline')}
            variant="secondary"
            onPress={() => void run(() => api.driverFleet.decline(inv.id))}
            busy={busy}
          />
        </Card>
      ))}
      {current && (
        <Card>
          <Body>{t('fleet.member', { fleet: current.name })}</Body>
          <Button
            title={t('fleet.leave')}
            variant="secondary"
            onPress={() =>
              Alert.alert(t('fleet.leaveConfirm', { fleet: current.name }), undefined, [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('fleet.leave'),
                  style: 'destructive',
                  onPress: () => void run(() => api.driverFleet.leave()),
                },
              ])
            }
            busy={busy}
          />
        </Card>
      )}
      <ErrorText error={error} />
    </View>
  );
}
