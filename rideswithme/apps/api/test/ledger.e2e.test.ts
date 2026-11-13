import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ErrorCode } from '@rideswithme/shared-types';
import { AppException } from '../src/common/app-exception';
import { credit, debit, LedgerService } from '../src/payments/ledger.service';
import { createHarness, type Harness, nextPhone, resetState } from './harness';

let h: Harness;
let ledger: LedgerService;
beforeAll(async () => {
  h = await createHarness();
  ledger = h.app.get(LedgerService);
});
afterAll(async () => h.close());
beforeEach(async () => resetState(h));

async function user(): Promise<string> {
  const u = await h.db
    .insertInto('users')
    .values({ phone_e164: nextPhone() })
    .returning('id')
    .executeTakeFirstOrThrow();
  return u.id;
}

/** A top-up through Paystack: money arrives at Paystack less its fee; the wallet gets it all. */
async function topUp(
  userId: string,
  amount: number,
  fee = 0,
  reference = `topup:${userId}:${amount}`,
) {
  return h.db.transaction().execute((trx) =>
    ledger.post(trx, {
      kind: 'wallet_topup',
      reference,
      lines: [
        debit({ system: 'paystack_balance' }, amount - fee),
        debit({ system: 'provider_fees' }, fee),
        credit({ user: userId, kind: 'passenger' }, amount),
      ],
    }),
  );
}

const spend = (userId: string, amount: number, reference: string) =>
  h.db.transaction().execute((trx) =>
    ledger.post(trx, {
      kind: 'ride_hold',
      reference,
      lines: [
        debit({ user: userId, kind: 'passenger' }, amount),
        credit({ system: 'ride_holds' }, amount),
      ],
    }),
  );

async function expectLedgerConsistent() {
  expect(await ledger.mismatches()).toEqual([]);
  const total = await sql<{
    s: string | null;
  }>`SELECT sum(amount_kobo) AS s FROM wallet_transactions`.execute(h.db);
  expect(Number(total.rows[0]?.s ?? 0)).toBe(0);
}

describe('ledger', () => {
  it('posts balanced journals and keeps balances in step with the lines', async () => {
    const u = await user();
    await topUp(u, 100_000, 1_600);
    expect(await ledger.balance(u, 'passenger')).toBe(100_000);
    expect(await ledger.systemBalance('paystack_balance')).toBe(98_400);
    expect(await ledger.systemBalance('provider_fees')).toBe(1_600);
    await spend(u, 30_000, 'hold-1');
    expect(await ledger.balance(u, 'passenger')).toBe(70_000);
    expect(await ledger.systemBalance('ride_holds')).toBe(30_000);
    await expectLedgerConsistent();
  });

  it('posts each reference once', async () => {
    const u = await user();
    const first = await topUp(u, 50_000, 0, 'same-ref');
    const again = await topUp(u, 50_000, 0, 'same-ref');
    expect(first?.created).toBe(true);
    expect(again).toEqual({ journalId: first!.journalId, created: false });
    expect(await ledger.balance(u, 'passenger')).toBe(50_000);
  });

  it('posts the same reference once even when both requests race', async () => {
    const u = await user();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => topUp(u, 10_000, 0, 'race-ref')),
    );
    expect(results.filter((r) => r?.created)).toHaveLength(1);
    expect(await ledger.balance(u, 'passenger')).toBe(10_000);
    await expectLedgerConsistent();
  });

  it('refuses journals that do not balance', async () => {
    const u = await user();
    await expect(
      h.db.transaction().execute((trx) =>
        ledger.post(trx, {
          kind: 'adjustment',
          reference: 'bad',
          lines: [
            credit({ user: u, kind: 'passenger' }, 100),
            debit({ system: 'platform_revenue' }, 99),
          ],
        }),
      ),
    ).rejects.toThrow(/does not balance/);
    await expect(
      h.db.transaction().execute((trx) =>
        ledger.post(trx, {
          kind: 'adjustment',
          reference: 'bad2',
          lines: [credit({ system: 'platform_revenue' }, 0.5)],
        }),
      ),
    ).rejects.toThrow(/integer kobo/);
  });

  it('never lets a passenger wallet go below zero, however many spends race', async () => {
    const u = await user();
    await topUp(u, 1_000);
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) => spend(u, 100, `race-${i}`)),
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    const refused = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(10);
    expect(refused).toHaveLength(10);
    for (const r of refused) {
      expect(r.reason).toBeInstanceOf(AppException);
      expect((r.reason as AppException).code).toBe(ErrorCode.WALLET_INSUFFICIENT_FUNDS);
    }
    expect(await ledger.balance(u, 'passenger')).toBe(0);
    await expectLedgerConsistent();
  });

  it('lets driver wallets go negative (commission owed on cash trips)', async () => {
    const d = await user();
    await h.db.transaction().execute((trx) =>
      ledger.post(trx, {
        kind: 'cash_commission',
        reference: 'commission-1',
        lines: [
          debit({ user: d, kind: 'driver' }, 45_000),
          credit({ system: 'platform_revenue' }, 45_000),
        ],
      }),
    );
    expect(await ledger.balance(d, 'driver')).toBe(-45_000);
  });

  it('does not deadlock when transfers between two wallets race in both directions', async () => {
    const a = await user();
    const b = await user();
    await topUp(a, 100_000);
    await topUp(b, 100_000);
    const move = (from: string, to: string, i: number) =>
      h.db.transaction().execute((trx) =>
        ledger.post(trx, {
          kind: 'adjustment',
          reference: `move-${from}-${i}`,
          lines: [
            debit({ user: from, kind: 'passenger' }, 1_000),
            credit({ user: to, kind: 'passenger' }, 1_000),
          ],
        }),
      );
    await Promise.all(Array.from({ length: 15 }, (_, i) => [move(a, b, i), move(b, a, i)]).flat());
    expect(await ledger.balance(a, 'passenger')).toBe(100_000);
    expect(await ledger.balance(b, 'passenger')).toBe(100_000);
    await expectLedgerConsistent();
  });

  it('cannot be edited after the fact', async () => {
    const u = await user();
    await topUp(u, 1_000);
    await expect(sql`UPDATE wallet_transactions SET amount_kobo = 1`.execute(h.db)).rejects.toThrow(
      /append-only/,
    );
    await expect(sql`DELETE FROM ledger_journals`.execute(h.db)).rejects.toThrow(/append-only/);
    await expect(sql`UPDATE wallets SET balance_kobo = 999999`.execute(h.db)).rejects.toThrow(
      /ledger lines/,
    );
  });
});
