import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, sql } from 'kysely';
import {
  ErrorCode,
  type RatingSummary,
  type RatingTag,
  type RatingView,
} from '@rideswithme/shared-types';
import type { RateRideInput } from '@rideswithme/validation';
import { AppException } from '../common/app-exception';
import { DB, isUniqueViolation } from '../database/database.module';
import type { Database } from '../database/types';
import { averageRating, RATING_WINDOW_DAYS } from '../rides/ride-view.service';
import { rideForParticipant } from '../safety/ride-access';

/**
 * Ratings both ways after a completed trip: the passenger rates the driver and
 * the driver rates the passenger, once each, within RATING_WINDOW_DAYS. Each
 * person's running totals are kept on their user row in the same transaction.
 */
@Injectable()
export class RatingsService {
  constructor(@Inject(DB) private readonly db: Kysely<Database>) {}

  async rate(
    userId: string,
    rideId: string,
    input: RateRideInput,
    now = new Date(),
  ): Promise<RatingView> {
    const ride = await rideForParticipant(this.db, rideId, userId);
    if (
      ride.status !== 'completed' ||
      !ride.completed_at ||
      now.getTime() - ride.completed_at.getTime() > RATING_WINDOW_DAYS * 86_400_000
    )
      throw new AppException(ErrorCode.RATING_CLOSED, 'This trip can no longer be rated');
    const ratedRole = ride.role === 'passenger' ? 'driver' : 'passenger';
    const rateeId = ratedRole === 'driver' ? ride.driver_id! : ride.passenger_id;
    try {
      const r = await this.db.transaction().execute(async (trx) => {
        const row = await trx
          .insertInto('ratings')
          .values({
            ride_id: rideId,
            rater_id: userId,
            ratee_id: rateeId,
            rated_role: ratedRole,
            stars: input.stars,
            tags: input.tags ?? [],
            comment: input.comment ?? null,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        await trx
          .updateTable('users')
          .set(
            ratedRole === 'driver'
              ? {
                  rating_as_driver_sum: sql`rating_as_driver_sum + ${input.stars}`,
                  rating_as_driver_count: sql`rating_as_driver_count + 1`,
                }
              : {
                  rating_as_passenger_sum: sql`rating_as_passenger_sum + ${input.stars}`,
                  rating_as_passenger_count: sql`rating_as_passenger_count + 1`,
                },
          )
          .where('id', '=', rateeId)
          .execute();
        return row;
      });
      return {
        rideId,
        stars: r.stars,
        tags: r.tags as RatingTag[],
        comment: r.comment,
        ratedRole: r.rated_role,
        createdAt: r.created_at.toISOString(),
      };
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppException(ErrorCode.CONFLICT, 'Already rated');
      throw err;
    }
  }

  /** Ratings a person received in one role. Rater names only for staff. */
  async summary(
    userId: string,
    role: 'driver' | 'passenger',
    forStaff: boolean,
  ): Promise<RatingSummary> {
    const u = await this.db
      .selectFrom('users')
      .select([
        'rating_as_driver_sum',
        'rating_as_driver_count',
        'rating_as_passenger_sum',
        'rating_as_passenger_count',
      ])
      .where('id', '=', userId)
      .executeTakeFirst();
    if (!u) throw new AppException(ErrorCode.NOT_FOUND, 'User not found');
    const [sum, count] =
      role === 'driver'
        ? [u.rating_as_driver_sum, u.rating_as_driver_count]
        : [u.rating_as_passenger_sum, u.rating_as_passenger_count];
    const rows = await this.db
      .selectFrom('ratings as r')
      .innerJoin('users as u', 'u.id', 'r.rater_id')
      .selectAll('r')
      .select('u.full_name')
      .where('r.ratee_id', '=', userId)
      .where('r.rated_role', '=', role)
      .orderBy('r.created_at', 'desc')
      .limit(20)
      .execute();
    return {
      average: forStaff
        ? count
          ? Math.round((sum / count) * 10) / 10
          : null
        : averageRating(sum, count),
      count,
      recent: rows.map((r) => ({
        rideId: r.ride_id,
        stars: r.stars,
        tags: r.tags as RatingTag[],
        comment: r.comment,
        ratedRole: r.rated_role,
        createdAt: r.created_at.toISOString(),
        raterName: forStaff ? r.full_name : null,
      })),
    };
  }
}
