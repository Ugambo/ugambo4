import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type Kysely, sql } from 'kysely';
import { ErrorCode } from '@rideswithme/shared-types';
import { AppException } from '../common/app-exception';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB } from '../database/database.module';
import type { Database } from '../database/types';
import { DisputesService } from './disputes.service';
import { FakePaymentProvider } from './fake.provider';
import { PAYMENT_PROVIDER, type PaymentProvider, type ProviderEvent } from './payment.provider';
import { PaymentsService } from './payments.service';
import { PayoutsService } from './payouts.service';
import { RefundsService } from './refunds.service';

const MAX_ATTEMPTS = 10;

/**
 * Receives provider webhooks. Only correctly signed events are accepted; each
 * is stored once and processed idempotently. If processing fails the event is
 * kept and retried by the reconciliation job, and the provider still gets 200
 * (so it does not keep resending something we already have).
 */
@Injectable()
export class WebhooksService implements OnModuleInit {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly payments: PaymentsService,
    private readonly payouts: PayoutsService,
    private readonly refunds: RefundsService,
    private readonly disputes: DisputesService,
  ) {}

  onModuleInit() {
    // The fake provider delivers its webhooks straight into this handler.
    if (this.provider instanceof FakePaymentProvider) {
      this.provider.setWebhookSink((raw, signature) => this.receive(raw, signature, null));
    }
  }

  /** `ip` null means delivered internally (the fake provider). */
  async receive(
    rawBody: Buffer | undefined,
    signature: string | undefined,
    ip: string | null,
  ): Promise<void> {
    const allowed = this.config.PAYSTACK_WEBHOOK_IPS;
    if (ip !== null && allowed.length && !allowed.includes(ip.replace(/^::ffff:/, ''))) {
      this.logger.warn({ ip }, 'Webhook from an address not on the allow-list');
      throw new AppException(ErrorCode.FORBIDDEN, 'Not allowed');
    }
    if (!rawBody || !this.provider.verifySignature(rawBody, signature)) {
      this.logger.warn({ ip }, 'Webhook with an invalid signature refused');
      throw new AppException(ErrorCode.WEBHOOK_SIGNATURE_INVALID, 'Invalid signature');
    }
    let body: unknown;
    try {
      body = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'Body is not JSON');
    }
    const event = this.provider.parseEvent(body);
    const name =
      typeof (body as { event?: unknown }).event === 'string'
        ? (body as { event: string }).event
        : 'unknown';
    await this.db
      .insertInto('payment_webhook_events')
      .values({
        provider: this.provider.name,
        event: name.slice(0, 80),
        event_key: event.key.slice(0, 300),
        payload: JSON.stringify(body),
      })
      .onConflict((oc) => oc.columns(['provider', 'event_key']).doNothing())
      .execute();
    const stored = await this.db
      .selectFrom('payment_webhook_events')
      .select(['id', 'processed_at'])
      .where('provider', '=', this.provider.name)
      .where('event_key', '=', event.key.slice(0, 300))
      .executeTakeFirstOrThrow();
    if (stored.processed_at) return; // a repeat delivery
    await this.process(stored.id, event);
  }

  private async process(eventId: string, event: ProviderEvent): Promise<boolean> {
    try {
      await this.handle(event);
      await this.db
        .updateTable('payment_webhook_events')
        .set({ processed_at: new Date() })
        .where('id', '=', eventId)
        .execute();
      return true;
    } catch (err) {
      this.logger.error({ err, eventId }, 'Webhook processing failed; will retry');
      await this.db
        .updateTable('payment_webhook_events')
        .set({
          attempts: sql`attempts + 1`,
          last_error: String((err as Error).message).slice(0, 500),
        } as never)
        .where('id', '=', eventId)
        .execute();
      return false;
    }
  }

  private async handle(event: ProviderEvent): Promise<void> {
    switch (event.type) {
      case 'charge':
        return this.payments.applyCharge(event.charge);
      case 'transfer':
        return this.payouts.applyTransfer(event.transfer);
      case 'refund':
        return this.refunds.applyProviderRefund(event);
      case 'dispute':
        return this.disputes.applyProviderDispute(event);
      case 'ignored':
        return;
    }
  }

  /** Re-processes stored events that failed (reconciliation job). */
  async retryFailed(): Promise<number> {
    const rows = await this.db
      .selectFrom('payment_webhook_events')
      .select(['id', 'payload'])
      .where('processed_at', 'is', null)
      .where('attempts', '<', MAX_ATTEMPTS)
      .where('received_at', '<', new Date(Date.now() - 30_000))
      .orderBy('received_at')
      .limit(100)
      .execute();
    let done = 0;
    for (const r of rows) {
      if (await this.process(r.id, this.provider.parseEvent(r.payload))) done++;
    }
    return done;
  }
}
