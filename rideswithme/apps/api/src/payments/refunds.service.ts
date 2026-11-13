import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Kysely, type Selectable } from 'kysely';
import { ErrorCode, type RefundView } from '@rideswithme/shared-types';
import type { RefundInput } from '@rideswithme/validation';
import { AppException } from '../common/app-exception';
import type { RequestContext } from '../common/request-context';
import { AuditService } from '../audit/audit.service';
import { DB } from '../database/database.module';
import { koboFromDb } from '../database/geo';
import type { Database, RefundsTable } from '../database/types';
import { credit, debit, type WalletRef, LedgerService } from './ledger.service';
import { PAYMENT_PROVIDER, type PaymentProvider, type ProviderEvent } from './payment.provider';

export function refundView(r: Selectable<RefundsTable>): RefundView {
  return {
    id: r.id,
    paymentId: r.payment_id,
    amountKobo: koboFromDb(r.amount_kobo),
    destination: r.destination,
    fundedBy: r.funded_by,
    status: r.status,
    reason: r.reason,
    disputeId: r.dispute_id,
    failureReason: r.failure_reason,
    createdAt: r.created_at.toISOString(),
    completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
  };
}

type RefundRequest = Required<Pick<RefundInput, 'amountKobo' | 'reason'>> & {
  destination: 'wallet' | 'card';
  fundedBy: 'platform' | 'driver';
  disputeId?: string | undefined;
};

