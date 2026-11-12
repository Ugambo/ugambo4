import NetInfo from '@react-native-community/netinfo';
import { type ReactNode, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, touchTarget, typography } from '../tokens';

/**
 * Shared React Native building blocks for the passenger and driver apps.
 * They take all text as props: apps pass translated strings, so no component
 * here contains user-facing words.
 */

export function useIsOffline(): boolean {
  const [offline, setOffline] = useState(false);
  useEffect(() => NetInfo.addEventListener((s) => setOffline(s.isConnected === false)), []);
  return offline;
}

export function OfflineBanner({ message }: { message: string }) {
  const offline = useIsOffline();
  if (!offline) return null;
  return (
    <View style={styles.offline} accessibilityRole="alert">
      <Text style={styles.offlineText}>{message}</Text>
    </View>
  );
}

/** Scrollable full screen with safe areas, an offline banner and optional pull-to-refresh. */
export function Screen({
  children,
  offlineMessage,
  onRefresh,
  refreshing = false,
}: {
  children: ReactNode;
  offlineMessage: string;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <OfflineBanner message={offlineMessage} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
        }
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.title} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Body({
  children,
  muted = false,
  bold = false,
  numberOfLines,
}: {
  children: ReactNode;
  muted?: boolean;
  bold?: boolean;
  numberOfLines?: number;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[styles.body, muted && styles.muted, bold && styles.bold]}
    >
      {children}
    </Text>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'accent';

/** One confident primary action per screen: large, high contrast, readable in sunlight. */
export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
}) {
  const inactive = disabled || busy;
  const textStyle =
    variant === 'primary'
      ? styles.onPrimary
      : variant === 'accent'
        ? styles.onAccent
        : variant === 'danger'
          ? styles.dangerText
          : styles.secondaryText;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        pressed && !inactive && styles.pressed,
        inactive && styles.disabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'primary' ? colors.onPrimary : colors.primary} />
      ) : (
        <Text style={[styles.buttonText, textStyle]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  error,
  ...input
}: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textDisabled}
        style={[
          styles.input,
          !!error && styles.inputError,
          input.editable === false && styles.inputDisabled,
        ]}
        {...input}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function ErrorMessage({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <Text style={styles.errorText} accessibilityRole="alert">
      {message}
    </Text>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <View style={styles.center} accessibilityLabel={label}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function ErrorView({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.center}>
      <ErrorMessage message={message} />
      <Button title={retryLabel} variant="secondary" onPress={onRetry} />
    </View>
  );
}

export function Empty({ message }: { message: string }) {
  return (
    <View style={styles.center}>
      <Text style={[styles.body, styles.muted]}>{message}</Text>
    </View>
  );
}

export type Tone = 'ok' | 'wait' | 'bad' | 'muted';
export const toneColors: Record<Tone, { bg: string; fg: string }> = {
  ok: { bg: '#E3F4E8', fg: colors.success },
  wait: { bg: '#FFF1D6', fg: colors.warning },
  bad: { bg: '#FDE7E7', fg: colors.danger },
  muted: { bg: colors.grey[100], fg: colors.textMuted },
};

export function Pill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <View style={[styles.pill, { backgroundColor: toneColors[tone].bg }]}>
      <Text style={[styles.pillText, { color: toneColors[tone].fg }]}>{label}</Text>
    </View>
  );
}

export function Card({ children, tone }: { children: ReactNode; tone?: Tone }) {
  return (
    <View
      style={[
        styles.card,
        tone && { backgroundColor: toneColors[tone].bg, borderColor: toneColors[tone].bg },
      ]}
    >
      {children}
    </View>
  );
}

/** Two or more options with large targets (e.g. English / Hausa). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  light = false,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  light?: boolean;
}) {
  return (
    <View style={styles.segRow} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[
              styles.segOption,
              light ? styles.segLight : styles.segDark,
              selected && styles.segSelected,
            ]}
          >
            <Text
              style={[
                styles.segText,
                light && !selected && styles.segTextLight,
                selected && styles.segTextSelected,
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing[4], paddingBottom: spacing[12], gap: spacing[4] },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
    gap: spacing[4],
  },
  offline: { backgroundColor: colors.warning, padding: spacing[2] },
  offlineText: {
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
    fontSize: typography.size.sm,
  },
  title: {
    fontSize: typography.size['2xl'],
    lineHeight: typography.lineHeight['2xl'],
    fontWeight: '800',
    color: colors.text,
  },
  body: { fontSize: typography.size.md, lineHeight: typography.lineHeight.md, color: colors.text },
  muted: { color: colors.textMuted },
  bold: { fontWeight: '700' },
  button: {
    minHeight: touchTarget.primaryButtonHeight,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
    borderWidth: 2,
    borderColor: 'transparent',
  },
  primary: { backgroundColor: colors.primary },
  accent: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.background, borderColor: colors.primary },
  danger: { backgroundColor: colors.background, borderColor: colors.danger },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  buttonText: { fontSize: typography.size.lg, fontWeight: '700' },
  onPrimary: { color: colors.onPrimary },
  onAccent: { color: colors.onAccent },
  secondaryText: { color: colors.primary },
  dangerText: { color: colors.danger },
  field: { gap: spacing[1] },
  label: { fontSize: typography.size.md, fontWeight: '700', color: colors.text },
  input: {
    minHeight: touchTarget.min,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing[3],
    fontSize: typography.size.lg,
    color: colors.text,
    backgroundColor: colors.background,
  },
  inputError: { borderColor: colors.danger, borderWidth: 2 },
  inputDisabled: { backgroundColor: colors.grey[100], color: colors.textMuted },
  hint: { fontSize: typography.size.sm, color: colors.textMuted },
  errorText: { fontSize: typography.size.md, color: colors.danger, fontWeight: '700' },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
    paddingVertical: 2,
  },
  pillText: { fontSize: typography.size.sm, fontWeight: '700' },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing[4],
    gap: spacing[3],
  },
  segRow: { flexDirection: 'row', gap: spacing[2], alignSelf: 'flex-end' },
  segOption: {
    minHeight: 40,
    paddingHorizontal: spacing[3],
    borderRadius: radius.pill,
    justifyContent: 'center',
    borderWidth: 1,
  },
  segLight: { borderColor: 'rgba(255,255,255,0.5)' },
  segDark: { borderColor: colors.border },
  segSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  segText: { fontSize: typography.size.sm, fontWeight: '700', color: colors.text },
  segTextLight: { color: colors.onPrimary },
  segTextSelected: { color: colors.onAccent },
});
