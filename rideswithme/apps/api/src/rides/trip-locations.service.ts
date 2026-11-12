import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, sql } from 'kysely';
import type { LocationPoint } from '@rideswithme/validation';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB } from '../database/database.module';
import { point } from '../database/geo';
import type { Database } from '../database/types';

/** Phones may run a little ahead of the server clock. */
const MAX_FUTURE_MS = 120_000;
/** Points less accurate than this are kept in history but not used for distance. */
const DISTANCE_ACCURACY_METERS = 50;

/**
 * Trip location history. Each reading is attributed, by the time it was taken
 * on the phone, to the driver's ride that was active at that moment, so points
 * buffered offline and uploaded later still land on the right trip. Readings
 * outside any ride are not stored.
 */
@Injectable()
export class TripLocationsService {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async record(driverId: string, points: LocationPoint[], now = new Date()): Promise<number> {
    const oldest = now.getTime() - this.config.LOCATION_MAX_AGE_HOURS * 3_600_000;
    const usable = points
      .map((p) => ({ ...p, t: Math.min(Date.parse(p.recordedAt), now.getTime() + MAX_FUTURE_MS) }))
      .filter((p) => p.t >= oldest);
    if (usable.length === 0) return 0;

    const rides = await this.db
      .selectFrom('rides')
      .select([
        'id',
        'assigned_at',
        sql<Date | null>`coalesce(completed_at, cancelled_at)`.as('ended_at'),
      ])
      .where('driver_id', '=', driverId)
      .where('assigned_at', 'is not', null)
      .where((eb) =>
        eb.or([
          eb('completed_at', 'is', null).and('cancelled_at', 'is', null),
          eb(sql`coalesce(completed_at, cancelled_at)`, '>=', new Date(oldest)),
        ]),
      )
      .execute();

    const rows = usable.flatMap((p) => {
      const ride = rides.find(
        (r) => r.assigned_at!.getTime() <= p.t && (!r.ended_at || p.t <= r.ended_at.getTime()),
      );
      if (!ride) return [];
      return [
        {
          ride_id: ride.id,
          driver_id: driverId,
          location: point(p),
          accuracy_meters: p.accuracy ?? null,
          heading: p.heading ?? null,
          speed_mps: p.speed ?? null,
          recorded_at: new Date(p.t),
          received_at: now,
        },
      ];
    });
    if (rows.length) await this.db.insertInto('trip_locations').values(rows).execute();
    return rows.length;
  }

  /** Distance actually driven between start and completion, from accurate readings (metres). */
  async drivenDistance(
    trx: Kysely<Database>,
    rideId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    const res = await sql<{ meters: number | null }>`
      SELECT coalesce(sum(ST_Distance(location, prev)), 0)::float AS meters FROM (
        SELECT location, lag(location) OVER (ORDER BY recorded_at, id) AS prev
        FROM trip_locations
        WHERE ride_id = ${rideId} AND recorded_at BETWEEN ${from} AND ${to}
          AND (accuracy_meters IS NULL OR accuracy_meters <= ${DISTANCE_ACCURACY_METERS})
      ) x WHERE prev IS NOT NULL`.execute(trx);
    return Math.round(res.rows[0]?.meters ?? 0);
  }

  async track(rideId: string) {
    return this.db
      .selectFrom('trip_locations')
      .select([
        sql<number>`ST_Y(location::geometry)`.as('lat'),
        sql<number>`ST_X(location::geometry)`.as('lng'),
        'recorded_at',
        'received_at',
      ])
      .where('ride_id', '=', rideId)
      .orderBy('recorded_at')
      .execute();
  }
}
