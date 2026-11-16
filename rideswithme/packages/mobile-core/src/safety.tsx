import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ApiClient } from '@rideswithme/api-client';
import type { RideMessageView, SosAlertView } from '@rideswithme/shared-types';
import { colors, radius, spacing } from '@rideswithme/ui-components';
import { Body, Button, Card, ErrorMessage } from '@rideswithme/ui-components/native';
import { formatTime } from './format';

export interface SosLabels {
  button: string;
  title: string;
  explain: string;
  send: string;
  cancel: string;
  sent: string;
  acknowledged: string;
  call: string;
}

/**
 * SOS for both apps: one press opens a confirmation, the second sends the
 * alert with whatever location the phone gives within a few seconds (it is
 * sent without one rather than waiting). Shows "help is coming" until staff
 * resolve it.
 */
export function SosButton({
  api,
  rideId,
  labels,
  getLocation,
  errorText,
}: {
  api: ApiClient;
  rideId?: string;
  labels: SosLabels;
  /** Resolves with a quick fix or undefined; must not hang. */
  getLocation: () => Promise<{ lat: number; lng: number; recordedAt: string } | undefined>;
  errorText: (err: unknown) => string;
}) {
  const [alert, setAlert] = useState<SosAlertView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.safety
      .currentSos()
      .then((a) => a?.id && setAlert(a))
      .catch(() => undefined);
  }, [api]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const location = await Promise.race([
        getLocation().catch(() => undefined),
        new Promise<undefined>((r) => setTimeout(() => r(undefined), 4000)),
      ]);
      setAlert(await api.safety.sos({ ...(rideId && { rideId }), ...(location && { location }) }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (alert && alert.status !== 'resolved')
    return (
      <Card tone="bad">
        <Body bold>{alert.status === 'acknowledged' ? labels.acknowledged : labels.sent}</Body>
        <Button
          title={labels.call}
          variant="secondary"
          onPress={() => void Linking.openURL('tel:112')}
        />
      </Card>
    );
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={labels.title}
        style={styles.sos}
        disabled={busy}
        onPress={() =>
          Alert.alert(labels.title, labels.explain, [
            { text: labels.cancel, style: 'cancel' },
            { text: labels.send, style: 'destructive', onPress: () => void send() },
          ])
        }
      >
        <Text style={styles.sosText}>{labels.button}</Text>
      </Pressable>
      <ErrorMessage message={error ? errorText(error) : null} />
    </View>
  );
}

export interface ChatLabels {
  placeholder: string;
  send: string;
  empty: string;
  privacy: string;
  quick: string[];
}

/** Messages with the other side of the ride, live, with quick replies. */
export function RideChat({
  api,
  rideId,
  labels,
  useMessageEvent,
  errorText,
}: {
  api: ApiClient;
  rideId: string;
  labels: ChatLabels;
  useMessageEvent: (handler: (m: RideMessageView) => void) => void;
  errorText: (err: unknown) => string;
}) {
  const [messages, setMessages] = useState<RideMessageView[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<unknown>(null);
  const add = useCallback(
    (m: RideMessageView) =>
      setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m])),
    [],
  );
  useEffect(() => {
    api.safety
      .messages(rideId)
      .then(setMessages)
      .catch(() => undefined);
  }, [api, rideId]);
  useMessageEvent(
    useCallback(
      (m: RideMessageView) => {
        if (m.rideId === rideId) add(m);
      },
      [rideId, add],
    ),
  );
  const send = async (body: string) => {
    setError(null);
    try {
      add(await api.safety.sendMessage(rideId, body));
      setText('');
    } catch (err) {
      setError(err);
    }
  };
  return (
    <View style={{ gap: spacing[2] }}>
      {messages.length === 0 && <Body muted>{labels.empty}</Body>}
      {messages.map((m) => (
        <View key={m.id} style={[styles.bubble, m.mine && styles.mine]}>
          <Text style={[styles.bubbleText, m.mine && { color: colors.onPrimary }]}>{m.body}</Text>
          <Text style={[styles.time, m.mine && { color: colors.onPrimary }]}>
            {formatTime(m.createdAt)}
          </Text>
        </View>
      ))}
      <View style={styles.quick}>
        {labels.quick.map((q) => (
          <Pressable
            key={q}
            accessibilityRole="button"
            style={styles.chip}
            onPress={() => void send(q)}
          >
            <Text style={styles.chipText}>{q}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={labels.placeholder}
          accessibilityLabel={labels.placeholder}
          maxLength={500}
        />
        <Button title={labels.send} onPress={() => text.trim() && void send(text.trim())} />
      </View>
      <Body muted>{labels.privacy}</Body>
      <ErrorMessage message={error ? errorText(error) : null} />
    </View>
  );
}

const styles = StyleSheet.create({
  sos: {
    alignSelf: 'flex-start',
    minHeight: 48,
    minWidth: 88,
    paddingHorizontal: spacing[4],
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosText: { color: colors.onDanger, fontWeight: '800', fontSize: 18, letterSpacing: 1 },
  bubble: {
    alignSelf: 'flex-start',
    maxWidth: '85%',
    padding: spacing[2],
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderColor: colors.primary },
  bubbleText: { color: colors.text, fontSize: 16 },
  time: { color: colors.textMuted, fontSize: 12 },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { color: colors.text, fontWeight: '600' },
  row: { flexDirection: 'row', gap: spacing[2], alignItems: 'center' },
  star: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    color: colors.text,
    fontSize: 16,
  },
});

export interface RateLabels {
  title: string;
  stars: (n: number) => string;
  comment: string;
  send: string;
  tag: (tag: string) => string;
}

/** Stars, a few tags and an optional comment. */
export function RateForm({
  tags,
  labels,
  onSubmit,
  errorText,
}: {
  tags: readonly string[];
  labels: RateLabels;
  onSubmit: (input: { stars: number; tags: string[]; comment?: string }) => Promise<void>;
  errorText: (err: unknown) => string;
}) {
  const [stars, setStars] = useState(0);
  const [chosen, setChosen] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ stars, tags: chosen, ...(comment.trim() && { comment: comment.trim() }) });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: spacing[2] }}>
      <Body bold>{labels.title}</Body>
      <View style={styles.row} accessibilityRole="radiogroup">
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            accessibilityRole="radio"
            accessibilityLabel={labels.stars(n)}
            accessibilityState={{ checked: stars === n }}
            onPress={() => setStars(n)}
            style={styles.star}
          >
            <Text style={{ fontSize: 32, color: n <= stars ? colors.accent : colors.border }}>
              ★
            </Text>
          </Pressable>
        ))}
      </View>
      {stars > 0 && (
        <>
          <View style={styles.quick}>
            {tags.map((tag) => {
              const on = chosen.includes(tag);
              return (
                <Pressable
                  key={tag}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[
                    styles.chip,
                    on && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() =>
                    setChosen((x) => (on ? x.filter((y) => y !== tag) : [...x, tag].slice(0, 5)))
                  }
                >
                  <Text style={[styles.chipText, on && { color: colors.onPrimary }]}>
                    {labels.tag(tag)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            style={[styles.input, { minHeight: 72 }]}
            multiline
            value={comment}
            onChangeText={setComment}
            placeholder={labels.comment}
            accessibilityLabel={labels.comment}
            maxLength={500}
          />
          <Button title={labels.send} onPress={() => void submit()} busy={busy} />
        </>
      )}
      <ErrorMessage message={error ? errorText(error) : null} />
    </View>
  );
}
