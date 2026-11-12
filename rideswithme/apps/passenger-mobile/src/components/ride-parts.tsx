import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { FareQuoteOption, RideView } from '@rideswithme/shared-types';
import { colors, radius, spacing, typography } from '@rideswithme/ui-components';
import { formatKobo } from '@rideswithme/utilities';
import { Body } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import { api } from '@/lib/session';

export const CATEGORY_ICON: Record<string, string> = {
  car: '🚗',
  keke_napep: '🛺',
  taxi: '🚕',
  motorcycle: '🏍️',
};

/** Vehicle list row: icon, name, ETA, seats, price. */
export function VehicleRow({
  option,
  selected,
  onPress,
}: {
  option: FareQuoteOption;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useI18n();
  const eta =
    option.etaSeconds === null
      ? t('choose.noDrivers')
      : t('choose.eta', { minutes: Math.max(1, Math.round(option.etaSeconds / 60)) });
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.vehicle, selected && styles.vehicleSelected]}
    >
      <Text style={styles.icon}>{CATEGORY_ICON[option.category.key] ?? '🚗'}</Text>
      <View style={styles.vehicleText}>
        <Text style={styles.vehicleName}>{option.category.name}</Text>
        <Text style={styles.vehicleMeta}>
          {eta} · {t('choose.seats', { seats: option.category.seats })}
        </Text>
      </View>
      <Text style={styles.price}>{formatKobo(option.totalKobo)}</Text>
    </Pressable>
  );
}

/** Driver card: photo, first name, rating, vehicle, plate, call and message. */
export function DriverCard({ ride }: { ride: RideView }) {
  const { t } = useI18n();
  const [photo, setPhoto] = useState<string | null>(null);
  const driver = ride.driver;
  useEffect(() => {
    if (!driver?.hasPhoto) return;
    api.rides.driverPhoto(ride.id).then(
      (p) => setPhoto(p.url),
      () => setPhoto(null),
    );
  }, [ride.id, driver?.hasPhoto]);
  if (!driver) return null;
  return (
    <View style={styles.driverCard}>
      <View style={styles.driverRow}>
        {photo ? (
          <Image
            source={{ uri: photo }}
            style={styles.photo}
            accessibilityLabel={driver.firstName}
          />
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <Text style={styles.initial}>{driver.firstName.slice(0, 1)}</Text>
          </View>
        )}
        <View style={styles.driverText}>
          <Text style={styles.driverName}>{driver.firstName}</Text>
          <Text style={styles.vehicleMeta}>★ {t('ride.newDriver')}</Text>
          <Text style={styles.vehicleMeta}>
            {driver.vehicle.colour} {driver.vehicle.make} {driver.vehicle.model}
          </Text>
        </View>
        <View
          style={styles.plate}
          accessibilityLabel={`${t('ride.plate')} ${driver.vehicle.plateNumber}`}
        >
          <Text style={styles.plateText}>{driver.vehicle.plateNumber}</Text>
        </View>
      </View>
      <View style={styles.contactRow}>
        {/* Masked calling and messaging need a telephony vendor (DECISIONS B-3). */}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          style={[styles.contact, styles.disabled]}
        >
          <Text style={styles.contactText}>📞 {t('ride.call')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          style={[styles.contact, styles.disabled]}
        >
          <Text style={styles.contactText}>💬 {t('ride.message')}</Text>
        </Pressable>
      </View>
      <Body muted>{t('ride.contactSoon')}</Body>
    </View>
  );
}

/** Every line of a ride's price. */
export function FareLines({ ride }: { ride: RideView }) {
  const { t } = useI18n();
  const b = ride.fare.breakdown;
  const lines: [MessageKey, number][] = [
    ['receipt.base', b.baseKobo],
    ['receipt.distance', b.distanceKobo],
    ['receipt.time', b.timeKobo],
    ['receipt.peak', b.peakSurchargeKobo],
    ['receipt.minimum', b.minimumAdjustmentKobo],
    ['receipt.bookingFee', b.bookingFeeKobo],
    ['receipt.rounding', b.roundingKobo],
    ['receipt.waiting', ride.fare.waitingChargeKobo],
  ];
  const cancelled =
    ride.status === 'cancelled_by_passenger' || ride.status === 'cancelled_by_driver';
  const total = cancelled
    ? ride.fare.cancellationFeeKobo
    : (ride.fare.finalTotalKobo ?? ride.fare.quotedTotalKobo);
  return (
    <View style={styles.lines}>
      {!cancelled &&
        lines
          .filter(([, v]) => v > 0)
          .map(([k, v]) => (
            <View key={k} style={styles.line}>
              <Text style={styles.lineLabel}>{t(k)}</Text>
              <Text style={styles.lineValue}>{formatKobo(v)}</Text>
            </View>
          ))}
      {cancelled && ride.fare.cancellationFeeKobo > 0 && (
        <View style={styles.line}>
          <Text style={styles.lineLabel}>{t('receipt.cancellationFee')}</Text>
          <Text style={styles.lineValue}>{formatKobo(ride.fare.cancellationFeeKobo)}</Text>
        </View>
      )}
      <View style={[styles.line, styles.totalLine]}>
        <Text style={styles.totalLabel}>{t('receipt.total')}</Text>
        <Text style={styles.totalValue}>{formatKobo(total)}</Text>
      </View>
    </View>
  );
}

export function StatusLabel({ ride }: { ride: RideView }) {
  const { t } = useI18n();
  return <Text style={styles.vehicleMeta}>{t(`status.${ride.status}` as MessageKey)}</Text>;
}

const styles = StyleSheet.create({
  vehicle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 64,
    paddingHorizontal: spacing[3],
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
  },
  vehicleSelected: { borderColor: colors.accent, backgroundColor: '#FFF7E8' },
  icon: { fontSize: 30 },
  vehicleText: { flex: 1 },
  vehicleName: { fontSize: typography.size.lg, fontWeight: '800', color: colors.text },
  vehicleMeta: { fontSize: typography.size.sm, color: colors.textMuted },
  price: { fontSize: typography.size.lg, fontWeight: '800', color: colors.text },
  driverCard: { gap: spacing[3] },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  photo: { width: 56, height: 56, borderRadius: 28 },
  photoPlaceholder: {
    backgroundColor: colors.grey[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontSize: typography.size.xl, fontWeight: '800', color: colors.textMuted },
  driverText: { flex: 1 },
  driverName: { fontSize: typography.size.lg, fontWeight: '800', color: colors.text },
  plate: {
    borderWidth: 2,
    borderColor: colors.text,
    borderRadius: radius.sm,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    backgroundColor: '#FFFDF5',
  },
  plateText: {
    fontSize: typography.size.lg,
    fontWeight: '900',
    letterSpacing: 1,
    color: colors.text,
  },
  contactRow: { flexDirection: 'row', gap: spacing[3] },
  contact: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactText: { fontSize: typography.size.md, fontWeight: '700', color: colors.primary },
  disabled: { opacity: 0.4 },
  lines: { gap: spacing[1] },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  lineLabel: { fontSize: typography.size.md, color: colors.textMuted },
  lineValue: { fontSize: typography.size.md, color: colors.text },
  totalLine: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing[2],
    marginTop: spacing[1],
  },
  totalLabel: { fontSize: typography.size.lg, fontWeight: '800', color: colors.text },
  totalValue: { fontSize: typography.size.lg, fontWeight: '800', color: colors.text },
});
