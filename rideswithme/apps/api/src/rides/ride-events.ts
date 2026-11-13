import type { Kysely } from 'kysely';
import type { LatLng, RideStatus } from '@rideswithme/shared-types';
import { point } from '../database/geo';
import type { Database } from '../database/types';

/** The ride state machine: which status may follow which. */
export const TRANSITIONS: Record<RideStatus, readonly RideStatus[]> = {
  requested: ['searching', 'cancelled_by_passenger', 'cancelled_by_admin'],
  searching: ['driver_assigned', 'cancelled_by_passenger', 'no_driver_found', 'cancelled_by_admin'],
  driver_assigned: [
    'driver_arrived',
    'cancelled_by_passenger',
    'cancelled_by_driver',
    'cancelled_by_admin',
  ],
  driver_arrived: [
    'in_progress',
    'cancelled_by_passenger',
    'cancelled_by_driver',
    'cancelled_by_admin',
  ],
  in_progress: ['completed', 'cancelled_by_admin'],
  completed: [],
  cancelled_by_passenger: [],
  cancelled_by_driver: [],
  no_driver_found: [],
  cancelled_by_admin: [],
};

export function canTransition(from: RideStatus, to: RideStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export interface RideEventInput {
  rideId: string;
  eventType: string;
  from?: RideStatus | null;
  to?: RideStatus | null;
  actorType: 'passenger' | 'driver' | 'admin' | 'system';
  actorId?: string | null;
  location?: LatLng | null;
  metadata?: Record<string, unknown>;
}

/** Appends to the ride's timeline (ride_events is append-only). */
export async function recordRideEvent(trx: Kysely<Database>, e: RideEventInput): Promise<void> {
  await trx
    .insertInto('ride_events')
    .values({
      ride_id: e.rideId,
      event_type: e.eventType,
      from_status: e.from ?? null,
      to_status: e.to ?? null,
      actor_type: e.actorType,
      actor_id: e.actorId ?? null,
      location: e.location ? point(e.location) : null,
      metadata: JSON.stringify(e.metadata ?? {}),
    })
    .execute();
}
