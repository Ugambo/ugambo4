import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError, newIdempotencyKey } from '@rideswithme/api-client';
import { formatDateTime, runCheckout } from '@rideswithme/mobile-core';
import type {
  PaymentView,
  SavedCardView,
  WalletEntryView,
  WalletView,
} from '@rideswithme/shared-types';
import { colors, radius, spacing, typography } from '@rideswithme/ui-components';
import { formatKobo, nairaToKobo } from '@rideswithme/utilities';
import { Body, Button, Card, ErrorText, ErrorView, Loading, Screen, Title } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import { api } from '@/lib/session';

/** Where the payment page sends the payer back (the app's deep link; matches the API's PAYMENT_RETURN_URL_APP). */
const RETURN_URL = 'rideswithme://wallet';
const PRESETS = [100_000, 200_000, 500_000, 1_000_000];

/** Balance, money owed, top-ups through the payment page, saved cards and activity. */
export default function Wallet() {
  const { t } = useI18n();
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [cards, setCards] = useState<SavedCardView[]>([]);
  const [entries, setEntries] = useState<WalletEntryView[]>([]);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<PaymentView | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    Promise.all([api.wallet.get(), api.payments.cards(), api.wallet.transactions()]).then(
      ([w, c, e]) => {
        setWallet(w);
        setCards(c);
        setEntries(e.items);
      },
      setLoadError,
    );
  }, []);
  useFocusEffect(load);

  async function pay(
    start: (key: string) => Promise<Awaited<ReturnType<typeof api.wallet.topUp>>>,
  ) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const key = newIdempotencyKey();
      setResult(
        await runCheckout(
          () => start(key),
          (id) => api.payments.get(id, true),
          RETURN_URL,
        ),
      );
      load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  function topUp() {
    let kobo: number;
    try {
      kobo = nairaToKobo(amount);
    } catch {
      setError(new ApiError(0, 'VALIDATION_FAILED', 'Not an amount'));
      return;
    }
    void pay((key) => api.wallet.topUp({ amountKobo: kobo, returnTo: 'app' }, key));
  }

  function removeCard(card: SavedCardView) {
    Alert.alert(t('pay.card', { brand: card.brand.toUpperCase(), last4: card.last4 }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('wallet.removeCard'),
        style: 'destructive',
        onPress: () => void api.payments.removeCard(card.id).then(load, setError),
      },
    ]);
  }

  if (!wallet) return loadError ? <ErrorView error={loadError} onRetry={load} /> : <Loading />;
  const { limits } = wallet;

  return (
    <Screen>
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
      <Card>
        <Body muted>{t('wallet.balance')}</Body>
        <Text style={styles.balance} accessibilityRole="header">
          {formatKobo(wallet.balanceKobo)}
        </Text>
        {wallet.heldKobo > 0 && (
          <Body muted>{t('wallet.held', { amount: formatKobo(wallet.heldKobo) })}</Body>
        )}
      </Card>
      {wallet.owedKobo > 0 && (
        <Card tone="bad">
          <Body bold>{t('wallet.owed', { amount: formatKobo(wallet.owedKobo) })}</Body>
          <Body>{t('wallet.owedHint')}</Body>
        </Card>
      )}

      <Title>{t('wallet.topUp')}</Title>
      <View style={styles.chips}>
        {PRESETS.filter((k) => k >= limits.topUpMinKobo && k <= limits.topUpMaxKobo).map((k) => (
          <Pressable
            key={k}
            accessibilityRole="button"
            style={styles.chip}
            onPress={() => setAmount(String(k / 100))}
          >
            <Text style={styles.chipText}>{formatKobo(k)}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>{t('wallet.amount')}</Text>
      <TextInput
        accessibilityLabel={t('wallet.amount')}
        style={styles.input}
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ''))}
      />
      <Body muted>
        {t('wallet.amountHint', {
          min: formatKobo(limits.topUpMinKobo),
          max: formatKobo(limits.topUpMaxKobo),
        })}
      </Body>
      <ErrorText error={error} />
      <Button title={t('wallet.topUp')} onPress={topUp} disabled={!amount} busy={busy} />

      <Title>{t('wallet.cards')}</Title>
      <Card>
        {cards.length === 0 && <Body muted>{t('wallet.cardsEmpty')}</Body>}
        {cards.map((c) => (
          <View key={c.id} style={styles.row}>
            <Body>
              💳 {t('pay.card', { brand: c.brand.toUpperCase(), last4: c.last4 })} ·{' '}
              {String(c.expMonth).padStart(2, '0')}/{String(c.expYear).slice(-2)}
              {c.expired ? ` · ${t('wallet.expired')}` : ''}
            </Body>
            <Pressable accessibilityRole="button" onPress={() => removeCard(c)}>
              <Text style={styles.link}>{t('wallet.removeCard')}</Text>
            </Pressable>
          </View>
        ))}
        <Body muted>{t('wallet.addCardHint', { amount: formatKobo(limits.cardCheckKobo) })}</Body>
        <Button
          title={t('wallet.addCard')}
          variant="secondary"
          busy={busy}
          onPress={() => void pay((key) => api.payments.addCard({ returnTo: 'app' }, key))}
        />
      </Card>

      <Title>{t('wallet.history')}</Title>
      <Card>
        {entries.length === 0 && <Body muted>{t('wallet.empty')}</Body>}
        {entries.map((e) => (
          <View key={e.id} style={styles.row}>
            <View style={styles.entryText}>
              <Body bold>{t(`entry.${e.kind}` as MessageKey)}</Body>
              <Body muted>{formatDateTime(e.createdAt)}</Body>
            </View>
            <Text style={[styles.amount, e.amountKobo > 0 && styles.moneyIn]}>
              {e.amountKobo > 0 ? '+' : '−'}
              {formatKobo(Math.abs(e.amountKobo))}
            </Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  balance: { fontSize: 40, fontWeight: '800', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing[3],
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  chipText: { fontSize: typography.size.md, color: colors.text },
  label: { fontSize: typography.size.md, fontWeight: '700', color: colors.text },
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
    justifyContent: 'space-between',
    gap: spacing[3],
    minHeight: 48,
  },
  entryText: { flex: 1 },
  amount: { fontSize: typography.size.md, fontWeight: '700', color: colors.text },
  moneyIn: { color: colors.success },
  link: { fontSize: typography.size.md, fontWeight: '700', color: colors.primary },
});
