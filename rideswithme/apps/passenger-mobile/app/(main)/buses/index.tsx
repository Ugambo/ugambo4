import { Link, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BusCityPair, BusDepartureSummary } from '@rideswithme/shared-types';
import { colors, radius, spacing } from '@rideswithme/ui-components';
import { formatKobo } from '@rideswithme/utilities';
import { DepartureText } from '@/components/bus';
import {
  Body,
  Button,
  Card,
  Empty,
  ErrorText,
  ErrorView,
  Loading,
  Screen,
  Title,
} from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/session';

const lagosDate = (days: number) =>
  new Date(Date.now() + 3_600_000 + days * 86_400_000).toISOString().slice(0, 10);

function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
  text = (v: T) => v,
}: {
  label: string;
  options: T[];
  value: T;
  onChange: (v: T) => void;
  text?: (v: T) => string;
}) {
  return (
    <View style={{ gap: spacing[2] }}>
      <Body bold>{label}</Body>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o) => (
          <Pressable
            key={o}
            accessibilityRole="radio"
            accessibilityState={{ checked: o === value }}
            onPress={() => onChange(o)}
            style={[styles.chip, o === value && styles.chipOn]}
          >
            <Text style={[styles.chipText, o === value && { color: colors.onPrimary }]}>
              {text(o)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Find a bus: cities, a day in the next two weeks, then the departures. */
export default function BusSearch() {
  const { t, lang } = useI18n();
  const [pairs, setPairs] = useState<BusCityPair[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [date, setDate] = useState(lagosDate(1));
  const [results, setResults] = useState<BusDepartureSummary[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.bus.cities().then((p) => {
      setPairs(p);
      setLoadError(null);
    }, setLoadError);
  }, []);
  useEffect(load, [load]);

  const origins = [...new Set((pairs ?? []).map((p) => p.originCity))];
  const destinations = (pairs ?? [])
    .filter((p) => p.originCity === from)
    .map((p) => p.destinationCity);
  useEffect(() => {
    if (!from && origins[0]) setFrom(origins[0]);
  }, [from, origins]);
  useEffect(() => {
    if (from && !destinations.includes(to) && destinations[0]) setTo(destinations[0]);
  }, [from, to, destinations]);

  const days = Array.from({ length: 14 }, (_, i) => lagosDate(i));
  const dayText = (d: string) =>
    new Intl.DateTimeFormat(lang === 'ha' ? 'ha-NG' : 'en-NG', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${d}T12:00:00Z`));

  async function search() {
    setBusy(true);
    setError(null);
    try {
      setResults(await api.bus.search({ from, to, date }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <ErrorView error={loadError} onRetry={load} />;
  if (!pairs) return <Loading />;
  return (
    <Screen>
      <Title>{t('bus.title')}</Title>
      <Body muted>{t('bus.subtitle')}</Body>
      <Link href="/buses/bookings" asChild>
        <Pressable accessibilityRole="link">
          <Text style={styles.link}>{t('bus.myTickets')} →</Text>
        </Pressable>
      </Link>
      {pairs.length === 0 ? (
        <Empty message={t('bus.noRoutes')} />
      ) : (
        <Card>
          <Chips label={t('bus.from')} options={origins} value={from} onChange={setFrom} />
          <Chips label={t('bus.to')} options={destinations} value={to} onChange={setTo} />
          <Chips
            label={t('bus.date')}
            options={days}
            value={date}
            onChange={setDate}
            text={dayText}
          />
          <ErrorText error={error} />
          <Button title={t('bus.search')} onPress={() => void search()} busy={busy} />
        </Card>
      )}
      {results && results.length === 0 && <Empty message={t('bus.noResults')} />}
      {results?.map((d) => (
        <Card key={d.id}>
          <DepartureText d={d} />
          <Body bold>
            {t('bus.fromPrice', {
              amount: formatKobo(Math.min(...d.fares.map((f) => f.fareKobo))),
            })}{' '}
            · {d.seatsLeft === 0 ? t('bus.full') : t('bus.seatsLeft', { count: d.seatsLeft })}
          </Body>
          <Button
            title={
              d.salesOpen ? (d.seatsLeft > 0 ? t('bus.choose') : t('bus.full')) : t('bus.closed')
            }
            disabled={!d.salesOpen || d.seatsLeft === 0}
            onPress={() => router.push(`/buses/departure/${d.id}`)}
          />
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontWeight: '600' },
  link: { color: colors.primary, fontWeight: '700', paddingVertical: spacing[2] },
});
