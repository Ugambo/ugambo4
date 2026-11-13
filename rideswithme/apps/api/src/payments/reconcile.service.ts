import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import type Redis from 'ioredis';
import type { Kysely } from 'kysely';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB } from '../database/database.module';
import type { Database } from '../database/types';
import { REDIS } from '../redis/redis.module';
import { LedgerService } from './ledger.service';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment.provider';
import { PaymentsService } from './payments.service';
import { PayoutsService } from './payouts.service';
import { RidePaymentsService } from './ride-payments.service';
import { WebhooksService } from './webhooks.service';

export interface ReconcileReport {
  chargesChecked: number;
  cardChargesRetried: number;
  abandoned: number;
  payoutsSent: number;
  payoutsChecked: number;
  webhooksRetried: number;
  holdsReleased: number;
  ledgerMismatches: number;
}

/**
 * Catches anything a missed webhook or an outage left unfinished: asks the
 * provider about payments and payouts still pending, retries card charges and
 * transfers that never reached it, gives up on abandoned checkouts, retries
 * failed webhook processing, returns wallet holds of finished rides, and checks
 * that every wallet balance matches its ledger lines. One API copy at a time.
 */
@Injectable()
export class ReconcileService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ReconcileService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly ledger: LedgerService,
    private readonly payments: PaymentsService,
    private readonly ridePayments: RidePaymentsService,
    private readonly payouts: PayoutsService,
    private readonly webhooks: WebhooksService,
  ) {}

  onModuleInit() {
    if (this.config.PAYMENT_RECONCILE_INTERVAL_MINUTES === 0) return;
    this.timer = setInterval(
      () => void this.runWithLock(),
      this.config.PAYMENT_RECONCILE_INTERVAL_MINUTES * 60_000,
    );
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async runWithLock(): Promise<ReconcileReport | null> {
    if ((await this.redis.set('lock:payments-reconcile', '1', 'EX', 900, 'NX')) !== 'OK')
      return null;
    try {
      const report = await this.run();
      if (Object.values(report).some((n) => n > 0))
        this.logger.log({ report }, 'Payments reconciled');
      return report;
    } catch (err) {
      this.logger.error({ err }, 'Payment reconciliation failed');
      return null;
    } finally {
      await this.redis.del('lock:payments-reconcile');
    }
  }

  async run(now = new Date()): Promise<ReconcileReport> {
    const report: ReconcileReport = {
      chargesChecked: 0,
      cardChargesRetried: 0,
      abandoned: 0,
      payoutsSent: 0,
      payoutsChecked: 0,
      webhooksRetried: 0,
      holdsReleased: 0,
      ledgerMismatches: 0,
    };
    const stale = new Date(now.getTime() - this.config.PAYMENT_RECONCILE_AFTER_MINUTES * 60_000);
    const giveUp = new Date(now.getTime() - this.config.PAYMENT_ABANDON_AFTER_HOURS * 3_600_000);

    report.webhooksRetried = await this.webhooks.retryFailed();

    const pending = await this.db
      .selectFrom('payments')
      .select([
        'id',
        'payer_id',
        'card_id',
        'amount_kobo',
        'provider_reference',
        'purpose',
        'created_at',
      ])
      .where('status', '=', 'pending')
      .where('provider', '=', this.provider.name)
      .where('created_at', '<', stale)
      .orderBy('created_at')
      .limit(200)
      .execute();
    for (const p of pending) {
      if (!p.provider_reference) continue;
      try {
        const charge = await this.provider.verifyCharge(p.provider_reference);
        report.chargesChecked++;
        if (charge.status !== 'pending') {
          await this.payments.applyCharge(charge);
        } else if (p.purpose === 'ride_fare' || p.purpose === 'cancellation_fee') {
          // The card was never charged (e.g. the provider was down): try again with the same reference.
          await this.ridePayments.chargeCard(p);
          report.cardChargesRetried++;
        } else if (p.created_at < giveUp) {
          await this.db
            .updateTable('payments')
            .set({ status: 'abandoned', failure_reason: 'Checkout not completed' })
            .where('id', '=', p.id)
            .where('status', '=', 'pending')
            .execute();
          report.abandoned++;
        }
      } catch (err) {
        this.logger.warn(
          { err: (err as Error).message, paymentId: p.id },
          'Could not check payment',
        );
      }
    }

    const payouts = await this.db
      .selectFrom('payouts')
      .select(['id', 'status', 'provider_reference'])
      .where('status', 'in', ['pending', 'processing'])
      .where('updated_at', '<', stale)
      .limit(200)
      .execute();
    for (const p of payouts) {
      try {
        if (p.status === 'pending') {
          await this.payouts.send(p.id);
          report.payoutsSent++;
        } else {
          await this.payouts.applyTransfer(
            await this.provider.verifyTransfer(p.provider_reference),
          );
          report.payoutsChecked++;
        }
      } catch (err) {
        this.logger.warn({ err: (err as Error).message, payoutId: p.id }, 'Could not check payout');
      }
    }

    // Wallet money still held for rides that have ended (e.g. a release that failed).
    const held = await this.db
      .selectFrom('rides')
      .select(['id', 'passenger_id'])
      .where('payment_method', '=', 'wallet')
      .where('status', 'in', ['cancelled_by_passenger', 'cancelled_by_driver', 'no_driver_found'])
      .where('cancelled_at', '<', stale)
      .where('cancelled_at', '>', new Date(now.getTime() - 7 * 86_400_000))
      .execute();
    for (const r of held) {
      if ((await this.ledger.heldForRide(this.db, r.id)) <= 0) continue;
      await this.db
        .transaction()
        .execute((trx) => this.ridePayments.release(trx, r.id, r.passenger_id));
      report.holdsReleased++;
    }

    const mismatches = await this.ledger.mismatches();
    report.ledgerMismatches = mismatches.length;
    if (mismatches.length)
      this.logger.error({ mismatches }, 'Wallet balances differ from their ledger lines');
    return report;
  }
}
