import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@rideswithme/ui-components';
import type { Language } from '@rideswithme/shared-types';
import { useI18n } from '@/lib/i18n';

/** English / Hausa toggle with large targets. */
export function LanguageSwitch({ light = false }: { light?: boolean }) {
  const { lang, setLang, t } = useI18n();
  const options: { value: Language; label: string }[] = [
    { value: 'en', label: 'English' },
    { value: 'ha', label: 'Hausa' },
  ];
  return (
    <View
      style={styles.row}
      accessibilityRole="radiogroup"
      accessibilityLabel={t('common.language')}
    >
      {options.map((o) => {
        const selected = lang === o.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => setLang(o.value)}
            style={[
              styles.option,
              light ? styles.optionLight : styles.optionDark,
              selected && styles.selected,
            ]}
          >
            <Text
              style={[
                styles.text,
                light && !selected && styles.textLight,
                selected && styles.selectedText,
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing[2], alignSelf: 'flex-end' },
  option: {
    minHeight: 40,
    paddingHorizontal: spacing[3],
    borderRadius: radius.pill,
    justifyContent: 'center',
    borderWidth: 1,
  },
  optionLight: { borderColor: 'rgba(255,255,255,0.5)' },
  optionDark: { borderColor: colors.border },
  selected: { backgroundColor: colors.accent, borderColor: colors.accent },
  text: { fontSize: typography.size.sm, fontWeight: '700', color: colors.text },
  textLight: { color: colors.onPrimary },
  selectedText: { color: colors.onAccent },
});
