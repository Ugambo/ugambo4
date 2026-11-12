import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@rideswithme/ui-components';
import { payoutAccountSchema } from '@rideswithme/validation';
import { Body, Button, Card, ErrorText, Field, Screen } from '@/components/ui';
import { BANKS } from '@/lib/banks';
import { useI18n } from '@/lib/i18n';
import { useOnboarding } from '@/lib/onboarding-context';
import { api } from '@/lib/session';

export default function Payout() {
  const { t } = useI18n();
  const { view, setView } = useOnboarding();
  const saved = view?.payoutAccount;
  const [bankCode, setBankCode] = useState(saved?.bankCode ?? '');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState(
    saved?.accountName ?? view?.profile.fullName ?? '',
  );
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!view) return null;

  const parsed = payoutAccountSchema.safeParse({ bankCode, accountNumber, accountName });
  const bank = BANKS.find((b) => b.code === bankCode);

  async function save() {
    if (!parsed.success) return;
    setBusy(true);
    setError(null);
    try {
      setView(await api.driver.setPayoutAccount(parsed.data));
      router.back();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Body>{t('payout.body')}</Body>
      {saved && (
        <Card tone="ok">
          <Body>
            {t('payout.saved', { name: saved.accountName, last4: saved.accountNumberLast4 })}
          </Body>
        </Card>
      )}
      {!view.editable ? (
        <Card tone="wait">
          <Body>{t('locked')}</Body>
        </Card>
      ) : (
        <>
          <Text style={styles.label}>{t('payout.bank')}</Text>
          <Pressable
            accessibilityRole="button"
            style={styles.select}
            onPress={() => setPicking((p) => !p)}
          >
            <Text style={styles.selectText}>{bank?.name ?? t('payout.chooseBank')}</Text>
          </Pressable>
          {picking && (
            <View style={styles.list}>
              {BANKS.map((b) => (
                <Pressable
                  key={b.code}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: b.code === bankCode }}
                  style={styles.option}
                  onPress={() => {
                    setBankCode(b.code);
                    setPicking(false);
                  }}
                >
                  <Text style={[styles.optionText, b.code === bankCode && styles.optionSelected]}>
                    {b.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          <Field
            label={t('payout.accountNumber')}
            value={accountNumber}
            onChangeText={(v) => setAccountNumber(v.replace(/\D/g, ''))}
            keyboardType="number-pad"
            maxLength={10}
          />
          <Field
            label={t('payout.accountName')}
            value={accountName}
            onChangeText={setAccountName}
          />
          <ErrorText error={error} />
          <Button
            title={t('common.save')}
            onPress={() => void save()}
            disabled={!parsed.success}
            busy={busy}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: typography.size.md, fontWeight: '700', color: colors.text },
  select: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing[3],
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  selectText: { fontSize: typography.size.lg, color: colors.text },
  list: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
  },
  option: {
    minHeight: 48,
    paddingHorizontal: spacing[3],
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.grey[100],
  },
  optionText: { fontSize: typography.size.md, color: colors.text },
  optionSelected: { fontWeight: '800', color: colors.primary },
});
