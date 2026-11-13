import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { type Kysely } from 'kysely';
import type {
  DisputeView,
  PaymentView,
  PayoutView,
  RefundView,
  WalletEntryView,
} from '@rideswithme/shared-types';
import { ErrorCode } from '@rideswithme/shared-types';
import {
  refundSchema,
  resolveDisputeSchema,
  uuidSchema,
  walletAdjustmentSchema,
} from '@rideswithme/validation';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { CurrentPrincipal, type Principal, RequirePermissions } from '../auth/principal';
import { AppException } from '../common/app-exception';
import { IdempotencyService } from '../common/idempotency.service';
import { ReqContext, type RequestContext } from '../common/request-context';
import { zod } from '../common/zod-validation.pipe';
import { DB } from '../database/database.module';
import type { Database, SystemAccountKey } from '../database/types';
import { DisputesService } from './disputes.service';
import { credit, debit, LedgerService } from './ledger.service';
import { paymentView, PaymentsService } from './payments.service';
import { payoutView, PayoutsService } from './payouts.service';
import { RefundsService } from './refunds.service';

const paymentsQuery = z
  .object({
    payerId: z.string().uuid().optional(),
    rideId: z.string().uuid().optional(),
    status: z
      .enum(['pending', 'succeeded', 'collected', 'outstanding', 'failed', 'abandoned'])
      .optional(),
  })
  .strict();
const disputesQuery = z
  .object({ status: z.enum(['open', 'refunded', 'rejected', 'won', 'lost']).optional() })
  .strict();
const payoutsQuery = z
  .object({
    status: z.enum(['pending', 'processing', 'succeeded', 'failed', 'reversed']).optional(),
  })
  .strict();

/** Staff APIs for payments, refunds, disputes, payouts and wallets. Screens arrive in Phase 6. */
@Controller('v1/admin')
export class AdminPaymentsController {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    private readonly payments: PaymentsService,
    private readonly refunds: RefundsService,
    private readonly disputes: DisputesService,
    private readonly payouts: PayoutsService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get('payments')
  @RequirePermissions('payments.read')
  async list(@Query(zod(paymentsQuery)) q: z.output<typeof paymentsQuery>): Promise<PaymentView[]> {
    let query = this.db
      .selectFrom('payments as p')
      .leftJoin('payment_cards as c', 'c.id', 'p.card_id')
      .selectAll('p')
      .select(['c.brand as card_brand', 'c.last4 as card_last4'])
      .orderBy('p.created_at', 'desc')
      .limit(200);
    if (q.payerId) query = query.where('p.payer_id', '=', q.payerId);
    if (q.rideId) query = query.where('p.ride_id', '=', q.rideId);
    if (q.status) query = query.where('p.status', '=', q.status);
    return (await query.execute()).map(paymentView);
  }

  @Get('payments/:id/refunds')
  @RequirePermissions('payments.read')
  paymentRefunds(@Param('id', zod(uuidSchema)) id: string): Promise<RefundView[]> {
    return this.refunds.forPayment(id);
  }

  /** Refunds part or all of a ride fare or fee. Idempotency-Key required. */
  @Post('payments/:id/refunds')
  @RequirePermissions('payments.refund')
  refund(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Body(zod(refundSchema)) body: z.output<typeof refundSchema>,
    @Headers('idempotency-key') key: string | undefined,
    @ReqContext() ctx: RequestContext,
  ): Promise<RefundView> {
    return this.idempotency.run(p.userId, key, `POST /v1/admin/payments/${id}/refunds`, body, () =>
      this.refunds.refund(p.userId, id, body, ctx),
    );
  }

  @Get('disputes')
  @RequirePermissions('payments.read')
  listDisputes(
    @Query(zod(disputesQuery)) q: z.output<typeof disputesQuery>,
  ): Promise<DisputeView[]> {
    return this.disputes.list(q.status);
  }

