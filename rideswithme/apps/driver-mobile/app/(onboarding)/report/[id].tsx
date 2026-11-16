import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { INCIDENT_CATEGORIES, type IncidentCategory } from '@rideswithme/shared-types';
import { colors, radius, spacing } from '@rideswithme/ui-components';
import { Body, Button, Card, ErrorText, Field, Screen, Title } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import { api } from '@/lib/session';

/** Report a problem on a trip to the safety team. */
export default function Report() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [category, setCategory] = useState<IncidentCategory>('other');
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (sent)
    return (
      <Screen>
        <Card tone="ok">
          <Body>{t('report.sent')}</Body>
        </Card>
        <Button title={t('common.back')} onPress={() => router.back()} />
      </Screen>
    );
  return (
    <Screen>
      <Title>{t('report.title')}</Title>
      <View style={styles.chips}>
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
      <Field
        label={t('report.description')}
        value={text}
        onChangeText={setText}
        multiline
        maxLength={2000}
      />
      <ErrorText error={error} />
      <Button
        title={t('report.send')}
        disabled={text.trim().length < 5}
        onPress={() =>
          void api.safety
            .report({ rideId: id, category, description: text.trim() })
            .then(() => setSent(true), setError)
        }
      />
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
  on: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontWeight: '600' },
});
