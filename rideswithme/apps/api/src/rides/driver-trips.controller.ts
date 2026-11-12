import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  type DriverAvailabilityView,
  type DriverOfferView,
  type DriverPosition,
  type DriverRideView,
  ErrorCode,
  type Paginated,
} from '@rideswithme/shared-types';
import {
  availabilitySchema,
  completeRideSchema,
  driverCancelSchema,
  listRidesQuerySchema,
  locationUpdateSchema,
  uuidSchema,
} from '@rideswithme/validation';
import type { z } from 'zod';
import { CurrentPrincipal, type Principal } from '../auth/principal';
import { AppException } from '../common/app-exception';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service';
import { zod } from '../common/zod-validation.pipe';
import { DriverViewService } from '../drivers/driver-view.service';
import { LocationService } from './location.service';
import { PresenceService } from './presence.service';
import { RideService } from './ride.service';

/** The driver's side of the ride flow. Each call acts only on the caller's own rides and offers. */
@Controller('v1/driver')
export class DriverTripsController {
  constructor(
    private readonly rides: RideService,
    private readonly presence: PresenceService,
    private readonly drivers: DriverViewService,
    private readonly rateLimiter: RateLimiterService,
    private readonly locations: LocationService,
  ) {}

  @Get('availability')
  async availability(@CurrentPrincipal() p: Principal): Promise<DriverAvailabilityView> {
    const state = await this.drivers.load(p.userId);
    return {
      online: await this.presence.isOnline(p.userId),
      blockers: state.view.eligibility.blockers,
      position: await this.presence.position(p.userId),
    };
  }

  /** Going online needs everything that makes a driver eligible (see DriverOnboardingView.eligibility). */
  @Post('availability')
  @HttpCode(200)
  async setAvailability(
    @CurrentPrincipal() p: Principal,
    @Body(zod(availabilitySchema)) body: z.output<typeof availabilitySchema>,
  ): Promise<DriverAvailabilityView> {
    const state = await this.drivers.load(p.userId);
    if (body.online) {
      if (!state.view.eligibility.canGoOnline || !state.view.vehicle) {
        throw new AppException(ErrorCode.DRIVER_NOT_ELIGIBLE, 'You cannot go online yet', {
          details: { blockers: state.view.eligibility.blockers },
        });
      }
      await this.presence.goOnline(
        p.userId,
        state.view.vehicle.category.key,
        state.view.vehicle.id,
        body.location!,
      );
    } else {
      await this.presence.goOffline(p.userId);
    }
    return {
      online: body.online,
      blockers: state.view.eligibility.blockers,
      position: await this.presence.position(p.userId),
    };
  }

  /** Accepts a batch of readings (the app buffers while offline); the newest becomes the current position. */
  @Post('location')
  @HttpCode(200)
  async location(
    @CurrentPrincipal() p: Principal,
    @Body(zod(locationUpdateSchema)) body: z.output<typeof locationUpdateSchema>,
  ): Promise<{ position: DriverPosition | null; stored: number }> {
    await this.rateLimiter.consume(
      { name: 'driver_location', limit: 60, windowSeconds: 60 },
      p.userId,
    );
    if (!p.roles.includes('driver')) throw new AppException(ErrorCode.FORBIDDEN, 'Drivers only');
    const res = await this.locations.ingest(p.userId, body.points);
    return { position: res.position, stored: res.stored };
  }

  @Get('offers/current')
  async currentOffer(@CurrentPrincipal() p: Principal): Promise<{ offer: DriverOfferView | null }> {
    return { offer: await this.rides.currentOffer(p.userId) };
  }

  @Post('offers/:id/accept')
  @HttpCode(200)
  accept(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
  ): Promise<DriverRideView> {
    return this.rides.acceptOffer(p.userId, id);
  }

  @Post('offers/:id/reject')
  @HttpCode(204)
  async reject(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
  ): Promise<void> {
    await this.rides.rejectOffer(p.userId, id);
  }

  @Get('rides/active')
  async active(@CurrentPrincipal() p: Principal): Promise<{ ride: DriverRideView | null }> {
    return { ride: await this.rides.activeForDriver(p.userId) };
  }

  @Get('rides')
  history(
    @CurrentPrincipal() p: Principal,
    @Query(zod(listRidesQuerySchema)) q: z.output<typeof listRidesQuerySchema>,
  ): Promise<Paginated<DriverRideView>> {
    return this.rides.historyForDriver(p.userId, q);
  }

  @Get('rides/:id')
  get(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
  ): Promise<DriverRideView> {
    return this.rides.getForDriver(p.userId, id);
  }

  @Post('rides/:id/arrived')
  @HttpCode(200)
  arrived(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
  ): Promise<DriverRideView> {
    return this.rides.arrived(p.userId, id);
  }

  @Post('rides/:id/start')
  @HttpCode(200)
  start(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
  ): Promise<DriverRideView> {
    return this.rides.start(p.userId, id);
  }

  @Post('rides/:id/complete')
  @HttpCode(200)
  complete(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Body(zod(completeRideSchema)) body: z.output<typeof completeRideSchema>,
  ): Promise<DriverRideView> {
    return this.rides.complete(p.userId, id, body.cashCollectedKobo);
  }

  @Post('rides/:id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Body(zod(driverCancelSchema)) body: z.output<typeof driverCancelSchema>,
  ): Promise<DriverRideView> {
    return this.rides.cancelByDriver(p.userId, id, body);
  }
}
