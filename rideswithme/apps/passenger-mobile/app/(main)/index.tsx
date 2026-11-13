import * as Location from 'expo-location';
import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, newIdempotencyKey } from '@rideswithme/api-client';
import { formatTime } from '@rideswithme/mobile-core';
import {
  type DriverPosition,
  ACTIVE_RIDE_STATUSES,
  type FareEstimateResponse,
  type RideView,
  type SavedCardView,
  type SavedPlace,
  type WalletView,
} from '@rideswithme/shared-types';
import { colors, radius, spacing, typography } from '@rideswithme/ui-components';
import { BottomSheet, OfflineBanner } from '@rideswithme/ui-components/native';
import { formatKobo } from '@rideswithme/utilities';
import { DriverCard, FareLines, PaymentLine, VehicleRow } from '@/components/ride-parts';
import { RideMap } from '@/components/ride-map';
import { Body, Button, Card, ErrorText, Title } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { api, useOnReconnect, useRealtimeEvent } from '@/lib/session';
import {
  applyActiveRides,
  applyRideUpdate,
  canCancel,
  cancellationFeeNow,
  type PassengerRides,
  positionAge,
  ridePhase,
  scheduleSlots,
  toPlaceInput,
} from '@rideswithme/utilities';
import { useTripDraft } from '@/lib/trip-draft';

/** Live updates do the work; this slow poll only covers missed events. */
const FALLBACK_POLL_MS = 30_000;

