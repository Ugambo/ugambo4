import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ApiClient } from '@rideswithme/api-client';
import type { TicketCategory, TicketView } from '@rideswithme/shared-types';
import { colors, radius, spacing } from '@rideswithme/ui-components';
import {
  Body,
  Button,
  Card,
  Empty,
  ErrorMessage,
  ErrorView,
  Field,
  Loading,
  Pill,
  Screen,
  Title,
} from '@rideswithme/ui-components/native';
import type { SupportMessageKey } from '@rideswithme/utilities';
import { formatDateTime } from './format';
import type { CommonKey } from './messages';

/** Translation for the support screens: the shared support text and the common words. */
type SupportT = (key: SupportMessageKey | CommonKey) => string;

/**
 * Contact support and follow one's requests: the passenger and driver apps'
 * help screen. `onOpen` navigates to a request; `useFocusEffect` (from the
 * app's router) reloads the list when the screen comes back into view.
 */
export function SupportHome({
  api,
  t,
  errorText,
  categories,
  onOpen,
  useFocusEffect,
}: {
  api: ApiClient;
  t: SupportT;
  errorText: (err: unknown) => string;
  /** The topics offered, first one chosen by default. */
  categories: readonly TicketCategory[];
  onOpen: (ticketId: string) => void;
  useFocusEffect: (effect: () => void) => void;
}) {
  const [tickets, setTickets] = useState<TicketView[] | null>(null);
  const [category, setCategory] = useState<TicketCategory>(categories[0]!);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api.support.list().then(setTickets, () => setTickets([]));
  }, [api]);
  useFocusEffect(load);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const tk = await api.support.create({ category, subject: subject.trim(), body: body.trim() });
      setSubject('');
      setBody('');
      onOpen(tk.id);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen offlineMessage={t('common.offline')} onRefresh={load}>
      <Title>{t('help.new')}</Title>
      <Card>
        <Body bold>{t('help.category')}</Body>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {categories.map((c) => (
            <Pressable
              key={c}
              accessibilityRole="radio"
              accessibilityState={{ checked: category === c }}
              style={[styles.chip, category === c && styles.on]}
              onPress={() => setCategory(c)}
            >
              <Text style={[styles.chipText, category === c && { color: colors.onPrimary }]}>
                {t(`ticketCategory.${c}`)}
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
        <ErrorMessage message={error ? errorText(error) : null} />
        <Button
          title={t('help.send')}
          busy={busy}
          disabled={subject.trim().length < 3 || !body.trim()}
          onPress={() => void send()}
        />
      </Card>
      <Title>{t('help.requests')}</Title>
      {tickets === null && <Loading label={t('common.loading')} />}
      {tickets?.length === 0 && <Empty message={t('help.none')} />}
      {tickets?.map((tk) => (
        <Pressable key={tk.id} accessibilityRole="button" onPress={() => onOpen(tk.id)}>
          <Card>
            <Body bold>{tk.subject}</Body>
            <Pill
              label={t(`ticketStatus.${tk.status}`)}
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

/** One support request: the conversation with support, and a reply box. */
export function SupportTicket({
  api,
  id,
  t,
  errorText,
}: {
  api: ApiClient;
  id: string;
  t: SupportT;
  errorText: (err: unknown) => string;
}) {
  const [tk, setTk] = useState<TicketView | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    setLoadError(null);
    api.support.get(id).then(setTk, setLoadError);
  }, [api, id]);
  useEffect(load, [load]);

  if (loadError)
    return (
      <ErrorView message={errorText(loadError)} retryLabel={t('common.retry')} onRetry={load} />
    );
  if (!tk) return <Loading label={t('common.loading')} />;

  const reply = async () => {
    setBusy(true);
    setError(null);
    try {
      setTk(await api.support.reply(id, body.trim()));
      setBody('');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen offlineMessage={t('common.offline')} onRefresh={load}>
      <Title>{tk.subject}</Title>
      {tk.messages.map((m) => (
        <Card key={m.id} tone={m.fromStaff ? 'ok' : undefined}>
          <Body muted>
            {t(m.fromStaff ? 'help.support' : 'help.you')} · {formatDateTime(m.createdAt)}
          </Body>
          <Body>{m.body}</Body>
        </Card>
      ))}
      <Field
        label={t('help.reply')}
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={4000}
      />
      <ErrorMessage message={error ? errorText(error) : null} />
      <Button
        title={t('help.send')}
        busy={busy}
        disabled={!body.trim()}
        onPress={() => void reply()}
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
