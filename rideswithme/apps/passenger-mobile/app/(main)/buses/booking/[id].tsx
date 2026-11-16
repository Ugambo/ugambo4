import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { newIdempotencyKey } from '@rideswithme/api-client';
import { formatDateTime, formatTime, runCheckout } from '@rideswithme/mobile-core';
import type { BusBookingView, SavedCardView, WalletView } from '@rideswithme/shared-types';
import { colors, radius, spacing } from '@rideswithme/ui-components';
import { formatKobo } from '@rideswithme/utilities';
import { BookingPill, DepartureText, QrCode, useSeatClass } from '@/components/bus';
import { Body, Button, Card, ErrorText, ErrorView, Loading, Screen, Title } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/session';

/** Where the payment page sends the payer back (matches the API's PAYMENT_RETURN_URL_APP). */
const RETURN_URL = 'rideswithme://wallet';

export default function BookingScreen() {
  const { t } = useI18n();
  const seatClass = useSeatClass();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [b, setB] = useState<BusBookingView | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setB(await api.bus.booking(id));
      setLoadError(null);
    } catch (err) {
      setLoadError(err);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  if (loadError) return <ErrorView error={loadError} onRetry={() => void load()} />;
  if (!b) return <Loading />;

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load().finally(() => setRefreshing(false));
      }}
    >
      <View style={styles.head}>
        <Title>{t('bus.reference', { reference: b.reference })}</Title>
        <BookingPill b={b} />
      </View>
      <DepartureText d={b.departure} />
      {b.status === 'held' && <Pay b={b} onDone={setB} reload={load} />}
      {b.status === 'expired' && (
        <Card tone="bad">
          <Body>{t('bus.expired')}</Body>
        </Card>
      )}
      {b.status === 'cancelled' && b.cancelledBy && b.cancelledBy !== 'passenger' && (
        <Card tone="bad">
          <Body>
            {t(b.cancelledBy === 'operator' ? 'bus.cancelledByOperator' : 'bus.cancelledByAdmin', {
              reason: b.cancelReason ?? '',
            })}
          </Body>
        </Card>
      )}
      {b.refundedKobo > 0 && (
        <Card tone="ok">
          <Body>{t('bus.refunded', { amount: formatKobo(b.refundedKobo) })}</Body>
        </Card>
      )}
      {b.status === 'confirmed' && (
        <>
          <Card tone="ok">
            <Body>{t('bus.confirmed')}</Body>
          </Card>
          {b.tickets.map((tk) => (
            <Card key={tk.id}>
              <View style={styles.ticket}>
                {tk.qrPayload && (
                  <QrCode
                    value={tk.qrPayload}
                    size={220}
                    label={t('bus.qr', { label: tk.seatLabel })}
                  />
                )}
                <Body bold>
                  {t('bus.ticketFor', { label: tk.seatLabel, name: tk.passengerName })}
                </Body>
                <Body muted>
                  {seatClass(tk.seatClass)} · {formatKobo(tk.fareKobo)}
                </Body>
                {tk.ticketCode && (
                  <Text style={styles.code} selectable>
                    {t('bus.ticketCode', { code: tk.ticketCode })}
                  </Text>
                )}
                {tk.checkedInAt && <Body bold>{t('bus.boarded')}</Body>}
              </View>
            </Card>
          ))}
        </>
      )}
      <Cancel b={b} onDone={setB} />
    </Screen>
  );
}