/**
 * Refunds of ride fares and fees, by staff. To the wallet: credited at once.
 * To the card: sent through the provider; if the provider refuses it now the
 * refund is undone (try again), and if it fails later the money goes to the
 * passenger's wallet instead. Funded by the platform's revenue or, where the
 * driver was at fault, from the driver's wallet.
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  async refund(
    staffId: string,
    paymentId: string,
    input: RefundRequest,
    ctx: Partial<RequestContext>,
    /** Runs inside the refund's transaction (e.g. to resolve the dispute it settles). */
    alsoInTransaction?: (trx: Kysely<Database>, refundId: string) => Promise<void>,
  ): Promise<RefundView> {
    const id = randomUUID();
    const prepared = await this.db.transaction().execute(async (trx) => {
      const p = await trx
        .selectFrom('payments as p')
        .leftJoin('rides as r', 'r.id', 'p.ride_id')
        .selectAll('p')
        .select('r.driver_id')
        .where('p.id', '=', paymentId)
        .forUpdate('p')
        .executeTakeFirst();
      if (!p) throw new AppException(ErrorCode.NOT_FOUND, 'Payment not found');
      const refuse = (why: string) => {
        throw new AppException(ErrorCode.REFUND_NOT_ALLOWED, why);
      };
      if (p.purpose !== 'ride_fare' && p.purpose !== 'cancellation_fee')
        refuse('Only ride fares and fees can be refunded');
      if (!['succeeded', 'collected', 'outstanding'].includes(p.status))
        refuse('Nothing has been paid');
      const paid = koboFromDb(p.amount_kobo) - koboFromDb(p.outstanding_kobo);
      const refundable = paid - koboFromDb(p.refunded_kobo);
      if (input.amountKobo > refundable) refuse(`At most ${refundable} kobo can be refunded`);
      if (
        input.destination === 'card' &&
        !(p.method === 'card' && p.status === 'succeeded' && p.provider_reference)
      )
        refuse('Only a card payment can be refunded to the card');
      if (input.fundedBy === 'driver' && !p.driver_id) refuse('This ride had no driver');

      const source: WalletRef =
        input.fundedBy === 'driver'
          ? { user: p.driver_id!, kind: 'driver' }
          : { system: 'platform_revenue' };
      const toCard = input.destination === 'card';
      await trx
        .insertInto('refunds')
        .values({
          id,
          payment_id: p.id,
          amount_kobo: input.amountKobo,
          destination: input.destination,
          funded_by: input.fundedBy,
          status: toCard ? 'pending' : 'succeeded',
          reason: input.reason,
          dispute_id: input.disputeId ?? null,
          created_by: staffId,
          completed_at: toCard ? null : new Date(),
        })
        .execute();
      await trx
        .updateTable('payments')
        .set({ refunded_kobo: koboFromDb(p.refunded_kobo) + input.amountKobo })
        .where('id', '=', p.id)
        .execute();
      await this.ledger.post(trx, {
        kind: 'refund',
        reference: `refund:${id}`,
        refundId: id,
        paymentId: p.id,
        rideId: p.ride_id,
        disputeId: input.disputeId ?? null,
        createdBy: staffId,
        memo: 'Refund',
        lines: [
          debit(source, input.amountKobo),
          toCard
            ? credit({ system: 'refunds_in_transit' }, input.amountKobo)
            : credit({ user: p.payer_id, kind: 'passenger' }, input.amountKobo),
        ],
      });
      if (alsoInTransaction) await alsoInTransaction(trx, id);
      await this.audit.record(
        {
          actor: { type: 'user', userId: staffId },
          action: 'payments.refund_issued',
          target: { type: 'payment', id: p.id },
          metadata: { refundId: id, ...input },
          context: ctx,
        },
        trx,
      );
      return { toCard, transactionReference: p.provider_reference, source };
    });

    if (prepared.toCard) {
      try {
        const r = await this.provider.refund({
          transactionReference: prepared.transactionReference!,
          amountKobo: input.amountKobo,
          note: input.reason,
        });
        await this.db
          .updateTable('refunds')
          .set({ provider_reference: r.providerRefundId })
          .where('id', '=', id)
          .execute();
        if (r.status === 'processed') await this.complete(id, 'processed');
      } catch (err) {
        await this.undo(id, prepared.source, staffId);
        throw err;
      }
    }
    return refundView(
      await this.db
        .selectFrom('refunds')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow(),
    );
  }

  /** The provider refused a card refund outright: take it back off the books. */
  private async undo(refundId: string, source: WalletRef, staffId: string) {
    await this.db.transaction().execute(async (trx) => {
      const r = await trx
        .selectFrom('refunds')
        .selectAll()
        .where('id', '=', refundId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      const amount = koboFromDb(r.amount_kobo);
      await this.ledger.post(trx, {
        kind: 'refund_returned',
        reference: `refund:${refundId}:undone`,
        refundId,
        paymentId: r.payment_id,
        createdBy: staffId,
        memo: 'Card refund refused by the provider; undone',
        lines: [debit({ system: 'refunds_in_transit' }, amount), credit(source, amount)],
      });
      await trx
        .updateTable('refunds')
        .set({ status: 'failed', failure_reason: 'Refused by the payment provider' })
        .where('id', '=', refundId)
        .execute();
      const p = await trx
        .selectFrom('payments')
        .select('refunded_kobo')
        .where('id', '=', r.payment_id)
        .forUpdate()
        .executeTakeFirstOrThrow();
      await trx
        .updateTable('payments')
        .set({ refunded_kobo: koboFromDb(p.refunded_kobo) - amount })
        .where('id', '=', r.payment_id)
        .execute();
    });
  }

  /** A provider webhook about a card refund. */
  async applyProviderRefund(ev: Extract<ProviderEvent, { type: 'refund' }>): Promise<void> {
    if (ev.status === 'pending') return;
    let refund = ev.providerRefundId
      ? await this.db
          .selectFrom('refunds')
          .select('id')
          .where('provider_reference', '=', ev.providerRefundId)
          .executeTakeFirst()
      : undefined;
    if (!refund) {
      // Older refunds may only be matched by the original charge and amount.
      refund = await this.db
        .selectFrom('refunds as r')
        .innerJoin('payments as p', 'p.id', 'r.payment_id')
        .select('r.id')
        .where('p.provider_reference', '=', ev.transactionReference)
        .where('r.destination', '=', 'card')
        .where('r.status', '=', 'pending')
        .where('r.amount_kobo', '=', String(ev.amountKobo))
        .orderBy('r.created_at')
        .executeTakeFirst();
    }
    if (!refund) {
      this.logger.warn({ ev }, 'Refund event for an unknown refund');
      return;
    }
    await this.complete(refund.id, ev.status);
  }

  private async complete(refundId: string, outcome: 'processed' | 'failed') {
    await this.db.transaction().execute(async (trx) => {
      const r = await trx
        .selectFrom('refunds as r')
        .innerJoin('payments as p', 'p.id', 'r.payment_id')
        .selectAll('r')
        .select('p.payer_id')
        .where('r.id', '=', refundId)
        .forUpdate('r')
        .executeTakeFirstOrThrow();
      if (r.status !== 'pending') return;
      const amount = koboFromDb(r.amount_kobo);
      if (outcome === 'processed') {
        await this.ledger.post(trx, {
          kind: 'refund_completed',
          reference: `refund:${refundId}:completed`,
          refundId,
          paymentId: r.payment_id,
          lines: [
            debit({ system: 'refunds_in_transit' }, amount),
            credit({ system: 'paystack_balance' }, amount),
          ],
        });
        await trx
          .updateTable('refunds')
          .set({ status: 'succeeded', completed_at: new Date() })
          .where('id', '=', refundId)
          .execute();
      } else {
        await this.ledger.post(trx, {
          kind: 'refund_returned',
          reference: `refund:${refundId}:returned`,
          refundId,
          paymentId: r.payment_id,
          memo: 'Card refund failed: added to your wallet instead',
          lines: [
            debit({ system: 'refunds_in_transit' }, amount),
            credit({ user: r.payer_id, kind: 'passenger' }, amount),
          ],
        });
        await trx
          .updateTable('refunds')
          .set({
            status: 'failed',
            failure_reason: 'Card refund failed; credited to the wallet',
            completed_at: new Date(),
          })
          .where('id', '=', refundId)
          .execute();
      }
    });
  }

  async forPayment(paymentId: string): Promise<RefundView[]> {
    const rows = await this.db
      .selectFrom('refunds')
      .selectAll()
      .where('payment_id', '=', paymentId)
      .orderBy('created_at')
      .execute();
    return rows.map(refundView);
  }
}
