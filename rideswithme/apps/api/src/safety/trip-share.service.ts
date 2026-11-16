import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { ErrorCode, type PublicTripView, type TripShareView } from '@rideswithme/shared-types';
import { AppException } from '../common/app-exception';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB } from '../database/database.module';
import type { Database } from '../database/types';
import { PresenceService } from '../rides/presence.service';
import { ACTIVE, rideForParticipant, WITH_DRIVER } from './ride-access';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const firstName = (full: string | null) => (full ?? '').trim().split(/\s+/)[0] || 'RideswithMe';

/**
 * Trip sharing: the passenger sends a link; whoever opens it sees the trip's
 * status, the driver's first name and vehicle, and the live position, with no
 * phone numbers or passenger details. Only a hash of the token is stored; a new
 * link replaces the old one, and links stop working
 * TRIP_SHARE_AFTER_END_MINUTES after the trip ends.
 */
@Injectable()
export class TripShareService {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly presence: PresenceService,
  ) {}

  async create(passengerId: string, rideId: string): Promise<TripShareView> {
    const ride = await rideForParticipant(this.db, rideId, passengerId);
    if (ride.role !== 'passenger') throw new AppException(ErrorCode.NOT_FOUND, 'Ride not found');
    if (!ACTIVE.includes(ride.status))
      throw new AppException(ErrorCode.INVALID_STATE, 'Only a trip in progress can be shared');
    const token = randomBytes(24).toString('base64url');
    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('trip_shares')
        .set({ revoked_at: new Date() })
        .where('ride_id', '=', rideId)
        .where('revoked_at', 'is', null)
        .execute();
      await trx
        .insertInto('trip_shares')
        .values({ ride_id: rideId, created_by: passengerId, token_hash: hash(token) })
        .execute();
    });
    return {
      url: `${this.config.TRIP_SHARE_BASE_URL.replace(/\/$/, '')}/${token}`,
      expiresWhen: 'trip_ends',
    };
  }

  async revoke(passengerId: string, rideId: string): Promise<void> {
    const ride = await rideForParticipant(this.db, rideId, passengerId);
    if (ride.role !== 'passenger') throw new AppException(ErrorCode.NOT_FOUND, 'Ride not found');
    await this.db
      .updateTable('trip_shares')
      .set({ revoked_at: new Date() })
      .where('ride_id', '=', rideId)
      .where('revoked_at', 'is', null)
      .execute();
  }

  async view(token: string, now = new Date()): Promise<PublicTripView> {
    const gone = () => new AppException(ErrorCode.NOT_FOUND, 'This link has expired');
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw gone();
    const r = await this.db
      .selectFrom('trip_shares as s')
      .innerJoin('rides as r', 'r.id', 's.ride_id')
      .leftJoin('users as d', 'd.id', 'r.driver_id')
      .leftJoin('vehicles as v', 'v.id', 'r.vehicle_id')
      .select([
        'r.status',
        'r.driver_id',
        'r.pickup_address',
        'r.dropoff_address',
        'r.completed_at',
        'r.cancelled_at',
        'r.updated_at',
        'd.full_name',
        'v.make',
        'v.model',
        'v.colour',
        'v.plate_number',
      ])
      .where('s.token_hash', '=', hash(token))
      .where('s.revoked_at', 'is', null)
      .executeTakeFirst();
    if (!r) throw gone();
    const active = ACTIVE.includes(r.status);
    const ended = r.completed_at ?? r.cancelled_at;
    if (
      !active &&
      (!ended ||
        now.getTime() - ended.getTime() > this.config.TRIP_SHARE_AFTER_END_MINUTES * 60_000)
    )
      throw gone();
    const pos =
      r.driver_id && WITH_DRIVER.includes(r.status)
        ? await this.presence.position(r.driver_id)
        : null;
    return {
      status: r.status,
      active,
      driver:
        r.driver_id && r.make
          ? {
              firstName: firstName(r.full_name),
              vehicle: {
                make: r.make,
                model: r.model ?? '',
                colour: r.colour ?? '',
                plateNumber: r.plate_number ?? '',
              },
            }
          : null,
      pickupAddress: r.pickup_address,
      dropoffAddress: r.dropoff_address,
      position: pos ? { lat: pos.lat, lng: pos.lng, receivedAt: pos.receivedAt } : null,
      updatedAt: r.updated_at.toISOString(),
    };
  }
}
