import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import {
  ACTIVE_RIDE_STATUSES,
  type DriverRideView,
  ErrorCode,
  type PaymentMethod,
  type RideEventView,
  type RideStatus,
  type RideView,
} from '@rideswithme/shared-types';
import { AppException } from '../common/app-exception';
import { DB } from '../database/database.module';
import { koboFromDb, latOf, lngOf } from '../database/geo';
import type { Database } from '../database/types';
import { splitFare } from '../pricing/fare-engine';
import type { FareSnapshot } from '../pricing/pricing.service';
import { PresenceService } from './presence.service';

const firstName = (full: string | null) => (full ?? '').trim().split(/\s+/)[0] || 'RideswithMe';

export type RideRow = Awaited<ReturnType<RideViewService['loadRow']>>;

/** Builds the ride as each party sees it. Passengers see the driver's first name only, and vice versa. */
@Injectable()
export class RideViewService {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    private readonly presence: PresenceService,
  ) {}

  async loadRow(rideId: string, trx: Kysely<Database> = this.db) {
    const row = await trx
      .selectFrom('rides as r')
      .innerJoin('vehicle_categories as c', 'c.id', 'r.vehicle_category_id')
      .innerJoin('users as p', 'p.id', 'r.passenger_id')
      .leftJoin('users as d', 'd.id', 'r.driver_id')
      .leftJoin('vehicles as v', 'v.id', 'r.vehicle_id')
      .selectAll('r')
      .select([
        latOf('r.pickup').as('pickup_lat'),
        lngOf('r.pickup').as('pickup_lng'),
        latOf('r.dropoff').as('dropoff_lat'),
        lngOf('r.dropoff').as('dropoff_lng'),
        'c.key as category_key',
        'c.name as category_name',
        'p.full_name as passenger_name',
        'd.full_name as driver_name',
        'v.make',
        'v.model',
        'v.colour',
        'v.plate_number',
      ])
      .where('r.id', '=', rideId)
      .executeTakeFirst();
    if (!row) throw new AppException(ErrorCode.NOT_FOUND, 'Ride not found');
    return row;
  }

  private base(row: RideRow): Omit<RideView, 'driver'> {
    const snapshot = row.fare_snapshot as FareSnapshot;
    return {
      id: row.id,
      status: row.status as RideStatus,
      category: { key: row.category_key, name: row.category_name },
      pickup: {
        address: row.pickup_address,
        location: { lat: row.pickup_lat, lng: row.pickup_lng },
      },
      dropoff: {
        address: row.dropoff_address,
        location: { lat: row.dropoff_lat, lng: row.dropoff_lng },
      },
      route: snapshot.route,
      scheduledFor: row.scheduled_for?.toISOString() ?? null,
      paymentMethod: row.payment_method as PaymentMethod,
      fare: {
        cancellationPolicy: {
          feeKobo: snapshot.rule.cancellationFeeKobo,
          graceSeconds: snapshot.rule.cancellationGraceSeconds,
        },
        quotedTotalKobo: koboFromDb(row.quoted_total_kobo),
        waitingChargeKobo: koboFromDb(row.waiting_charge_kobo),
        finalTotalKobo: row.final_total_kobo === null ? null : koboFromDb(row.final_total_kobo),
        cancellationFeeKobo: koboFromDb(row.cancellation_fee_kobo),
        breakdown: snapshot.breakdown,
      },
      requestedAt: row.requested_at.toISOString(),
      assignedAt: row.assigned_at?.toISOString() ?? null,
      arrivedAt: row.arrived_at?.toISOString() ?? null,
      startedAt: row.started_at?.toISOString() ?? null,
      completedAt: row.completed_at?.toISOString() ?? null,
      cancelledAt: row.cancelled_at?.toISOString() ?? null,
      cancellationReason: row.cancellation_reason,
    };
  }

  async passengerView(row: RideRow): Promise<RideView> {
    const active = ACTIVE_RIDE_STATUSES.includes(row.status as RideStatus);
    let hasPhoto = false;
    if (row.driver_id) {
      hasPhoto = !!(await this.db
        .selectFrom('driver_documents')
        .select('id')
        .where('driver_user_id', '=', row.driver_id)
        .where('document_type', '=', 'profile_photo')
        .where('status', '=', 'approved')
        .executeTakeFirst());
    }
    return {
      ...this.base(row),
      driver: row.driver_id
        ? {
            firstName: firstName(row.driver_name),
            vehicle: {
              make: row.make ?? '',
              model: row.model ?? '',
              colour: row.colour ?? '',
              plateNumber: row.plate_number ?? '',
            },
            // Live position only while the ride is active; never afterwards.
            position: active ? await this.presence.position(row.driver_id) : null,
            hasPhoto,
          }
        : null,
    };
  }

  driverView(row: RideRow): DriverRideView {
    const snapshot = row.fare_snapshot as FareSnapshot;
    const final = row.final_total_kobo === null ? null : koboFromDb(row.final_total_kobo);
    const split = final === null ? null : splitFare(snapshot.rule, final);
    return {
      ...this.base(row),
      passenger: { firstName: firstName(row.passenger_name) },
      earnings: split
        ? {
            fareKobo: final!,
            bookingFeeKobo: split.bookingFeeKobo,
            commissionKobo: split.commissionKobo,
            netKobo: split.driverEarningsKobo,
          }
        : null,
    };
  }

  async events(rideId: string): Promise<RideEventView[]> {
    const rows = await this.db
      .selectFrom('ride_events')
      .selectAll()
      .where('ride_id', '=', rideId)
      .orderBy('seq')
      .execute();
    return rows.map((e) => ({
      id: e.id,
      eventType: e.event_type,
      fromStatus: e.from_status,
      toStatus: e.to_status,
      actorType: e.actor_type,
      actorId: e.actor_id,
      metadata: e.metadata,
      createdAt: e.created_at.toISOString(),
    }));
  }
}