function Pay({
  b,
  onDone,
  reload,
}: {
  b: BusBookingView;
  onDone: (b: BusBookingView) => void;
  reload: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [cards, setCards] = useState<SavedCardView[]>([]);
  const [method, setMethod] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef(newIdempotencyKey());

  useEffect(() => {
    void Promise.all([api.wallet.get(), api.payments.cards()]).then(
      ([w, c]) => {
        const usable = c.filter((x) => !x.expired);
        setWallet(w);
        setCards(usable);
        setMethod(
          w.balanceKobo >= b.totalKobo ? 'wallet' : usable[0] ? `card:${usable[0].id}` : 'checkout',
        );
      },
      () => setMethod('checkout'),
    );
  }, [b.totalKobo]);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      if (method === 'checkout') {
        await runCheckout(
          async () => {
            const r = await api.bus.pay(b.id, { method: 'checkout', returnTo: 'app' }, key.current);
            return { checkoutUrl: r.checkoutUrl!, payment: r.payment! };
          },
          (pid) => api.payments.get(pid, true),
          RETURN_URL,
        );
        await reload();
      } else {
        const r = await api.bus.pay(
          b.id,
          method === 'wallet' ? { method: 'wallet' } : { method: 'card', cardId: method.slice(5) },
          key.current,
        );
        onDone(r.booking);
      }
    } catch (err) {
      setError(err);
      key.current = newIdempotencyKey();
    } finally {
      setBusy(false);
    }
  }

  const option = (value: string, label: string, disabled = false) => (
    <Pressable
      key={value}
      accessibilityRole="radio"
      accessibilityState={{ checked: method === value, disabled }}
      disabled={disabled}
      onPress={() => setMethod(value)}
      style={[styles.option, method === value && styles.optionOn, disabled && { opacity: 0.5 }]}
    >
      <Text style={[styles.optionText, method === value && { color: colors.onPrimary }]}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <Card>
      <Body muted>{t('bus.heldUntil', { time: formatTime(b.holdExpiresAt) })}</Body>
      {b.paymentPending && <Body>{t('bus.paymentPending')}</Body>}
      <Body bold>{t('bus.payWith')}</Body>
      <View accessibilityRole="radiogroup" style={{ gap: spacing[2] }}>
        {wallet &&
          option(
            'wallet',
            t('bus.payWallet', { amount: formatKobo(wallet.balanceKobo) }),
            wallet.balanceKobo < b.totalKobo,
          )}
        {cards.map((c) =>
          option(`card:${c.id}`, t('bus.payCard', { brand: c.brand, last4: c.last4 })),
        )}
        {option('checkout', t('bus.payCheckout'))}
      </View>
      <ErrorText error={error} />
      <Button
        title={t('bus.pay', { amount: formatKobo(b.totalKobo) })}
        onPress={() => void pay()}
        busy={busy}
        disabled={!method}
      />
    </Card>
  );
}

function Cancel({ b, onDone }: { b: BusBookingView; onDone: (b: BusBookingView) => void }) {
  const { t } = useI18n();
  const [error, setError] = useState<unknown>(null);
  if (b.status !== 'held' && b.status !== 'confirmed') return null;
  if (!b.cancelUntil)
    return b.status === 'confirmed' ? <Body muted>{t('bus.noCancel')}</Body> : null;
  const run = async () => {
    try {
      onDone(await api.bus.cancel(b.id));
    } catch (err) {
      setError(err);
    }
  };
  const press = () => {
    if (b.status === 'held') return void run();
    Alert.alert(t('bus.cancel'), t('bus.cancelConfirm', { amount: formatKobo(b.totalKobo) }), [
      { text: t('common.back'), style: 'cancel' },
      { text: t('bus.cancel'), style: 'destructive', onPress: () => void run() },
    ]);
  };
  return (
    <View style={{ gap: spacing[2] }}>
      {b.status === 'confirmed' && (
        <Body muted>{t('bus.cancelUntil', { time: formatDateTime(b.cancelUntil) })}</Body>
      )}
      <ErrorText error={error} />
      <Button
        title={b.status === 'held' ? t('bus.release') : t('bus.cancel')}
        variant="secondary"
        onPress={press}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing[2],
  },
  ticket: { alignItems: 'center', gap: spacing[2] },
  code: { fontFamily: 'monospace', fontSize: 18, letterSpacing: 2, color: colors.text },
  option: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { color: colors.text, fontWeight: '600' },
});
