import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type {
  AdminTicketView,
  RatingSummary,
  RatingView,
  TicketView,
} from '@rideswithme/shared-types';
import {
  adminTicketsQuerySchema,
  createTicketSchema,
  rateRideSchema,
  ticketMessageSchema,
  ticketStatusSchema,
  uuidSchema,
} from '@rideswithme/validation';
import type { z } from 'zod';
import { CurrentPrincipal, type Principal, RequirePermissions } from '../auth/principal';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service';
import { ReqContext, type RequestContext } from '../common/request-context';
import { zod } from '../common/zod-validation.pipe';
import { RatingsService } from './ratings.service';
import { SupportService } from './support.service';

@Controller('v1')
export class EngagementController {
  constructor(
    private readonly ratings: RatingsService,
    private readonly support: SupportService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  /** Passenger rates the driver, or driver rates the passenger (whichever the caller was). */
  @Post('rides/:id/rating')
  rate(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Body(zod(rateRideSchema)) body: z.output<typeof rateRideSchema>,
  ): Promise<RatingView> {
    return this.ratings.rate(p.userId, id, body);
  }

  /** A driver's own ratings (no rater names). */
  @Get('driver/ratings')
  driverRatings(@CurrentPrincipal() p: Principal): Promise<RatingSummary> {
    return this.ratings.summary(p.userId, 'driver', false);
  }

  @Post('support/tickets')
  async create(
    @CurrentPrincipal() p: Principal,
    @Body(zod(createTicketSchema)) body: z.output<typeof createTicketSchema>,
  ): Promise<TicketView> {
    await this.rateLimiter.consume(
      { name: 'support_ticket', limit: 10, windowSeconds: 86_400 },
      p.userId,
    );
    return this.support.create(p.userId, body);
  }

  @Get('support/tickets')
  mine(@CurrentPrincipal() p: Principal): Promise<TicketView[]> {
    return this.support.mine(p.userId);
  }

  @Get('support/tickets/:id')
  get(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
  ): Promise<TicketView> {
    return this.support.get(p.userId, id);
  }

  @Post('support/tickets/:id/messages')
  async reply(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Body(zod(ticketMessageSchema)) body: z.output<typeof ticketMessageSchema>,
  ): Promise<TicketView> {
    await this.rateLimiter.consume(
      { name: 'support_reply', limit: 60, windowSeconds: 3600 },
      p.userId,
    );
    return this.support.reply(p.userId, id, body.body);
  }
}

@Controller('v1/admin')
export class AdminEngagementController {
  constructor(
    private readonly ratings: RatingsService,
    private readonly support: SupportService,
  ) {}

  @Get('users/:id/ratings')
  @RequirePermissions('users.read')
  async userRatings(
    @Param('id', zod(uuidSchema)) id: string,
  ): Promise<{ asDriver: RatingSummary; asPassenger: RatingSummary }> {
    return {
      asDriver: await this.ratings.summary(id, 'driver', true),
      asPassenger: await this.ratings.summary(id, 'passenger', true),
    };
  }

  @Get('support/tickets')
  @RequirePermissions('support.read')
  tickets(
    @Query(zod(adminTicketsQuerySchema)) q: z.output<typeof adminTicketsQuerySchema>,
  ): Promise<AdminTicketView[]> {
    return this.support.list(q);
  }

  @Get('support/tickets/:id')
  @RequirePermissions('support.read')
  ticket(@Param('id', zod(uuidSchema)) id: string): Promise<AdminTicketView> {
    return this.support.adminGet(id);
  }

  @Post('support/tickets/:id/messages')
  @RequirePermissions('support.manage')
  replyAsStaff(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Body(zod(ticketMessageSchema)) body: z.output<typeof ticketMessageSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<AdminTicketView> {
    return this.support.staffReply(p, id, body.body, ctx);
  }

  @Post('support/tickets/:id/status')
  @HttpCode(200)
  @RequirePermissions('support.manage')
  status(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Body(zod(ticketStatusSchema)) body: z.output<typeof ticketStatusSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<AdminTicketView> {
    return this.support.setStatus(p, id, body.status, ctx);
  }
}
