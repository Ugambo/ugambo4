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
