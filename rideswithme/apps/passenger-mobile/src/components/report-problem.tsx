import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { INCIDENT_CATEGORIES, type IncidentCategory } from '@rideswithme/shared-types';
import { colors, radius, spacing } from '@rideswithme/ui-components';
import { Body, Button, Card, ErrorText } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import { api } from '@/lib/session';

/** Report a problem on a trip (an incident report for the safety team). */
export function ReportProblem({ rideId }: { rideId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<IncidentCategory>('lost_item');
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (sent)
    return (
      <Card tone="ok">
        <Body>{t('report.sent')}</Body>
      </Card>
    );
  if (!open)
    return <Button title={t('report.title')} variant="secondary" onPress={() => setOpen(true)} />;
  return (
    <Card>
      <Body bold>{t('report.title')}</Body>
      <Body muted>{t('report.urgent')}</Body>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {INCIDENT_CATEGORIES.map((c) => (
          <Pressable
            key={c}
            accessibilityRole="radio"
            accessibilityState={{ checked: category === c }}
            style={[styles.chip, category === c && styles.on]}
            onPress={() => setCategory(c)}
          >
            <Text style={[styles.chipText, category === c && { color: colors.onPrimary }]}>
              {t(`incident.${c}` as MessageKey)}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.input}
        multiline
        value={text}
        onChangeText={setText}
        placeholder={t('report.description')}
        accessibilityLabel={t('report.description')}
        maxLength={2000}
      />
      <ErrorText error={error} />
      <Button
        title={t('report.send')}
        disabled={text.trim().length < 5}
        onPress={() =>
          void api.safety
            .report({ rideId, category, description: text.trim() })
            .then(() => setSent(true), setError)
        }
      />
    </Card>
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
  on: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontWeight: '600' },
  input: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing[3],
    color: colors.text,
    textAlignVertical: 'top',
  },
});
