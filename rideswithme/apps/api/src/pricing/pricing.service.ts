import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, type Selectable, sql } from 'kysely';
import {
  ErrorCode,
  type FareEstimateResponse,
  type FareRuleView,
  type LatLng,
  type PeakWindow,
  type ServiceAreaView,
} from '@rideswithme/shared-types';
import type { FareEstimateInput, FareRuleInput, ServiceAreaInput } from '@rideswithme/validation';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import type { RequestContext } from '../common/request-context';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB, isUniqueViolation } from '../database/database.module';
import { koboFromDb, point } from '../database/geo';
import type { Database, FareRulesTable } from '../database/types';
import { MapsService } from '../maps/maps.service';
import { etaSecondsFromDistance, PresenceService } from '../rides/presence.service';
import { DEFAULT_FARES } from './default-fares';
import { calculateFare, type FareRuleValues } from './fare-engine';

/** Longest trip we price (km); beyond this something is wrong with the inputs. */
const MAX_TRIP_METERS = 200_000;

export function ruleValues(r: Selectable<FareRulesTable>): FareRuleValues {
  return {
    baseFareKobo: koboFromDb(r.base_fare_kobo),
    perKmKobo: koboFromDb(r.per_km_kobo),
    perMinuteKobo: koboFromDb(r.per_minute_kobo),
    minimumFareKobo: koboFromDb(r.minimum_fare_kobo),
    bookingFeeKobo: koboFromDb(r.booking_fee_kobo),
    cancellationFeeKobo: koboFromDb(r.cancellation_fee_kobo),
    cancellationGraceSeconds: r.cancellation_grace_seconds,
    waitingFreeMinutes: r.waiting_free_minutes,
    waitingPerMinuteKobo: koboFromDb(r.waiting_per_minute_kobo),
    commissionBps: r.commission_bps,
    roundingIncrementKobo: koboFromDb(r.rounding_increment_kobo),
    peakWindows: (r.peak_windows ?? []) as PeakWindow[],
  };
}

/** What a ride stores at booking so its price never depends on later changes. */
export interface FareSnapshot {
  fareRuleId: string;
  rule: FareRuleValues;
  breakdown: ReturnType<typeof calculateFare>;
  route: { distanceMeters: number; durationSeconds: number; polyline: string | null };
  category: { key: string; name: string; seats: number };
  serviceArea: { key: string; name: string };
  quotedAt: string;
}

