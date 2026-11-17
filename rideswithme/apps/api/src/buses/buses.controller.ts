import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type {
  AdminBusBookingView,
  BusBookingView,
  BusCityPair,
  BusDepartureDetail,
  BusDepartureSummary,
  BusOperatorSummary,
  BusPayResult,
  BusRouteView,
  BusSeatLayoutView,
  CheckInResult,
  OperatorDepartureDetail,
  OperatorDepartureView,
  OperatorOverview,
  WalletEntryView,
} from '@rideswithme/shared-types';
import {
  addBusOperatorManagerSchema,
  adminBusBookingsQuerySchema,
  busRouteSchema,
  busSearchQuerySchema,
  busSeatLayoutSchema,
  checkInSchema,
  createBusBookingSchema,
  createBusDeparturesSchema,
  createBusOperatorSchema,
  operatorDeparturesQuerySchema,
  operatorSettlementSchema,
  payBusBookingSchema,
  reasonSchema,
  updateBusDepartureSchema,
  updateBusOperatorSchema,
  updateBusRouteSchema,
  uuidSchema,
} from '@rideswithme/validation';
import type { z } from 'zod';
import { CurrentPrincipal, type Principal, RequirePermissions } from '../auth/principal';
import { IdempotencyService } from '../common/idempotency.service';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service';
import { ReqContext, type RequestContext } from '../common/request-context';
import { zod } from '../common/zod-validation.pipe';
import { KycService } from '../passengers/kyc.service';
import { BookingsService } from './bookings.service';
import { CatalogService } from './catalog.service';
import { OperatorsService } from './operators.service';

type Out<T extends z.ZodTypeAny> = z.output<T>;

