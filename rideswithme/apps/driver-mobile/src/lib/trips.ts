import type { DriverRideView } from '@rideswithme/shared-types';

/** Whole seconds left on an offer (never negative). */
export function secondsLeft(expiresAt: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
}

/** What to collect from the passenger in cash: the booked price plus any waiting charge. */
export function cashToCollect(ride: Pick<DriverRideView, 'fare'>): number {
  return ride.fare.finalTotalKobo ?? ride.fare.quotedTotalKobo + ride.fare.waitingChargeKobo;
}

/** Opens turn-by-turn directions in Google Maps (app if installed, else browser). */
export function navigationUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

/** Start of today and of this week (Monday) in Nigerian time, as epoch ms. */
function nigerianPeriodStarts(now: number) {
  const local = new Date(now + 3_600_000);
  const dayStart =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - 3_600_000;
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  return { today: dayStart, week: dayStart - daysSinceMonday * 86_400_000 };
}

export interface EarningsSummary {
  trips: number;
  fareKobo: number;
  commissionKobo: number;
  netKobo: number;
}

/** Totals of completed trips for today and this week (Monday to Sunday, Nigerian time). */
export function summarizeEarnings(
  rides: DriverRideView[],
  now = Date.now(),
): { today: EarningsSummary; week: EarningsSummary } {
  const { today, week } = nigerianPeriodStarts(now);
  const empty = (): EarningsSummary => ({ trips: 0, fareKobo: 0, commissionKobo: 0, netKobo: 0 });
  const out = { today: empty(), week: empty() };
  for (const r of rides) {
    if (r.status !== 'completed' || !r.completedAt || !r.earnings) continue;
    const at = Date.parse(r.completedAt);
    const add = (s: EarningsSummary) => {
      s.trips += 1;
      s.fareKobo += r.earnings!.fareKobo;
      s.commissionKobo += r.earnings!.commissionKobo + r.earnings!.bookingFeeKobo;
      s.netKobo += r.earnings!.netKobo;
    };
    if (at >= week) add(out.week);
    if (at >= today) add(out.today);
  }
  return out;
}
