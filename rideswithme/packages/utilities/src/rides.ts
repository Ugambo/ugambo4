/** Passenger-side ride rules shared by the passenger app and website. */
import {
  ACTIVE_RIDE_STATUSES,
  type DriverPosition,
  type LatLng,
  type Place,
  type RideStatus,
  type RideView,
} from '@rideswithme/shared-types';

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

/** A place as the fare and booking endpoints accept it (no null fields). */
export function toPlaceInput(p: Place): {
  location: LatLng;
  address: string;
  name?: string;
  placeId?: string;
} {
  return {
    location: p.location,
    address: p.address,
    ...(p.name && { name: p.name }),
    ...(p.placeId && { placeId: p.placeId }),
  };
}

/** What the passenger's screen shows: the ride in front of them, and rides scheduled for later. */
export interface PassengerRides {
  current: RideView | null;
  scheduled: RideView[];
}

/**
 * Applies a live `ride:updated` event. A scheduled ride stays in the scheduled
 * list until it starts searching; the current ride is replaced by its own update,
 * or by any other ride once it has finished (so the receipt is not lost to an
 * unrelated update while it is on screen).
 */
export function applyRideUpdate(state: PassengerRides, updated: RideView): PassengerRides {
  const scheduled = state.scheduled.filter((r) => r.id !== updated.id);
  if (updated.status === 'requested')
    return { current: state.current, scheduled: [...scheduled, updated] };
  const current = state.current;
  const replace =
    !current || current.id === updated.id || !ACTIVE_RIDE_STATUSES.includes(current.status);
  return { current: replace ? updated : current, scheduled };
}

/** Applies the passenger's active rides from the API (on load and after reconnecting). */
export function applyActiveRides(state: PassengerRides, rides: RideView[]): PassengerRides {
  const current = state.current;
  return {
    scheduled: rides.filter((r) => r.status === 'requested'),
    current:
      rides.find((r) => r.status !== 'requested') ??
      (current && !ACTIVE_RIDE_STATUSES.includes(current.status) ? current : null),
  };
}

/** What to say about how a ride was (or is being) paid. Null when there is nothing to say yet. */
export interface PaymentSummary {
  key:
    | 'receipt.owed'
    | 'ride.payCash'
    | 'receipt.paidCash'
    | 'receipt.paidWallet'
    | 'receipt.cardPending'
    | 'receipt.paidCard';
  /** Amounts in kobo; `card` is { brand, last4 } for 'receipt.paidCard'. */
  amountKobo?: number;
  card?: { brand: string; last4: string };
  tone: 'bad' | 'action' | 'info';
}

/** `past`: on a receipt (cash was paid) rather than at the end of the trip (pay the driver now). */
export function paymentSummary(
  ride: Pick<RideView, 'status' | 'payment' | 'fare'>,
  past = false,
): PaymentSummary | null {
  const p = ride.payment;
  if (p.status === 'outstanding')
    return { key: 'receipt.owed', amountKobo: p.outstandingKobo, tone: 'bad' };
  if (p.method === 'cash' && ride.status === 'completed') {
    return past
      ? { key: 'receipt.paidCash', tone: 'info' }
      : {
          key: 'ride.payCash',
          amountKobo: ride.fare.finalTotalKobo ?? ride.fare.quotedTotalKobo,
          tone: 'action',
        };
  }
  if (p.method === 'wallet' && p.status === 'succeeded')
    return { key: 'receipt.paidWallet', tone: 'info' };
  if (p.method === 'card' && p.status === 'pending')
    return { key: 'receipt.cardPending', tone: 'info' };
  if (p.method === 'card' && p.status === 'succeeded' && p.card)
    return { key: 'receipt.paidCard', card: p.card, tone: 'info' };
  return null;
}
