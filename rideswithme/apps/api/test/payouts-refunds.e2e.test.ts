import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DisputeView, PayoutView, RefundView } from '@rideswithme/shared-types';
import { fakeTransferFee } from '../src/payments/fake.provider';
import { WebhooksService } from '../src/payments/webhooks.service';
import { createHarness, type Harness, nextPhone, resetState, signInWithMfa } from './harness';
import {
  acceptedRide,
  addCard,
  balance,
  expectLedgerConsistent,
  fake,
  finishRide,
  system,
  topUp,
} from './payment-fixtures';
import { approvedDriver, passenger, seedCity } from './ride-fixtures';

let h: Harness;
let superAdmin: { auth: string; userId: string };
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h.close());
beforeEach(async () => {
  await resetState(h);
  await seedCity(h);
  h.app.get(WebhooksService).onModuleInit();
  superAdmin = await signInWithMfa(h, nextPhone(), 'super_admin');
});

const adjust = (
  userId: string,
  amountKobo: number,
  kind: 'passenger' | 'driver',
  auth = superAdmin.auth,
) =>
  h.http
    .post(`/v1/admin/users/${userId}/wallet-adjustments`)
    .set('Authorization', auth)
    .set('Idempotency-Key', randomUUID())
    .send({ amountKobo, kind, reason: 'Test credit' });

const requestPayout = (auth: string, amountKobo: number) =>
  h.http
    .post('/v1/driver/payouts')
    .set('Authorization', auth)
    .set('Idempotency-Key', randomUUID())
    .send({ amountKobo });

describe('payouts', () => {
  it('takes the amount from the wallet and sends it to the bank, recording the transfer fee', async () => {
    const d = await approvedDriver(h);
    await adjust(d.userId, 500_000, 'driver').expect(201);
    const res = await requestPayout(d.auth, 300_000).expect(201);
    expect(res.body).toMatchObject({
      amountKobo: 300_000,
      status: 'processing',
      account: { last4: expect.any(String) },
    });
    expect(await balance(h, d.userId, 'driver')).toBe(200_000);
    await fake(h).settled();
    const [payout] = (
      await h.http.get('/v1/driver/payouts').set('Authorization', d.auth).expect(200)
    ).body as PayoutView[];
    const fee = fakeTransferFee(300_000);
    expect(payout).toMatchObject({
      status: 'succeeded',
      feeKobo: fee,
      completedAt: expect.any(String),
    });
    expect(await system(h, 'payouts_in_transit')).toBe(0);
    expect(await system(h, 'provider_fees')).toBe(fee);
    const lines = (
      await h.http.get('/v1/driver/wallet/transactions').set('Authorization', d.auth).expect(200)
    ).body;
    expect(lines.items[0]).toMatchObject({
      kind: 'payout',
      amountKobo: -300_000,
      balanceAfterKobo: 200_000,
    });
    await expectLedgerConsistent(h);
  });

  it('returns the money to the wallet when the bank refuses the transfer, and when it is reversed later', async () => {
    const d = await approvedDriver(h);
    await adjust(d.userId, 500_000, 'driver').expect(201);
    await h.db
      .updateTable('driver_profiles')
      .set({ payout_recipient_code: 'RCP_fake_fail_0000' })
      .where('user_id', '=', d.userId)
      .execute();
    await requestPayout(d.auth, 200_000).expect(201);
    await fake(h).settled();
    const [failed] = (
      await h.http.get('/v1/driver/payouts').set('Authorization', d.auth).expect(200)
    ).body as PayoutView[];
    expect(failed).toMatchObject({ status: 'failed', failureReason: expect.any(String) });
    expect(await balance(h, d.userId, 'driver')).toBe(500_000);

    await h.db
      .updateTable('driver_profiles')
      .set({ payout_recipient_code: null })
      .where('user_id', '=', d.userId)
      .execute();
    const ok = (await requestPayout(d.auth, 100_000).expect(201)).body as PayoutView;
    await fake(h).settled();
    const { PayoutsService } = await import('../src/payments/payouts.service');
    await h.app.get(PayoutsService).applyTransfer({
      reference: ok.id,
      status: 'reversed',
      transferCode: null,
      feeKobo: 0,
      message: 'Reversed',
    });
    await h.app.get(PayoutsService).applyTransfer({
      reference: ok.id,
      status: 'reversed',
      transferCode: null,
      feeKobo: 0,
      message: 'Reversed',
    });
    expect(await balance(h, d.userId, 'driver')).toBe(500_000);
    await expectLedgerConsistent(h);
  });

  it('keeps to the rules: minimum, balance, one at a time, and a pause after a bank change', async () => {
    const d = await approvedDriver(h);
    await adjust(d.userId, 500_000, 'driver').expect(201);
    expect((await requestPayout(d.auth, 50_000).expect(422)).body.error.code).toBe(
      'PAYOUT_UNAVAILABLE',
    );
    expect((await requestPayout(d.auth, 600_000).expect(422)).body.error.details).toMatchObject({
      availableKobo: 500_000,
    });

    fake(h).setWebhookSink(async () => undefined); // the first stays in flight
    await requestPayout(d.auth, 100_000).expect(201);
    expect((await requestPayout(d.auth, 100_000).expect(422)).body.error.code).toBe(
      'PAYOUT_UNAVAILABLE',
    );

    await h.db.updateTable('payouts').set({ status: 'succeeded' }).execute();
    await h.db
      .updateTable('driver_profiles')
      .set({ payout_account_changed_at: new Date() })
      .where('user_id', '=', d.userId)
      .execute();
    const paused = await requestPayout(d.auth, 100_000).expect(409);
    expect(paused.body.error).toMatchObject({
      code: 'PAYOUT_ACCOUNT_RECENTLY_CHANGED',
      details: { pausedUntil: expect.any(String) },
    });
    const w = (await h.http.get('/v1/driver/wallet').set('Authorization', d.auth).expect(200)).body;
    expect(w.payout.pausedUntil).toEqual(expect.any(String));
  });

  it('creates one payout when several requests race', async () => {
    const d = await approvedDriver(h);
    await adjust(d.userId, 500_000, 'driver').expect(201);
    fake(h).setWebhookSink(async () => undefined);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => requestPayout(d.auth, 400_000)),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await balance(h, d.userId, 'driver')).toBe(100_000);
    await expectLedgerConsistent(h);
  });
});

