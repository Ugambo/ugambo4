import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, sql } from 'kysely';
import { ErrorCode } from '@rideswithme/shared-types';
import { AppException } from '../common/app-exception';
import { DB } from '../database/database.module';
import { koboFromDb } from '../database/geo';
import type { Database, JournalKind, SystemAccountKey, WalletKind } from '../database/types';

/** Which account a line touches. User wallets are created on first use. */
export type WalletRef =
  { id: string } | { system: SystemAccountKey } | { user: string; kind: WalletKind };

/** One side of a journal. Debits are positive, credits negative. */
export interface LedgerLine {
  wallet: WalletRef;
  amountKobo: number;
}

export const debit = (wallet: WalletRef, amountKobo: number): LedgerLine => ({
  wallet,
  amountKobo,
});
export const credit = (wallet: WalletRef, amountKobo: number): LedgerLine => ({
  wallet,
  amountKobo: -amountKobo,
});

export interface JournalInput {
  kind: JournalKind;
  /** Unique per business event; posting the same reference again does nothing. */
  reference: string;
  rideId?: string | null;
  paymentId?: string | null;
  payoutId?: string | null;
  refundId?: string | null;
  disputeId?: string | null;
  memo?: string | null;
  createdBy?: string | null;
  lines: LedgerLine[];
}

/** SQLSTATE raised by the posting trigger when a wallet would go below its minimum. */
const INSUFFICIENT_FUNDS = 'RWM01';

export function isInsufficientFunds(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === INSUFFICIENT_FUNDS;
}

/**
 * The only way application code moves money. The database enforces the rules
 * (balanced journals, append-only lines, balances maintained by trigger, wallet
 * minimums); this service builds journals and gives errors useful names.
 * Always call it inside the caller's transaction.
 */
@Injectable()
export class LedgerService {
  constructor(@Inject(DB) private readonly db: Kysely<Database>) {}

  /**
   * Posts a journal. Lines on the same wallet are netted and zero lines dropped;
   * the rest must sum to zero. Returns the journal (created: false when the
   * reference was already posted), or null when nothing was left to post.
   */
  async post(
    trx: Kysely<Database>,
    input: JournalInput,
  ): Promise<{ journalId: string; created: boolean } | null> {
    for (const l of input.lines) {
      if (!Number.isSafeInteger(l.amountKobo))
        throw new Error(`Ledger amount must be integer kobo: ${l.amountKobo}`);
    }
    const ids = await Promise.all(input.lines.map((l) => this.walletId(trx, l.wallet)));
    const net = new Map<string, number>();
    input.lines.forEach((l, i) => net.set(ids[i]!, (net.get(ids[i]!) ?? 0) + l.amountKobo));
    // Lock wallets in one order everywhere, so concurrent journals cannot deadlock.
    const lines = [...net.entries()]
      .filter(([, a]) => a !== 0)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    const total = lines.reduce((s, [, a]) => s + a, 0);
    if (total !== 0) throw new Error(`Journal ${input.reference} does not balance (${total})`);

    const existing = await trx
      .selectFrom('ledger_journals')
      .select('id')
      .where('reference', '=', input.reference)
      .executeTakeFirst();
    if (existing) return { journalId: existing.id, created: false };
    if (lines.length === 0) return null;
    if (lines.length === 1) throw new Error(`Journal ${input.reference} needs two sides`);

    const inserted = await trx
      .insertInto('ledger_journals')
      .values({
        kind: input.kind,
        reference: input.reference,
        ride_id: input.rideId ?? null,
        payment_id: input.paymentId ?? null,
        payout_id: input.payoutId ?? null,
        refund_id: input.refundId ?? null,
        dispute_id: input.disputeId ?? null,
        memo: input.memo ?? null,
        created_by: input.createdBy ?? null,
      })
      .onConflict((oc) => oc.column('reference').doNothing())
      .returning('id')
      .executeTakeFirst();
    if (!inserted) {
      // Another transaction posted the same reference first.
      const row = await trx
        .selectFrom('ledger_journals')
        .select('id')
        .where('reference', '=', input.reference)
        .executeTakeFirstOrThrow();
      return { journalId: row.id, created: false };
    }
    try {
      for (const [walletId, amount] of lines) {
        await trx
          .insertInto('wallet_transactions')
          .values({ journal_id: inserted.id, wallet_id: walletId, amount_kobo: amount })
          .execute();
      }
    } catch (err) {
      if (isInsufficientFunds(err))
        throw new AppException(ErrorCode.WALLET_INSUFFICIENT_FUNDS, 'Insufficient wallet balance');
      throw err;
    }
    return { journalId: inserted.id, created: true };
  }

