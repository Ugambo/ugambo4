import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { DeletionRequestView, NotificationView, SavedPlace } from '@rideswithme/shared-types';
import { colors, spacing, typography } from '@rideswithme/ui-components';
import { Body, Button, Card, LanguageSwitch, Screen, Title } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { api, useSession } from '@/lib/session';

export default function Account() {
  const { t } = useI18n();
  const { signOut } = useSession();
  const [saved, setSaved] = useState<SavedPlace[]>([]);
  const [notifications, setNotifications] = useState<NotificationView[]>([]);
  const [deletion, setDeletion] = useState<DeletionRequestView | null>(null);

  useFocusEffect(
    useCallback(() => {
      api.places.saved().then(setSaved, () => undefined);
      api.notifications.list().then(
        (n) => {
          setNotifications(n.items);
          if (n.unread > 0) void api.notifications.markRead('all').catch(() => undefined);
        },
        () => undefined,
      );
      api.privacy.deletionRequest().then(
        (d) => setDeletion(d?.id ? d : null),
        () => undefined,
      );
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
      <Button title={t('help.title')} variant="secondary" onPress={() => router.push('/help')} />
      <Card>
        <Text style={styles.section}>{t('account.notifications')}</Text>
        {notifications.length === 0 && <Body muted>{t('account.noNotifications')}</Body>}
        {notifications.slice(0, 20).map((n) => (
          <View key={n.id}>
            <Body bold={!n.read}>{n.title}</Body>
            <Body muted>{n.body}</Body>
          </View>
        ))}
      </Card>
      <Card>
        <Text style={styles.section}>{t('account.delete')}</Text>
        {deletion ? (
          <>
            <Body>
              {deletion.status === 'blocked'
                ? t('account.deleteBlocked', { reason: deletion.blockedReason ?? '' })
                : t('account.deleteScheduled', { date: deletion.scheduledFor.slice(0, 10) })}
            </Body>
            <Button
              title={t('account.deleteCancel')}
              variant="secondary"
              onPress={() => void api.privacy.cancelDeletion().then(() => setDeletion(null))}
            />
          </>
        ) : (
          <>
            <Body muted>{t('account.deleteExplain', { days: 7 })}</Body>
            <Button
              title={t('account.delete')}
              variant="danger"
              onPress={() =>
                Alert.alert(t('account.deleteConfirm'), t('account.deleteExplain', { days: 7 }), [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('account.delete'),
                    style: 'destructive',
                    onPress: () =>
                      void api.privacy.requestDeletion().then(setDeletion, () => undefined),
                  },
                ])
              }
            />
          </>
        )}
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
