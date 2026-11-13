import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Kysely, type Selectable, sql } from 'kysely';
import {
  ErrorCode,
  type CheckoutView,
  type PaymentReturnTarget,
  type PaymentView,
  type SavedCardView,
  type WalletEntryKind,
  type WalletEntryView,
  type WalletView,
} from '@rideswithme/shared-types';
import { AppException } from '../common/app-exception';
import { FieldEncryption } from '../common/crypto/field-encryption';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB } from '../database/database.module';
import { koboFromDb } from '../database/geo';
import type { Database, PaymentsTable, WalletKind } from '../database/types';
import { credit, debit, LedgerService } from './ledger.service';
import { type ChargeResult, PAYMENT_PROVIDER, type PaymentProvider } from './payment.provider';

export const cardContext = (userId: string) => `payment_cards.authorization_code:${userId}`;

type PaymentRow = Selectable<PaymentsTable> & {
  card_brand?: string | null;
  card_last4?: string | null;
};

export function paymentView(p: PaymentRow): PaymentView {
  return {
    id: p.id,
    purpose: p.purpose,
    method: p.method,
    status: p.status,
    amountKobo: koboFromDb(p.amount_kobo),
    outstandingKobo: koboFromDb(p.outstanding_kobo),
    refundedKobo: koboFromDb(p.refunded_kobo),
    rideId: p.ride_id,
    card: p.card_brand && p.card_last4 ? { brand: p.card_brand, last4: p.card_last4 } : null,
    failureReason: p.failure_reason,
    createdAt: p.created_at.toISOString(),
    paidAt: p.paid_at ? new Date(p.paid_at).toISOString() : null,
  };
}

