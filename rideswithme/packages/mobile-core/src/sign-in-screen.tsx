import { type ReactNode, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError, type ApiClient } from '@rideswithme/api-client';
import { colors, spacing, typography } from '@rideswithme/ui-components';
import {
  Body,
  Button,
  ErrorMessage,
  Field,
  Screen,
  Title,
} from '@rideswithme/ui-components/native';
import { normalizeNigerianPhone } from '@rideswithme/validation';
import type { CommonKey } from './messages';

/** Phone + SMS code sign-in, shared by both apps. The hero (title, intro) comes from the app. */
export function SignInScreen({
  api,
  signIn,
  t,
  errorText,
  hero,
}: {
  api: ApiClient;
  signIn: (phone: string, code: string) => Promise<void>;
  t: (key: CommonKey, params?: Record<string, string | number>) => string;
  errorText: (err: unknown) => string;
  hero: ReactNode;
}) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  const normalised = normalizeNigerianPhone(phone);

  async function sendCode() {
    if (!normalised) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.auth.requestOtp({ phone: normalised });
      setStep('code');
      setResendIn(res.resendAfterSeconds);
    } catch (err) {
      if (err instanceof ApiError && err.retryAfterSeconds) setResendIn(err.retryAfterSeconds);
      // A code was already sent a moment ago: let the person type it.
      if (err instanceof ApiError && err.code === 'OTP_RESEND_TOO_SOON') setStep('code');
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!normalised) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(normalised, code);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen offlineMessage={t('common.offline')}>
      <View style={styles.hero}>{hero}</View>
      {step === 'phone' ? (
        <>
          <Field
            label={t('signIn.phone')}
            hint={t('signIn.phoneHint')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
          />
          <ErrorMessage message={error ? errorText(error) : null} />
          <Button
            title={t('signIn.sendCode')}
            onPress={() => void sendCode()}
            disabled={!normalised}
            busy={busy}
          />
          <Body muted>{t('signIn.consent')}</Body>
        </>
      ) : (
        <>
          <Title>{t('signIn.verify')}</Title>
          <Field
            label={t('signIn.code', { phone: normalised ?? phone })}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            maxLength={6}
          />
          <ErrorMessage message={error ? errorText(error) : null} />
          <Button
            title={t('signIn.verify')}
            onPress={() => void verify()}
            disabled={code.length !== 6}
            busy={busy}
          />
          <Button
            title={resendIn > 0 ? t('signIn.resendIn', { seconds: resendIn }) : t('signIn.resend')}
            variant="secondary"
            disabled={resendIn > 0 || busy}
            onPress={() => void sendCode()}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setStep('phone');
              setCode('');
              setError(null);
            }}
          >
            <Text style={styles.link}>{t('signIn.changeNumber')}</Text>
          </Pressable>
        </>
      )}
    </Screen>
  );
}

/** The navy hero block used at the top of the sign-in screen. */
export function SignInHero({
  title,
  subtitle,
  languageSwitch,
}: {
  title: string;
  subtitle: string;
  languageSwitch: ReactNode;
}) {
  return (
    <>
      {languageSwitch}
      <View style={styles.mark}>
        <Text style={styles.markText}>R</Text>
      </View>
      <Text style={styles.heroTitle}>{title}</Text>
      <Text style={styles.heroBody}>{subtitle}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.primary, borderRadius: 16, padding: spacing[6], gap: spacing[3] },
  mark: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: { fontSize: typography.size.xl, fontWeight: '900', color: colors.onAccent },
  heroTitle: { fontSize: typography.size['2xl'], fontWeight: '800', color: colors.onPrimary },
  heroBody: { fontSize: typography.size.md, color: colors.onPrimary },
  link: {
    color: colors.primary,
    fontWeight: '700',
    textAlign: 'center',
    padding: spacing[3],
    fontSize: typography.size.md,
  },
});
