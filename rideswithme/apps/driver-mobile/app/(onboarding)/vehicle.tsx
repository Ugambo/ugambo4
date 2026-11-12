import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { VehicleCategorySummary } from '@rideswithme/shared-types';
import { colors, radius, spacing, typography } from '@rideswithme/ui-components';
import { upsertVehicleSchema } from '@rideswithme/validation';
import { Body, Button, Card, ErrorText, ErrorView, Field, Loading, Screen } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { useOnboarding } from '@/lib/onboarding-context';
import { api } from '@/lib/session';

export default function Vehicle() {
  const { t } = useI18n();
  const { view, setView } = useOnboarding();
  const v = view?.vehicle;
  const [categories, setCategories] = useState<VehicleCategorySummary[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [form, setForm] = useState({
    categoryKey: v?.category.key ?? '',
    plateNumber: v?.plateNumber ?? '',
    make: v?.make ?? '',
    model: v?.model ?? '',
    colour: v?.colour ?? '',
    year: v ? String(v.year) : '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = () => {
    setLoadError(null);
    api.vehicleCategories().then(setCategories, setLoadError);
  };
  useEffect(load, []);

  if (!view) return null;
  if (!categories) return loadError ? <ErrorView error={loadError} onRetry={load} /> : <Loading />;

  const parsed = upsertVehicleSchema().safeParse({ ...form, year: Number(form.year) });
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    if (!parsed.success) return;
    setBusy(true);
    setError(null);
    try {
      setView(await api.driver.upsertVehicle(parsed.data));
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
      <Text style={styles.label}>{t('vehicle.category')}</Text>
      <View style={styles.categories} accessibilityRole="radiogroup">
        {categories.map((c) => {
          const selected = form.categoryKey === c.key;
          return (
            <Pressable
              key={c.key}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: !view.editable }}
              onPress={view.editable ? () => set('categoryKey')(c.key) : undefined}
              style={[styles.category, selected && styles.categorySelected]}
            >
              <Text style={styles.categoryName}>{c.name}</Text>
              <Text style={styles.categorySeats}>{t('vehicle.seats', { seats: c.seats })}</Text>
            </Pressable>
          );
        })}
      </View>
      <Field
        label={t('vehicle.plate')}
        value={form.plateNumber}
        onChangeText={set('plateNumber')}
        autoCapitalize="characters"
        editable={view.editable}
      />
      <Field
        label={t('vehicle.make')}
        value={form.make}
        onChangeText={set('make')}
        editable={view.editable}
      />
      <Field
        label={t('vehicle.model')}
        value={form.model}
        onChangeText={set('model')}
        editable={view.editable}
      />
      <Field
        label={t('vehicle.colour')}
        value={form.colour}
        onChangeText={set('colour')}
        editable={view.editable}
      />
      <Field
        label={t('vehicle.year')}
        value={form.year}
        onChangeText={(y) => set('year')(y.replace(/\D/g, ''))}
        keyboardType="number-pad"
        maxLength={4}
        editable={view.editable}
      />
      <ErrorText error={error} />
      {view.editable && (
        <Button
          title={t('common.save')}
          onPress={() => void save()}
          disabled={!parsed.success}
          busy={busy}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: typography.size.md, fontWeight: '700', color: colors.text },
  categories: { flexDirection: 'row', gap: spacing[3] },
  category: {
    flex: 1,
    minHeight: 72,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing[3],
    backgroundColor: colors.background,
    justifyContent: 'center',
  },
  categorySelected: { borderColor: colors.accent, backgroundColor: '#FFF7E8' },
  categoryName: { fontSize: typography.size.lg, fontWeight: '800', color: colors.text },
  categorySeats: { fontSize: typography.size.sm, color: colors.textMuted },
});
