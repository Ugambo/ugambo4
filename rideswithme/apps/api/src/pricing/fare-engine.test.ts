import { describe, expect, it } from 'vitest';
import {
  calculateFare,
  type FareRuleValues,
  passengerCancellationFee,
  peakMultiplierBps,
  splitFare,
  waitingCharge,
} from './fare-engine';

const car: FareRuleValues = {
  baseFareKobo: 50_000, // ₦500
  perKmKobo: 12_000, // ₦120/km
  perMinuteKobo: 1_500, // ₦15/min
  minimumFareKobo: 80_000, // ₦800
  bookingFeeKobo: 10_000, // ₦100
  cancellationFeeKobo: 30_000,
  cancellationGraceSeconds: 120,
  waitingFreeMinutes: 3,
  waitingPerMinuteKobo: 2_000,
  commissionBps: 2000,
  roundingIncrementKobo: 5_000, // ₦50
  peakWindows: [],
};
// Wednesday 2026-11-11 12:00 in Lagos (11:00 UTC): off-peak.
const noon = new Date('2026-11-11T11:00:00Z');

describe('calculateFare', () => {
  it('applies F = B + D×Rd + T×Rt + A and rounds up to ₦50', () => {
    const f = calculateFare(car, { distanceMeters: 7_350, durationSeconds: 1_130, at: noon });
    expect(f.baseKobo).toBe(50_000);
    expect(f.distanceKobo).toBe(88_200); // 7.35 km × ₦120
    expect(f.timeKobo).toBe(28_250); // 18.833 min × ₦15
    expect(f.bookingFeeKobo).toBe(10_000);
    expect(f.minimumAdjustmentKobo).toBe(0);
    // 50,000 + 88,200 + 28,250 + 10,000 = 176,450 → 180,000 (₦1,800)
    expect(f.roundingKobo).toBe(3_550);
    expect(f.totalKobo).toBe(180_000);
    const parts =
      f.baseKobo +
      f.distanceKobo +
      f.timeKobo +
      f.peakSurchargeKobo +
      f.minimumAdjustmentKobo +
      f.bookingFeeKobo +
      f.roundingKobo;
    expect(parts).toBe(f.totalKobo);
  });

  it('raises short trips to the minimum fare, then adds the booking fee', () => {
    const f = calculateFare(car, { distanceMeters: 800, durationSeconds: 180, at: noon });
    // 50,000 + 9,600 + 4,500 = 64,100 → minimum 80,000 (+15,900), + 10,000 fee = 90,000
    expect(f.minimumAdjustmentKobo).toBe(15_900);
    expect(f.totalKobo).toBe(90_000);
  });

  it('never produces fractional kobo, whatever the inputs', () => {
    for (let m = 0; m < 50_000; m += 997) {
      const f = calculateFare(car, { distanceMeters: m, durationSeconds: m / 7, at: noon });
      expect(Number.isSafeInteger(f.totalKobo)).toBe(true);
      expect(f.totalKobo % car.roundingIncrementKobo).toBe(0);
    }
  });

  it('applies the highest active peak multiplier to the trip part only', () => {
    const rule = {
      ...car,
      peakWindows: [
        { days: [1, 2, 3, 4, 5], start: '07:00', end: '09:30', multiplierBps: 12_000 },
        { days: [3], start: '08:00', end: '09:00', multiplierBps: 15_000 },
      ],
    };
    const wedPeak = new Date('2026-11-11T07:30:00Z'); // 08:30 Lagos, Wednesday
    expect(peakMultiplierBps(rule.peakWindows, wedPeak)).toBe(15_000);
    const f = calculateFare(rule, { distanceMeters: 7_350, durationSeconds: 1_130, at: wedPeak });
    // subtotal 166,450 × 1.5 = 249,675 → surcharge 83,225; + fee 10,000 = 259,675 → 260,000
    expect(f.peakSurchargeKobo).toBe(83_225);
    expect(f.totalKobo).toBe(260_000);
    // Saturday 08:30 Lagos: no window.
    expect(peakMultiplierBps(rule.peakWindows, new Date('2026-11-14T07:30:00Z'))).toBe(10_000);
    // End time is exclusive: 09:30 Lagos is off-peak.
    expect(peakMultiplierBps(rule.peakWindows, new Date('2026-11-10T08:30:00Z'))).toBe(10_000);
  });
});

describe('waitingCharge', () => {
  const arrived = new Date('2026-11-11T10:00:00Z');
  it('is free within the free minutes, then charges each started minute', () => {
    expect(waitingCharge(car, arrived, new Date('2026-11-11T10:03:00Z'))).toBe(0);
    expect(waitingCharge(car, arrived, new Date('2026-11-11T10:03:01Z'))).toBe(2_000);
    expect(waitingCharge(car, arrived, new Date('2026-11-11T10:06:30Z'))).toBe(8_000);
  });
});

describe('splitFare', () => {
  it('gives the booking fee to the platform and takes commission on the rest', () => {
    // ₦1,800 fare: ₦100 fee, 20% of ₦1,700 = ₦340, driver keeps ₦1,360
    expect(splitFare(car, 180_000)).toEqual({
      bookingFeeKobo: 10_000,
      commissionKobo: 34_000,
      driverEarningsKobo: 136_000,
    });
  });
  it('always adds back up to the fare', () => {
    for (const total of [0, 1, 9_999, 10_001, 123_457, 99_999_999]) {
      const s = splitFare(car, total);
      expect(s.bookingFeeKobo + s.commissionKobo + s.driverEarningsKobo).toBe(total);
    }
  });
});

describe('passengerCancellationFee', () => {
  const assignedAt = new Date('2026-11-11T10:00:00Z');
  it('is free while searching and during the grace period after a driver accepts', () => {
    expect(
      passengerCancellationFee(car, { status: 'searching', assignedAt: null }, assignedAt),
    ).toBe(0);
    expect(
      passengerCancellationFee(
        car,
        { status: 'driver_assigned', assignedAt },
        new Date('2026-11-11T10:02:00Z'),
      ),
    ).toBe(0);
  });
  it('charges after the grace period or once the driver has arrived', () => {
    expect(
      passengerCancellationFee(
        car,
        { status: 'driver_assigned', assignedAt },
        new Date('2026-11-11T10:02:01Z'),
      ),
    ).toBe(30_000);
    expect(
      passengerCancellationFee(car, { status: 'driver_arrived', assignedAt }, assignedAt),
    ).toBe(30_000);
  });
});