/**
 * Wallet top-ups, saved cards, applying the provider's answers about charges,
 * and collecting money passengers owe. Everything that moves money posts to
 * the ledger in the same transaction as the record it belongs to.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly ledger: LedgerService,
    private readonly encryption: FieldEncryption,
  ) {}

  // --- Checkout: top-ups and saving a card ---

  async startTopUp(
    userId: string,
    kind: WalletKind,
    amountKobo: number,
    returnTo: PaymentReturnTarget,
  ): Promise<CheckoutView> {
    const { WALLET_TOPUP_MIN_KOBO: min, WALLET_TOPUP_MAX_KOBO: max } = this.config;
    if (amountKobo < min || amountKobo > max) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, `Top up between ${min} and ${max} kobo`, {
        details: { minKobo: min, maxKobo: max },
      });
    }
    if (kind === 'passenger') {
      const balance = await this.ledger.balance(userId, 'passenger');
      if (balance + amountKobo > this.config.WALLET_MAX_BALANCE_KOBO) {
        throw new AppException(ErrorCode.WALLET_LIMIT_EXCEEDED, 'Wallet limit reached', {
          details: { maxBalanceKobo: this.config.WALLET_MAX_BALANCE_KOBO },
        });
      }
    }
    return this.checkout(userId, 'wallet_topup', kind, amountKobo, returnTo, kind === 'driver');
  }

  /** Saves a card by charging a small amount, which goes into the passenger's wallet. */
  startCardLink(userId: string, returnTo: PaymentReturnTarget): Promise<CheckoutView> {
    return this.checkout(
      userId,
      'card_link',
      'passenger',
      this.config.CARD_LINK_AMOUNT_KOBO,
      returnTo,
      false,
    );
  }

  private async checkout(
    userId: string,
    purpose: 'wallet_topup' | 'card_link',
    kind: WalletKind,
    amountKobo: number,
    returnTo: PaymentReturnTarget,
    driverApp: boolean,
  ): Promise<CheckoutView> {
    const payment = await this.db
      .insertInto('payments')
      .values({
        payer_id: userId,
        method: 'card',
        purpose,
        wallet_kind: kind,
        amount_kobo: amountKobo,
        status: 'pending',
        provider: this.provider.name,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    // Our payment id is the provider's reference, so every answer maps back to one row.
    await this.db
      .updateTable('payments')
      .set({ provider_reference: payment.id })
      .where('id', '=', payment.id)
      .execute();
    const returnUrl =
      returnTo === 'web'
        ? this.config.PAYMENT_RETURN_URL_WEB
        : driverApp
          ? this.config.PAYMENT_RETURN_URL_DRIVER_APP
          : this.config.PAYMENT_RETURN_URL_APP;
    try {
      const { checkoutUrl } = await this.provider.initializeCheckout({
        reference: payment.id,
        email: await this.email(userId),
        amountKobo,
        returnUrl,
        metadata: { purpose, paymentId: payment.id },
      });
      return { payment: paymentView({ ...payment, provider_reference: payment.id }), checkoutUrl };
    } catch (err) {
      await this.db
        .updateTable('payments')
        .set({ status: 'failed', failure_reason: 'Payment provider unavailable' })
        .where('id', '=', payment.id)
        .execute();
      throw err;
    }
  }

  /**
   * The payer's view of one payment. With refresh, a pending payment is checked
   * with the provider first (server to server), so the app does not have to
   * wait for the webhook after returning from checkout.
   */
  async getPayment(userId: string, paymentId: string, refresh = false): Promise<PaymentView> {
    let row = await this.paymentRow(paymentId, userId);
    if (
      refresh &&
      row.status === 'pending' &&
      row.provider_reference &&
      row.provider === this.provider.name
    ) {
      const result = await this.provider.verifyCharge(row.provider_reference);
      if (result.status !== 'pending') {
        await this.applyCharge(result);
        row = await this.paymentRow(paymentId, userId);
      }
    }
    return paymentView(row);
  }

  private async paymentRow(paymentId: string, userId?: string): Promise<PaymentRow> {
    let q = this.db
      .selectFrom('payments as p')
      .leftJoin('payment_cards as c', 'c.id', 'p.card_id')
      .selectAll('p')
      .select(['c.brand as card_brand', 'c.last4 as card_last4'])
      .where('p.id', '=', paymentId);
    if (userId) q = q.where('p.payer_id', '=', userId);
    const row = await q.executeTakeFirst();
    if (!row) throw new AppException(ErrorCode.NOT_FOUND, 'Payment not found');
    return row;
  }

  /**
   * Applies the provider's answer about a charge (from a webhook, a verify call
   * or a card charge). Safe to call any number of times: a payment is settled
   * once, and only for the exact amount we asked for.
   */
  async applyCharge(charge: ChargeResult): Promise<void> {
    if (charge.status === 'pending' || !charge.reference) return;
    await this.db.transaction().execute(async (trx) => {
      const p = await trx
        .selectFrom('payments')
        .selectAll()
        .where('provider_reference', '=', charge.reference)
        .forUpdate()
        .executeTakeFirst();
      if (!p) {
        this.logger.warn(
          { reference: charge.reference },
          'Charge for an unknown payment reference',
        );
        return;
      }
      const amount = koboFromDb(p.amount_kobo);
      const topUp = p.purpose === 'wallet_topup' || p.purpose === 'card_link';

      if (charge.status !== 'success') {
        if (p.status !== 'pending') return;
        await trx
          .updateTable('payments')
          .set(
            topUp
              ? {
                  status: charge.status === 'abandoned' ? 'abandoned' : 'failed',
                  failure_reason: charge.message,
                }
              : // A ride's card was declined: the passenger owes it (collected from their next top-up).
                { status: 'outstanding', failure_reason: charge.message ?? 'Card declined' },
          )
          .where('id', '=', p.id)
          .execute();
        // Whatever is in the wallet goes towards a declined ride payment straight away.
        if (!topUp) await this.collectOutstanding(trx, p.payer_id);
        return;
      }

      if (charge.amountKobo !== amount) {
        // Never credit an amount we did not ask for; a person must look at this.
        this.logger.error(
          { paymentId: p.id, expected: amount, received: charge.amountKobo },
          'Charge amount does not match the payment',
        );
        await trx
          .updateTable('payments')
          .set({ failure_reason: `Amount mismatch: provider reported ${charge.amountKobo}` })
          .where('id', '=', p.id)
          .execute();
        return;
      }

      const fee = Math.min(charge.feeKobo, amount);
      const received = [
        debit({ system: 'paystack_balance' }, amount - fee),
        debit({ system: 'provider_fees' }, fee),
      ];
      let posted;
      if (topUp) {
        // A late success after we gave up on the checkout still counts.
        posted = await this.ledger.post(trx, {
          kind: 'wallet_topup',
          reference: `payment:${p.id}:charge`,
          paymentId: p.id,
          memo: p.purpose === 'card_link' ? 'Card saved' : 'Top-up',
          lines: [...received, credit({ user: p.payer_id, kind: p.wallet_kind! }, amount)],
        });
      } else {
        // A ride fare or fee charged to a card settles what the passenger owed.
        // If they meanwhile paid part of it from their wallet, that part goes back to the wallet.
        const stillOwed = p.status === 'succeeded' ? 0 : koboFromDb(p.outstanding_kobo);
        posted = await this.ledger.post(trx, {
          kind: 'card_charge',
          reference: `payment:${p.id}:charge`,
          paymentId: p.id,
          rideId: p.ride_id,
          memo:
            stillOwed < amount
              ? 'Card payment arrived after you paid from your wallet: returned'
              : null,
          lines: [
            ...received,
            credit({ system: 'passenger_receivables' }, stillOwed),
            credit({ user: p.payer_id, kind: 'passenger' }, amount - stillOwed),
          ],
        });
      }
      if (!posted?.created) return;
      await trx
        .updateTable('payments')
        .set({
          status: 'succeeded',
          fee_kobo: fee,
          outstanding_kobo: 0,
          failure_reason: null,
          paid_at: charge.paidAt ?? new Date(),
        })
        .where('id', '=', p.id)
        .execute();

      if (p.purpose === 'card_link' && charge.authorization?.reusable) {
        await this.saveCard(trx, p.payer_id, charge.authorization);
      }
      if (p.wallet_kind === 'passenger') await this.collectOutstanding(trx, p.payer_id);
    });
  }

  private async saveCard(
    trx: Kysely<Database>,
    userId: string,
    a: NonNullable<ChargeResult['authorization']>,
  ) {
    const existing = await trx
      .selectFrom('payment_cards')
      .select('id')
      .where('user_id', '=', userId)
      .where('signature', '=', a.signature)
      .where('removed_at', 'is', null)
      .executeTakeFirst();
    const values = {
      authorization_code_encrypted: this.encryption.encrypt(
        a.authorizationCode,
        cardContext(userId),
      ),
      brand: a.brand.slice(0, 30),
      last4: a.last4,
      exp_month: a.expMonth,
      exp_year: a.expYear,
      bank: a.bank?.slice(0, 80) ?? null,
    };
    if (existing) {
      await trx.updateTable('payment_cards').set(values).where('id', '=', existing.id).execute();
    } else {
      await trx
        .insertInto('payment_cards')
        .values({ user_id: userId, signature: a.signature, ...values })
        .execute();
    }
  }

  /**
   * Pays what the passenger owes from their wallet, oldest first, as far as
   * the balance goes. Called after every top-up and before booking.
   */
  async collectOutstanding(trx: Kysely<Database>, userId: string): Promise<number> {
    const owed = await trx
      .selectFrom('payments')
      .select(['id', 'ride_id', 'outstanding_kobo'])
      .where('payer_id', '=', userId)
      .where('status', '=', 'outstanding')
      .orderBy('created_at')
      .forUpdate()
      .execute();
    if (owed.length === 0) return 0;
    let { balanceKobo } = await this.ledger.lockUserWallet(trx, userId, 'passenger');
    let collected = 0;
    for (const p of owed) {
      if (balanceKobo <= 0) break;
      const due = koboFromDb(p.outstanding_kobo);
      const take = Math.min(due, balanceKobo);
      await this.ledger.post(trx, {
        kind: 'outstanding_collection',
        // Outstanding only goes down, so (payment, amount still due) is unique.
        reference: `payment:${p.id}:collect:${due}`,
        paymentId: p.id,
        rideId: p.ride_id,
        memo: 'Paid what you owed',
        lines: [
          debit({ user: userId, kind: 'passenger' }, take),
          credit({ system: 'passenger_receivables' }, take),
        ],
      });
      await trx
        .updateTable('payments')
        .set({
          outstanding_kobo: due - take,
          ...(due - take === 0 && { status: 'succeeded' as const, paid_at: new Date() }),
        })
        .where('id', '=', p.id)
        .execute();
      balanceKobo -= take;
      collected += take;
    }
    return collected;
  }

  async owedKobo(userId: string, db: Kysely<Database> = this.db): Promise<number> {
    const r = await db
      .selectFrom('payments')
      .select(sql<string>`coalesce(sum(outstanding_kobo), 0)`.as('owed'))
      .where('payer_id', '=', userId)
      .where('status', '=', 'outstanding')
      .executeTakeFirst();
    return koboFromDb(r?.owed ?? 0);
  }

  // --- Wallet ---

  async wallet(userId: string): Promise<WalletView> {
    const [balanceKobo, owedKobo, held] = await Promise.all([
      this.ledger.balance(userId, 'passenger'),
      this.owedKobo(userId),
      this.db
        .selectFrom('rides as r')
        .select(sql<string>`coalesce(sum(r.quoted_total_kobo), 0)`.as('held'))
        .where('r.passenger_id', '=', userId)
        .where('r.payment_method', '=', 'wallet')
        .where('r.status', 'in', [
          'requested',
          'searching',
          'driver_assigned',
          'driver_arrived',
          'in_progress',
        ])
        .executeTakeFirst(),
    ]);
    return {
      balanceKobo,
      owedKobo,
      heldKobo: koboFromDb(held?.held ?? 0),
      limits: {
        topUpMinKobo: this.config.WALLET_TOPUP_MIN_KOBO,
        topUpMaxKobo: this.config.WALLET_TOPUP_MAX_KOBO,
        maxBalanceKobo: this.config.WALLET_MAX_BALANCE_KOBO,
        cardCheckKobo: this.config.CARD_LINK_AMOUNT_KOBO,
      },
    };
  }

  /** The wallet's lines, newest first. Amounts are positive for money in. */
  async statement(
    userId: string,
    kind: WalletKind,
    page: { cursor?: string | undefined; limit: number },
  ): Promise<{ items: WalletEntryView[]; nextCursor: string | null }> {
    let q = this.db
      .selectFrom('wallet_transactions as t')
      .innerJoin('wallets as w', 'w.id', 't.wallet_id')
      .innerJoin('ledger_journals as j', 'j.id', 't.journal_id')
      .select([
        't.id',
        't.seq',
        't.amount_kobo',
        't.balance_after_kobo',
        't.created_at',
        'j.kind',
        'j.ride_id',
        'j.memo',
      ])
      .where('w.owner_id', '=', userId)
      .where('w.kind', '=', kind)
      .orderBy('t.seq', 'desc')
      .limit(page.limit + 1);
    const cursor = decodeCursor(page.cursor);
    if (cursor) q = q.where('t.seq', '<', cursor.id as never);
    const rows = await q.execute();
    const items = rows.slice(0, page.limit);
    const last = items[items.length - 1];
    return {
      items: items.map((r) => ({
        id: r.id,
        kind: (r.kind === 'card_charge' ||
        r.kind === 'payout_completed' ||
        r.kind === 'refund_completed' ||
        r.kind === 'chargeback'
          ? 'adjustment'
          : r.kind) as WalletEntryKind,
        // User wallets are credit-normal: a credit (negative line) is money in.
        amountKobo: -koboFromDb(r.amount_kobo),
        balanceAfterKobo: koboFromDb(r.balance_after_kobo),
        rideId: r.ride_id,
        memo: r.memo,
        createdAt: r.created_at.toISOString(),
      })),
      nextCursor:
        rows.length > page.limit && last ? encodeCursor({ ts: '', id: String(last.seq) }) : null,
    };
  }

  // --- Cards ---

  async cards(userId: string): Promise<SavedCardView[]> {
    const rows = await this.db
      .selectFrom('payment_cards')
      .selectAll()
      .where('user_id', '=', userId)
      .where('removed_at', 'is', null)
      .orderBy('created_at', 'desc')
      .execute();
    const now = new Date();
    return rows.map((c) => ({
      id: c.id,
      brand: c.brand,
      last4: c.last4,
      expMonth: c.exp_month,
      expYear: c.exp_year,
      bank: c.bank,
      expired:
        c.exp_year < now.getUTCFullYear() ||
        (c.exp_year === now.getUTCFullYear() && c.exp_month < now.getUTCMonth() + 1),
    }));
  }

  async removeCard(userId: string, cardId: string): Promise<void> {
    const r = await this.db
      .updateTable('payment_cards')
      .set({ removed_at: new Date() })
      .where('id', '=', cardId)
      .where('user_id', '=', userId)
      .where('removed_at', 'is', null)
      .executeTakeFirst();
    if (Number(r.numUpdatedRows) === 0)
      throw new AppException(ErrorCode.NOT_FOUND, 'Card not found');
  }

  /** The card's provider authorization, for charging it. */
  async cardAuthorization(
    db: Kysely<Database>,
    userId: string,
    cardId: string,
    includeRemoved = false,
  ): Promise<string> {
    let q = db
      .selectFrom('payment_cards')
      .select('authorization_code_encrypted')
      .where('id', '=', cardId)
      .where('user_id', '=', userId);
    if (!includeRemoved) q = q.where('removed_at', 'is', null);
    const c = await q.executeTakeFirst();
    if (!c) throw new AppException(ErrorCode.CARD_NOT_FOUND, 'Card not found');
    return this.encryption.decrypt(c.authorization_code_encrypted, cardContext(userId));
  }

  /** Paystack needs an email; we never send phone numbers. */
  async email(userId: string): Promise<string> {
    const u = await this.db
      .selectFrom('users')
      .select(['email', 'email_verified_at'])
      .where('id', '=', userId)
      .executeTakeFirst();
    return u?.email && u.email_verified_at
      ? u.email
      : `${userId}@${this.config.PAYMENT_PLACEHOLDER_EMAIL_DOMAIN}`;
  }
}
