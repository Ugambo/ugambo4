import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDateTime, formatTime } from '@rideswithme/mobile-core';
import type {
  BusBookingView,
  BusDepartureSummary,
  BusSeatMapSeat,
  SeatClass,
} from '@rideswithme/shared-types';
import { colors, radius, spacing, typography } from '@rideswithme/ui-components';
import { formatKobo } from '@rideswithme/utilities';
import { Body, Pill, type Tone } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { qrRuns } from '@/lib/qr';
import type { MessageKey } from '@/lib/messages';

export function useSeatClass() {
  const { t } = useI18n();
  return (c: SeatClass) => t(`bus.class.${c}` as MessageKey);
}

/**
 * A QR code drawn with plain views (no native module). Dark runs in each row
 * are merged so a 33×33 code needs a few hundred views at most.
 */
export function QrCode({ value, size, label }: { value: string; size: number; label: string }) {
  const rows = useMemo(() => {
    const q = qrRuns(value);
    return { n: q.size, out: q.rows };
  }, [value]);
  const quiet = 2;
  const cell = size / (rows.n + quiet * 2);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ width: size, height: size, backgroundColor: '#fff', padding: cell * quiet }}
    >
      {rows.out.map((runs, r) => (
        <View key={r} style={{ height: cell, flexDirection: 'row' }}>
          {runs.map((run) => (
            <View
              key={run.start}
              style={{
                position: 'absolute',
                left: run.start * cell,
                width: run.length * cell,
                height: cell,
                backgroundColor: '#000',
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

/** The seat map; free seats are buttons, chosen seats show a tick. */
export function SeatGrid({
  rows,
  columns,
  seats,
  chosen,
  onToggle,
}: {
  rows: number;
  columns: number;
  seats: BusSeatMapSeat[];
  chosen: string[];
  onToggle: (s: BusSeatMapSeat) => void;
}) {
  const { t } = useI18n();
  const seatClass = useSeatClass();
  const at = new Map(seats.map((s) => [`${s.row}:${s.col}`, s]));
  const grid = [];
  for (let r = 1; r <= rows; r++) {
    const cells = [];
    for (let c = 1; c <= columns; c++) {
      const s = at.get(`${r}:${c}`);
      if (!s) {
        cells.push(<View key={c} style={styles.gap} />);
        continue;
      }
      const isChosen = chosen.includes(s.id);
      const taken = s.state === 'taken';
      const yours = s.state === 'yours';
      const base = t('bus.seatDescribe', {
        label: s.label,
        seatClass: seatClass(s.seatClass),
        fare: formatKobo(s.fareKobo),
      });
      cells.push(
        <Pressable
          key={c}
          accessibilityRole="button"
          accessibilityLabel={
            isChosen
              ? `${base}, ${t('bus.seatChosen')}`
              : taken
                ? `${base}, ${t('bus.seatTaken')}`
                : base
          }
          accessibilityState={{ selected: isChosen, disabled: taken || yours }}
          disabled={taken || yours}
          onPress={() => onToggle(s)}
          style={[
            styles.seat,
            s.seatClass === 'executive' && { borderColor: colors.primary },
            s.seatClass === 'vip' && { borderColor: colors.accent, borderWidth: 3 },
            taken && styles.taken,
            yours && styles.yours,
            isChosen && styles.chosen,
          ]}
        >
          <Text style={[styles.seatText, (isChosen || yours) && { color: colors.onPrimary }]}>
            {s.label}
            {isChosen || yours ? ' ✓' : taken ? ' ✕' : ''}
          </Text>
        </Pressable>,
      );
    }
    grid.push(
      <View key={r} style={styles.row}>
        {cells}
      </View>,
    );
  }
  return (
    <View style={styles.map} accessibilityLabel={t('bus.seatMap')}>
      <Text style={styles.front}>{t('bus.front')}</Text>
      {grid}
    </View>
  );
}

export function DepartureText({ d }: { d: BusDepartureSummary }) {
  const { t } = useI18n();
  return (
    <View style={{ gap: spacing[1] }}>
      <Body bold>
        {formatDateTime(d.departsAt)} · {d.route.originCity} → {d.route.destinationCity}
      </Body>
      <Body muted>
        {d.route.originTerminal} → {d.route.destinationTerminal} ·{' '}
        {t('bus.arrives', { time: formatTime(d.arrivesAt) })}
      </Body>
      <Body muted>
        {d.operator.name}
        {d.vehiclePlate ? ` · ${t('bus.plate', { plate: d.vehiclePlate })}` : ''}
      </Body>
    </View>
  );
}

const TONE: Record<BusBookingView['status'], Tone> = {
  held: 'wait',
  confirmed: 'ok',
  expired: 'muted',
  cancelled: 'bad',
};

export function BookingPill({ b }: { b: BusBookingView }) {
  const { t } = useI18n();
  if (b.status === 'confirmed' && b.departure.status === 'departed')
    return <Pill label={t('bus.departed')} tone="muted" />;
  return <Pill label={t(`bus.status.${b.status}` as MessageKey)} tone={TONE[b.status]} />;
}

const styles = StyleSheet.create({
  map: {
    alignSelf: 'center',
    padding: spacing[3],
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    gap: spacing[2],
    backgroundColor: colors.surface,
  },
  front: { textAlign: 'center', color: colors.textMuted, fontSize: typography.size.sm },
  row: { flexDirection: 'row', gap: spacing[2] },
  gap: { width: 48, height: 48 },
  seat: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taken: { backgroundColor: colors.border },
  chosen: { backgroundColor: colors.primary },
  yours: { backgroundColor: colors.primary, opacity: 0.6 },
  seatText: { fontWeight: '700', color: colors.text },
});
