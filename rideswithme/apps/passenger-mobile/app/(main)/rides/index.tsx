import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RideView } from '@rideswithme/shared-types';
import { colors, spacing, typography } from '@rideswithme/ui-components';
import { formatKobo } from '@rideswithme/utilities';
import { CATEGORY_ICON, StatusLabel } from '@/components/ride-parts';
import { Button, Empty, ErrorView, Loading, Screen } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/session';

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

export default function History() {
  const { t } = useI18n();
  const [items, setItems] = useState<RideView[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (next?: string) => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.rides.history(next);
      setItems((prev) => (next && prev ? [...prev, ...page.items] : page.items));
      setCursor(page.nextCursor);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!items) return error ? <ErrorView error={error} onRetry={() => void load()} /> : <Loading />;
  if (items.length === 0) return <Empty message={t('history.empty')} />;

  return (
    <Screen onRefresh={() => void load()} refreshing={loading}>
      {items.map((r) => (
        <Link key={r.id} href={`/rides/${r.id}`} asChild>
          <Pressable accessibilityRole="button" style={styles.row}>
            <Text style={styles.icon}>{CATEGORY_ICON[r.category.key] ?? '🚗'}</Text>
            <View style={styles.text}>
              <Text style={styles.title} numberOfLines={1}>
                {r.dropoff.address}
              </Text>
              <Text style={styles.meta}>{dateTime(r.requestedAt)}</Text>
              <StatusLabel ride={r} />
            </View>
            <Text style={styles.price}>
              {formatKobo(r.fare.finalTotalKobo ?? r.fare.quotedTotalKobo)}
            </Text>
          </Pressable>
        </Link>
      ))}
      {cursor && (
        <Button
          title={t('common.continue')}
          variant="secondary"
          onPress={() => void load(cursor)}
          busy={loading}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 72,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  icon: { fontSize: 28 },
  text: { flex: 1 },
  title: { fontSize: typography.size.md, fontWeight: '700', color: colors.text },
  meta: { fontSize: typography.size.sm, color: colors.textMuted },
  price: { fontSize: typography.size.md, fontWeight: '800', color: colors.text },
});
