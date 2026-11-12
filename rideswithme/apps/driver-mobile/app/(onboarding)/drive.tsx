import * as Location from 'expo-location';
import { Link } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '@rideswithme/api-client';
import { formatDistance, formatDuration } from '@rideswithme/mobile-core';
import type { DriverOfferView, DriverRideView, OnlineBlocker } from '@rideswithme/shared-types';
import { colors, radius, spacing, typography } from '@rideswithme/ui-components';
import { formatKobo } from '@rideswithme/utilities';
import { Body, Button, Card, ErrorText, Screen, Title } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import { api } from '@/lib/session';
import { cashToCollect, navigationUrl, secondsLeft } from '@/lib/trips';

const OFFER_POLL_MS = 3000;
const RIDE_POLL_MS = 5000;

/**
 * The driver's working screen: go online, answer ride requests, run the trip.
 * Phase 3 polls the API; Phase 4 adds live updates, background location and an
 * offline buffer for positions.
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
  const watcher = useRef<Location.LocationSubscription | null>(null);

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

  // Share position while online (foreground only in Phase 3).
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    void Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 10_000, distanceInterval: 25 },
      (loc) => {
        void api.trips
          .sendLocation({
            points: [
              {
                lat: loc.coords.latitude,
                lng: loc.coords.longitude,
                ...(loc.coords.accuracy !== null && { accuracy: loc.coords.accuracy }),
                ...(loc.coords.heading !== null &&
                  loc.coords.heading >= 0 && { heading: loc.coords.heading }),
                ...(loc.coords.speed !== null &&
                  loc.coords.speed >= 0 && { speed: loc.coords.speed }),
                recordedAt: new Date(loc.timestamp).toISOString(),
              },
            ],
          })
          .catch(() => undefined);
      },
    ).then((sub) => {
      if (cancelled) sub.remove();
      else watcher.current = sub;
    });
    return () => {
      cancelled = true;
      watcher.current?.remove();
      watcher.current = null;
    };
  }, [online]);

  // Look for requests while online and free; follow the trip while on one.
  useEffect(() => {
    if (!online && !ride) return;
    const id = setInterval(
      () => {
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
      },
      ride ? RIDE_POLL_MS : OFFER_POLL_MS,
    );
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
                  : t(`blocker.${b.code}` as MessageKey)}
              </Body>
            ))}
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
            {t('trip.collect', { amount: formatKobo(cashToCollect(r)) })}
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