describe('refunds', () => {
  async function paidWalletRide() {
    const p = await passenger(h);
    const d = await approvedDriver(h);
    await topUp(h, p.auth, 1_000_000);
    const ride = await acceptedRide(h, p, d, { paymentMethod: 'wallet' });
    const done = await finishRide(h, ride.id, d);
    const payment = await h.db
      .selectFrom('payments')
      .select('id')
      .where('ride_id', '=', ride.id)
      .executeTakeFirstOrThrow();
    return { p, d, ride, done, paymentId: payment.id };
  }

  const refund = (paymentId: string, body: Record<string, unknown>, auth = superAdmin.auth) =>
    h.http
      .post(`/v1/admin/payments/${paymentId}/refunds`)
      .set('Authorization', auth)
      .set('Idempotency-Key', randomUUID())
      .send(body);

  it('refunds to the wallet from platform revenue or from the driver, never more than was paid', async () => {
    const { p, d, done, paymentId } = await paidWalletRide();
    const final = done.fare.finalTotalKobo!;
    const before = await balance(h, p.userId);
    const revenue = await system(h, 'platform_revenue');

    const r1 = (await refund(paymentId, { amountKobo: 10_000, reason: 'Long route' }).expect(201))
      .body as RefundView;
    expect(r1).toMatchObject({ status: 'succeeded', destination: 'wallet', fundedBy: 'platform' });
    expect(await balance(h, p.userId)).toBe(before + 10_000);
    expect(await system(h, 'platform_revenue')).toBe(revenue - 10_000);

    const driverBefore = await balance(h, d.userId, 'driver');
    await refund(paymentId, {
      amountKobo: 5_000,
      fundedBy: 'driver',
      reason: 'Driver detour',
    }).expect(201);
    expect(await balance(h, d.userId, 'driver')).toBe(driverBefore - 5_000);

    const tooMuch = await refund(paymentId, { amountKobo: final, reason: 'Everything' }).expect(
      422,
    );
    expect(tooMuch.body.error.code).toBe('REFUND_NOT_ALLOWED');
    const toCard = await refund(paymentId, {
      amountKobo: 1_000,
      destination: 'card',
      reason: 'Card',
    }).expect(422);
    expect(toCard.body.error.code).toBe('REFUND_NOT_ALLOWED');

    // Racing refunds cannot together exceed what is left.
    const left = final - 15_000;
    const racing = await Promise.all(
      Array.from({ length: 4 }, () =>
        refund(paymentId, { amountKobo: Math.floor(left / 2) + 1, reason: 'Race' }),
      ),
    );
    expect(racing.filter((r) => r.status === 201)).toHaveLength(1);
    const audit = await h.db
      .selectFrom('audit_logs')
      .select('action')
      .where('action', '=', 'payments.refund_issued')
      .execute();
    expect(audit).toHaveLength(3);
    await expectLedgerConsistent(h);
  });

  it('sends card refunds back through the provider', async () => {
    const p = await passenger(h);
    const d = await approvedDriver(h);
    const cardId = await addCard(h, p.auth);
    const ride = await acceptedRide(h, p, d, { paymentMethod: 'card', cardId });
    await finishRide(h, ride.id, d);
    const payment = await h.db
      .selectFrom('payments')
      .select('id')
      .where('ride_id', '=', ride.id)
      .executeTakeFirstOrThrow();
    const paystack = await system(h, 'paystack_balance');
    const r = (
      await refund(payment.id, {
        amountKobo: 20_000,
        destination: 'card',
        reason: 'Overcharged',
      }).expect(201)
    ).body as RefundView;
    expect(r.status).toBe('pending');
    expect(await system(h, 'refunds_in_transit')).toBe(20_000);
    await fake(h).settled();
    const [done] = (
      await h.http
        .get(`/v1/admin/payments/${payment.id}/refunds`)
        .set('Authorization', superAdmin.auth)
        .expect(200)
    ).body as RefundView[];
    expect(done!.status).toBe('succeeded');
    expect(await system(h, 'refunds_in_transit')).toBe(0);
    expect(await system(h, 'paystack_balance')).toBe(paystack - 20_000);
    expect(
      (await h.http.get(`/v1/rides/${ride.id}`).set('Authorization', p.auth).expect(200)).body
        .payment.refundedKobo,
    ).toBe(20_000);
    await expectLedgerConsistent(h);
  });

  it('needs the refund permission', async () => {
    const { paymentId } = await paidWalletRide();
    const agent = await signInWithMfa(h, nextPhone(), 'support_agent');
    await refund(paymentId, { amountKobo: 1_000, reason: 'Nope' }, agent.auth).expect(403);
    await h.http.get('/v1/admin/payments').set('Authorization', agent.auth).expect(200);
  });
});