  /** A user's wallet, created on first use (passenger wallets may not go below zero). */
  async userWallet(
    trx: Kysely<Database>,
    userId: string,
    kind: WalletKind,
  ): Promise<{ id: string; balanceKobo: number }> {
    await trx
      .insertInto('wallets')
      .values({
        owner_id: userId,
        kind,
        normal_side: 'credit',
        min_balance_kobo: kind === 'passenger' ? 0 : null,
      })
      .onConflict((oc) => oc.columns(['owner_id', 'kind']).doNothing())
      .execute();
    const w = await trx
      .selectFrom('wallets')
      .select(['id', 'balance_kobo'])
      .where('owner_id', '=', userId)
      .where('kind', '=', kind)
      .executeTakeFirstOrThrow();
    return { id: w.id, balanceKobo: koboFromDb(w.balance_kobo) };
  }

  /** Locks a user's wallet for the rest of the transaction and returns its balance. */
  async lockUserWallet(
    trx: Kysely<Database>,
    userId: string,
    kind: WalletKind,
  ): Promise<{ id: string; balanceKobo: number }> {
    const { id } = await this.userWallet(trx, userId, kind);
    const w = await trx
      .selectFrom('wallets')
      .select('balance_kobo')
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirstOrThrow();
    return { id, balanceKobo: koboFromDb(w.balance_kobo) };
  }

  /** Current balance (0 for a wallet that does not exist yet). */
  async balance(userId: string, kind: WalletKind, db: Kysely<Database> = this.db): Promise<number> {
    const w = await db
      .selectFrom('wallets')
      .select('balance_kobo')
      .where('owner_id', '=', userId)
      .where('kind', '=', kind)
      .executeTakeFirst();
    return w ? koboFromDb(w.balance_kobo) : 0;
  }

  async systemBalance(key: SystemAccountKey, db: Kysely<Database> = this.db): Promise<number> {
    const w = await db
      .selectFrom('wallets')
      .select('balance_kobo')
      .where('system_key', '=', key)
      .executeTakeFirstOrThrow();
    return koboFromDb(w.balance_kobo);
  }

  /** Total wallet money held for a ride (what releasing its hold would return). */
  async heldForRide(trx: Kysely<Database>, rideId: string): Promise<number> {
    const r = await trx
      .selectFrom('wallet_transactions as t')
      .innerJoin('ledger_journals as j', 'j.id', 't.journal_id')
      .innerJoin('wallets as w', 'w.id', 't.wallet_id')
      .select(sql<string>`coalesce(-sum(t.amount_kobo), 0)`.as('held'))
      .where('j.ride_id', '=', rideId)
      .where('w.system_key', '=', 'ride_holds')
      .executeTakeFirst();
    return koboFromDb(r?.held ?? 0);
  }

  /** Wallets whose stored balance differs from their lines (always empty unless something is badly wrong). */
  async mismatches(): Promise<{ wallet_id: string; stored_kobo: string; derived_kobo: string }[]> {
    const r = await sql<{
      wallet_id: string;
      stored_kobo: string;
      derived_kobo: string;
    }>`SELECT * FROM ledger_balance_mismatches()`.execute(this.db);
    return r.rows;
  }

  private async walletId(trx: Kysely<Database>, ref: WalletRef): Promise<string> {
    if ('id' in ref) return ref.id;
    if ('system' in ref) {
      const w = await trx
        .selectFrom('wallets')
        .select('id')
        .where('system_key', '=', ref.system)
        .executeTakeFirstOrThrow();
      return w.id;
    }
    return (await this.userWallet(trx, ref.user, ref.kind)).id;
  }
}