/** Passengers: finding a bus, choosing seats, paying, tickets. */
@Controller('v1/bus')
export class PassengerBusController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly bookings: BookingsService,
    private readonly idempotency: IdempotencyService,
    private readonly rateLimiter: RateLimiterService,
    private readonly kyc: KycService,
  ) {}

  @Get('cities')
  cities(): Promise<BusCityPair[]> {
    return this.catalog.cities();
  }

  @Get('search')
  search(
    @Query(zod(busSearchQuerySchema)) q: Out<typeof busSearchQuerySchema>,
  ): Promise<BusDepartureSummary[]> {
    return this.catalog.search(q);
  }

  @Get('departures/:id')
  departure(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
  ): Promise<BusDepartureDetail> {
    return this.catalog.seatMap(id, p.userId);
  }

  /** Holds seats while the passenger pays. Requires an Idempotency-Key. */
  @Post('bookings')
  async hold(
    @CurrentPrincipal() p: Principal,
    @Body(zod(createBusBookingSchema)) body: Out<typeof createBusBookingSchema>,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<BusBookingView> {
    await this.rateLimiter.consume({ name: 'bus_hold', limit: 30, windowSeconds: 3600 }, p.userId);
    // Passengers must be verified first while the setting is on (D-083).
    await this.kyc.assertCanBook(p.userId);
    return this.idempotency.run(p.userId, key, 'POST /v1/bus/bookings', body, () =>
      this.bookings.hold(p.userId, body),
    );
  }

  @Get('bookings')
  mine(@CurrentPrincipal() p: Principal): Promise<BusBookingView[]> {
    return this.bookings.mine(p.userId);
  }

  @Get('bookings/:id')
  get(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
  ): Promise<BusBookingView> {
    return this.bookings.get(p.userId, id);
  }

  /** Pays from the wallet, a saved card, or on the provider's page. Requires an Idempotency-Key. */
  @Post('bookings/:id/pay')
  @HttpCode(200)
  pay(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Body(zod(payBusBookingSchema)) body: Out<typeof payBusBookingSchema>,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<BusPayResult> {
    return this.idempotency.run(p.userId, key, `POST /v1/bus/bookings/${id}/pay`, body, () =>
      this.bookings.pay(p.userId, id, body),
    );
  }

  @Post('bookings/:id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<BusBookingView> {
    return this.bookings.cancelByPassenger(p.userId, id, ctx);
  }
}

/** Bus operators' managers: their own routes, buses, departures and passengers only. */
@Controller('v1/operator')
export class OperatorController {
  constructor(
    private readonly operators: OperatorsService,
    private readonly catalog: CatalogService,
    private readonly bookings: BookingsService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  @Get()
  @RequirePermissions('bus.operator')
  async overview(@CurrentPrincipal() p: Principal): Promise<OperatorOverview> {
    return this.operators.overview(await this.operators.scope(p));
  }

  @Get('routes')
  @RequirePermissions('bus.operator')
  async routes(@CurrentPrincipal() p: Principal): Promise<BusRouteView[]> {
    return this.catalog.routes(await this.operators.scope(p));
  }

  @Post('routes')
  @RequirePermissions('bus.operator')
  async createRoute(
    @CurrentPrincipal() p: Principal,
    @Body(zod(busRouteSchema)) body: Out<typeof busRouteSchema>,
  ): Promise<BusRouteView> {
    return this.catalog.createRoute(await this.operators.scope(p), body);
  }

  @Patch('routes/:id')
  @RequirePermissions('bus.operator')
  async updateRoute(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Body(zod(updateBusRouteSchema)) body: Out<typeof updateBusRouteSchema>,
  ): Promise<BusRouteView> {
    return this.catalog.updateRoute(await this.operators.scope(p), id, body);
  }

  @Get('layouts')
  @RequirePermissions('bus.operator')
  async layouts(@CurrentPrincipal() p: Principal): Promise<BusSeatLayoutView[]> {
    return this.catalog.layouts((await this.operators.scope(p)).operatorId);
  }

  @Post('layouts')
  @RequirePermissions('bus.operator')
  async createLayout(
    @CurrentPrincipal() p: Principal,
    @Body(zod(busSeatLayoutSchema)) body: Out<typeof busSeatLayoutSchema>,
  ): Promise<BusSeatLayoutView> {
    return this.catalog.createLayout(await this.operators.scope(p), body);
  }

  @Get('departures')
  @RequirePermissions('bus.operator')
  async departures(
    @CurrentPrincipal() p: Principal,
    @Query(zod(operatorDeparturesQuerySchema)) q: Out<typeof operatorDeparturesQuerySchema>,
  ): Promise<OperatorDepartureView[]> {
    return this.catalog.listDepartures((await this.operators.scope(p)).operatorId, q);
  }

  @Post('departures')
  @RequirePermissions('bus.operator')
  async createDepartures(
    @CurrentPrincipal() p: Principal,
    @Body(zod(createBusDeparturesSchema)) body: Out<typeof createBusDeparturesSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<OperatorDepartureView[]> {
    return this.catalog.createDepartures(p, await this.operators.scope(p), body, ctx);
  }

  @Get('departures/:id')
  @RequirePermissions('bus.operator')
  async departure(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
  ): Promise<OperatorDepartureDetail> {
    return this.catalog.departureDetail((await this.operators.scope(p)).operatorId, id);
  }

  @Patch('departures/:id')
  @RequirePermissions('bus.operator')
  async updateDeparture(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Body(zod(updateBusDepartureSchema)) body: Out<typeof updateBusDepartureSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<OperatorDepartureDetail> {
    return this.catalog.updateDeparture(p, await this.operators.scope(p), id, body, ctx);
  }

  @Post('departures/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('bus.operator')
  async cancelDeparture(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Body(zod(reasonSchema)) body: Out<typeof reasonSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<OperatorDepartureDetail> {
    const scope = await this.operators.scope(p);
    return this.bookings.cancelDeparture(p, scope.operatorId, id, body.reason, ctx);
  }

  @Post('check-in')
  @HttpCode(200)
  @RequirePermissions('bus.operator')
  async checkIn(
    @CurrentPrincipal() p: Principal,
    @Body(zod(checkInSchema)) body: Out<typeof checkInSchema>,
  ): Promise<CheckInResult> {
    // Guessing ticket codes is pointless (50 bits), but cap it anyway.
    await this.rateLimiter.consume(
      { name: 'bus_check_in', limit: 600, windowSeconds: 3600 },
      p.userId,
    );
    return this.bookings.checkIn(p, await this.operators.scope(p), body.code);
  }

  @Get('statement')
  @RequirePermissions('bus.operator')
  async statement(@CurrentPrincipal() p: Principal): Promise<WalletEntryView[]> {
    return this.operators.statement((await this.operators.scope(p)).operatorId);
  }
}

/** Staff: bus operators, their fees and settlements, departures and bookings. */
@Controller('v1/admin')
export class AdminBusController {
  constructor(
    private readonly operators: OperatorsService,
    private readonly catalog: CatalogService,
    private readonly bookings: BookingsService,
  ) {}

  @Get('bus-operators')
  @RequirePermissions('buses.read')
  list(): Promise<BusOperatorSummary[]> {
    return this.operators.list();
  }

  @Post('bus-operators')
  @RequirePermissions('buses.manage')
  create(
    @CurrentPrincipal() p: Principal,
    @Body(zod(createBusOperatorSchema)) body: Out<typeof createBusOperatorSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<BusOperatorSummary> {
    return this.operators.create(p, body, ctx);
  }

  @Get('bus-operators/:id')
  @RequirePermissions('buses.read')
  get(@Param('id', zod(uuidSchema)) id: string): Promise<BusOperatorSummary> {
    return this.operators.get(id);
  }

  @Patch('bus-operators/:id')
  @RequirePermissions('buses.manage')
  update(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Body(zod(updateBusOperatorSchema)) body: Out<typeof updateBusOperatorSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<BusOperatorSummary> {
    return this.operators.update(p, id, body, ctx);
  }

  @Post('bus-operators/:id/managers')
  @RequirePermissions('buses.manage')
  addManager(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Body(zod(addBusOperatorManagerSchema)) body: Out<typeof addBusOperatorManagerSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<BusOperatorSummary> {
    return this.operators.addManager(p, id, body.phone, ctx);
  }

  @Post('bus-operators/:id/suspend')
  @HttpCode(200)
  @RequirePermissions('buses.manage')
  suspend(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<BusOperatorSummary> {
    return this.operators.setStatus(p, id, 'suspended', ctx);
  }

  @Post('bus-operators/:id/reactivate')
  @HttpCode(200)
  @RequirePermissions('buses.manage')
  reactivate(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<BusOperatorSummary> {
    return this.operators.setStatus(p, id, 'active', ctx);
  }

  @Post('bus-operators/:id/settlements')
  @RequirePermissions('buses.manage')
  settle(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Body(zod(operatorSettlementSchema)) body: Out<typeof operatorSettlementSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<BusOperatorSummary> {
    return this.operators.recordSettlement(p, id, body, ctx);
  }

  @Get('bus-operators/:id/statement')
  @RequirePermissions('buses.read')
  statement(@Param('id', zod(uuidSchema)) id: string): Promise<WalletEntryView[]> {
    return this.operators.statement(id);
  }

  @Get('bus-operators/:id/routes')
  @RequirePermissions('buses.read')
  routes(@Param('id', zod(uuidSchema)) id: string): Promise<BusRouteView[]> {
    return this.catalog.routes({ operatorId: id, name: '' });
  }

  @Get('bus-operators/:id/layouts')
  @RequirePermissions('buses.read')
  layouts(@Param('id', zod(uuidSchema)) id: string): Promise<BusSeatLayoutView[]> {
    return this.catalog.layouts(id);
  }

  @Get('bus-operators/:id/departures')
  @RequirePermissions('buses.read')
  departures(
    @Param('id', zod(uuidSchema)) id: string,
    @Query(zod(operatorDeparturesQuerySchema)) q: Out<typeof operatorDeparturesQuerySchema>,
  ): Promise<OperatorDepartureView[]> {
    return this.catalog.listDepartures(id, q);
  }

  @Get('bus-departures/:id')
  @RequirePermissions('buses.read')
  departure(@Param('id', zod(uuidSchema)) id: string): Promise<OperatorDepartureDetail> {
    return this.catalog.departureDetail(null, id);
  }

  @Post('bus-departures/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('buses.manage')
  cancelDeparture(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Body(zod(reasonSchema)) body: Out<typeof reasonSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<OperatorDepartureDetail> {
    return this.bookings.cancelDeparture(p, null, id, body.reason, ctx);
  }

  @Get('bus-bookings')
  @RequirePermissions('buses.read')
  bookings_(
    @Query(zod(adminBusBookingsQuerySchema)) q: Out<typeof adminBusBookingsQuerySchema>,
  ): Promise<AdminBusBookingView[]> {
    return this.bookings.adminList(q);
  }

  @Get('bus-bookings/:id')
  @RequirePermissions('buses.read')
  booking(@Param('id', zod(uuidSchema)) id: string): Promise<AdminBusBookingView> {
    return this.bookings.adminGet(id);
  }

  @Post('bus-bookings/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('buses.manage')
  cancelBooking(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Body(zod(reasonSchema)) body: Out<typeof reasonSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<AdminBusBookingView> {
    return this.bookings.cancelByAdmin(p, id, body.reason, ctx);
  }
}