/** API place input: drop empty optional fields. */
export default function Home() {
  const { t } = useI18n();
  const draft = useTripDraft();
  const { height } = useWindowDimensions();
  const [expanded, setExpanded] = useState(true);
  const [rides, setRides] = useState<PassengerRides>({ current: null, scheduled: [] });
  const ride = rides.current;
  const scheduled = rides.scheduled;
  const setRide = useCallback(
    (next: RideView | null | ((current: RideView | null) => RideView | null)) =>
      setRides((s) => ({ ...s, current: typeof next === 'function' ? next(s.current) : next })),
    [],
  );
  const setScheduled = useCallback(
    (next: (scheduled: RideView[]) => RideView[]) =>
      setRides((s) => ({ ...s, scheduled: next(s.scheduled) })),
    [],
  );
  const [saved, setSaved] = useState<SavedPlace[]>([]);
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [cards, setCards] = useState<SavedCardView[]>([]);
  /** 'cash', 'wallet' or 'card:<id>'. */
  const [pay, setPay] = useState('cash');
  const [locating, setLocating] = useState(true);
  const [locationDenied, setLocationDenied] = useState(false);
  const [estimate, setEstimate] = useState<FareEstimateResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [when, setWhen] = useState<Date | null>(null);
  const [choosingTime, setChoosingTime] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // Same key for every retry of one booking attempt, so a retry never books twice.
  const bookingKey = useRef(newIdempotencyKey());

  const collapsed = 200;
  const expandedHeight = Math.round(height * 0.62);

  const loadActive = useCallback(async () => {
    const rides = await api.rides.active();
    setRides((state) => applyActiveRides(state, rides));
  }, []);

  useEffect(() => {
    void loadActive().catch(() => undefined);
    api.places.saved().then(setSaved, () => undefined);
  }, [loadActive]);

  // Wallet balance, money owed and saved cards, fresh whenever this screen comes back into view.
  useFocusEffect(
    useCallback(() => {
      api.wallet.get().then(setWallet, () => undefined);
      api.payments.cards().then(
        (c) => setCards(c.filter((card) => !card.expired)),
        () => undefined,
      );
    }, []),
  );

  // Pickup defaults to the phone's location unless the passenger chose one.
  useEffect(() => {
    void (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) {
          setLocationDenied(true);
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (!draft.pickupChosen) {
          const location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          draft.setPickup(
            await api.places
              .reverse(location)
              .catch(() => ({ address: t('home.yourLocation'), location })),
          );
        }
      } catch {
        setLocationDenied(true);
      } finally {
        setLocating(false);
      }
    })();
  }, []);

  // Price the trip whenever both ends are set.
  useEffect(() => {
    if (!draft.pickup || !draft.dropoff || ride) {
      setEstimate(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setError(null);
    api.fares
      .estimate({ pickup: toPlaceInput(draft.pickup), dropoff: toPlaceInput(draft.dropoff) })
      .then(
        (e) => {
          if (cancelled) return;
          setEstimate(e);
          setSelected(e.options[0]?.category.key ?? null);
          bookingKey.current = newIdempotencyKey();
          setExpanded(true);
        },
        (err: unknown) => !cancelled && setError(err),
      )
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [draft.pickup, draft.dropoff, ride]);

  // Live: the ride's status and the driver's position as they change.
  useRealtimeEvent<RideView>(
    'ride:updated',
    useCallback((updated: RideView) => setRides((state) => applyRideUpdate(state, updated)), []),
  );
  useRealtimeEvent<{ rideId: string; position: DriverPosition }>(
    'driver:position',
    useCallback((p: { rideId: string; position: DriverPosition }) => {
      setRide((current) =>
        current?.id === p.rideId && current.driver
          ? { ...current, driver: { ...current.driver, position: p.position } }
          : current,
      );
    }, []),
  );
  // Anything sent while the connection was down is missed: refetch on reconnect.
  useOnReconnect(
    useCallback(() => {
      void loadActive().catch(() => undefined);
    }, [loadActive]),
  );

  // Fallback in case a live event was missed; also re-renders "last updated" ages.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!ride || !ACTIVE_RIDE_STATUSES.includes(ride.status)) return;
    const age = setInterval(() => setTick((n) => n + 1), 5000);
    const poll = setInterval(() => {
      api.rides.get(ride.id).then(setRide, () => undefined);
    }, FALLBACK_POLL_MS);
    return () => {
      clearInterval(age);
      clearInterval(poll);
    };
  }, [ride?.id, ride?.status]);

  const option = estimate?.options.find((o) => o.category.key === selected) ?? null;

  async function request() {
    if (!option) return;
    setBusy(true);
    setError(null);
    try {
      const booked = await api.rides.book(
        {
          quoteId: option.quoteId,
          ...(pay.startsWith('card:')
            ? { paymentMethod: 'card' as const, cardId: pay.slice(5) }
            : { paymentMethod: pay as 'cash' | 'wallet' }),
          ...(when && { scheduledFor: when.toISOString() }),
        },
        bookingKey.current,
      );
      bookingKey.current = newIdempotencyKey();
      if (booked.status === 'requested') setScheduled((s) => [...s, booked]);
      else setRide(booked);
      draft.setDropoff(null);
      setWhen(null);
    } catch (err) {
      setError(err);
      // A stale price needs a fresh quote; ask for one.
      if (err instanceof ApiError && err.code === 'QUOTE_EXPIRED' && draft.dropoff)
        draft.setDropoff({ ...draft.dropoff });
    } finally {
      setBusy(false);
    }
  }

  function confirmCancel(r: RideView) {
    const fee = cancellationFeeNow(r);
    Alert.alert(
      t('ride.cancelConfirm'),
      fee > 0 ? t('ride.cancelFee', { amount: formatKobo(fee) }) : undefined,
      [
        { text: t('ride.keep'), style: 'cancel' },
        {
          text: t('ride.cancel'),
          style: 'destructive',
          onPress: () => {
            api.rides.cancel(r.id).then((updated) => {
              if (updated.status === 'cancelled_by_passenger' && r.status === 'requested')
                setScheduled((s) => s.filter((x) => x.id !== r.id));
              else setRide(updated);
            }, setError);
          },
        },
      ],
    );
  }

  function finish() {
    setRide(null);
    setError(null);
    draft.setDropoff(null);
  }

  const driverPosition = ride?.driver?.position ?? null;
  const age = positionAge(driverPosition);

  return (
    <View style={styles.fill}>
      <RideMap
        pickup={ride ? ride.pickup.location : draft.pickup?.location}
        dropoff={ride ? ride.dropoff.location : draft.dropoff?.location}
        driver={driverPosition}
        polyline={ride ? ride.route.polyline : estimate?.route.polyline}
        bottomInset={expanded ? expandedHeight : collapsed}
      />
      <SafeAreaView edges={['top']} style={styles.top}>
        <OfflineBanner message={t('common.offline')} />
        <View style={styles.topButtons}>
          <Link href="/rides" asChild>
            <Pressable accessibilityRole="button" style={styles.roundButton}>
              <Text style={styles.roundText}>{t('home.history')}</Text>
            </Pressable>
          </Link>
          <Link href="/wallet" asChild>
            <Pressable accessibilityRole="button" style={styles.roundButton}>
              <Text style={styles.roundText}>{t('wallet.title')}</Text>
            </Pressable>
          </Link>
          <Link href="/account" asChild>
            <Pressable accessibilityRole="button" style={styles.roundButton}>
              <Text style={styles.roundText}>{t('home.account')}</Text>
            </Pressable>
          </Link>
        </View>
      </SafeAreaView>

      <BottomSheet
        collapsedHeight={collapsed}
        expandedHeight={expandedHeight}
        expanded={expanded}
        onExpandedChange={setExpanded}
        handleLabel={t('home.sheetHandle')}
      >
        <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          {ride ? (
            <ActiveRide />
          ) : estimate || (draft.dropoff && busy) ? (
            <ChooseRide />
          ) : (
            <WhereTo />
          )}
          <ErrorText error={error} />
        </ScrollView>
      </BottomSheet>
    </View>
  );

  function WhereTo() {
    const home = saved.find((s) => s.label === 'home');
    const work = saved.find((s) => s.label === 'work');
    return (
      <>
        <Pressable
          accessibilityRole="search"
          onPress={() => router.push('/search?mode=destination')}
          style={styles.whereTo}
        >
          <Text style={styles.whereToText}>{t('home.whereTo')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/search?mode=pickup')}
          style={styles.pickupRow}
        >
          <Text style={styles.pickupLabel}>{t('home.pickup')}</Text>
          <Text style={styles.pickupValue} numberOfLines={1}>
            {draft.pickup?.address ?? (locating ? t('home.locating') : '—')}
          </Text>
        </Pressable>
        {locationDenied && !draft.pickup && <Body muted>{t('home.locationDenied')}</Body>}
        <View style={styles.chips}>
          {[home, work].map((p) =>
            p ? (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                style={styles.chip}
                onPress={() => draft.setDropoff(p)}
              >
                <Text style={styles.chipText}>
                  {p.label === 'home' ? `🏠 ${t('saved.home')}` : `💼 ${t('saved.work')}`}
                </Text>
              </Pressable>
            ) : null,
          )}
        </View>
        {scheduled.map((s) => (
          <Card key={s.id} tone="wait">
            <Body bold>{t('ride.scheduled', { time: formatTime(s.scheduledFor!) })}</Body>
            <Body>{s.dropoff.address}</Body>
            <Button title={t('ride.cancel')} variant="danger" onPress={() => confirmCancel(s)} />
          </Card>
        ))}
      </>
    );
  }

  function ChooseRide() {
    return (
      <>
        <Title>{t('choose.title')}</Title>
        <Body muted numberOfLines={1}>
          {draft.pickup?.address} → {draft.dropoff?.address}
        </Body>
        {!estimate ? (
          <Body muted>{t('common.loading')}</Body>
        ) : (
          <View accessibilityRole="radiogroup" style={styles.list}>
            {estimate.options.map((o) => (
              <VehicleRow
                key={o.quoteId}
                option={o}
                selected={o.category.key === selected}
                onPress={() => setSelected(o.category.key)}
              />
            ))}
          </View>
        )}
        <Text style={styles.optionLabel}>{t('choose.payWith')}</Text>
        <ScrollView horizontal contentContainerStyle={styles.slots}>
          {[
            { value: 'cash', label: `💵 ${t('pay.cash')}` },
            {
              value: 'wallet',
              label: `👛 ${t('pay.wallet', { amount: formatKobo(wallet?.balanceKobo ?? 0) })}`,
            },
            ...cards.map((c) => ({
              value: `card:${c.id}`,
              label: `💳 ${t('pay.card', { brand: c.brand.toUpperCase(), last4: c.last4 })}`,
            })),
          ].map((o) => (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: pay === o.value }}
              style={[styles.chip, pay === o.value && styles.chipSelected]}
              onPress={() => setPay(o.value)}
            >
              <Text style={styles.chipText}>{o.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {pay === 'wallet' && option && (wallet?.balanceKobo ?? 0) < option.totalKobo && (
          <Body muted>{t('pay.walletShort')}</Body>
        )}
        {wallet && wallet.owedKobo > 0 && (
          <Card tone="bad">
            <Body bold>{t('wallet.owed', { amount: formatKobo(wallet.owedKobo) })}</Body>
            <Body>{t('wallet.owedHint')}</Body>
            <Button
              title={t('wallet.topUp')}
              variant="secondary"
              onPress={() => router.push('/wallet')}
            />
          </Card>
        )}
        <Pressable
          accessibilityRole="button"
          style={styles.optionRow}
          onPress={() => setChoosingTime((v) => !v)}
        >
          <Text style={styles.optionLabel}>{t('choose.when')}</Text>
          <Text style={styles.optionValue}>
            {when ? formatTime(when.toISOString()) : t('choose.now')} ▾
          </Text>
        </Pressable>
        {choosingTime && (
          <ScrollView horizontal contentContainerStyle={styles.slots}>
            {[null, ...scheduleSlots(new Date())].map((slot) => (
              <Pressable
                key={slot?.toISOString() ?? 'now'}
                accessibilityRole="radio"
                accessibilityState={{
                  selected: (when?.getTime() ?? null) === (slot?.getTime() ?? null),
                }}
                style={[
                  styles.chip,
                  (when?.getTime() ?? null) === (slot?.getTime() ?? null) && styles.chipSelected,
                ]}
                onPress={() => {
                  setWhen(slot);
                  setChoosingTime(false);
                }}
              >
                <Text style={styles.chipText}>
                  {slot ? formatTime(slot.toISOString()) : t('choose.now')}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        <Body muted>{t('choose.priceNote')}</Body>
        <Button
          title={
            option
              ? when
                ? t('choose.schedule', {
                    category: option.category.name,
                    time: formatTime(when.toISOString()),
                  })
                : t('choose.request', {
                    category: option.category.name,
                    price: formatKobo(option.totalKobo),
                  })
              : t('common.loading')
          }
          onPress={() => void request()}
          disabled={!option || (wallet?.owedKobo ?? 0) > 0}
          busy={busy}
        />
        <Button
          title={t('common.cancel')}
          variant="secondary"
          onPress={() => draft.setDropoff(null)}
        />
      </>
    );
  }

  function ActiveRide() {
    if (!ride) return null;
    const phase = ridePhase(ride);
    const name = ride.driver?.firstName ?? '';
    return (
      <>
        {phase === 'searching' && (
          <>
            <Title>{t('ride.searching')}</Title>
            <Body muted>{t('ride.searchingHint')}</Body>
          </>
        )}
        {phase === 'driver_coming' && <Title>{t('ride.driverComing', { name })}</Title>}
        {phase === 'driver_here' && (
          <>
            <Title>{t('ride.driverHere', { name })}</Title>
            <Body>{t('ride.driverHereHint')}</Body>
          </>
        )}
        {phase === 'on_trip' && <Title>{t('ride.onTrip')}</Title>}
        {age?.stale && ACTIVE_RIDE_STATUSES.includes(ride.status) && (
          <Body muted>{t('ride.lastUpdated', { seconds: age.seconds })}</Body>
        )}
        {ride.driver && ACTIVE_RIDE_STATUSES.includes(ride.status) && <DriverCard ride={ride} />}
        {phase === 'completed' && (
          <>
            <Title>{t('ride.completed')}</Title>
            <Card tone={ride.payment.status === 'outstanding' ? 'bad' : 'ok'}>
              <PaymentLine ride={ride} />
            </Card>
            <FareLines ride={ride} />
          </>
        )}
        {phase === 'cancelled' && (
          <>
            <Title>{t('ride.cancelled')}</Title>
            {ride.status === 'cancelled_by_driver' && <Body>{t('ride.cancelledByDriver')}</Body>}
            {ride.status === 'cancelled_by_admin' && <Body>{t('ride.cancelledByAdmin')}</Body>}
            {ride.fare.cancellationFeeKobo > 0 && (
              <>
                <FareLines ride={ride} />
                <PaymentLine ride={ride} />
              </>
            )}
          </>
        )}
        {phase === 'no_driver' && (
          <>
            <Title>{t('ride.cancelled')}</Title>
            <Body>{t('ride.noDriver')}</Body>
          </>
        )}
        {ACTIVE_RIDE_STATUSES.includes(ride.status) && phase !== 'completed' && (
          <View style={styles.optionRow}>
            <Text style={styles.optionLabel}>{t('ride.fare')}</Text>
            <Text style={styles.optionValue}>
              {formatKobo(ride.fare.quotedTotalKobo)} · 💵 {t('choose.cash')}
            </Text>
          </View>
        )}
        {canCancel(ride.status) && (
          <Button title={t('ride.cancel')} variant="danger" onPress={() => confirmCancel(ride)} />
        )}
        {!ACTIVE_RIDE_STATUSES.includes(ride.status) && (
          <Button title={t('ride.done')} onPress={finish} />
        )}
      </>
    );
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.surface },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  topButtons: { flexDirection: 'row', justifyContent: 'space-between', padding: spacing[3] },
  roundButton: {
    minHeight: 44,
    paddingHorizontal: spacing[4],
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  roundText: { fontSize: typography.size.md, fontWeight: '700', color: colors.primary },
  sheetContent: { gap: spacing[3], paddingBottom: spacing[8] },
  whereTo: {
    minHeight: 56,
    borderRadius: radius.md,
    backgroundColor: colors.grey[100],
    paddingHorizontal: spacing[4],
    justifyContent: 'center',
  },
  whereToText: { fontSize: typography.size.xl, fontWeight: '800', color: colors.text },
  pickupRow: { minHeight: 48, justifyContent: 'center' },
  pickupLabel: { fontSize: typography.size.sm, color: colors.textMuted },
  pickupValue: { fontSize: typography.size.md, fontWeight: '600', color: colors.text },
  chips: { flexDirection: 'row', gap: spacing[2], flexWrap: 'wrap' },
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing[4],
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  chipSelected: { borderColor: colors.accent, backgroundColor: '#FFF7E8' },
  chipText: { fontSize: typography.size.md, fontWeight: '700', color: colors.text },
  list: { gap: spacing[2] },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
  },
  optionLabel: { fontSize: typography.size.md, color: colors.textMuted },
  optionValue: { fontSize: typography.size.md, fontWeight: '700', color: colors.text },
  slots: { gap: spacing[2], paddingVertical: spacing[1] },
});
