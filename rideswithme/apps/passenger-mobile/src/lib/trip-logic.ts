import type { DriverPosition, RideStatus, RideView } from '@rideswithme/shared-types';

/** What the home screen shows for the passenger's current ride. */
export type RidePhase =
  | 'searching'
  | 'driver_coming'
  | 'driver_here'
  | 'on_trip'
  | 'completed'
  | 'cancelled'
  | 'no_driver'
  | 'scheduled';

export function ridePhase(ride: Pick<RideView, 'status' | 'scheduledFor'>): RidePhase {
  const map: Record<RideStatus, RidePhase> = {
    requested: 'scheduled',
    searching: 'searching',
    driver_assigned: 'driver_coming',
    driver_arrived: 'driver_here',
    in_progress: 'on_trip',
    completed: 'completed',
    cancelled_by_passenger: 'cancelled',
    cancelled_by_driver: 'cancelled',
    no_driver_found: 'no_driver',
  };
  return map[ride.status];
}

/** The passenger may cancel in the app until the trip starts. */
export const canCancel = (status: RideStatus) =>
  status === 'requested' ||
  status === 'searching' ||
  status === 'driver_assigned' ||
  status === 'driver_arrived';

/** The fee the passenger would pay if they cancelled now (mirrors the server rule). */
export function cancellationFeeNow(
  ride: Pick<RideView, 'status' | 'assignedAt' | 'fare'>,
  now = Date.now(),
): number {
  const { feeKobo, graceSeconds } = ride.fare.cancellationPolicy;
  if (ride.status === 'driver_arrived') return feeKobo;
  if (ride.status === 'driver_assigned' && ride.assignedAt) {
    return now - Date.parse(ride.assignedAt) > graceSeconds * 1000 ? feeKobo : 0;
  }
  return 0;
}

/**
 * A driver position older than this is shown as "last updated … ago", never as
 * live (drivers often lose signal).
 */
export const STALE_AFTER_SECONDS = 30;

export function positionAge(
  position: DriverPosition | null,
  now = Date.now(),
): { stale: boolean; seconds: number } | null {
  if (!position) return null;
  const seconds = Math.max(0, Math.round((now - Date.parse(position.receivedAt)) / 1000));
  return { stale: seconds > STALE_AFTER_SECONDS, seconds };
}

/**
 * Times a passenger can schedule a ride for: every 15 minutes from 30 minutes
 * ahead (rounded up) for the next 24 hours.
 */
export function scheduleSlots(now: Date, hours = 24): Date[] {
  const step = 15 * 60_000;
  const first = Math.ceil((now.getTime() + 30 * 60_000) / step) * step;
  const slots: Date[] = [];
  for (let t = first; t <= now.getTime() + hours * 3_600_000; t += step) slots.push(new Date(t));
  return slots;
}
