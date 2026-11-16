import type { Kysely } from 'kysely';
import { ErrorCode } from '@rideswithme/shared-types';
import { AppException } from '../common/app-exception';
import type { Database } from '../database/types';

/** The ride, if this person is its passenger or driver (as which), else 404. */
export async function rideForParticipant(db: Kysely<Database>, rideId: string, userId: string) {
  const r = await db
    .selectFrom('rides')
    .select([
      'id',
      'status',
      'passenger_id',
      'driver_id',
      'completed_at',
      'cancelled_at',
      'pickup_address',
      'dropoff_address',
    ])
    .where('id', '=', rideId)
    .executeTakeFirst();
  if (!r || (r.passenger_id !== userId && r.driver_id !== userId))
    throw new AppException(ErrorCode.NOT_FOUND, 'Ride not found');
  return { ...r, role: r.passenger_id === userId ? ('passenger' as const) : ('driver' as const) };
}

export const ACTIVE = [
  'requested',
  'searching',
  'driver_assigned',
  'driver_arrived',
  'in_progress',
];
export const WITH_DRIVER = ['driver_assigned', 'driver_arrived', 'in_progress'];
