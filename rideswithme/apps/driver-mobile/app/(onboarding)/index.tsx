import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { OnlineBlocker } from '@rideswithme/shared-types';
import { colors, spacing, typography } from '@rideswithme/ui-components';
import { LanguageSwitch } from '@/components/language-switch';
import {
  Body,
  Button,
  Card,
  ErrorText,
  ErrorView,
  Loading,
  Pill,
  Screen,
  type Tone,
} from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import {
  buildChecklist,
  type ChecklistStep,
  remainingCount,
  type StepState,
} from '@/lib/onboarding';
import { useOnboarding } from '@/lib/onboarding-context';
import { api, useSession } from '@/lib/session';

const stateTone: Record<StepState, Tone> = {
  done: 'ok',
  todo: 'muted',
  waiting: 'wait',
  attention: 'bad',
};

export default function Home() {
  const { t } = useI18n();
  const { signOut } = useSession();
  const { view, error, loading, reload, setView } = useOnboarding();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);

  if (!view)
    return loading ? <Loading /> : <ErrorView error={error} onRetry={() => void reload()} />;

  const steps = buildChecklist(view);
  const remaining = remainingCount(view);
  const blockerText = (b: OnlineBlocker) =>
    'documentType' in b
      ? t(`blocker.${b.code}` as MessageKey, {
          document: t(`docType.${b.documentType}` as MessageKey),
        })
      : t(`blocker.${b.code}` as MessageKey);

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      setView(await api.driver.submitForReview());
    } catch (err) {
      setSubmitError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen onRefresh={() => void reload()} refreshing={loading}>
      <LanguageSwitch />
      <StatusCard />

      <Text style={styles.section}>{t('home.yourDetails')}</Text>
      <Card>
        {steps.slice(0, 3).map((s) => (
          <StepRow key={s.id} step={s} />
        ))}
      </Card>

      <Text style={styles.section}>{t('home.documents')}</Text>
      <Card>
        {steps.slice(3).map((s) => (
          <StepRow key={s.id} step={s} />
        ))}
      </Card>

      {view.editable && (
        <View style={styles.submit}>
          {remaining > 0 && <Body muted>{t('home.remaining', { count: remaining })}</Body>}
          <ErrorText error={submitError} />
          <Button
            title={t('home.submit')}
            onPress={() => void submit()}
            disabled={!view.submission.ready}
            busy={submitting}
          />
        </View>
      )}

      <Button title={t('common.signOut')} variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );

  function StatusCard() {
    if (!view) return null;
    switch (view.status) {
      case 'onboarding':
        return (
          <Card>
            <Body>{t('home.onboarding')}</Body>
          </Card>
        );
      case 'pending_review':
        return (
          <Card tone="wait">
            <Body>{t('home.pending_review')}</Body>
          </Card>
        );
      case 'rejected':
        return (
          <Card tone="bad">
            <Body>{t('home.rejected')}</Body>
            <Text style={styles.reason}>{view.rejectionReason}</Text>
          </Card>
        );
      case 'suspended':
        return (
          <Card tone="bad">
            <Body>{t('home.suspended')}</Body>
          </Card>
        );
      case 'approved':
        return view.eligibility.canGoOnline ? (
          <Card tone="ok">
            <Body>{t('home.approved')}</Body>
            <Body muted>{t('home.goOnlineSoon')}</Body>
          </Card>
        ) : (
          <Card tone="bad">
            <Body>{t('home.approvedBlocked')}</Body>
            {view.eligibility.blockers.map((b, i) => (
              <Text key={i} style={styles.reason}>
                • {blockerText(b)}
              </Text>
            ))}
          </Card>
        );
    }
  }

  function StepRow({ step }: { step: ChecklistStep }) {
    return (
      <Link href={step.href as never} asChild>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <Text style={styles.rowTitle}>{t(step.titleKey as MessageKey)}</Text>
          <Pill label={t(`state.${step.state}`)} tone={stateTone[step.state]} />
        </Pressable>
      </Link>
    );
  }
}

const styles = StyleSheet.create({
  section: {
    fontSize: typography.size.lg,
    fontWeight: '800',
    color: colors.text,
    marginTop: spacing[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    gap: spacing[3],
  },
  rowPressed: { opacity: 0.6 },
  rowTitle: { flex: 1, fontSize: typography.size.md, fontWeight: '600', color: colors.text },
  reason: { fontSize: typography.size.md, fontWeight: '700', color: colors.text },
  submit: { gap: spacing[2] },
});
