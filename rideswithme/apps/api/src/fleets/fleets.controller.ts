import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  type DriverFleetView,
  ErrorCode,
  type FleetDriverView,
  type FleetOverview,
  type FleetSummary,
  type FleetTripView,
  type Paginated,
} from '@rideswithme/shared-types';
import {
  addFleetManagerSchema,
  createFleetSchema,
  fleetTripsQuerySchema,
  inviteFleetDriverSchema,
  uuidSchema,
} from '@rideswithme/validation';
import type { z } from 'zod';
import { CurrentPrincipal, type Principal, RequirePermissions } from '../auth/principal';
import { AppException } from '../common/app-exception';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service';
import { ReqContext, type RequestContext } from '../common/request-context';
import { zod } from '../common/zod-validation.pipe';
import { FleetsService } from './fleets.service';

/** Staff: fleet operators and their managers. */
@Controller('v1/admin/fleets')
export class AdminFleetsController {
  constructor(private readonly fleets: FleetsService) {}

  @Get()
  @RequirePermissions('fleets.read')
  list(): Promise<FleetSummary[]> {
    return this.fleets.list();
  }

  @Post()
  @RequirePermissions('fleets.manage')
  create(
    @CurrentPrincipal() p: Principal,
    @Body(zod(createFleetSchema)) body: z.output<typeof createFleetSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<FleetSummary> {
    return this.fleets.create(p, body, ctx);
  }

  @Get(':id')
  @RequirePermissions('fleets.read')
  get(@Param('id', zod(uuidSchema)) id: string): Promise<FleetSummary> {
    return this.fleets.get(id);
  }

  @Get(':id/drivers')
  @RequirePermissions('fleets.read')
  async drivers(@Param('id', zod(uuidSchema)) id: string): Promise<FleetDriverView[]> {
    const f = await this.fleets.get(id);
    return this.fleets.drivers({ fleetId: f.id, name: f.name });
  }

  @Post(':id/managers')
  @HttpCode(200)
  @RequirePermissions('fleets.manage')
  addManager(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Body(zod(addFleetManagerSchema)) body: z.output<typeof addFleetManagerSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<FleetSummary> {
    return this.fleets.addManager(p, id, body.phone, ctx);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  @RequirePermissions('fleets.manage')
  suspend(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.fleets.setStatus(p, id, 'suspended', ctx);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @RequirePermissions('fleets.manage')
  reactivate(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.fleets.setStatus(p, id, 'active', ctx);
  }
}

/** Fleet managers: only their own fleet (fleet.portal needs two-factor). */
@Controller('v1/fleet')
export class FleetPortalController {
  constructor(
    private readonly fleets: FleetsService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  @Get()
  @RequirePermissions('fleet.portal')
  async overview(@CurrentPrincipal() p: Principal): Promise<FleetOverview> {
    return this.fleets.overview(await this.fleets.scope(p));
  }

  @Get('drivers')
  @RequirePermissions('fleet.portal')
  async drivers(@CurrentPrincipal() p: Principal): Promise<FleetDriverView[]> {
    return this.fleets.drivers(await this.fleets.scope(p));
  }

  @Get('drivers/:id')
  @RequirePermissions('fleet.portal')
  async driver(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
  ): Promise<FleetDriverView> {
    return this.fleets.driver(await this.fleets.scope(p), id);
  }

  @Post('drivers')
  @RequirePermissions('fleet.portal')
  async invite(
    @CurrentPrincipal() p: Principal,
    @Body(zod(inviteFleetDriverSchema)) body: z.output<typeof inviteFleetDriverSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<FleetDriverView> {
    await this.rateLimiter.consume(
      { name: 'fleet_invite', limit: 50, windowSeconds: 86_400 },
      p.userId,
    );
    return this.fleets.invite(p, await this.fleets.scope(p), body.phone, ctx);
  }

  @Delete('drivers/:id')
  @HttpCode(204)
  @RequirePermissions('fleet.portal')
  async remove(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @ReqContext() ctx: RequestContext,
  ) {
    await this.fleets.removeDriver(p, await this.fleets.scope(p), id, ctx);
  }

  @Get('vehicles')
  @RequirePermissions('fleet.portal')
  async vehicles(@CurrentPrincipal() p: Principal) {
    return this.fleets.vehicles(await this.fleets.scope(p));
  }

  @Get('trips')
  @RequirePermissions('fleet.portal')
  async trips(
    @CurrentPrincipal() p: Principal,
    @Query(zod(fleetTripsQuerySchema)) q: z.output<typeof fleetTripsQuerySchema>,
  ): Promise<Paginated<FleetTripView>> {
    return this.fleets.trips(await this.fleets.scope(p), q);
  }
}

/** Drivers: invitations from fleets, and leaving a fleet. */
@Controller('v1/driver')
export class DriverFleetController {
  constructor(private readonly fleets: FleetsService) {}

  private driver(p: Principal) {
    if (!p.roles.includes('driver')) throw new AppException(ErrorCode.FORBIDDEN, 'Drivers only');
  }

  @Get('fleet')
  fleet(@CurrentPrincipal() p: Principal): Promise<DriverFleetView> {
    this.driver(p);
    return this.fleets.driverFleet(p.userId);
  }

  @Post('fleet-invitations/:id/accept')
  @HttpCode(200)
  accept(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @ReqContext() ctx: RequestContext,
  ) {
    this.driver(p);
    return this.fleets.respond(p.userId, id, true, ctx);
  }

  @Post('fleet-invitations/:id/decline')
  @HttpCode(200)
  decline(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @ReqContext() ctx: RequestContext,
  ) {
    this.driver(p);
    return this.fleets.respond(p.userId, id, false, ctx);
  }

  @Post('fleet/leave')
  @HttpCode(200)
  leave(@CurrentPrincipal() p: Principal, @ReqContext() ctx: RequestContext) {
    this.driver(p);
    return this.fleets.leave(p.userId, ctx);
  }
}