@Injectable()
export class PricingService {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly maps: MapsService,
    private readonly presence: PresenceService,
    private readonly audit: AuditService,
  ) {}

  async serviceAreaAt(location: LatLng) {
    return this.db
      .selectFrom('service_areas')
      .select(['id', 'key', 'name'])
      .where('is_active', '=', true)
      .where(sql<boolean>`ST_Covers(boundary, ${point(location)})`)
      .orderBy('created_at')
      .executeTakeFirst();
  }

  /** Prices a trip for every available vehicle type and stores one quote per type. */
  async estimate(
    passengerId: string,
    input: FareEstimateInput,
    now = new Date(),
  ): Promise<FareEstimateResponse> {
    const area = await this.serviceAreaAt(input.pickup.location);
    if (!area)
      throw new AppException(ErrorCode.OUTSIDE_SERVICE_AREA, 'Pickup is outside the service area');

    const route = await this.maps.route(input.pickup.location, input.dropoff.location);
    if (route.distanceMeters > MAX_TRIP_METERS) {
      throw new AppException(ErrorCode.ROUTE_NOT_FOUND, 'Trip is too long', {
        details: { maxMeters: MAX_TRIP_METERS },
      });
    }

    const rules = await this.db
      .selectFrom('fare_rules as r')
      .innerJoin('vehicle_categories as c', 'c.id', 'r.vehicle_category_id')
      .selectAll('r')
      .select(['c.key as category_key', 'c.name as category_name', 'c.seats'])
      .where('r.service_area_id', '=', area.id)
      .where('r.is_active', '=', true)
      .where('c.is_enabled', '=', true)
      .orderBy('c.sort_order')
      .execute();

    const expiresAt = new Date(now.getTime() + this.config.QUOTE_TTL_SECONDS * 1000);
    const options: FareEstimateResponse['options'] = [];
    for (const r of rules) {
      const values = ruleValues(r);
      const breakdown = calculateFare(values, {
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
        at: now,
      });
      const nearest = (
        await this.presence.nearby(r.category_key, input.pickup.location, 8_000, 1, now)
      )[0];
      const quote = await this.db
        .insertInto('fare_quotes')
        .values({
          passenger_id: passengerId,
          service_area_id: area.id,
          vehicle_category_id: r.vehicle_category_id,
          fare_rule_id: r.id,
          pickup: point(input.pickup.location),
          pickup_address: input.pickup.address,
          dropoff: point(input.dropoff.location),
          dropoff_address: input.dropoff.address,
          distance_meters: route.distanceMeters,
          duration_seconds: route.durationSeconds,
          route_polyline: route.polyline,
          breakdown: JSON.stringify(breakdown),
          total_kobo: breakdown.totalKobo,
          expires_at: expiresAt,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      options.push({
        quoteId: quote.id,
        category: { key: r.category_key, name: r.category_name, seats: r.seats },
        totalKobo: breakdown.totalKobo,
        breakdown,
        etaSeconds: nearest ? etaSecondsFromDistance(nearest.distanceMeters) : null,
        expiresAt: expiresAt.toISOString(),
      });
    }

    return {
      serviceArea: { key: area.key, name: area.name },
      pickup: input.pickup,
      dropoff: input.dropoff,
      route,
      options,
    };
  }

  // --- Admin: service areas and fare rules ---

  async listServiceAreas(): Promise<ServiceAreaView[]> {
    const rows = await this.db
      .selectFrom('service_areas')
      .select([
        'id',
        'key',
        'name',
        'is_active',
        sql<string>`ST_AsGeoJSON(boundary::geometry)`.as('geojson'),
      ])
      .orderBy('name')
      .execute();
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      isActive: r.is_active,
      boundary: JSON.parse(r.geojson),
    }));
  }

  /** Creates or replaces a service area by key. Polygons are stored as a MultiPolygon. */
  async upsertServiceArea(
    input: ServiceAreaInput,
    actorId: string | null,
    ctx: Partial<RequestContext>,
  ) {
    const multi =
      input.boundary.type === 'Polygon'
        ? { type: 'MultiPolygon', coordinates: [input.boundary.coordinates] }
        : input.boundary;
    const geom = sql<string>`ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(multi)}), 4326)))::geography`;
    const valid = await sql<{
      ok: boolean;
    }>`SELECT ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(multi)}), 4326)) AS ok`.execute(
      this.db,
    );
    if (!valid.rows[0]?.ok)
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'Boundary polygon is not valid (self-intersecting?)',
      );
    const row = await this.db
      .insertInto('service_areas')
      .values({
        key: input.key,
        name: input.name,
        boundary: geom,
        is_active: input.isActive ?? true,
      })
      .onConflict((oc) =>
        oc
          .column('key')
          .doUpdateSet({ name: input.name, boundary: geom, is_active: input.isActive ?? true }),
      )
      .returning('id')
      .executeTakeFirstOrThrow();
    await this.audit.record({
      actor: actorId ? { type: 'user', userId: actorId } : { type: 'system' },
      action: 'admin.service_area.saved',
      target: { type: 'service_area', id: row.id },
      metadata: { key: input.key, name: input.name, isActive: input.isActive ?? true },
      context: ctx,
    });
    return row.id;
  }

  async listFareRules(): Promise<FareRuleView[]> {
    const rows = await this.db
      .selectFrom('fare_rules as r')
      .innerJoin('service_areas as a', 'a.id', 'r.service_area_id')
      .innerJoin('vehicle_categories as c', 'c.id', 'r.vehicle_category_id')
      .selectAll('r')
      .select([
        'a.key as area_key',
        'a.name as area_name',
        'c.key as category_key',
        'c.name as category_name',
      ])
      .where('r.is_active', '=', true)
      .orderBy('a.name')
      .orderBy('c.sort_order')
      .execute();
    return rows.map((r) => ({
      id: r.id,
      serviceArea: { key: r.area_key, name: r.area_name },
      category: { key: r.category_key, name: r.category_name },
      ...ruleValues(r),
      createdAt: r.created_at.toISOString(),
    }));
  }

  /**
   * Replaces the active rule for an area and vehicle type. The old row is kept
   * (inactive) for history; rides already booked keep their own snapshot.
   */
  async setFareRule(
    areaKey: string,
    categoryKey: string,
    input: FareRuleInput,
    actorId: string | null,
    ctx: Partial<RequestContext>,
  ) {
    return this.db.transaction().execute(async (trx) => {
      const area = await trx
        .selectFrom('service_areas')
        .select('id')
        .where('key', '=', areaKey)
        .executeTakeFirst();
      const category = await trx
        .selectFrom('vehicle_categories')
        .select('id')
        .where('key', '=', categoryKey)
        .executeTakeFirst();
      if (!area || !category)
        throw new AppException(ErrorCode.NOT_FOUND, 'Service area or vehicle category not found');

      const previous = await trx
        .updateTable('fare_rules')
        .set({ is_active: false })
        .where('service_area_id', '=', area.id)
        .where('vehicle_category_id', '=', category.id)
        .where('is_active', '=', true)
        .returningAll()
        .executeTakeFirst();
      let inserted;
      try {
        inserted = await trx
          .insertInto('fare_rules')
          .values({
            service_area_id: area.id,
            vehicle_category_id: category.id,
            base_fare_kobo: input.baseFareKobo,
            per_km_kobo: input.perKmKobo,
            per_minute_kobo: input.perMinuteKobo,
            minimum_fare_kobo: input.minimumFareKobo,
            booking_fee_kobo: input.bookingFeeKobo,
            cancellation_fee_kobo: input.cancellationFeeKobo,
            cancellation_grace_seconds: input.cancellationGraceSeconds,
            waiting_free_minutes: input.waitingFreeMinutes,
            waiting_per_minute_kobo: input.waitingPerMinuteKobo,
            commission_bps: input.commissionBps,
            rounding_increment_kobo: input.roundingIncrementKobo,
            peak_windows: JSON.stringify(input.peakWindows ?? []),
            created_by: actorId,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
      } catch (err) {
        if (isUniqueViolation(err))
          throw new AppException(
            ErrorCode.CONFLICT,
            'Fare rule changed at the same time; try again',
          );
        throw err;
      }
      await this.audit.record(
        {
          actor: actorId ? { type: 'user', userId: actorId } : { type: 'system' },
          action: 'admin.fare_rule.changed',
          target: { type: 'fare_rule', id: inserted.id },
          metadata: {
            serviceArea: areaKey,
            category: categoryKey,
            previous: previous ? ruleValues(previous) : null,
            next: input,
          },
          context: ctx,
        },
        trx,
      );
      return inserted.id;
    });
  }

  /** Creates a service area from a bounding box with placeholder fares for every vehicle type (CLI/dev). */
  async seedCity(key: string, name: string, bbox: [number, number, number, number]) {
    const [minLng, minLat, maxLng, maxLat] = bbox;
    await this.upsertServiceArea(
      {
        key,
        name,
        boundary: {
          type: 'Polygon',
          coordinates: [
            [
              [minLng, minLat],
              [maxLng, minLat],
              [maxLng, maxLat],
              [minLng, maxLat],
              [minLng, minLat],
            ],
          ],
        },
        isActive: true,
      },
      null,
      { userAgent: 'rideswithme-cli' },
    );
    for (const [category, values] of Object.entries(DEFAULT_FARES)) {
      await this.setFareRule(key, category, values, null, { userAgent: 'rideswithme-cli' });
    }
  }
}
