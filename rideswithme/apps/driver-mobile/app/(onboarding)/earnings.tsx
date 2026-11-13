import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError, newIdempotencyKey } from '@rideswithme/api-client';
import { formatDateTime, runCheckout } from '@rideswithme/mobile-core';
import type {
  DriverRideView,
  DriverWalletView,
  EarningsPeriod,
  PaymentView,
  PayoutView,
  WalletEntryView,
} from '@rideswithme/shared-types';
import { colors, radius, spacing, typography } from '@rideswithme/ui-components';
import { formatKobo, nairaToKobo } from '@rideswithme/utilities';
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
import type { MessageKey } from '@/lib/messages';
import { api } from '@/lib/session';

/** The payment page sends the driver back here (matches the API's PAYMENT_RETURN_URL_DRIVER_APP). */
const RETURN_URL = 'rideswithme-driver://wallet';

const toKobo = (naira: string): number => {
  try {
    return nairaToKobo(naira);
  } catch {
    throw new ApiError(0, 'VALIDATION_FAILED', 'Not an amount');
  }
};

/** Earnings today and this week, the wallet (what is owed or can be withdrawn), withdrawals and trips. */
export default function Earnings() {
  const { t } = useI18n();
  const [wallet, setWallet] = useState<DriverWalletView | null>(null);
  const [payouts, setPayouts] = useState<PayoutView[]>([]);
  const [entries, setEntries] = useState<WalletEntryView[]>([]);
  const [rides, setRides] = useState<DriverRideView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<PaymentView | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setLoadError(null);
    try {
      const [w, p, e, h] = await Promise.all([
        api.driverWallet.get(),
        api.driverWallet.payouts(),
        api.driverWallet.transactions(),
        api.trips.history(),
      ]);
      setWallet(w);
      setPayouts(p);
      setEntries(e.items);
      setRides(h.items);
      setCursor(h.nextCursor);
      // Suggest topping up exactly what is owed.
      if (w.balanceKobo < 0) setTopUpAmount((v) => v || String(Math.ceil(-w.balanceKobo / 100)));
    } catch (err) {
      setLoadError(err);
    } finally {
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const topUp = () =>
    run(async () => {
      const amountKobo = toKobo(topUpAmount);
      const key = newIdempotencyKey();
      setResult(
        await runCheckout(
          () => api.driverWallet.topUp({ amountKobo, returnTo: 'app' }, key),
          (id) => api.payments.get(id, true),
          RETURN_URL,
        ),
      );
      setTopUpAmount('');
    });

  const withdraw = () =>
    run(async () => {
      await api.driverWallet.requestPayout(
        { amountKobo: toKobo(payoutAmount) },
        newIdempotencyKey(),
      );
      setPayoutAmount('');
    });

  const more = async () => {
    if (!cursor) return;
    const page = await api.trips.history(cursor);
    setRides((r) => [...r, ...page.items]);
    setCursor(page.nextCursor);
  };

  if (!wallet)
    return loadError ? <ErrorView error={loadError} onRetry={() => void load()} /> : <Loading />;
  const owes = wallet.balanceKobo < 0;
  const { payout } = wallet;

  return (
    <Screen onRefresh={() => void load()} refreshing={refreshing}>
      <View style={styles.cards}>
        <Period label={t('earnings.today')} p={wallet.earnings.today} />
        <Period label={t('earnings.week')} p={wallet.earnings.week} />
      </View>

      {result && (
        <Card
          tone={result.status === 'succeeded' ? 'ok' : result.status === 'pending' ? 'wait' : 'bad'}
        >
          <Body bold>
            {result.status === 'succeeded'
              ? t('wallet.topUpDone', { amount: formatKobo(result.amountKobo) })
              : result.status === 'pending'
                ? t('wallet.topUpPending')
                : t('wallet.topUpFailed')}
          </Body>
        </Card>
      )}

      <Card tone={!wallet.canGoOnline ? 'bad' : undefined}>
        <Body muted>{t('wallet.balance')}</Body>
        <Text style={[styles.balance, owes && styles.owes]}>
          {owes ? `−${formatKobo(-wallet.balanceKobo)}` : formatKobo(wallet.balanceKobo)}
        </Text>
        {owes && <Body bold>{t('wallet.owe', { amount: formatKobo(-wallet.balanceKobo) })}</Body>}
        {!wallet.canGoOnline && (
          <Body>{t('wallet.blocked', { limit: formatKobo(wallet.debtLimitKobo) })}</Body>
        )}
        <Body muted>{t('wallet.oweHint')}</Body>
      </Card>

      {owes && (
        <Card>
          <Title>{t('wallet.topUp')}</Title>
          <AmountInput value={topUpAmount} onChange={setTopUpAmount} />
          <Body muted>
            {t('wallet.amountHint', {
              min: formatKobo(wallet.limits.topUpMinKobo),
              max: formatKobo(wallet.limits.topUpMaxKobo),
            })}
          </Body>
          <Button
            title={t('wallet.topUp')}
            variant="accent"
            onPress={() => void topUp()}
            busy={busy}
            disabled={!topUpAmount}
          />
        </Card>
      )}

      <Card>
        <Title>{t('payout.withdrawTitle')}</Title>
        <Body bold>{t('payout.available', { amount: formatKobo(payout.availableKobo) })}</Body>
        {payout.account ? (
          <Body muted>
            {t('payout.account', { last4: payout.account.last4, name: payout.account.name })}
          </Body>
        ) : (
          <Body muted>{t('payout.noAccount')}</Body>
        )}
        {payout.pausedUntil && (
          <Body>{t('payout.paused', { time: formatDateTime(payout.pausedUntil) })}</Body>
        )}
        <AmountInput value={payoutAmount} onChange={setPayoutAmount} />
        <Body muted>{t('payout.min', { amount: formatKobo(payout.minKobo) })}</Body>
        <ErrorText error={error} />
        <Button
          title={t('payout.withdraw')}
          onPress={() => void withdraw()}
          busy={busy}
          disabled={
            !payoutAmount ||
            payout.availableKobo < payout.minKobo ||
            !!payout.pausedUntil ||
            !payout.account
          }
        />
      </Card>

      {payouts.length > 0 && (
        <>
          <Title>{t('payout.history')}</Title>
          {payouts.map((p) => (
            <View key={p.id} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{t(`payout.status.${p.status}` as MessageKey)}</Text>
                <Text style={styles.meta}>
                  {formatDateTime(p.requestedAt)} · •••• {p.account.last4}
                </Text>
              </View>
              <Text style={styles.net}>{formatKobo(p.amountKobo)}</Text>
            </View>
          ))}
        </>
      )}

      <Title>{t('wallet.activity')}</Title>
      {entries.length === 0 && <Empty message={t('wallet.empty')} />}
      {entries.map((e) => (
        <View key={e.id} style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>{t(`entry.${e.kind}` as MessageKey)}</Text>
            <Text style={styles.meta}>{formatDateTime(e.createdAt)}</Text>
          </View>
          <Text style={[styles.net, e.amountKobo > 0 ? styles.moneyIn : styles.moneyOut]}>
            {e.amountKobo > 0 ? '+' : '−'}
            {formatKobo(Math.abs(e.amountKobo))}
          </Text>
        </View>
      ))}

      <Title>{t('earnings.history')}</Title>
      {rides.length === 0 && <Empty message={t('earnings.empty')} />}
      {rides.map((r) => (
        <View key={r.id} style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {r.dropoff.address}
            </Text>
            <Text style={styles.meta}>
              {formatDateTime(r.requestedAt)} ·{' '}
              {t(r.status === 'completed' ? 'trip.done' : 'trip.cancelled')}
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
        <Button title={t('common.continue')} variant="secondary" onPress={() => void more()} />
      )}
    </Screen>
  );

  function Period({ label, p }: { label: string; p: EarningsPeriod }) {
    return (
      <View style={styles.card}>
        <Card>
          <Text style={styles.meta}>{label}</Text>
          <Text style={styles.big}>{formatKobo(p.earningsKobo)}</Text>
          <Text style={styles.meta}>{t('earnings.trips', { count: p.trips })}</Text>
          <Text style={styles.meta}>
            {t('earnings.commission')}: {formatKobo(p.commissionKobo + p.bookingFeesKobo)}
          </Text>
          <Text style={styles.meta}>
            {t('earnings.cash', { amount: formatKobo(p.cashCollectedKobo) })}
          </Text>
        </Card>
      </View>
    );
  }

  function AmountInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
      <TextInput
        accessibilityLabel={t('wallet.amount')}
        placeholder={t('wallet.amount')}
        style={styles.input}
        keyboardType="decimal-pad"
        value={value}
        onChangeText={(v) => onChange(v.replace(/[^\d.]/g, ''))}
      />
    );
  }
}

const styles = StyleSheet.create({
  cards: { flexDirection: 'row', gap: spacing[3] },
  card: { flex: 1 },
  big: { fontSize: typography.size['2xl'], fontWeight: '800', color: colors.success },
  balance: { fontSize: 36, fontWeight: '800', color: colors.text },
  owes: { color: colors.danger },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    fontSize: typography.size.lg,
    color: colors.text,
  },
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
  moneyIn: { color: colors.success },
  moneyOut: { color: colors.text },
});
