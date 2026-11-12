import * as Location from 'expo-location';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { newIdempotencyKey } from '@rideswithme/api-client';
import type { Place, PlaceSuggestion, SavedPlace } from '@rideswithme/shared-types';
import { colors, radius, spacing, typography } from '@rideswithme/ui-components';
import { Body, ErrorText, Screen } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/session';
import { useTripDraft } from '@/lib/trip-draft';

type Mode = 'pickup' | 'destination' | 'save-home' | 'save-work';

/** Place search with autocomplete. Results are limited to Nigeria and biased to the pickup. */
export default function Search() {
  const { mode = 'destination' } = useLocalSearchParams<{ mode?: Mode }>();
  const { t } = useI18n();
  const draft = useTripDraft();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSuggestion[] | null>(null);
  const [saved, setSaved] = useState<SavedPlace[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // One session token per search groups the calls for map billing.
  const sessionToken = useMemo(() => newIdempotencyKey().replace(/[^A-Za-z0-9_-]/g, ''), []);
  const latest = useRef(0);

  useEffect(() => {
    if (mode === 'destination' || mode === 'pickup')
      api.places.saved().then(setSaved, () => undefined);
  }, [mode]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    const id = ++latest.current;
    const timer = setTimeout(() => {
      setBusy(true);
      api.places
        .autocomplete(q, draft.pickup?.location, sessionToken)
        .then(
          (r) => id === latest.current && setResults(r),
          (err: unknown) => id === latest.current && setError(err),
        )
        .finally(() => id === latest.current && setBusy(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, draft.pickup, sessionToken]);

  async function choose(place: Place) {
    if (mode === 'pickup') {
      draft.setPickup(place);
      draft.setPickupChosen(true);
    } else if (mode === 'destination') {
      draft.setDropoff(place);
    } else {
      const label = mode === 'save-home' ? 'home' : 'work';
      await api.places.save({
        label,
        name: t(label === 'home' ? 'saved.home' : 'saved.work'),
        address: place.address,
        location: place.location,
        ...(place.placeId && { placeId: place.placeId }),
      });
    }
    router.back();
  }

  async function pick(s: PlaceSuggestion) {
    setError(null);
    try {
      await choose(await api.places.details(s.placeId, sessionToken));
    } catch (err) {
      setError(err);
    }
  }

  async function useCurrent() {
    setError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await choose(
        await api.places.reverse({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      );
    } catch (err) {
      setError(err);
    }
  }

  const title =
    mode === 'pickup'
      ? t('home.pickup')
      : mode === 'save-home'
        ? t('saved.setHome')
        : mode === 'save-work'
          ? t('saved.setWork')
          : t('home.whereTo');

  return (
    <Screen>
      <Stack.Screen options={{ title }} />
      <TextInput
        autoFocus
        value={query}
        onChangeText={setQuery}
        placeholder={
          mode === 'pickup' ? t('search.pickupPlaceholder') : t('search.destinationPlaceholder')
        }
        placeholderTextColor={colors.textDisabled}
        accessibilityLabel={title}
        style={styles.input}
        returnKeyType="search"
      />
      {mode === 'pickup' && (
        <Row title={t('search.useCurrent')} onPress={() => void useCurrent()} />
      )}
      {(mode === 'destination' || mode === 'pickup') &&
        !results &&
        saved.map((s) => (
          <Row
            key={s.id}
            title={
              s.label === 'other' ? s.name : t(s.label === 'home' ? 'saved.home' : 'saved.work')
            }
            subtitle={s.address}
            onPress={() => void choose(s)}
          />
        ))}
      {busy && <ActivityIndicator color={colors.primary} />}
      <ErrorText error={error} />
      {query.trim().length > 0 && query.trim().length < 2 && (
        <Body muted>{t('search.typeMore')}</Body>
      )}
      {results?.length === 0 && <Body muted>{t('search.noResults')}</Body>}
      {results?.map((r) => (
        <Row
          key={r.placeId}
          title={r.primaryText}
          subtitle={r.secondaryText}
          onPress={() => void pick(r)}
        />
      ))}
    </Screen>
  );
}

function Row({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={styles.rowTitle}>{title}</Text>
      {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.primary,
    paddingHorizontal: spacing[4],
    fontSize: typography.size.lg,
    backgroundColor: colors.background,
    color: colors.text,
  },
  row: {
    minHeight: 56,
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
  rowTitle: { fontSize: typography.size.md, fontWeight: '700', color: colors.text },
  rowSub: { fontSize: typography.size.sm, color: colors.textMuted },
});
