import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { SavedPlace } from '@rideswithme/shared-types';
import { colors, spacing, typography } from '@rideswithme/ui-components';
import { Body, Button, Card, LanguageSwitch, Screen, Title } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { api, useSession } from '@/lib/session';

export default function Account() {
  const { t } = useI18n();
  const { signOut } = useSession();
  const [saved, setSaved] = useState<SavedPlace[]>([]);

  useFocusEffect(
    useCallback(() => {
      api.places.saved().then(setSaved, () => undefined);
    }, []),
  );

  return (
    <Screen>
      <Title>{t('account.title')}</Title>
      <LanguageSwitch />
      <Card>
        <Text style={styles.section}>{t('account.savedPlaces')}</Text>
        {(['home', 'work'] as const).map((label) => {
          const place = saved.find((s) => s.label === label);
          return (
            <Pressable
              key={label}
              accessibilityRole="button"
              style={styles.row}
              onPress={() =>
                router.push(`/search?mode=${label === 'home' ? 'save-home' : 'save-work'}`)
              }
            >
              <Text style={styles.rowTitle}>
                {label === 'home' ? `🏠 ${t('saved.home')}` : `💼 ${t('saved.work')}`}
              </Text>
              <Body muted numberOfLines={1}>
                {place?.address ?? t('account.notSet')}
              </Body>
            </Pressable>
          );
        })}
      </Card>
      <Button title={t('common.signOut')} variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: typography.size.lg, fontWeight: '800', color: colors.text },
  row: { minHeight: 56, justifyContent: 'center', gap: spacing[1] },
  rowTitle: { fontSize: typography.size.md, fontWeight: '700', color: colors.text },
});