describe('disputes', () => {
  it('lets a passenger report a fare once, and staff resolve it with a refund or a reasoned rejection', async () => {
    const p = await passenger(h);
    const d = await approvedDriver(h);
    await topUp(h, p.auth, 1_000_000);
    const ride = await acceptedRide(h, p, d, { paymentMethod: 'wallet' });
    await finishRide(h, ride.id, d);

    const other = await passenger(h);
    await h.http
      .post(`/v1/rides/${ride.id}/dispute`)
      .set('Authorization', other.auth)
      .send({ reason: 'overcharged' })
      .expect(404);
    const raised = (
      await h.http
        .post(`/v1/rides/${ride.id}/dispute`)
        .set('Authorization', p.auth)
        .send({ reason: 'overcharged', details: 'Took a long way' })
        .expect(201)
    ).body as DisputeView;
    expect(raised).toMatchObject({ status: 'open', source: 'passenger', reason: 'overcharged' });
    const again = await h.http
      .post(`/v1/rides/${ride.id}/dispute`)
      .set('Authorization', p.auth)
      .send({ reason: 'other' })
      .expect(409);
    expect(again.body.error.code).toBe('DISPUTE_EXISTS');
    expect(
      (await h.http.get(`/v1/rides/${ride.id}`).set('Authorization', p.auth).expect(200)).body
        .payment.disputed,
    ).toBe(true);

    const open = (
      await h.http
        .get('/v1/admin/disputes?status=open')
        .set('Authorization', superAdmin.auth)
        .expect(200)
    ).body as DisputeView[];
    expect(open.map((x) => x.id)).toEqual([raised.id]);
    const before = await balance(h, p.userId);
    const resolved = (
      await h.http
        .post(`/v1/admin/disputes/${raised.id}/resolve`)
        .set('Authorization', superAdmin.auth)
        .send({ outcome: 'refund', amountKobo: 15_000, note: 'Route was 3 km longer than needed' })
        .expect(200)
    ).body as DisputeView;
    expect(resolved).toMatchObject({
      status: 'refunded',
      resolutionNote: 'Route was 3 km longer than needed',
    });
    expect(await balance(h, p.userId)).toBe(before + 15_000);
    const refunds = await h.db.selectFrom('refunds').select(['dispute_id']).execute();
    expect(refunds).toEqual([{ dispute_id: raised.id }]);
    await h.http
      .post(`/v1/admin/disputes/${raised.id}/resolve`)
      .set('Authorization', superAdmin.auth)
      .send({ outcome: 'reject', note: 'Second try' })
      .expect(409);
    const actions = (await h.db.selectFrom('audit_logs').select('action').execute()).map(
      (a) => a.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        'payments.dispute_raised',
        'payments.dispute_refunded',
        'payments.refund_issued',
      ]),
    );
  });

  it('records card chargebacks, and takes the money back from revenue when lost', async () => {
    const p = await passenger(h);
    const d = await approvedDriver(h);
    const cardId = await addCard(h, p.auth);
    const ride = await acceptedRide(h, p, d, { paymentMethod: 'card', cardId });
    const done = await finishRide(h, ride.id, d);
    const payment = await h.db
      .selectFrom('payments')
      .select('provider_reference')
      .where('ride_id', '=', ride.id)
      .executeTakeFirstOrThrow();
    const amount = done.fare.finalTotalKobo!;
    const revenue = await system(h, 'platform_revenue');

    fake(h).emitDispute(payment.provider_reference!, amount, 'create');
    fake(h).emitDispute(payment.provider_reference!, amount, 'create');
    await fake(h).settled();
    const opened = await h.db.selectFrom('payment_disputes').selectAll().execute();
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ source: 'provider', status: 'open' });

    fake(h).emitDispute(payment.provider_reference!, amount, 'resolve', 'merchant-accepted');
    await fake(h).settled();
    expect(
      (await h.db.selectFrom('payment_disputes').select('status').executeTakeFirstOrThrow()).status,
    ).toBe('lost');
    expect(await system(h, 'platform_revenue')).toBe(revenue - amount);
    await expectLedgerConsistent(h);
  });
});

describe('adjustments and the ledger check', () => {
  it('only super admins adjust wallets; passengers cannot be taken below zero', async () => {
    const p = await passenger(h);
    const admin = await signInWithMfa(h, nextPhone(), 'admin');
    await adjust(p.userId, 10_000, 'passenger', admin.auth).expect(403);
    expect((await adjust(p.userId, 10_000, 'passenger').expect(201)).body).toEqual({
      balanceKobo: 10_000,
    });
    expect((await adjust(p.userId, -20_000, 'passenger').expect(422)).body.error.code).toBe(
      'WALLET_INSUFFICIENT_FUNDS',
    );
    expect(await balance(h, p.userId)).toBe(10_000);
    const audit = await h.db
      .selectFrom('audit_logs')
      .select(['action', 'metadata'])
      .where('action', '=', 'payments.wallet_adjusted')
      .execute();
    expect(audit).toHaveLength(1);
    const health = (
      await h.http.get('/v1/admin/ledger').set('Authorization', superAdmin.auth).expect(200)
    ).body;
    expect(health).toMatchObject({ mismatchedWallets: 0, accounts: { platform_revenue: -10_000 } });
  });
});
