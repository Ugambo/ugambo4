import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  DISPUTE_REASONS,
  type DisputeReason,
  type DisputeView,
  type RideView,
} from '@rideswithme/shared-types';
import { colors, radius, spacing, typography } from '@rideswithme/ui-components';
import { Body, Button, Card, ErrorText, Title } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import { api } from '@/lib/session';

/** "Report a problem with the fare" on a past ride, or what happened to the report. */
export function DisputeSection({ ride, onRaised }: { ride: RideView; onRaised: () => void }) {
  const { t } = useI18n();
  const [dispute, setDispute] = useState<DisputeView | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<DisputeReason>('overcharged');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (ride.payment.disputed) api.rides.getDispute(ride.id).then(setDispute, () => undefined);
  }, [ride.id, ride.payment.disputed]);

  if (!(ride.status === 'completed' || ride.fare.cancellationFeeKobo > 0)) return null;
  if (dispute) {
    return (
      <Card tone="wait">
        <Body>
          {t(`dispute.status.${dispute.status}` as MessageKey, {
            note: dispute.resolutionNote ?? '',
          })}
        </Body>
      </Card>
    );
  }
  if (!open)
    return <Button title={t('dispute.title')} variant="secondary" onPress={() => setOpen(true)} />;

  async function send() {
    setBusy(true);
    setError(null);
    try {
      setDispute(
        await api.rides.dispute(ride.id, {
          reason,
          ...(details.trim() && { details: details.trim() }),
        }),
      );
      onRaised();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Title>{t('dispute.title')}</Title>
      <Body bold>{t('dispute.reason')}</Body>
      <View accessibilityRole="radiogroup">
        {DISPUTE_REASONS.map((r) => (
          <Pressable
            key={r}
            accessibilityRole="radio"
            accessibilityState={{ selected: reason === r }}
            style={styles.option}
            onPress={() => setReason(r)}
          >
            <Text style={styles.radio}>{reason === r ? '◉' : '○'}</Text>
            <Text style={styles.optionText}>{t(`dispute.reason.${r}` as MessageKey)}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        accessibilityLabel={t('dispute.details')}
        placeholder={t('dispute.details')}
        style={styles.input}
        multiline
        maxLength={1000}
        value={details}
        onChangeText={setDetails}
      />
      <ErrorText error={error} />
      <Button title={t('dispute.send')} onPress={() => void send()} busy={busy} />
    </Card>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], minHeight: 44 },
  radio: { fontSize: typography.size.lg, color: colors.primary },
  optionText: { fontSize: typography.size.md, color: colors.text, flex: 1 },
  input: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing[3],
    fontSize: typography.size.md,
    color: colors.text,
    textAlignVertical: 'top',
  },
});
