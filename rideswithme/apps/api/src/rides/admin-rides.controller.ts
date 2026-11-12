import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { type Kysely, sql } from 'kysely';
import { Inject } from '@nestjs/common';
import type {
  FareRuleView,
  Paginated,
  RideEventView,
  RideView,
  ServiceAreaView,
} from '@rideswithme/shared-types';
import {
  fareRuleSchema,
  listAdminRidesQuerySchema,
  serviceAreaSchema,
  uuidSchema,
} from '@rideswithme/validation';
import { z } from 'zod';
import { CurrentPrincipal, type Principal, RequirePermissions } from '../auth/principal';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { ReqContext, type RequestContext } from '../common/request-context';
import { zod } from '../common/zod-validation.pipe';
import { DB } from '../database/database.module';
import type { Database } from '../database/types';
import { PricingService } from '../pricing/pricing.service';
import { RideViewService } from './ride-view.service';

const keyParam = z.string().regex(/^[a-z][a-z0-9_-]{1,40}$/);

/** Admin APIs for service areas, fare rules and rides. Screens for these arrive in Phase 6. */
@Controller('v1/admin')
export class AdminRidesController {
  constructor(
    private readonly pricing: PricingService,
    private readonly views: RideViewService,
    @Inject(DB) private readonly db: Kysely<Database>,
  ) {}

  @Get('service-areas')
  @RequirePermissions('rides.read')
  serviceAreas(): Promise<ServiceAreaView[]> {
    return this.pricing.listServiceAreas();
  }

  @Put('service-areas')
  @RequirePermissions('service_areas.manage')
  async saveServiceArea(
    @CurrentPrincipal() p: Principal,
    @Body(zod(serviceAreaSchema)) body: z.output<typeof serviceAreaSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<ServiceAreaView[]> {
    await this.pricing.upsertServiceArea(body, p.userId, ctx);
    return this.pricing.listServiceAreas();
  }

  @Get('fare-rules')
  @RequirePermissions('rides.read')
  fareRules(): Promise<FareRuleView[]> {
    return this.pricing.listFareRules();
  }

  @Put('fare-rules/:area/:category')
  @RequirePermissions('pricing.manage')
  async setFareRule(
    @CurrentPrincipal() p: Principal,
    @Param('area', zod(keyParam)) area: string,
    @Param('category', zod(keyParam)) category: string,
    @Body(zod(fareRuleSchema)) body: z.output<typeof fareRuleSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<FareRuleView[]> {
    await this.pricing.setFareRule(area, category, body, p.userId, ctx);
    return this.pricing.listFareRules();
  }

  @Get('rides')
  @RequirePermissions('rides.read')
  async rides(
    @Query(zod(listAdminRidesQuerySchema)) q: z.output<typeof listAdminRidesQuerySchema>,
  ): Promise<Paginated<RideView>> {
    let query = this.db
      .selectFrom('rides')
      .select(['id', sql<string>`created_at::text`.as('ts')])
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(q.limit + 1);
    if (q.status) query = query.where(sql<boolean>`status::text = ${q.status}`);
    if (q.passengerId) query = query.where('passenger_id', '=', q.passengerId);
    if (q.driverId) query = query.where('driver_id', '=', q.driverId);
    const cursor = decodeCursor(q.cursor);
    if (cursor)
      query = query.where(
        sql<boolean>`(created_at, id) < (${cursor.ts}::timestamptz, ${cursor.id}::uuid)`,
      );
    const rows = await query.execute();
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    return {
      items: await Promise.all(
        page.map(async (r) => this.views.passengerView(await this.views.loadRow(r.id))),
      ),
      nextCursor: rows.length > q.limit && last ? encodeCursor({ ts: last.ts, id: last.id }) : null,
    };
  }

  /** A ride with its full event timeline. */
  @Get('rides/:id')
  @RequirePermissions('rides.read')
  async ride(
    @Param('id', zod(uuidSchema)) id: string,
  ): Promise<RideView & { passengerId: string; driverId: string | null; events: RideEventView[] }> {
    const row = await this.views.loadRow(id);
    return {
      ...(await this.views.passengerView(row)),
      passengerId: row.passenger_id,
      driverId: row.driver_id,
      events: await this.views.events(id),
    };
  }
}
