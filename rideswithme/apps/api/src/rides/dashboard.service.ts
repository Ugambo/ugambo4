import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, sql } from 'kysely';
import type { DashboardView, LiveView } from '@rideswithme/shared-types';
import { DB } from '../database/database.module';
import { koboFromDb, latOf, lngOf } from '../database/geo';
import type { Database } from '../database/types';
import { PresenceService } from './presence.service';

const ACTIVE = ['searching', 'driver_assigned', 'driver_arrived', 'in_progress'] as const;

/** Numbers for the admin overview. Days are Nigerian calendar days. */
@Injectable()
export class DashboardService {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    private readonly presence: PresenceService,
  ) {}

  async overview(now = new Date(), days = 14): Promise<DashboardView> {
    const lagosToday = sql`(${now}::timestamptz AT TIME ZONE 'Africa/Lagos')::date`;
    const todayStart = sql`(${lagosToday} AT TIME ZONE 'Africa/Lagos')`;
    const k = await sql<{
      riders: string;
      new_riders: string;
      drivers: string;
      active: string;
      trips: string;
      fares: string;
      revenue: string;
      disputes: string;
    }>`
      SELECT
        (SELECT count(*) FROM user_roles ur JOIN roles r ON r.id = ur.role_id JOIN users u ON u.id = ur.user_id
          WHERE r.key = 'passenger' AND u.status = 'active') AS riders,
        (SELECT count(*) FROM user_roles ur JOIN roles r ON r.id = ur.role_id JOIN users u ON u.id = ur.user_id
          WHERE r.key = 'passenger' AND u.created_at >= ${todayStart}) AS new_riders,
        (SELECT count(*) FROM driver_profiles WHERE status = 'approved') AS drivers,
        (SELECT count(*) FROM rides WHERE status IN ('searching', 'driver_assigned', 'driver_arrived', 'in_progress')) AS active,
        (SELECT count(*) FROM rides WHERE status = 'completed' AND completed_at >= ${todayStart}) AS trips,
        (SELECT coalesce(sum(final_total_kobo), 0) FROM rides WHERE status = 'completed' AND completed_at >= ${todayStart}) AS fares,
        (SELECT coalesce(-sum(t.amount_kobo), 0) FROM wallet_transactions t JOIN wallets w ON w.id = t.wallet_id
          WHERE w.system_key = 'platform_revenue' AND t.created_at >= ${todayStart}) AS revenue,
        (SELECT count(*) FROM payment_disputes WHERE status = 'open') AS disputes`.execute(this.db);
    const row = k.rows[0]!;
    const series = await sql<{ day: string; trips: string; fares: string; revenue: string }>`
      WITH d AS (
        SELECT generate_series(${lagosToday} - ${days - 1}::int, ${lagosToday}, interval '1 day')::date AS day
      )
      SELECT d.day::text AS day,
        (SELECT count(*) FROM rides r WHERE r.status = 'completed'
          AND (r.completed_at AT TIME ZONE 'Africa/Lagos')::date = d.day) AS trips,
        (SELECT coalesce(sum(r.final_total_kobo), 0) FROM rides r WHERE r.status = 'completed'
          AND (r.completed_at AT TIME ZONE 'Africa/Lagos')::date = d.day) AS fares,
        (SELECT coalesce(-sum(t.amount_kobo), 0) FROM wallet_transactions t JOIN wallets w ON w.id = t.wallet_id
          WHERE w.system_key = 'platform_revenue' AND (t.created_at AT TIME ZONE 'Africa/Lagos')::date = d.day) AS revenue
      FROM d ORDER BY d.day`.execute(this.db);
    return {
      kpis: {
        riders: Number(row.riders),
        newRidersToday: Number(row.new_riders),
        drivers: Number(row.drivers),
        driversOnline: (await this.presence.onlineDrivers()).length,
        activeRides: Number(row.active),
        tripsToday: Number(row.trips),
        faresTodayKobo: koboFromDb(row.fares),
        revenueTodayKobo: koboFromDb(row.revenue),
        openDisputes: Number(row.disputes),
      },
      days: series.rows.map((r) => ({
        date: r.day,
        trips: Number(r.trips),
        faresKobo: koboFromDb(r.fares),
        revenueKobo: koboFromDb(r.revenue),
      })),
    };
  }

  /** Online drivers and rides in progress, for the live map. */
  async live(): Promise<LiveView> {
    const [online, rides] = await Promise.all([
      this.presence.onlineDrivers(),
      this.db
        .selectFrom('rides as r')
        .innerJoin('vehicle_categories as c', 'c.id', 'r.vehicle_category_id')
        .select([
          'r.id',
          'r.status',
          'c.name as category',
          'r.driver_id',
          'r.requested_at',
          'r.pickup_address',
          'r.dropoff_address',
          latOf('r.pickup').as('pickup_lat'),
          lngOf('r.pickup').as('pickup_lng'),
          latOf('r.dropoff').as('dropoff_lat'),
          lngOf('r.dropoff').as('dropoff_lng'),
        ])
        .where('r.status', 'in', [...ACTIVE])
        .orderBy('r.requested_at')
        .limit(500)
        .execute(),
    ]);
    const ids = online.map((d) => d.driverId);
    const names = ids.length
      ? await this.db
          .selectFrom('users')
          .select(['id', 'full_name'])
          .where('id', 'in', ids)
          .execute()
      : [];
    const nameOf = new Map(names.map((n) => [n.id, n.full_name]));
    const rideOf = new Map(rides.filter((r) => r.driver_id).map((r) => [r.driver_id!, r.id]));
    return {
      drivers: online.map((d) => ({
        driverId: d.driverId,
        name: nameOf.get(d.driverId) ?? null,
        lat: d.lat,
        lng: d.lng,
        receivedAt: d.receivedAt,
        rideId: rideOf.get(d.driverId) ?? null,
      })),
      rides: rides.map((r) => ({
        id: r.id,
        status: r.status,
        category: r.category,
        pickup: { lat: r.pickup_lat, lng: r.pickup_lng, address: r.pickup_address },
        dropoff: { lat: r.dropoff_lat, lng: r.dropoff_lng, address: r.dropoff_address },
        driverId: r.driver_id,
        requestedAt: r.requested_at.toISOString(),
      })),
    };
  }
}
