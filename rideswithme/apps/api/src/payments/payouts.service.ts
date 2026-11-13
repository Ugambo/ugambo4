import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Kysely, type Selectable, sql } from 'kysely';
import {
  type DriverWalletView,
  type EarningsPeriod,
  ErrorCode,
  type PayoutView,
} from '@rideswithme/shared-types';
import { AppException } from '../common/app-exception';
import { FieldEncryption } from '../common/crypto/field-encryption';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB } from '../database/database.module';
import { koboFromDb } from '../database/geo';
import type { Database, PayoutsTable } from '../database/types';
import { payoutContext } from '../drivers/driver-onboarding.service';
import { credit, debit, LedgerService } from './ledger.service';
import { PAYMENT_PROVIDER, type PaymentProvider, type TransferResult } from './payment.provider';

export function payoutView(p: Selectable<PayoutsTable>): PayoutView {
  return {
    id: p.id,
    amountKobo: koboFromDb(p.amount_kobo),
    feeKobo: koboFromDb(p.fee_kobo),
    status: p.status,
    account: { bankCode: p.bank_code, last4: p.account_last4, name: p.account_name },
    failureReason: p.failure_reason,
    requestedAt: p.requested_at.toISOString(),
    completedAt: p.completed_at ? new Date(p.completed_at).toISOString() : null,
  };
}

/** Start of today and of this week (Monday) in Nigerian time (UTC+1, no daylight saving). */
export function lagosPeriodStarts(now: Date): { today: Date; week: Date } {
  const lagos = new Date(now.getTime() + 3_600_000);
  const today = new Date(
    Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate()) - 3_600_000,
  );
  const sinceMonday = (lagos.getUTCDay() + 6) % 7;
  return { today, week: new Date(today.getTime() - sinceMonday * 86_400_000) };
}

/**
 * The driver's wallet and withdrawals. A payout is taken from the wallet when
 * requested and sent to the driver's bank by provider transfer; if the
 * transfer fails or is reversed the money goes back to the wallet.
 */
