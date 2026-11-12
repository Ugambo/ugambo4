import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import {
  DOCUMENT_TYPES,
  type DocumentType,
  type RequirementStatus,
} from '@rideswithme/shared-types';
import { colors, radius, typography } from '@rideswithme/ui-components';
import { Body, Button, Card, ErrorText, Field, Pill, Screen, type Tone } from '@/components/ui';
import { formatDayFirst, parseDayFirstDate } from '@/lib/dates';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import { useOnboarding } from '@/lib/onboarding-context';
import {
  choosePdf,
  choosePhoto,
  FileTooLargeError,
  PermissionDeniedError,
  type PickedFile,
  takePhoto,
} from '@/lib/pick-file';
import { api } from '@/lib/session';
import { type UploadStage, uploadDocument } from '@/lib/upload';

const tone: Record<RequirementStatus, Tone> = {
  missing: 'muted',
  pending: 'wait',
  approved: 'ok',
  rejected: 'bad',
  expired: 'bad',
};

export default function DocumentScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const { t } = useI18n();
  const { view, reload } = useOnboarding();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [stage, setStage] = useState<UploadStage | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const requirement = view?.requirements.find((r) => r.key === type);
  if (!view || !requirement || !(DOCUMENT_TYPES as readonly string[]).includes(type)) return null;

  const title = t(`docType.${requirement.key}` as MessageKey);
  const latest = requirement.latest;
  const expiresOn = parseDayFirstDate(expiry);
  const expiryError = expiry && !expiresOn ? t('doc.expiryInvalid') : null;
  const ready =
    !!file &&
    (!requirement.requiresNumber || number.trim().length >= 3) &&
    (!requirement.requiresExpiry || !!expiresOn);

  async function pick(picker: () => Promise<PickedFile | null>) {
    setError(null);
    setMessage(null);
    setDone(false);
    try {
      const picked = await picker();
      if (picked) setFile(picked);
    } catch (err) {
      if (err instanceof PermissionDeniedError) setMessage(t('doc.permissionDenied'));
      else if (err instanceof FileTooLargeError) setMessage(t('doc.tooLarge'));
      else setError(err);
    }
  }

  async function upload() {
    if (!file) return;
    setError(null);
    try {
      await uploadDocument(api.driver, {
        documentType: requirement!.key as DocumentType,
        file,
        ...(requirement!.requiresNumber && { documentNumber: number.trim() }),
        ...(expiresOn && { expiresOn }),
        onStage: setStage,
      });
      setDone(true);
      setFile(null);
      await reload();
    } catch (err) {
      setError(err);
    } finally {
      setStage(null);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title }} />
      <Card>
        <View style={styles.statusRow}>
          <Text style={styles.label}>{t('doc.status')}</Text>
          <Pill label={t(`docStatus.${requirement.status}`)} tone={tone[requirement.status]} />
        </View>
        {latest?.expiresOn && (
          <Body muted>{t('doc.validUntil', { date: formatDayFirst(latest.expiresOn) })}</Body>
        )}
        {latest?.rejectionReason && (
          <>
            <Text style={styles.label}>{t('doc.reason')}</Text>
            <Body>{latest.rejectionReason}</Body>
          </>
        )}
      </Card>

      {done && (
        <Card tone="ok">
          <Body>{t('doc.uploaded')}</Body>
        </Card>
      )}

      <Body muted>{t('doc.photoTip')}</Body>
      <Button
        title={t('doc.takePhoto')}
        variant="secondary"
        onPress={() => void pick(takePhoto)}
        disabled={!!stage}
      />
      <Button
        title={t('doc.choosePhoto')}
        variant="secondary"
        onPress={() => void pick(choosePhoto)}
        disabled={!!stage}
      />
      {requirement.media === 'document' && (
        <Button
          title={t('doc.choosePdf')}
          variant="secondary"
          onPress={() => void pick(choosePdf)}
          disabled={!!stage}
        />
      )}
      {message && <Text style={styles.message}>{message}</Text>}

      {file && (
        <Card>
          {file.previewUri ? (
            <Image
              source={{ uri: file.previewUri }}
              style={styles.preview}
              resizeMode="contain"
              accessibilityLabel={title}
            />
          ) : (
            <Body>{t('doc.selected', { name: file.name })}</Body>
          )}
          <Body muted>{`${Math.ceil(file.sizeBytes / 1024)} KB`}</Body>
        </Card>
      )}

      {file && requirement.requiresNumber && (
        <Field
          label={t('doc.number')}
          value={number}
          onChangeText={setNumber}
          autoCapitalize="characters"
        />
      )}
      {file && requirement.requiresExpiry && (
        <Field
          label={t('doc.expiry')}
          value={expiry}
          onChangeText={setExpiry}
          keyboardType="numbers-and-punctuation"
          placeholder="31/12/2027"
          error={expiryError}
        />
      )}

      <ErrorText error={error} />
      {file && (
        <Button
          title={stage ? t(`doc.stage.${stage}`) : error ? t('common.retry') : t('doc.upload')}
          onPress={() => void upload()}
          disabled={!ready}
          busy={!!stage}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: typography.size.md, fontWeight: '700', color: colors.text },
  message: { fontSize: typography.size.md, color: colors.warning, fontWeight: '700' },
  preview: {
    width: '100%',
    height: 220,
    borderRadius: radius.md,
    backgroundColor: colors.grey[100],
  },
});
