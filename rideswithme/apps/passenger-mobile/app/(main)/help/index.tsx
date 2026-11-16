import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TICKET_CATEGORIES, type TicketCategory, type TicketView } from '@rideswithme/shared-types';
import { colors, radius, spacing } from '@rideswithme/ui-components';
import { Body, Button, Card, Empty, ErrorText, Field, Pill, Screen, Title } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import { api } from '@/lib/session';

/** Contact support and follow your requests. */
export default function Help() {
  const { t } = useI18n();
  const [tickets, setTickets] = useState<TicketView[] | null>(null);
  const [category, setCategory] = useState<TicketCategory>('ride');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api.support.list().then(setTickets, () => setTickets([]));
  }, []);
  useFocusEffect(load);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const tk = await api.support.create({ category, subject: subject.trim(), body: body.trim() });
      setSubject('');
      setBody('');
      router.push(`/help/${tk.id}`);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen onRefresh={load}>
      <Title>{t('help.new')}</Title>
      <Card>
        <Body bold>{t('help.category')}</Body>
        <View style={styles.chips}>
          {TICKET_CATEGORIES.map((c) => (
            <Pressable
              key={c}
              accessibilityRole="radio"
              accessibilityState={{ checked: category === c }}
              style={[styles.chip, category === c && styles.on]}
              onPress={() => setCategory(c)}
            >
              <Text style={[styles.chipText, category === c && { color: colors.onPrimary }]}>
                {t(`ticketCategory.${c}` as MessageKey)}
              </Text>
            </Pressable>
          ))}
        </View>
        <Field
          label={t('help.subject')}
          value={subject}
          onChangeText={setSubject}
          maxLength={120}
        />
        <Field
          label={t('help.body')}
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={4000}
        />
        <ErrorText error={error} />
        <Button
          title={t('help.send')}
          busy={busy}
          disabled={subject.trim().length < 3 || !body.trim()}
          onPress={() => void send()}
        />
      </Card>
      <Title>{t('help.requests')}</Title>
      {tickets && tickets.length === 0 && <Empty message={t('help.none')} />}
      {tickets?.map((tk) => (
        <Pressable
          key={tk.id}
          accessibilityRole="button"
          onPress={() => router.push(`/help/${tk.id}`)}
        >
          <Card>
            <Body bold>{tk.subject}</Body>
            <Pill
              label={t(`ticketStatus.${tk.status}` as MessageKey)}
              tone={
                tk.status === 'waiting_on_user' ? 'wait' : tk.status === 'resolved' ? 'muted' : 'ok'
              }
            />
          </Card>
        </Pressable>
      ))}
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