@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly ledger: LedgerService,
    private readonly encryption: FieldEncryption,
  ) {}

  async driverWallet(driverId: string, now = new Date()): Promise<DriverWalletView> {
    const profile = await this.db
      .selectFrom('driver_profiles')
      .select([
        'payout_bank_code',
        'payout_account_last4',
        'payout_account_name',
        'payout_account_changed_at',
      ])
      .where('user_id', '=', driverId)
      .executeTakeFirst();
    if (!profile)
      throw new AppException(ErrorCode.DRIVER_NOT_REGISTERED, 'Driver registration not started');
    const balance = await this.ledger.balance(driverId, 'driver');
    const starts = lagosPeriodStarts(now);
    const [today, week] = await Promise.all([
      this.earnings(driverId, starts.today),
      this.earnings(driverId, starts.week),
    ]);
    return {
      balanceKobo: balance,
      debtLimitKobo: this.config.DRIVER_DEBT_LIMIT_KOBO,
      canGoOnline: -balance <= this.config.DRIVER_DEBT_LIMIT_KOBO,
      payout: {
        minKobo: this.config.PAYOUT_MIN_KOBO,
        availableKobo: Math.max(0, balance),
        pausedUntil:
          this.pausedUntil(profile.payout_account_changed_at, now)?.toISOString() ?? null,
        account:
          profile.payout_bank_code && profile.payout_account_last4 && profile.payout_account_name
            ? {
                bankCode: profile.payout_bank_code,
                last4: profile.payout_account_last4,
                name: profile.payout_account_name,
              }
            : null,
      },
      earnings: { today, week },
      limits: {
        topUpMinKobo: this.config.WALLET_TOPUP_MIN_KOBO,
        topUpMaxKobo: this.config.WALLET_TOPUP_MAX_KOBO,
      },
    };
  }

  private pausedUntil(changedAt: Date | null, now: Date): Date | null {
    if (!changedAt) return null;
    const until = new Date(
      changedAt.getTime() + this.config.PAYOUT_ACCOUNT_CHANGE_HOLD_HOURS * 3_600_000,
    );
    return until > now ? until : null;
  }

  /** Completed trips since `from`: what the driver kept, commission and booking fees, and cash taken. */
  private async earnings(driverId: string, from: Date): Promise<EarningsPeriod> {
    const r = await this.db
      .selectFrom('commissions as c')
      .innerJoin('rides as r', 'r.id', 'c.ride_id')
      .select([
        sql<string>`count(*)`.as('trips'),
        sql<string>`coalesce(sum(c.fare_kobo - c.booking_fee_kobo - c.commission_kobo), 0)`.as(
          'earnings',
        ),
        sql<string>`coalesce(sum(c.commission_kobo), 0)`.as('commission'),
        sql<string>`coalesce(sum(c.booking_fee_kobo), 0)`.as('fees'),
        sql<string>`coalesce(sum(c.fare_kobo) FILTER (WHERE r.payment_method = 'cash'), 0)`.as(
          'cash',
        ),
      ])
      .where('c.driver_id', '=', driverId)
      .where('r.completed_at', '>=', from)
      .executeTakeFirstOrThrow();
    return {
      trips: Number(r.trips),
      earningsKobo: koboFromDb(r.earnings),
      commissionKobo: koboFromDb(r.commission),
      bookingFeesKobo: koboFromDb(r.fees),
      cashCollectedKobo: koboFromDb(r.cash),
    };
  }

  async list(driverId: string): Promise<PayoutView[]> {
    const rows = await this.db
      .selectFrom('payouts')
      .selectAll()
      .where('driver_id', '=', driverId)
      .orderBy('requested_at', 'desc')
      .limit(50)
      .execute();
    return rows.map(payoutView);
  }

  /** Takes the amount from the wallet and starts the bank transfer. One payout at a time. */
  async request(driverId: string, amountKobo: number, now = new Date()): Promise<PayoutView> {
    const id = randomUUID();
    await this.db.transaction().execute(async (trx) => {
      const profile = await trx
        .selectFrom('driver_profiles')
        .select([
          'status',
          'payout_bank_code',
          'payout_account_last4',
          'payout_account_name',
          'payout_account_changed_at',
        ])
        .where('user_id', '=', driverId)
        .forUpdate()
        .executeTakeFirst();
      if (!profile)
        throw new AppException(ErrorCode.DRIVER_NOT_REGISTERED, 'Driver registration not started');
      if (
        profile.status !== 'approved' ||
        !profile.payout_bank_code ||
        !profile.payout_account_last4 ||
        !profile.payout_account_name
      ) {
        throw new AppException(
          ErrorCode.PAYOUT_UNAVAILABLE,
          'Payouts need an approved driver with a bank account',
        );
      }
      const paused = this.pausedUntil(profile.payout_account_changed_at, now);
      if (paused) {
        throw new AppException(
          ErrorCode.PAYOUT_ACCOUNT_RECENTLY_CHANGED,
          'Payouts are paused after a bank account change',
          {
            details: { pausedUntil: paused.toISOString() },
          },
        );
      }
      if (amountKobo < this.config.PAYOUT_MIN_KOBO) {
        throw new AppException(ErrorCode.PAYOUT_UNAVAILABLE, 'Below the minimum payout', {
          details: { minKobo: this.config.PAYOUT_MIN_KOBO },
        });
      }
      const open = await trx
        .selectFrom('payouts')
        .select('id')
        .where('driver_id', '=', driverId)
        .where('status', 'in', ['pending', 'processing'])
        .executeTakeFirst();
      if (open)
        throw new AppException(ErrorCode.PAYOUT_UNAVAILABLE, 'A payout is already on its way');
      const { balanceKobo } = await this.ledger.lockUserWallet(trx, driverId, 'driver');
      if (amountKobo > balanceKobo) {
        throw new AppException(ErrorCode.PAYOUT_UNAVAILABLE, 'More than your balance', {
          details: { availableKobo: Math.max(0, balanceKobo) },
        });
      }
      await trx
        .insertInto('payouts')
        .values({
          id,
          driver_id: driverId,
          amount_kobo: amountKobo,
          bank_code: profile.payout_bank_code,
          account_last4: profile.payout_account_last4,
          account_name: profile.payout_account_name,
          provider: this.provider.name,
          provider_reference: id,
        })
        .execute();
      await this.ledger.post(trx, {
        kind: 'payout',
        reference: `payout:${id}`,
        payoutId: id,
        memo: 'Withdrawal to your bank',
        lines: [
          debit({ user: driverId, kind: 'driver' }, amountKobo),
          credit({ system: 'payouts_in_transit' }, amountKobo),
        ],
      });
    });
    await this.send(id);
    const row = await this.db
      .selectFrom('payouts')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    return payoutView(row);
  }

  /**
   * Asks the provider to send a pending payout. If the provider cannot be
   * reached the payout stays pending and the reconciliation job tries again.
   */
  async send(payoutId: string): Promise<void> {
    const p = await this.db
      .selectFrom('payouts')
      .selectAll()
      .where('id', '=', payoutId)
      .executeTakeFirst();
    if (!p || p.status !== 'pending') return;
    try {
      const recipientCode = await this.recipient(p.driver_id);
      const result = await this.provider.transfer({
        reference: p.provider_reference,
        recipientCode,
        amountKobo: koboFromDb(p.amount_kobo),
        reason: 'RideswithMe earnings',
      });
      if (result.status === 'pending') {
        await this.db
          .updateTable('payouts')
          .set({ status: 'processing', transfer_code: result.transferCode })
          .where('id', '=', payoutId)
          .where('status', '=', 'pending')
          .execute();
      } else {
        await this.applyTransfer(result);
      }
    } catch (err) {
      this.logger.warn(
        { err: (err as Error).message, payoutId },
        'Payout not sent yet; will retry',
      );
    }
  }

  private async recipient(driverId: string): Promise<string> {
    const p = await this.db
      .selectFrom('driver_profiles')
      .select([
        'payout_recipient_code',
        'payout_bank_code',
        'payout_account_number_encrypted',
        'payout_account_name',
      ])
      .where('user_id', '=', driverId)
      .executeTakeFirstOrThrow();
    if (p.payout_recipient_code) return p.payout_recipient_code;
    const { recipientCode } = await this.provider.createTransferRecipient({
      name: p.payout_account_name!,
      accountNumber: this.encryption.decrypt(
        p.payout_account_number_encrypted!,
        payoutContext(driverId),
      ),
      bankCode: p.payout_bank_code!,
    });
    await this.db
      .updateTable('driver_profiles')
      .set({ payout_recipient_code: recipientCode })
      .where('user_id', '=', driverId)
      .execute();
    return recipientCode;
  }

  /** Applies the provider's answer about a transfer. Safe to repeat. */
  async applyTransfer(t: TransferResult): Promise<void> {
    if (t.status === 'pending') return;
    await this.db.transaction().execute(async (trx) => {
      const p = await trx
        .selectFrom('payouts')
        .selectAll()
        .where('provider_reference', '=', t.reference)
        .forUpdate()
        .executeTakeFirst();
      if (!p) {
        this.logger.warn({ reference: t.reference }, 'Transfer for an unknown payout');
        return;
      }
      const amount = koboFromDb(p.amount_kobo);
      const driver = { user: p.driver_id, kind: 'driver' as const };
      const inFlight = p.status === 'pending' || p.status === 'processing';

      if (t.status === 'success' && inFlight) {
        const fee = t.feeKobo;
        await this.ledger.post(trx, {
          kind: 'payout_completed',
          reference: `payout:${p.id}:completed`,
          payoutId: p.id,
          lines: [
            debit({ system: 'payouts_in_transit' }, amount),
            debit({ system: 'provider_fees' }, fee),
            credit({ system: 'paystack_balance' }, amount + fee),
          ],
        });
        await trx
          .updateTable('payouts')
          .set({
            status: 'succeeded',
            fee_kobo: fee,
            transfer_code: t.transferCode ?? p.transfer_code,
            completed_at: new Date(),
          })
          .where('id', '=', p.id)
          .execute();
      } else if ((t.status === 'failed' || t.status === 'reversed') && inFlight) {
        await this.ledger.post(trx, {
          kind: 'payout_returned',
          reference: `payout:${p.id}:returned`,
          payoutId: p.id,
          memo: 'Withdrawal could not be completed: returned',
          lines: [debit({ system: 'payouts_in_transit' }, amount), credit(driver, amount)],
        });
        await trx
          .updateTable('payouts')
          .set({
            status: t.status,
            failure_reason: t.message ?? 'Transfer failed',
            completed_at: new Date(),
          })
          .where('id', '=', p.id)
          .execute();
      } else if (t.status === 'reversed' && p.status === 'succeeded') {
        // The bank sent it back after it had arrived: the money is ours again, so it goes back to the driver.
        await this.ledger.post(trx, {
          kind: 'payout_returned',
          reference: `payout:${p.id}:reversed`,
          payoutId: p.id,
          memo: 'Withdrawal reversed by the bank: returned',
          lines: [debit({ system: 'paystack_balance' }, amount), credit(driver, amount)],
        });
        await trx
          .updateTable('payouts')
          .set({ status: 'reversed', failure_reason: t.message ?? 'Reversed by the bank' })
          .where('id', '=', p.id)
          .execute();
      }
    });
  }
}
