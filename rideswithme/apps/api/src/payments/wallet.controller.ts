import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type {
  CheckoutView,
  DisputeView,
  DriverWalletView,
  Paginated,
  PaymentView,
  PayoutView,
  SavedCardView,
  WalletEntryView,
  WalletView,
} from '@rideswithme/shared-types';
import { ErrorCode } from '@rideswithme/shared-types';
import {
  addCardSchema,
  pageQuerySchema,
  payoutRequestSchema,
  raiseDisputeSchema,
  topUpSchema,
  uuidSchema,
} from '@rideswithme/validation';
import { z } from 'zod';
import { CurrentPrincipal, type Principal } from '../auth/principal';
import { AppException } from '../common/app-exception';
import { IdempotencyService } from '../common/idempotency.service';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service';
import { ReqContext, type RequestContext } from '../common/request-context';
import { zod } from '../common/zod-validation.pipe';
import { DisputesService } from './disputes.service';
import { PaymentsService } from './payments.service';
import { PayoutsService } from './payouts.service';

const refreshQuery = z.object({ refresh: z.enum(['0', '1']).optional() });

/** The passenger's wallet, saved cards, payments and fare disputes. */
@Controller('v1')
export class WalletController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly disputes: DisputesService,
    private readonly idempotency: IdempotencyService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  @Get('wallet')
  wallet(@CurrentPrincipal() p: Principal): Promise<WalletView> {
    return this.payments.wallet(p.userId);
  }

  @Get('wallet/transactions')
  transactions(
    @CurrentPrincipal() p: Principal,
    @Query(zod(pageQuerySchema)) q: z.output<typeof pageQuerySchema>,
  ): Promise<Paginated<WalletEntryView>> {
    return this.payments.statement(p.userId, 'passenger', q);
  }

  /** Starts a top-up: open checkoutUrl, then check the payment. Idempotency-Key required. */
  @Post('wallet/topups')
  async topUp(
    @CurrentPrincipal() p: Principal,
    @Body(zod(topUpSchema)) body: z.output<typeof topUpSchema>,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<CheckoutView> {
    await this.rateLimiter.consume(
      { name: 'wallet_topup', limit: 20, windowSeconds: 3600 },
      p.userId,
    );
    return this.idempotency.run(p.userId, key, 'POST /v1/wallet/topups', body, () =>
      this.payments.startTopUp(p.userId, 'passenger', body.amountKobo, body.returnTo),
    );
  }

  @Get('payments/:id')
  payment(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Query(zod(refreshQuery)) q: z.output<typeof refreshQuery>,
  ): Promise<PaymentView> {
    return this.payments.getPayment(p.userId, id, q.refresh === '1');
  }

  @Get('payment-cards')
  cards(@CurrentPrincipal() p: Principal): Promise<SavedCardView[]> {
    return this.payments.cards(p.userId);
  }

  /** Saves a card: a small charge that goes into the wallet. Idempotency-Key required. */
  @Post('payment-cards')
  async addCard(
    @CurrentPrincipal() p: Principal,
    @Body(zod(addCardSchema)) body: z.output<typeof addCardSchema>,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<CheckoutView> {
    await this.rateLimiter.consume({ name: 'card_link', limit: 10, windowSeconds: 3600 }, p.userId);
    return this.idempotency.run(p.userId, key, 'POST /v1/payment-cards', body, () =>
      this.payments.startCardLink(p.userId, body.returnTo),
    );
  }

  @Delete('payment-cards/:id')
  @HttpCode(204)
  async removeCard(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
  ): Promise<void> {
    await this.payments.removeCard(p.userId, id);
  }

  /** Reports a problem with what was paid for a ride (once per ride). */
  @Post('rides/:id/dispute')
  async dispute(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Body(zod(raiseDisputeSchema)) body: z.output<typeof raiseDisputeSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<DisputeView> {
    await this.rateLimiter.consume({ name: 'dispute', limit: 10, windowSeconds: 86_400 }, p.userId);
    return this.disputes.raise(p.userId, id, body, ctx);
  }

  @Get('rides/:id/dispute')
  async getDispute(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
  ): Promise<DisputeView> {
    const d = await this.disputes.forRide(id);
    if (!d || !(await this.disputes.isRaisedBy(id, p.userId)))
      throw new AppException(ErrorCode.NOT_FOUND, 'No problem reported for this ride');
    return d;
  }
}

/** The driver's wallet, earnings and payouts. */
@Controller('v1/driver')
export class DriverWalletController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly payouts: PayoutsService,
    private readonly idempotency: IdempotencyService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  private driver(p: Principal) {
    if (!p.roles.includes('driver')) throw new AppException(ErrorCode.FORBIDDEN, 'Drivers only');
  }

  @Get('wallet')
  wallet(@CurrentPrincipal() p: Principal): Promise<DriverWalletView> {
    this.driver(p);
    return this.payouts.driverWallet(p.userId);
  }

  @Get('wallet/transactions')
  transactions(
    @CurrentPrincipal() p: Principal,
    @Query(zod(pageQuerySchema)) q: z.output<typeof pageQuerySchema>,
  ): Promise<Paginated<WalletEntryView>> {
    this.driver(p);
    return this.payments.statement(p.userId, 'driver', q);
  }

  /** Tops up the driver wallet (to clear commission owed). Idempotency-Key required. */
  @Post('wallet/topups')
  async topUp(
    @CurrentPrincipal() p: Principal,
    @Body(zod(topUpSchema)) body: z.output<typeof topUpSchema>,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<CheckoutView> {
    this.driver(p);
    await this.rateLimiter.consume(
      { name: 'wallet_topup', limit: 20, windowSeconds: 3600 },
      p.userId,
    );
    return this.idempotency.run(p.userId, key, 'POST /v1/driver/wallet/topups', body, () =>
      this.payments.startTopUp(p.userId, 'driver', body.amountKobo, body.returnTo),
    );
  }

  @Get('payouts')
  list(@CurrentPrincipal() p: Principal): Promise<PayoutView[]> {
    this.driver(p);
    return this.payouts.list(p.userId);
  }

  /** Withdraws to the driver's bank account. Idempotency-Key required. */
  @Post('payouts')
  async request(
    @CurrentPrincipal() p: Principal,
    @Body(zod(payoutRequestSchema)) body: z.output<typeof payoutRequestSchema>,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<PayoutView> {
    this.driver(p);
    await this.rateLimiter.consume({ name: 'payout', limit: 10, windowSeconds: 86_400 }, p.userId);
    return this.idempotency.run(p.userId, key, 'POST /v1/driver/payouts', body, () =>
      this.payouts.request(p.userId, body.amountKobo),
    );
  }
}
