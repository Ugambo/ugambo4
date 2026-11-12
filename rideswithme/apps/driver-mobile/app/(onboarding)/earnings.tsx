import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DriverRideView } from '@rideswithme/shared-types';
import { colors, spacing, typography } from '@rideswithme/ui-components';
import { formatKobo } from '@rideswithme/utilities';
import { Body, Button, Card, Empty, ErrorView, Loading, Screen, Title } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import { api } from '@/lib/session';
import { type EarningsSummary, summarizeEarnings } from '@/lib/trips';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

/** Today and this week, then each trip with the fee taken. Payouts arrive in Phase 5. */
export default function Earnings() {
  const { t } = useI18n();
  const [rides, setRides] = useState<DriverRideView[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (next?: string) => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.trips.history(next);
      setRides((prev) => (next && prev ? [...prev, ...page.items] : page.items));
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

  if (!rides) return error ? <ErrorView error={error} onRetry={() => void load()} /> : <Loading />;
  const summary = summarizeEarnings(rides);

  return (
    <Screen onRefresh={() => void load()} refreshing={loading}>
      <View style={styles.cards}>
        <Period label={t('earnings.today')} s={summary.today} />
        <Period label={t('earnings.week')} s={summary.week} />
      </View>
      <Body muted>{t('earnings.cashNote')}</Body>
      <Title>{t('earnings.history')}</Title>
      {rides.length === 0 && <Empty message={t('earnings.empty')} />}
      {rides.map((r) => (
        <View key={r.id} style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {r.dropoff.address}
            </Text>
            <Text style={styles.meta}>
              {when(r.requestedAt)} · {t(r.status === 'completed' ? 'trip.done' : 'trip.cancelled')}
            </Text>
            {r.earnings && (
              <Text style={styles.meta}>
                {formatKobo(r.earnings.fareKobo)} −{' '}
                {formatKobo(r.earnings.commissionKobo + r.earnings.bookingFeeKobo)}
              </Text>
            )}
          </View>
          <Text style={styles.net}>{r.earnings ? formatKobo(r.earnings.netKobo) : '—'}</Text>
        </View>
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

  function Period({ label, s }: { label: string; s: EarningsSummary }) {
    return (
      <View style={styles.card}>
        <Card>
          <Text style={styles.meta}>{label}</Text>
          <Text style={styles.big}>{formatKobo(s.netKobo)}</Text>
          <Text style={styles.meta}>{t('earnings.trips' as MessageKey, { count: s.trips })}</Text>
          <Text style={styles.meta}>
            {t('earnings.commission')}: {formatKobo(s.commissionKobo)}
          </Text>
        </Card>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  cards: { flexDirection: 'row', gap: spacing[3] },
  card: { flex: 1 },
  big: { fontSize: typography.size['2xl'], fontWeight: '800', color: colors.success },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 64,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: typography.size.md, fontWeight: '700', color: colors.text },
  meta: { fontSize: typography.size.sm, color: colors.textMuted },
  net: { fontSize: typography.size.md, fontWeight: '800', color: colors.text },
});
