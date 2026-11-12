import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from '@nestjs/common';
import type {
  DocumentViewUrl,
  FareEstimateResponse,
  Paginated,
  RideView,
} from '@rideswithme/shared-types';
import {
  createRideSchema,
  fareEstimateSchema,
  listRidesQuerySchema,
  passengerCancelSchema,
  uuidSchema,
} from '@rideswithme/validation';
import type { z } from 'zod';
import { CurrentPrincipal, type Principal } from '../auth/principal';
import { IdempotencyService } from '../common/idempotency.service';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service';
import { zod } from '../common/zod-validation.pipe';
import { PricingService } from '../pricing/pricing.service';
import { RideService } from './ride.service';

@Controller('v1')
export class RidesController {
  constructor(
    private readonly pricing: PricingService,
    private readonly rides: RideService,
    private readonly idempotency: IdempotencyService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  /** Prices a trip for every vehicle type. Each option carries a quoteId valid for a few minutes. */
  @Post('fares/estimate')
  @HttpCode(200)
  async estimate(
    @CurrentPrincipal() p: Principal,
    @Body(zod(fareEstimateSchema)) body: z.output<typeof fareEstimateSchema>,
  ): Promise<FareEstimateResponse> {
    await this.rateLimiter.consume(
      { name: 'fare_estimate', limit: 60, windowSeconds: 600 },
      p.userId,
    );
    return this.pricing.estimate(p.userId, body);
  }

  /** Books a ride from a quote. Requires an Idempotency-Key header so retries never book twice. */
  @Post('rides')
  async book(
    @CurrentPrincipal() p: Principal,
    @Body(zod(createRideSchema)) body: z.output<typeof createRideSchema>,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<RideView> {
    await this.rateLimiter.consume(
      { name: 'ride_booking', limit: 20, windowSeconds: 3600 },
      p.userId,
    );
    return this.idempotency.run(p.userId, key, 'POST /v1/rides', body, () =>
      this.rides.book(p.userId, body),
    );
  }

  @Get('rides/active')
  active(@CurrentPrincipal() p: Principal): Promise<RideView[]> {
    return this.rides.activeForPassenger(p.userId);
  }

  @Get('rides')
  history(
    @CurrentPrincipal() p: Principal,
    @Query(zod(listRidesQuerySchema)) q: z.output<typeof listRidesQuerySchema>,
  ): Promise<Paginated<RideView>> {
    return this.rides.historyForPassenger(p.userId, q);
  }

  @Get('rides/:id')
  get(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
  ): Promise<RideView> {
    return this.rides.getForPassenger(p.userId, id);
  }

  @Post('rides/:id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Body(zod(passengerCancelSchema)) body: z.output<typeof passengerCancelSchema>,
  ): Promise<RideView> {
    return this.rides.cancelByPassenger(p.userId, id, body.reason);
  }

  @Get('rides/:id/driver-photo')
  driverPhoto(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
  ): Promise<DocumentViewUrl> {
    return this.rides.driverPhotoUrl(p.userId, id);
  }
}
