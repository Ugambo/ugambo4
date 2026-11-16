import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { formatDateTime } from '@rideswithme/mobile-core';
import type { TicketView } from '@rideswithme/shared-types';
import {
  Body,
  Button,
  Card,
  ErrorText,
  ErrorView,
  Field,
  Loading,
  Screen,
  Title,
} from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/session';

export default function Ticket() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tk, setTk] = useState<TicketView | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(() => {
    api.support.get(id).then(setTk, setLoadError);
  }, [id]);
  useEffect(load, [load]);
  if (loadError) return <ErrorView error={loadError} onRetry={load} />;
  if (!tk) return <Loading />;
  return (
    <Screen onRefresh={load}>
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
      <ErrorText error={error} />
      <Button
        title={t('help.send')}
        disabled={!body.trim()}
        onPress={() =>
          void api.support.reply(id, body.trim()).then((x) => {
            setTk(x);
            setBody('');
          }, setError)
        }
      />
    </Screen>
  );
}
