import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import type {
  AdminIncidentView,
  AdminSosAlertView,
  IncidentView,
  PublicTripView,
  RideMessageView,
  SosAlertView,
  TripShareView,
} from '@rideswithme/shared-types';
import {
  raiseSosSchema,
  reportIncidentSchema,
  resolveSosSchema,
  rideMessageSchema,
  updateIncidentSchema,
  uuidSchema,
} from '@rideswithme/validation';
import { z } from 'zod';
import { CurrentPrincipal, type Principal, Public, RequirePermissions } from '../auth/principal';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service';
import { ReqContext, type RequestContext } from '../common/request-context';
import { zod } from '../common/zod-validation.pipe';
import { IncidentsService } from './incidents.service';
import { RideMessagesService } from './ride-messages.service';
import { SosService } from './sos.service';
import { TripShareService } from './trip-share.service';

const statusQuery = z.object({ status: z.enum(['open', 'resolved']).optional() }).strict();

/** Passengers and drivers: SOS, sharing a trip, messages, reports. */
@Controller('v1')
export class SafetyController {
  constructor(
    private readonly sos: SosService,
    private readonly shares: TripShareService,
    private readonly messages: RideMessagesService,
    private readonly incidents: IncidentsService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  /** Never rate-limited and never refused for missing details. */
  @Post('sos')
  @HttpCode(201)
  raise(
    @CurrentPrincipal() p: Principal,
    @Body(zod(raiseSosSchema)) body: z.output<typeof raiseSosSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<SosAlertView> {
    return this.sos.raise(p.userId, body, ctx);
  }

  @Get('sos/current')
  current(@CurrentPrincipal() p: Principal): Promise<SosAlertView | null> {
    return this.sos.current(p.userId);
  }

  @Post('rides/:id/share')
  share(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
  ): Promise<TripShareView> {
    return this.shares.create(p.userId, id);
  }

  @Delete('rides/:id/share')
  @HttpCode(204)
  async unshare(@CurrentPrincipal() p: Principal, @Param('id', zod(uuidSchema)) id: string) {
    await this.shares.revoke(p.userId, id);
  }

  @Get('rides/:id/messages')
  list(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
  ): Promise<RideMessageView[]> {
    return this.messages.list(p.userId, id);
  }

  @Post('rides/:id/messages')
  async send(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Body(zod(rideMessageSchema)) body: z.output<typeof rideMessageSchema>,
  ): Promise<RideMessageView> {
    await this.rateLimiter.consume(
      { name: 'ride_message', limit: 30, windowSeconds: 60 },
      p.userId,
    );
    return this.messages.send(p.userId, id, body.body);
  }

  @Post('incidents')
  async report(
    @CurrentPrincipal() p: Principal,
    @Body(zod(reportIncidentSchema)) body: z.output<typeof reportIncidentSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<IncidentView> {
    await this.rateLimiter.consume({ name: 'incident', limit: 10, windowSeconds: 3600 }, p.userId);
    return this.incidents.report(p.userId, body, ctx);
  }

  @Get('incidents')
  mine(@CurrentPrincipal() p: Principal): Promise<IncidentView[]> {
    return this.incidents.mine(p.userId);
  }
}

/** Anyone with a share link (no account): the shared trip. */
@Public()
@Controller('v1/share')
export class PublicShareController {
  constructor(
    private readonly shares: TripShareService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  @Get(':token')
  async view(
    @Param('token') token: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<PublicTripView> {
    await this.rateLimiter.consume(
      { name: 'trip_share_view', limit: 240, windowSeconds: 3600 },
      ctx.ip ?? 'unknown',
    );
    return this.shares.view(token);
  }
}

/** Staff: SOS alerts first, then incident reports. */
@Controller('v1/admin')
export class AdminSafetyController {
  constructor(
    private readonly sos: SosService,
    private readonly incidents: IncidentsService,
    private readonly messages: RideMessagesService,
  ) {}

  @Get('sos')
  @RequirePermissions('safety.read')
  alerts(@Query(zod(statusQuery)) q: z.output<typeof statusQuery>): Promise<AdminSosAlertView[]> {
    return this.sos.list(q.status);
  }

  @Get('sos/:id')
  @RequirePermissions('safety.read')
  alert(@Param('id', zod(uuidSchema)) id: string): Promise<AdminSosAlertView> {
    return this.sos.adminView(id);
  }

  @Post('sos/:id/acknowledge')
  @HttpCode(200)
  @RequirePermissions('safety.manage')
  acknowledge(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<AdminSosAlertView> {
    return this.sos.acknowledge(p, id, ctx);
  }

  @Post('sos/:id/resolve')
  @HttpCode(200)
  @RequirePermissions('safety.manage')
  resolve(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Body(zod(resolveSosSchema)) body: z.output<typeof resolveSosSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<AdminSosAlertView> {
    return this.sos.resolve(p, id, body.note, ctx);
  }

  @Get('incidents')
  @RequirePermissions('safety.read')
  incidentList(
    @Query(zod(statusQuery)) q: z.output<typeof statusQuery>,
  ): Promise<AdminIncidentView[]> {
    return this.incidents.list(q.status);
  }

  @Get('incidents/:id')
  @RequirePermissions('safety.read')
  incident(@Param('id', zod(uuidSchema)) id: string): Promise<AdminIncidentView> {
    return this.incidents.get(id);
  }

  @Patch('incidents/:id')
  @RequirePermissions('safety.manage')
  updateIncident(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Body(zod(updateIncidentSchema)) body: z.output<typeof updateIncidentSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<AdminIncidentView> {
    return this.incidents.update(p, id, body, ctx);
  }

  /** The ride's messages, for looking into a report or an SOS. */
  @Get('rides/:id/messages')
  @RequirePermissions('safety.read')
  rideMessages(@Param('id', zod(uuidSchema)) id: string): Promise<RideMessageView[]> {
    return this.messages.list(null, id);
  }
}