  @Post('disputes/:id/resolve')
  @HttpCode(200)
  @RequirePermissions('payments.refund')
  resolve(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Body(zod(resolveDisputeSchema)) body: z.output<typeof resolveDisputeSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<DisputeView> {
    return this.disputes.resolve(p.userId, id, body, ctx);
  }

  @Get('payouts')
  @RequirePermissions('payments.read')
  async listPayouts(
    @Query(zod(payoutsQuery)) q: z.output<typeof payoutsQuery>,
  ): Promise<PayoutView[]> {
    let query = this.db
      .selectFrom('payouts')
      .selectAll()
      .orderBy('requested_at', 'desc')
      .limit(200);
    if (q.status) query = query.where('status', '=', q.status);
    return (await query.execute()).map(payoutView);
  }

  /** Sends a payout that never reached the provider (normally done by the reconciliation job). */
  @Post('payouts/:id/retry')
  @HttpCode(200)
  @RequirePermissions('payouts.manage')
  async retryPayout(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<PayoutView> {
    await this.payouts.send(id);
    await this.audit.record({
      actor: { type: 'user', userId: p.userId },
      action: 'payments.payout_retried',
      target: { type: 'payout', id },
      context: ctx,
    });
    const row = await this.db
      .selectFrom('payouts')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw new AppException(ErrorCode.NOT_FOUND, 'Payout not found');
    return payoutView(row);
  }

  @Get('users/:id/wallets')
  @RequirePermissions('payments.read')
  async wallets(@Param('id', zod(uuidSchema)) id: string): Promise<{
    passenger: { balanceKobo: number; owedKobo: number; recent: WalletEntryView[] };
    driver: { balanceKobo: number; recent: WalletEntryView[] };
  }> {
    const [pb, owed, pr, db, dr] = await Promise.all([
      this.ledger.balance(id, 'passenger'),
      this.payments.owedKobo(id),
      this.payments.statement(id, 'passenger', { limit: 20 }),
      this.ledger.balance(id, 'driver'),
      this.payments.statement(id, 'driver', { limit: 20 }),
    ]);
    return {
      passenger: { balanceKobo: pb, owedKobo: owed, recent: pr.items },
      driver: { balanceKobo: db, recent: dr.items },
    };
  }

  /** A manual correction against platform revenue, with a reason. Idempotency-Key required. */
  @Post('users/:id/wallet-adjustments')
  @RequirePermissions('wallets.adjust')
  adjust(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) userId: string,
    @Body(zod(walletAdjustmentSchema)) body: z.output<typeof walletAdjustmentSchema>,
    @Headers('idempotency-key') key: string | undefined,
    @ReqContext() ctx: RequestContext,
  ): Promise<{ balanceKobo: number }> {
    return this.idempotency.run(
      p.userId,
      key,
      `POST /v1/admin/users/${userId}/wallet-adjustments`,
      body,
      async () => {
        const user = await this.db
          .selectFrom('users')
          .select('id')
          .where('id', '=', userId)
          .executeTakeFirst();
        if (!user) throw new AppException(ErrorCode.NOT_FOUND, 'User not found');
        const id = randomUUID();
        const wallet = { user: userId, kind: body.kind };
        const amount = Math.abs(body.amountKobo);
        await this.db.transaction().execute(async (trx) => {
          await this.ledger.post(trx, {
            kind: 'adjustment',
            reference: `adjustment:${id}`,
            createdBy: p.userId,
            memo: body.reason,
            lines:
              body.amountKobo > 0
                ? [debit({ system: 'platform_revenue' }, amount), credit(wallet, amount)]
                : [debit(wallet, amount), credit({ system: 'platform_revenue' }, amount)],
          });
          await this.audit.record(
            {
              actor: { type: 'user', userId: p.userId },
              action: 'payments.wallet_adjusted',
              target: { type: 'user', id: userId },
              metadata: { adjustmentId: id, ...body },
              context: ctx,
            },
            trx,
          );
        });
        return { balanceKobo: await this.ledger.balance(userId, body.kind) };
      },
    );
  }

  /** The platform's accounts and a check that every wallet matches its ledger lines. */
  @Get('ledger')
  @RequirePermissions('payments.read')
  async health(): Promise<{
    accounts: Record<SystemAccountKey, number>;
    mismatchedWallets: number;
  }> {
    const rows = await this.db
      .selectFrom('wallets')
      .select(['system_key', 'balance_kobo'])
      .where('kind', '=', 'system')
      .execute();
    const accounts = Object.fromEntries(
      rows.map((r) => [r.system_key, Number(r.balance_kobo)]),
    ) as Record<SystemAccountKey, number>;
    return { accounts, mismatchedWallets: (await this.ledger.mismatches()).length };
  }
}
