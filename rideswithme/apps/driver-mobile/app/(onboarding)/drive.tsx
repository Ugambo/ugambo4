import * as Location from 'expo-location';
import { Link, router } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '@rideswithme/api-client';
import { formatDistance, formatDuration } from '@rideswithme/mobile-core';
import type { DriverOfferView, DriverRideView, OnlineBlocker } from '@rideswithme/shared-types';
import { colors, radius, spacing, typography } from '@rideswithme/ui-components';
import { formatKobo } from '@rideswithme/utilities';
import { Body, Button, Card, ErrorText, Screen, Title } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import {
  flushLocations,
  locationBuffer,
  startTracking,
  stopTracking,
} from '@/lib/background-location';
import { api, useOnReconnect, useRealtimeConnected, useRealtimeEvent } from '@/lib/session';
import { cashToCollect, navigationUrl, secondsLeft } from '@/lib/trips';

/** Live events do the work; this slow poll only covers missed events. */
const FALLBACK_POLL_MS = 30_000;
const FLUSH_MS = 15_000;

/**
 * The driver's working screen: go online, answer ride requests, run the trip.
 * Requests and trip changes arrive live; location is tracked in the background
 * and buffered on the phone whenever there is no connection.
 */
export default function Drive() {
  const { t } = useI18n();
  const [online, setOnline] = useState(false);
  const [blockers, setBlockers] = useState<OnlineBlocker[]>([]);
  const [offer, setOffer] = useState<DriverOfferView | null>(null);
  const [ride, setRide] = useState<DriverRideView | null>(null);
  const [finished, setFinished] = useState<DriverRideView | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [foregroundOnly, setForegroundOnly] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(0);
  const connected = useRealtimeConnected();

  const refresh = useCallback(async () => {
    const [availability, active] = await Promise.all([
      api.trips.availability(),
      api.trips.active(),
    ]);
    setOnline(availability.online);
    setBlockers(availability.blockers as OnlineBlocker[]);
    setRide(active.ride);
  }, []);

  useEffect(() => {
    void refresh().catch(setError);
  }, [refresh]);

  // Clock for the offer countdown and waiting timer.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Track location while online (background where allowed) and keep uploading the buffer.
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    void startTracking({ title: t('drive.trackingTitle'), body: t('drive.trackingBody') }).then(
      (mode) => {
        if (cancelled) return;
        setLocationDenied(mode === 'denied');
        setForegroundOnly(mode === 'foreground');
      },
    );
    const flush = () => {
      void flushLocations()
        .catch(() => 0)
        .then(() => locationBuffer().pending())
        .then(setPendingUploads);
    };
    const timer = setInterval(flush, FLUSH_MS);
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) flush();
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      unsubscribe();
    };
  }, [online, t]);

  // Live: new and withdrawn requests, and changes to the current trip.
  useRealtimeEvent<DriverOfferView>(
    'offer:new',
    useCallback((o: DriverOfferView) => setOffer(o), []),
  );
  useRealtimeEvent<{ offerId: string }>(
    'offer:closed',
    useCallback(
      (c: { offerId: string }) =>
        setOffer((current) => (current?.offerId === c.offerId ? null : current)),
      [],
    ),
  );
  useRealtimeEvent<DriverRideView>(
    'ride:updated',
    useCallback((r: DriverRideView) => {
      const ended =
        r.status === 'completed' ||
        r.status === 'cancelled_by_driver' ||
        r.status === 'cancelled_by_passenger';
      if (ended) {
        setRide((current) => (current?.id === r.id ? null : current));
        setFinished((current) => current ?? r);
      } else setRide(r);
    }, []),
  );
  // Events sent while the connection was down are missed: refetch on reconnect.
  useOnReconnect(
    useCallback(() => {
      void refresh().catch(() => undefined);
      api.trips.currentOffer().then(
        (o) => setOffer(o.offer),
        () => undefined,
      );
    }, [refresh]),
  );

  // Fallback in case a live event was missed.
  useEffect(() => {
    if (!online && !ride) return;
    const id = setInterval(() => {
      if (ride)
        api.trips.active().then(
          (a) => setRide(a.ride),
          () => undefined,
        );
      else
        api.trips.currentOffer().then(
          (o) => setOffer(o.offer),
          () => undefined,
        );
    }, FALLBACK_POLL_MS);
    return () => clearInterval(id);
  }, [online, ride]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err);
      if (err instanceof ApiError && err.code === 'DRIVER_NOT_ELIGIBLE')
        await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  const toggleOnline = () =>
    run(async () => {
      if (online) {
        await api.trips.setAvailability({ online: false });
        await stopTracking();
        setOnline(false);
        setOffer(null);
        return;
      }
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setLocationDenied(true);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const res = await api.trips.setAvailability({
        online: true,
        location: {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          recordedAt: new Date(pos.timestamp).toISOString(),
        },
      });
      setOnline(res.online);
    });

  const accept = (o: DriverOfferView) =>
    run(async () => {
      try {
        setRide(await api.trips.accept(o.offerId));
      } finally {
        setOffer(null);
      }
    });

  const decline = (o: DriverOfferView) =>
    run(async () => {
      setOffer(null);
      await api.trips.reject(o.offerId).catch(() => undefined);
    });

  const step = (fn: (id: string) => Promise<DriverRideView>) =>
    run(async () => {
      if (!ride) return;
      const updated = await fn(ride.id);
      if (updated.status === 'completed' || updated.status === 'cancelled_by_driver') {
        setFinished(updated);
        setRide(null);
      } else setRide(updated);
    });

  function confirmComplete(r: DriverRideView) {
    // Paid in the app (wallet or card): nothing to collect.
    if (r.paymentMethod !== 'cash') {
      void step((id) => api.trips.complete(id, 0));
      return;
    }
    const amount = formatKobo(cashToCollect(r));
    Alert.alert(t('trip.collectConfirm', { amount }), undefined, [
      { text: t('trip.notYet'), style: 'cancel' },
      {
        text: t('trip.received'),
        onPress: () => void step((id) => api.trips.complete(id, cashToCollect(r))),
      },
    ]);
  }

  function askCancel(noShow: boolean) {
    if (noShow) {
      void step((id) => api.trips.cancel(id, { reason: 'passenger_no_show' }));
      return;
    }
    const reasons = ['vehicle_problem', 'safety_concern', 'other'] as const;
    Alert.alert(t('trip.cancelWhy'), undefined, [
      ...reasons.map((reason) => ({
        text: t(`trip.reason.${reason}` as MessageKey),
        onPress: () => void step((id) => api.trips.cancel(id, { reason })),
      })),
      { text: t('common.back'), style: 'cancel' as const },
    ]);
  }

  const open = (lat: number, lng: number) => void Linking.openURL(navigationUrl(lat, lng));

  return (
    <Screen onRefresh={() => void refresh().catch(setError)}>
      {finished ? (
        <Finished />
      ) : ride ? (
        <ActiveTrip r={ride} />
      ) : offer && secondsLeft(offer.expiresAt, now) > 0 ? (
        <Offer o={offer} />
      ) : (
        <Availability />
      )}
      <ErrorText error={error} />
      <Link href="/earnings" asChild>
        <Pressable accessibilityRole="button" style={styles.link}>
          <Text style={styles.linkText}>{t('earnings.title')} →</Text>
        </Pressable>
      </Link>
    </Screen>
  );

  function Availability() {
    return (
      <>
        <View style={[styles.statusBanner, online ? styles.onlineBanner : styles.offlineBanner]}>
          <Text style={styles.statusText}>{t(online ? 'drive.online' : 'drive.offline')}</Text>
        </View>
        {online && <Body muted>{t('drive.waiting')}</Body>}
        {online && !connected && <Body muted>{t('drive.reconnecting')}</Body>}
        {online && foregroundOnly && <Body muted>{t('drive.foregroundOnly')}</Body>}
        {pendingUploads > 0 && (
          <Body muted>{t('drive.pendingUploads', { count: pendingUploads })}</Body>
        )}
        {locationDenied && <Body>{t('drive.locationNeeded')}</Body>}
        {!online && blockers.length > 0 && (
          <Card tone="bad">
            <Body>{t('drive.notEligible')}</Body>
            {blockers.map((b, i) => (
              <Body key={i}>
                •{' '}
                {'documentType' in b
                  ? t(`blocker.${b.code}` as MessageKey, {
                      document: t(`docType.${b.documentType}` as MessageKey),
                    })
                  : b.code === 'WALLET_DEBT'
                    ? t('blocker.WALLET_DEBT', { amount: formatKobo(b.owedKobo) })
                    : t(`blocker.${b.code}` as MessageKey)}
              </Body>
            ))}
            {blockers.some((b) => b.code === 'WALLET_DEBT') && (
              <Button
                title={t('wallet.topUp')}
                variant="secondary"
                onPress={() => router.push('/earnings')}
              />
            )}
          </Card>
        )}
        <Button
          title={t(online ? 'drive.goOffline' : 'drive.goOnline')}
          variant={online ? 'secondary' : 'accent'}
          onPress={() => void toggleOnline()}
          disabled={!online && blockers.length > 0}
          busy={busy}
        />
      </>
    );
  }

  function Offer({ o }: { o: DriverOfferView }) {
    const left = secondsLeft(o.expiresAt, now);
    return (
      <Card tone="wait">
        <Title>{t('offer.title')}</Title>
        <Text style={styles.countdown} accessibilityLiveRegion="polite">
          {t('offer.secondsLeft', { seconds: left })}
        </Text>
        <Body bold>{o.pickup.address}</Body>
        <Body muted>
          {t('offer.toPickup', { distance: formatDistance(o.distanceToPickupMeters) })}
        </Body>
        <Body>→ {o.dropoff.address}</Body>
        <Body muted>
          {t('offer.trip', {
            distance: formatDistance(o.trip.distanceMeters),
            duration: formatDuration(o.trip.durationSeconds),
          })}
        </Body>
        <Body bold>
          {t('offer.fare', {
            fare: formatKobo(o.fareKobo),
            earnings: formatKobo(o.estimatedEarningsKobo),
          })}
        </Body>
        <Body muted>💵 {t('offer.cash')}</Body>
        <Button title={t('offer.accept')} onPress={() => void accept(o)} busy={busy} />
        <Button
          title={t('offer.decline')}
          variant="secondary"
          onPress={() => void decline(o)}
          disabled={busy}
        />
      </Card>
    );
  }

  function ActiveTrip({ r }: { r: DriverRideView }) {
    const name = r.passenger.firstName;
    if (r.status === 'driver_assigned') {
      return (
        <>
          <Title>{t('trip.pickupName', { name })}</Title>
          <Body bold>{r.pickup.address}</Body>
          <Button
            title={`🧭 ${t('trip.navigate')}`}
            variant="secondary"
            onPress={() => open(r.pickup.location.lat, r.pickup.location.lng)}
          />
          <Button
            title={t('trip.arrived')}
            onPress={() => void step(api.trips.arrived)}
            busy={busy}
          />
          <Button
            title={t('trip.cancel')}
            variant="danger"
            onPress={() => askCancel(false)}
            disabled={busy}
          />
        </>
      );
    }
    if (r.status === 'driver_arrived') {
      const waited = r.arrivedAt ? Math.floor((now - Date.parse(r.arrivedAt)) / 60_000) : 0;
      return (
        <>
          <Title>{t('trip.waitingFor', { name })}</Title>
          <Body muted>{t('trip.waitedFor', { minutes: waited })}</Body>
          <Button title={t('trip.start')} onPress={() => void step(api.trips.start)} busy={busy} />
          <Button
            title={t('trip.noShow')}
            variant="danger"
            onPress={() => askCancel(true)}
            disabled={busy}
          />
          <Button
            title={t('trip.cancel')}
            variant="secondary"
            onPress={() => askCancel(false)}
            disabled={busy}
          />
        </>
      );
    }
    return (
      <>
        <Title>{t('trip.toDropoff')}</Title>
        <Body bold>{r.dropoff.address}</Body>
        <Button
          title={`🧭 ${t('trip.navigate')}`}
          variant="secondary"
          onPress={() => open(r.dropoff.location.lat, r.dropoff.location.lng)}
        />
        <Card tone="ok">
          <Text style={styles.collect}>
            {r.paymentMethod === 'cash'
              ? t('trip.collect', { amount: formatKobo(cashToCollect(r)) })
              : t('trip.paidInApp')}
          </Text>
        </Card>
        <Button title={t('trip.complete')} onPress={() => confirmComplete(r)} busy={busy} />
      </>
    );
  }

  function Finished() {
    if (!finished) return null;
    const e = finished.earnings;
    return (
      <>
        <Title>{t(finished.status === 'completed' ? 'trip.done' : 'trip.cancelled')}</Title>
        {e && (
          <Card tone="ok">
            <Text style={styles.collect}>
              {t('trip.youEarned', { amount: formatKobo(e.netKobo) })}
            </Text>
            <Body muted>
              {t('earnings.fare')}: {formatKobo(e.fareKobo)} · {t('earnings.commission')}:{' '}
              {formatKobo(e.commissionKobo + e.bookingFeeKobo)}
            </Body>
          </Card>
        )}
        <Button title={t('trip.backOnline')} onPress={() => setFinished(null)} />
      </>
    );
  }
}

const styles = StyleSheet.create({
  statusBanner: { borderRadius: radius.lg, padding: spacing[6], alignItems: 'center' },
  onlineBanner: { backgroundColor: colors.success },
  offlineBanner: { backgroundColor: colors.grey[700] },
  statusText: { fontSize: typography.size['2xl'], fontWeight: '800', color: '#fff' },
  countdown: { fontSize: typography.size.xl, fontWeight: '800', color: colors.warning },
  collect: { fontSize: typography.size.xl, fontWeight: '800', color: colors.success },
  link: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  linkText: { fontSize: typography.size.md, fontWeight: '700', color: colors.primary },
});
