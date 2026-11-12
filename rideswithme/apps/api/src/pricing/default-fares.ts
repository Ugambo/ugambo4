import type { FareRuleValues } from './fare-engine';

/**
 * Placeholder prices used when a city is seeded. NOT business-approved: set the
 * real numbers through the admin API before launch (DECISIONS.md D-034).
 */
export const DEFAULT_FARES: Record<string, FareRuleValues> = {
  car: {
    baseFareKobo: 50_000, // ₦500
    perKmKobo: 12_000, // ₦120 per km
    perMinuteKobo: 1_500, // ₦15 per minute
    minimumFareKobo: 80_000, // ₦800
    bookingFeeKobo: 10_000, // ₦100
    cancellationFeeKobo: 30_000, // ₦300
    cancellationGraceSeconds: 120,
    waitingFreeMinutes: 3,
    waitingPerMinuteKobo: 2_000, // ₦20
    commissionBps: 2000, // 20%
    roundingIncrementKobo: 5_000, // ₦50
    peakWindows: [],
  },
  keke_napep: {
    baseFareKobo: 20_000,
    perKmKobo: 7_000,
    perMinuteKobo: 800,
    minimumFareKobo: 40_000,
    bookingFeeKobo: 5_000,
    cancellationFeeKobo: 15_000,
    cancellationGraceSeconds: 120,
    waitingFreeMinutes: 3,
    waitingPerMinuteKobo: 1_000,
    commissionBps: 1500,
    roundingIncrementKobo: 5_000,
    peakWindows: [],
  },
  taxi: {
    baseFareKobo: 50_000,
    perKmKobo: 11_000,
    perMinuteKobo: 1_500,
    minimumFareKobo: 80_000,
    bookingFeeKobo: 10_000,
    cancellationFeeKobo: 30_000,
    cancellationGraceSeconds: 120,
    waitingFreeMinutes: 3,
    waitingPerMinuteKobo: 2_000,
    commissionBps: 2000,
    roundingIncrementKobo: 5_000,
    peakWindows: [],
  },
  motorcycle: {
    baseFareKobo: 15_000,
    perKmKobo: 6_000,
    perMinuteKobo: 600,
    minimumFareKobo: 30_000,
    bookingFeeKobo: 5_000,
    cancellationFeeKobo: 10_000,
    cancellationGraceSeconds: 120,
    waitingFreeMinutes: 3,
    waitingPerMinuteKobo: 800,
    commissionBps: 1500,
    roundingIncrementKobo: 5_000,
    peakWindows: [],
  },
};
