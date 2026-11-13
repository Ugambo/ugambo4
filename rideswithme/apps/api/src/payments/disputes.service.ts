import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Kysely, type Selectable } from 'kysely';
import { type DisputeView, ErrorCode } from '@rideswithme/shared-types';
import type { RaiseDisputeInput, ResolveDisputeInput } from '@rideswithme/validation';
import { AppException } from '../common/app-exception';
import type { RequestContext } from '../common/request-context';
import { AuditService } from '../audit/audit.service';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB, isUniqueViolation } from '../database/database.module';
import { koboFromDb } from '../database/geo';
import type { Database, DisputeStatus, PaymentDisputesTable } from '../database/types';
import { credit, debit, LedgerService } from './ledger.service';
import type { ProviderEvent } from './payment.provider';
import { RefundsService } from './refunds.service';

export function disputeView(d: Selectable<PaymentDisputesTable>): DisputeView {
  return {
    id: d.id,
    rideId: d.ride_id,
    paymentId: d.payment_id,
    source: d.source,
    status: d.status,
    reason: d.reason,
    details: d.details,
    amountKobo: d.amount_kobo === null ? null : koboFromDb(d.amount_kobo),
    resolutionNote: d.resolution_note,
    createdAt: d.created_at.toISOString(),
    resolvedAt: d.resolved_at ? new Date(d.resolved_at).toISOString() : null,
  };
}

/**
 * Payment disputes: a passenger reporting a problem with what they paid, and
 * card chargebacks reported by the provider. Staff resolve passenger disputes
 * with a refund or a reasoned rejection; every step is audited.
 */
