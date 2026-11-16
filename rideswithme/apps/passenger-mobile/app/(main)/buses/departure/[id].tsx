import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { newIdempotencyKey } from '@rideswithme/api-client';
import type { BusDepartureDetail, BusSeatMapSeat } from '@rideswithme/shared-types';
import { spacing } from '@rideswithme/ui-components';
import { formatKobo } from '@rideswithme/utilities';
import { BUS_MAX_SEATS_PER_BOOKING } from '@rideswithme/validation';
import { DepartureText, SeatGrid } from '@/components/bus';
import { Body, Button, Card, ErrorText, ErrorView, Field, Loading, Screen } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/session';

/** Choose seats and name each traveller, then hold the seats and pay. */
export default function DepartureScreen() {
  const { t } = useI18n();
  const [myName, setMyName] = useState('');
  const { id } = useLocalSearchParams<{ id: string }>();
  const [d, setD] = useState<BusDepartureDetail | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef(newIdempotencyKey());

  const load = useCallback(() => {
    api.bus.departure(id).then((x) => {
      setD(x);
      setLoadError(null);
    }, setLoadError);
  }, [id]);
  useEffect(load, [load]);
  useEffect(() => {
    api.me.get().then(
      (m) => setMyName(m.fullName ?? ''),
      () => undefined,
    );
  }, []);

  if (loadError) return <ErrorView error={loadError} onRetry={load} />;
  if (!d) return <Loading />;
  const seats = d.layout.seats;
  const chosenSeats = seats.filter((s) => chosen.includes(s.id));
  const total = chosenSeats.reduce((sum, s) => sum + s.fareKobo, 0);
  const nameOf = (s: BusSeatMapSeat, i: number) => names[s.id] ?? (i === 0 ? myName : '');

  const toggle = (s: BusSeatMapSeat) => {
    key.current = newIdempotencyKey();
    setChosen((c) =>
      c.includes(s.id)
        ? c.filter((x) => x !== s.id)
        : c.length >= BUS_MAX_SEATS_PER_BOOKING
          ? c
          : [...c, s.id],
    );
  };

  async function hold() {
    setBusy(true);
    setError(null);
    try {
      const b = await api.bus.hold(
        {
          scheduleId: d!.id,
          seats: chosenSeats.map((s, i) => ({ seatId: s.id, passengerName: nameOf(s, i).trim() })),
        },
        key.current,
      );
      router.replace(`/buses/booking/${b.id}`);
    } catch (err) {
      setError(err);
      key.current = newIdempotencyKey();
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <DepartureText d={d} />
      <Body muted>{t('bus.maxSeats', { count: BUS_MAX_SEATS_PER_BOOKING })}</Body>
      <SeatGrid
        rows={d.layout.rows}
        columns={d.layout.columns}
        seats={seats}
        chosen={chosen}
        onToggle={toggle}
      />
      {chosenSeats.length > 0 && (
        <Card>
          <View style={{ gap: spacing[2] }}>
            {chosenSeats.map((s, i) => (
              <Field
                key={s.id}
                label={t('bus.passengerName', { label: s.label })}
                value={nameOf(s, i)}
                onChangeText={(v) => setNames((n) => ({ ...n, [s.id]: v }))}
                autoComplete={i === 0 ? 'name' : 'off'}
              />
            ))}
            <Body bold>{t('bus.total', { amount: formatKobo(total) })}</Body>
            <Body muted>{t('bus.holdNote')}</Body>
          </View>
        </Card>
      )}
      <ErrorText error={error} />
      <Button
        title={d.salesOpen ? t('bus.hold') : t('bus.closed')}
        onPress={() => void hold()}
        busy={busy}
        disabled={
          !d.salesOpen ||
          chosenSeats.length === 0 ||
          chosenSeats.some((s, i) => nameOf(s, i).trim().length < 2)
        }
      />
    </Screen>
  );
}
