import { router } from 'expo-router';
import { useState } from 'react';
import { ninSchema } from '@rideswithme/validation';
import { Body, Button, Card, ErrorText, Field, Screen } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { useOnboarding } from '@/lib/onboarding-context';
import { api } from '@/lib/session';

export default function Profile() {
  const { t } = useI18n();
  const { view, setView } = useOnboarding();
  const [fullName, setFullName] = useState(view?.profile.fullName ?? '');
  const [nin, setNin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!view) return null;

  const ninValid = nin === '' || ninSchema.safeParse(nin).success;
  const canSave =
    view.editable &&
    fullName.trim().length >= 2 &&
    ninValid &&
    (nin !== '' || !!view.profile.ninLast4);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      setView(await api.driver.updateProfile({ fullName: fullName.trim(), ...(nin && { nin }) }));
      router.back();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      {!view.editable && (
        <Card tone="wait">
          <Body>{t('locked')}</Body>
        </Card>
      )}
      <Field
        label={t('profile.fullName')}
        value={fullName}
        onChangeText={setFullName}
        autoComplete="name"
        editable={view.editable}
      />
      <Field
        label={t('profile.nin')}
        hint={
          view.profile.ninLast4
            ? t('profile.ninSaved', { last4: view.profile.ninLast4 })
            : t('profile.ninHint')
        }
        value={nin}
        onChangeText={(v) => setNin(v.replace(/[^\d ]/g, ''))}
        keyboardType="number-pad"
        maxLength={14}
        editable={view.editable}
        secureTextEntry={false}
      />
      <ErrorText error={error} />
      {view.editable && (
        <Button
          title={t('common.save')}
          onPress={() => void save()}
          disabled={!canSave}
          busy={busy}
        />
      )}
    </Screen>
  );
}