@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly ledger: LedgerService,
    private readonly refunds: RefundsService,
    private readonly audit: AuditService,
  ) {}

  async raise(
    passengerId: string,
    rideId: string,
    input: RaiseDisputeInput,
    ctx: Partial<RequestContext>,
    now = new Date(),
  ): Promise<DisputeView> {
    const ride = await this.db
      .selectFrom('rides')
      .select(['id', 'passenger_id', 'status', 'completed_at', 'cancelled_at'])
      .where('id', '=', rideId)
      .executeTakeFirst();
    if (!ride || ride.passenger_id !== passengerId)
      throw new AppException(ErrorCode.NOT_FOUND, 'Ride not found');
    const payment = await this.db
      .selectFrom('payments')
      .select(['id', 'amount_kobo'])
      .where('ride_id', '=', rideId)
      .orderBy('created_at', 'desc')
      .executeTakeFirst();
    const ended = ride.completed_at ?? ride.cancelled_at;
    if (!payment || !ended)
      throw new AppException(ErrorCode.INVALID_STATE, 'Nothing was charged for this ride');
    if (now.getTime() - ended.getTime() > this.config.DISPUTE_WINDOW_DAYS * 86_400_000) {
      throw new AppException(
        ErrorCode.INVALID_STATE,
        `Problems can be reported for ${this.config.DISPUTE_WINDOW_DAYS} days`,
      );
    }
    try {
      const d = await this.db.transaction().execute(async (trx) => {
        const row = await trx
          .insertInto('payment_disputes')
          .values({
            ride_id: rideId,
            payment_id: payment.id,
            source: 'passenger',
            raised_by: passengerId,
            reason: input.reason,
            details: input.details ?? null,
            amount_kobo: koboFromDb(payment.amount_kobo),
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        await this.audit.record(
          {
            actor: { type: 'user', userId: passengerId },
            action: 'payments.dispute_raised',
            target: { type: 'ride', id: rideId },
            metadata: { disputeId: row.id, reason: input.reason },
            context: ctx,
          },
          trx,
        );
        return row;
      });
      return disputeView(d);
    } catch (err) {
      if (isUniqueViolation(err, 'payment_disputes_one_per_ride'))
        throw new AppException(ErrorCode.DISPUTE_EXISTS, 'Already reported');
      throw err;
    }
  }

  async list(status?: DisputeStatus): Promise<DisputeView[]> {
    let q = this.db.selectFrom('payment_disputes').selectAll().orderBy('created_at').limit(200);
    if (status) q = q.where('status', '=', status);
    return (await q.execute()).map(disputeView);
  }

  async forRide(rideId: string): Promise<DisputeView | null> {
    const d = await this.db
      .selectFrom('payment_disputes')
      .selectAll()
      .where('ride_id', '=', rideId)
      .where('source', '=', 'passenger')
      .executeTakeFirst();
    return d ? disputeView(d) : null;
  }

  async isRaisedBy(rideId: string, userId: string): Promise<boolean> {
    return !!(await this.db
      .selectFrom('payment_disputes')
      .select('id')
      .where('ride_id', '=', rideId)
      .where('raised_by', '=', userId)
      .executeTakeFirst());
  }

  async resolve(
    staffId: string,
    disputeId: string,
    input: ResolveDisputeInput,
    ctx: Partial<RequestContext>,
  ): Promise<DisputeView> {
    const d = await this.db
      .selectFrom('payment_disputes')
      .selectAll()
      .where('id', '=', disputeId)
      .executeTakeFirst();
    if (!d) throw new AppException(ErrorCode.NOT_FOUND, 'Dispute not found');
    if (d.status !== 'open' || d.source !== 'passenger')
      throw new AppException(ErrorCode.INVALID_STATE, 'This dispute is not open');
    const close = (status: DisputeStatus) => async (trx: Kysely<Database>) => {
      const r = await trx
        .updateTable('payment_disputes')
        .set({ status, resolution_note: input.note, resolved_by: staffId, resolved_at: new Date() })
        .where('id', '=', disputeId)
        .where('status', '=', 'open')
        .executeTakeFirst();
      if (Number(r.numUpdatedRows) === 0)
        throw new AppException(ErrorCode.CONFLICT, 'Already resolved');
      await this.audit.record(
        {
          actor: { type: 'user', userId: staffId },
          action: `payments.dispute_${status}`,
          target: { type: 'payment_dispute', id: disputeId },
          metadata: { note: input.note },
          context: ctx,
        },
        trx,
      );
    };
    if (input.outcome === 'refund') {
      if (!d.payment_id)
        throw new AppException(ErrorCode.REFUND_NOT_ALLOWED, 'No payment to refund');
      await this.refunds.refund(
        staffId,
        d.payment_id,
        {
          amountKobo: input.amountKobo,
          destination: input.destination ?? 'wallet',
          fundedBy: input.fundedBy ?? 'platform',
          reason: input.note,
          disputeId,
        },
        ctx,
        close('refunded'),
      );
    } else {
      await this.db.transaction().execute(close('rejected'));
    }
    return disputeView(
      await this.db
        .selectFrom('payment_disputes')
        .selectAll()
        .where('id', '=', disputeId)
        .executeTakeFirstOrThrow(),
    );
  }

  /** A card chargeback from the provider: recorded when opened; if lost, the money leaves our balance. */
  async applyProviderDispute(ev: Extract<ProviderEvent, { type: 'dispute' }>): Promise<void> {
    const payment = await this.db
      .selectFrom('payments')
      .select(['id', 'ride_id', 'amount_kobo'])
      .where('provider_reference', '=', ev.transactionReference)
      .executeTakeFirst();
    if (!payment) {
      this.logger.warn({ ev }, 'Chargeback for an unknown payment');
      return;
    }
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('payment_disputes')
        .values({
          ride_id: payment.ride_id,
          payment_id: payment.id,
          source: 'provider',
          reason: (ev.reason ?? 'chargeback').slice(0, 60),
          amount_kobo: ev.amountKobo,
          provider_dispute_id: ev.disputeId,
        })
        .onConflict((oc) => oc.column('provider_dispute_id').doNothing())
        .execute();
      const d = await trx
        .selectFrom('payment_disputes')
        .selectAll()
        .where('provider_dispute_id', '=', ev.disputeId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      if (ev.outcome === 'open' || d.status !== 'open') return;
      if (ev.outcome === 'lost') {
        const amount = Math.min(ev.amountKobo, koboFromDb(payment.amount_kobo));
        // The bank took the money back. The platform bears it; staff can recover it from the driver by adjustment.
        await this.ledger.post(trx, {
          kind: 'chargeback',
          reference: `dispute:${d.id}:lost`,
          disputeId: d.id,
          paymentId: payment.id,
          rideId: payment.ride_id,
          lines: [
            debit({ system: 'platform_revenue' }, amount),
            credit({ system: 'paystack_balance' }, amount),
          ],
        });
        const p = await trx
          .selectFrom('payments')
          .select('refunded_kobo')
          .where('id', '=', payment.id)
          .forUpdate()
          .executeTakeFirstOrThrow();
        await trx
          .updateTable('payments')
          .set({
            refunded_kobo: Math.min(
              koboFromDb(payment.amount_kobo),
              koboFromDb(p.refunded_kobo) + amount,
            ),
          })
          .where('id', '=', payment.id)
          .execute();
      }
      await trx
        .updateTable('payment_disputes')
        .set({
          status: ev.outcome,
          resolved_at: new Date(),
          resolution_note: `Card network decision: ${ev.outcome}`,
        })
        .where('id', '=', d.id)
        .execute();
      await this.audit.record(
        {
          actor: { type: 'system' },
          action: `payments.chargeback_${ev.outcome}`,
          target: { type: 'payment', id: payment.id },
          metadata: { disputeId: d.id, amountKobo: ev.amountKobo },
        },
        trx,
      );
    });
  }
}
