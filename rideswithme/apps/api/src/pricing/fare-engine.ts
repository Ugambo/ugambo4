import type { FareBreakdown, PeakWindow } from '@rideswithme/shared-types';
import { applyBasisPoints, assertKobo, sumKobo } from '@rideswithme/utilities';

/** The price inputs of a fare rule, as frozen into each ride's fare snapshot. */
export interface FareRuleValues {
  baseFareKobo: number;
  perKmKobo: number;
  perMinuteKobo: number;
  minimumFareKobo: number;
  bookingFeeKobo: number;
  cancellationFeeKobo: number;
  cancellationGraceSeconds: number;
  waitingFreeMinutes: number;
  waitingPerMinuteKobo: number;
  commissionBps: number;
  roundingIncrementKobo: number;
  peakWindows: PeakWindow[];
}

/** rate × quantity / divisor in integer kobo, rounded half up (BigInt: no float error, no overflow). */
function prorate(rateKobo: number, quantity: number, divisor: number): number {
  assertKobo(rateKobo);
  const product = BigInt(rateKobo) * BigInt(Math.round(quantity));
  const d = BigInt(divisor);
  let q = product / d;
  if ((product % d) * 2n >= d) q += 1n;
  return Number(q);
}

/** Nigeria is UTC+1 with no daylight saving. */
function nigerianClock(at: Date): { isoWeekday: number; minutes: number } {
  const local = new Date(at.getTime() + 3_600_000);
  return {
    isoWeekday: ((local.getUTCDay() + 6) % 7) + 1,
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};

/** Highest multiplier of the peak windows active at `at` (10000 = no surge). */
export function peakMultiplierBps(windows: PeakWindow[], at: Date): number {
  const { isoWeekday, minutes } = nigerianClock(at);
  let best = 10_000;
  for (const w of windows) {
    if (
      w.days.includes(isoWeekday) &&
      minutes >= toMinutes(w.start) &&
      minutes < toMinutes(w.end)
    ) {
      best = Math.max(best, w.multiplierBps);
    }
  }
  return best;
}

/**
 * F = B + (D × Rd) + (T × Rt) + A
 *
 * B base fare, D distance (km), Rd per-km rate, T duration (minutes), Rt
 * per-minute rate, A additional charges (booking fee). A peak multiplier, when
 * active, applies to B + D×Rd + T×Rt. The minimum fare applies to that trip part.
 * The total is rounded up to the rounding increment (e.g. ₦50) so cash change is easy.
 */
export function calculateFare(
  rule: FareRuleValues,
  trip: { distanceMeters: number; durationSeconds: number; at: Date },
): FareBreakdown {
  const baseKobo = rule.baseFareKobo;
  const distanceKobo = prorate(rule.perKmKobo, trip.distanceMeters, 1000);
  const timeKobo = prorate(rule.perMinuteKobo, trip.durationSeconds, 60);
  const subtotal = sumKobo(baseKobo, distanceKobo, timeKobo);

  const multiplier = peakMultiplierBps(rule.peakWindows, trip.at);
  const peakSurchargeKobo = applyBasisPoints(subtotal, multiplier) - subtotal;
  const tripFare = subtotal + peakSurchargeKobo;

  const minimumAdjustmentKobo = Math.max(0, rule.minimumFareKobo - tripFare);
  const beforeRounding = sumKobo(tripFare, minimumAdjustmentKobo, rule.bookingFeeKobo);
  const inc = rule.roundingIncrementKobo;
  const roundingKobo = (inc - (beforeRounding % inc)) % inc;

  return {
    baseKobo,
    distanceKobo,
    timeKobo,
    peakSurchargeKobo,
    peakMultiplierBps: multiplier,
    bookingFeeKobo: rule.bookingFeeKobo,
    minimumAdjustmentKobo,
    roundingKobo,
    totalKobo: beforeRounding + roundingKobo,
  };
}

/**
 * Charge for keeping the driver waiting at pickup beyond the free minutes,
 * per started minute.
 */
export function waitingCharge(rule: FareRuleValues, arrivedAt: Date, startedAt: Date): number {
  const waitedSeconds = Math.max(0, (startedAt.getTime() - arrivedAt.getTime()) / 1000);
  const billable = waitedSeconds - rule.waitingFreeMinutes * 60;
  if (billable <= 0) return 0;
  return Math.ceil(billable / 60) * rule.waitingPerMinuteKobo;
}

/**
 * Splits a final fare: the booking fee goes to the platform in full; commission
 * is a percentage of the rest; the driver keeps the remainder.
 */
export function splitFare(
  rule: Pick<FareRuleValues, 'bookingFeeKobo' | 'commissionBps'>,
  finalTotalKobo: number,
) {
  const bookingFeeKobo = Math.min(rule.bookingFeeKobo, finalTotalKobo);
  const commissionKobo = applyBasisPoints(finalTotalKobo - bookingFeeKobo, rule.commissionBps);
  return {
    bookingFeeKobo,
    commissionKobo,
    driverEarningsKobo: finalTotalKobo - bookingFeeKobo - commissionKobo,
  };
}

/**
 * Passenger cancellation fee: free during the grace period after a driver
 * accepts; charged after it, or once the driver has arrived.
 */
export function passengerCancellationFee(
  rule: Pick<FareRuleValues, 'cancellationFeeKobo' | 'cancellationGraceSeconds'>,
  ride: { status: string; assignedAt: Date | null },
  now: Date,
): number {
  if (ride.status === 'driver_arrived') return rule.cancellationFeeKobo;
  if (ride.status === 'driver_assigned' && ride.assignedAt) {
    const elapsed = (now.getTime() - ride.assignedAt.getTime()) / 1000;
    return elapsed > rule.cancellationGraceSeconds ? rule.cancellationFeeKobo : 0;
  }
  return 0;
}
