import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  DriverAvailabilityView,
  PaymentView,
  RideView,
  WalletView,
} from '@rideswithme/shared-types';
import { FAKE_WEBHOOK_SECRET, fakeChargeFee } from '../src/payments/fake.provider';
import { credit, debit, LedgerService } from '../src/payments/ledger.service';
import { signPaystack } from '../src/payments/paystack.provider';
import { ReconcileService } from '../src/payments/reconcile.service';
import { WebhooksService } from '../src/payments/webhooks.service';
import { createHarness, type Harness, resetState } from './harness';
import {
  acceptedRide,
  addCard,
  balance,
  bookWith,
  expectLedgerConsistent,
  fake,
  finishRide,
  rideView,
  system,
  topUp,
} from './payment-fixtures';
import { approvedDriver, dispatcher, estimate, passenger, seedCity } from './ride-fixtures';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h.close());
beforeEach(async () => {
  await resetState(h);
  await seedCity(h);
  // Some tests drop the fake provider's webhooks; deliver them again.
  h.app.get(WebhooksService).onModuleInit();
});

const wallet = async (auth: string) =>
  (await h.http.get('/v1/wallet').set('Authorization', auth).expect(200)).body as WalletView;

function signed(body: unknown, secret = FAKE_WEBHOOK_SECRET) {
  const raw = JSON.stringify(body);
  return { raw, signature: signPaystack(raw, secret) };
}

const postWebhook = (raw: string, signature: string) =>
  h.http
    .post('/v1/webhooks/paystack')
    .set('Content-Type', 'application/json')
    .set('x-paystack-signature', signature)
    .send(raw);

describe('wallet top-ups', () => {
  it('credits the wallet only when the signed webhook arrives, and records the provider fee', async () => {
    const p = await passenger(h);
    const res = await h.http
      .post('/v1/wallet/topups')
      .set('Authorization', p.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ amountKobo: 500_000, returnTo: 'web' })
      .expect(201);
    expect(res.body.checkoutUrl).toContain('/v1/dev/fake-checkout/');
    expect(res.body.payment).toMatchObject({
      status: 'pending',
      purpose: 'wallet_topup',
      amountKobo: 500_000,
    });
    // Coming back from the checkout page proves nothing: still nothing in the wallet.
    expect((await wallet(p.auth)).balanceKobo).toBe(0);

    await fake(h).completeCheckout(res.body.payment.id, 'pay');
    await fake(h).settled();
    expect((await wallet(p.auth)).balanceKobo).toBe(500_000);
    const payment = (
      await h.http
        .get(`/v1/payments/${res.body.payment.id}`)
        .set('Authorization', p.auth)
        .expect(200)
    ).body as PaymentView;
    expect(payment).toMatchObject({ status: 'succeeded', amountKobo: 500_000 });
    const fee = fakeChargeFee(500_000);
    expect(await system(h, 'paystack_balance')).toBe(500_000 - fee);
    expect(await system(h, 'provider_fees')).toBe(fee);
    const lines = (
      await h.http.get('/v1/wallet/transactions').set('Authorization', p.auth).expect(200)
    ).body;
    expect(lines.items[0]).toMatchObject({
      kind: 'wallet_topup',
      amountKobo: 500_000,
      balanceAfterKobo: 500_000,
    });
    await expectLedgerConsistent(h);
  });

  it('ignores repeated and forged webhooks', async () => {
    const p = await passenger(h);
    const checkout = (
      await h.http
        .post('/v1/wallet/topups')
        .set('Authorization', p.auth)
        .set('Idempotency-Key', randomUUID())
        .send({ amountKobo: 200_000 })
        .expect(201)
    ).body;
    const body = {
      event: 'charge.success',
      data: {
        reference: checkout.payment.id,
        status: 'success',
        amount: 200_000,
        fees: 3_000,
        paid_at: new Date().toISOString(),
      },
    };
    const { raw, signature } = signed(body);
    await postWebhook(raw, signature).expect(200);
    await postWebhook(raw, signature).expect(200);
    await Promise.all([postWebhook(raw, signature), postWebhook(raw, signature)]);
    expect(await balance(h, p.userId)).toBe(200_000);
    expect(await h.db.selectFrom('payment_webhook_events').select('id').execute()).toHaveLength(1);

    // Wrong key, edited body, or no signature: refused and not stored.
    const forged = signed(
      { ...body, data: { ...body.data, reference: randomUUID() } },
      'not-the-secret',
    );
    expect((await postWebhook(forged.raw, forged.signature).expect(401)).body.error.code).toBe(
      'WEBHOOK_SIGNATURE_INVALID',
    );
    await postWebhook(raw.replace('200000', '900000'), signature).expect(401);
    await h.http
      .post('/v1/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(401);
    expect(await balance(h, p.userId)).toBe(200_000);
    expect(await h.db.selectFrom('payment_webhook_events').select('id').execute()).toHaveLength(1);
  });

  it('never credits an amount different from the one asked for', async () => {
    const p = await passenger(h);
    const checkout = (
      await h.http
        .post('/v1/wallet/topups')
        .set('Authorization', p.auth)
        .set('Idempotency-Key', randomUUID())
        .send({ amountKobo: 100_000 })
        .expect(201)
    ).body;
    const { raw, signature } = signed({
      event: 'charge.success',
      data: { reference: checkout.payment.id, status: 'success', amount: 10_000_000 },
    });
    await postWebhook(raw, signature).expect(200);
    expect(await balance(h, p.userId)).toBe(0);
    const row = await h.db
      .selectFrom('payments')
      .select(['status', 'failure_reason'])
      .where('id', '=', checkout.payment.id)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('pending');
    expect(row.failure_reason).toMatch(/mismatch/);
  });

  it('marks declined checkouts and keeps to the limits', async () => {
    const p = await passenger(h);
    const declined = await topUp(h, p.auth, 100_000, { outcome: 'decline' });
    const view = (
      await h.http
        .get(`/v1/payments/${declined.payment.id}?refresh=1`)
        .set('Authorization', p.auth)
        .expect(200)
    ).body;
    expect(view.status).toBe('failed');
    expect(await balance(h, p.userId)).toBe(0);

    const tooSmall = await h.http
      .post('/v1/wallet/topups')
      .set('Authorization', p.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ amountKobo: 5_000 })
      .expect(422);
    expect(tooSmall.body.error.details).toMatchObject({ minKobo: 10_000 });
    await topUp(h, p.auth, 10_000_000);
    await topUp(h, p.auth, 10_000_000);
    await topUp(h, p.auth, 10_000_000);
    const over = await h.http
      .post('/v1/wallet/topups')
      .set('Authorization', p.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ amountKobo: 10_000 })
      .expect(422);
    expect(over.body.error.code).toBe('WALLET_LIMIT_EXCEEDED');
  });

  it('lets the app check a payment with the provider instead of waiting for the webhook', async () => {
    const p = await passenger(h);
    fake(h).setWebhookSink(async () => undefined); // webhooks lost
    const checkout = await topUp(h, p.auth, 100_000);
    expect(await balance(h, p.userId)).toBe(0);
    const view = (
      await h.http
        .get(`/v1/payments/${checkout.payment.id}?refresh=1`)
        .set('Authorization', p.auth)
        .expect(200)
    ).body;
    expect(view.status).toBe('succeeded');
    expect(await balance(h, p.userId)).toBe(100_000);
  });
});

describe('saved cards', () => {
  it('saves a card once, puts the small charge in the wallet, and can remove it', async () => {
    const p = await passenger(h);
    const id = await addCard(h, p.auth);
    await addCard(h, p.auth); // same card again
    const cards = (await h.http.get('/v1/payment-cards').set('Authorization', p.auth).expect(200))
      .body;
    expect(cards).toEqual([
      expect.objectContaining({ id, brand: 'visa', last4: '4081', expired: false }),
    ]);
    expect(await balance(h, p.userId)).toBe(2 * h.config.CARD_LINK_AMOUNT_KOBO);
    const stored = await h.db
      .selectFrom('payment_cards')
      .select('authorization_code_encrypted')
      .executeTakeFirstOrThrow();
    expect(stored.authorization_code_encrypted).not.toContain('AUTH_');

    await h.http.delete(`/v1/payment-cards/${id}`).set('Authorization', p.auth).expect(204);
    expect(
      (await h.http.get('/v1/payment-cards').set('Authorization', p.auth).expect(200)).body,
    ).toEqual([]);
    const other = await passenger(h);
    await h.http.delete(`/v1/payment-cards/${id}`).set('Authorization', other.auth).expect(404);
  });
});

describe('wallet rides', () => {
  it('refuses a booking the wallet cannot cover', async () => {
    const p = await passenger(h);
    const res = await bookWith(h, p.auth, { paymentMethod: 'wallet' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('WALLET_INSUFFICIENT_FUNDS');
    expect(await h.db.selectFrom('rides').select('id').execute()).toHaveLength(0);
  });

  it('holds the price at booking, then pays the driver and the platform at the end', async () => {
    const p = await passenger(h);
    const d = await approvedDriver(h);
    await topUp(h, p.auth, 1_000_000);
    const ride = await acceptedRide(h, p, d, { paymentMethod: 'wallet' });
    const quoted = ride.fare.quotedTotalKobo;
    expect(await wallet(p.auth)).toMatchObject({
      balanceKobo: 1_000_000 - quoted,
      heldKobo: quoted,
    });
    expect(await system(h, 'ride_holds')).toBe(quoted);

    const done = await finishRide(h, ride.id, d, { waitedMinutes: 8 });
    const final = done.fare.finalTotalKobo!;
    expect(final).toBeGreaterThan(quoted); // waiting charge
    expect(await balance(h, p.userId)).toBe(1_000_000 - final);
    expect(await balance(h, d.userId, 'driver')).toBe(done.earnings!.netKobo);
    expect(await system(h, 'platform_revenue')).toBe(
      done.earnings!.bookingFeeKobo + done.earnings!.commissionKobo,
    );
    expect(await system(h, 'ride_holds')).toBe(0);
    expect((await rideView(h, p.auth, ride.id)).payment).toMatchObject({
      method: 'wallet',
      status: 'succeeded',
      outstandingKobo: 0,
    });
    await expectLedgerConsistent(h);
  });

  it('records what the wallet could not cover, blocks booking until it is paid, then collects it from a top-up', async () => {
    const p = await passenger(h);
    const d = await approvedDriver(h);
    // Exactly the quoted price, so a waiting charge cannot be covered.
    const quoted = (await estimate(h, p.auth)).options.find(
      (o) => o.category.key === 'car',
    )!.totalKobo;
    await topUp(h, p.auth, quoted);
    const ride = await acceptedRide(h, p, d, { paymentMethod: 'wallet' });
    const done = await finishRide(h, ride.id, d, { waitedMinutes: 10 });
    const owed = done.fare.finalTotalKobo! - ride.fare.quotedTotalKobo;
    expect(owed).toBeGreaterThan(0);
    expect(await wallet(p.auth)).toMatchObject({ balanceKobo: 0, owedKobo: owed });
    expect((await rideView(h, p.auth, ride.id)).payment).toMatchObject({
      status: 'outstanding',
      outstandingKobo: owed,
    });
    // The driver was paid in full regardless.
    expect(await balance(h, d.userId, 'driver')).toBe(done.earnings!.netKobo);

    const blocked = await bookWith(h, p.auth, { paymentMethod: 'cash' });
    expect(blocked.status).toBe(402);
    expect(blocked.body.error).toMatchObject({
      code: 'OUTSTANDING_BALANCE',
      details: { owedKobo: owed },
    });

    await topUp(h, p.auth, 100_000);
    expect(await wallet(p.auth)).toMatchObject({ balanceKobo: 100_000 - owed, owedKobo: 0 });
    expect((await rideView(h, p.auth, ride.id)).payment.status).toBe('succeeded');
    expect(await system(h, 'passenger_receivables')).toBe(0);
    expect((await bookWith(h, p.auth, { paymentMethod: 'cash' })).status).toBe(201);
    await expectLedgerConsistent(h);
  });

  it('returns the hold when no driver is found', async () => {
    const p = await passenger(h);
    await topUp(h, p.auth, 500_000);
    const ride = (await bookWith(h, p.auth, { paymentMethod: 'wallet' })).body as RideView;
    expect(await balance(h, p.userId)).toBe(500_000 - ride.fare.quotedTotalKobo);
    await h.db
      .updateTable('rides')
      .set({ search_deadline: new Date(Date.now() - 1000) })
      .where('id', '=', ride.id)
      .execute();
    await dispatcher(h).tick();
    expect((await rideView(h, p.auth, ride.id)).status).toBe('no_driver_found');
    expect(await balance(h, p.userId)).toBe(500_000);
    expect(await system(h, 'ride_holds')).toBe(0);
    await expectLedgerConsistent(h);
  });

  it('takes a late cancellation fee from the hold, returns the rest, and pays the driver their share', async () => {
    const p = await passenger(h);
    const d = await approvedDriver(h);
    await topUp(h, p.auth, 500_000);
    const ride = await acceptedRide(h, p, d, { paymentMethod: 'wallet' });
    await h.db
      .updateTable('rides')
      .set({ assigned_at: new Date(Date.now() - 5 * 60_000) })
      .where('id', '=', ride.id)
      .execute();
    const cancelled = (
      await h.http
        .post(`/v1/rides/${ride.id}/cancel`)
        .set('Authorization', p.auth)
        .send({})
        .expect(200)
    ).body as RideView;
    const fee = cancelled.fare.cancellationFeeKobo;
    expect(fee).toBe(30_000);
    expect(await balance(h, p.userId)).toBe(500_000 - fee);
    expect(await balance(h, d.userId, 'driver')).toBe(fee - 6_000); // less 20% commission
    expect(await system(h, 'platform_revenue')).toBe(6_000);
    expect(await system(h, 'ride_holds')).toBe(0);
    await expectLedgerConsistent(h);
  });
});

describe('card rides', () => {
  it('charges the saved card after the trip', async () => {
    const p = await passenger(h);
    const d = await approvedDriver(h);
    const cardId = await addCard(h, p.auth);
    const ride = await acceptedRide(h, p, d, { paymentMethod: 'card', cardId });
    expect(ride.payment).toMatchObject({ method: 'card', card: { brand: 'visa', last4: '4081' } });
    const done = await finishRide(h, ride.id, d);
    const view = await rideView(h, p.auth, ride.id);
    expect(view.payment).toMatchObject({ method: 'card', status: 'succeeded', outstandingKobo: 0 });
    expect(await balance(h, d.userId, 'driver')).toBe(done.earnings!.netKobo);
    expect(await system(h, 'passenger_receivables')).toBe(0);
    await expectLedgerConsistent(h);
  });

  it("refuses another passenger's card", async () => {
    const owner = await passenger(h);
    const cardId = await addCard(h, owner.auth);
    const p = await passenger(h);
    const res = await bookWith(h, p.auth, { paymentMethod: 'card', cardId });
    expect(res.body.error.code).toBe('CARD_NOT_FOUND');
    const missing = await bookWith(h, p.auth, { paymentMethod: 'card' });
    expect(missing.status).toBe(422);
  });

  it('records a declined card as owed and collects it from the next top-up', async () => {
    const p = await passenger(h);
    const d = await approvedDriver(h);
    const cardId = await addCard(h, p.auth, 'declines_later');
    const linkCredit = h.config.CARD_LINK_AMOUNT_KOBO;
    const ride = await acceptedRide(h, p, d, { paymentMethod: 'card', cardId });
    const done = await finishRide(h, ride.id, d);
    const final = done.fare.finalTotalKobo!;
    const view = await rideView(h, p.auth, ride.id);
    expect(view.payment.status).toBe('outstanding');
    // The ₦50 from saving the card was already applied.
    expect(view.payment.outstandingKobo).toBe(final - linkCredit);
    expect(await balance(h, d.userId, 'driver')).toBe(done.earnings!.netKobo);

    await topUp(h, p.auth, final);
    expect(await wallet(p.auth)).toMatchObject({ owedKobo: 0, balanceKobo: linkCredit });
    expect((await rideView(h, p.auth, ride.id)).payment.status).toBe('succeeded');
    await expectLedgerConsistent(h);
  });
});

describe('cash rides and driver debt', () => {
  it('stops a driver going online once commission owed passes the limit, until they top up', async () => {
    const d = await approvedDriver(h);
    await h.db.transaction().execute(async (trx) => {
      await h.app.get(LedgerService).post(trx, {
        kind: 'cash_commission',
        reference: 'test-debt',
        lines: [
          debit({ user: d.userId, kind: 'driver' }, 600_000),
          credit({ system: 'platform_revenue' }, 600_000),
        ],
      });
    });
    const availability = (
      await h.http.get('/v1/driver/availability').set('Authorization', d.auth).expect(200)
    ).body as DriverAvailabilityView;
    expect(availability.blockers).toContainEqual({
      code: 'WALLET_DEBT',
      owedKobo: 600_000,
      limitKobo: 500_000,
    });
    const w = (await h.http.get('/v1/driver/wallet').set('Authorization', d.auth).expect(200)).body;
    expect(w).toMatchObject({
      balanceKobo: -600_000,
      canGoOnline: false,
      payout: { availableKobo: 0 },
    });

    await topUp(h, d.auth, 200_000, { path: '/v1/driver/wallet/topups' });
    const after = (
      await h.http.get('/v1/driver/availability').set('Authorization', d.auth).expect(200)
    ).body as DriverAvailabilityView;
    expect(after.blockers.find((b) => b.code === 'WALLET_DEBT')).toBeUndefined();
    expect(await balance(h, d.userId, 'driver')).toBe(-400_000);
  });

  it('collects a cash cancellation fee from the wallet when the passenger has money there', async () => {
    const p = await passenger(h);
    const d = await approvedDriver(h);
    await topUp(h, p.auth, 100_000);
    const ride = await acceptedRide(h, p, d, { paymentMethod: 'cash' });
    await h.db
      .updateTable('rides')
      .set({ assigned_at: new Date(Date.now() - 5 * 60_000) })
      .where('id', '=', ride.id)
      .execute();
    await h.http
      .post(`/v1/rides/${ride.id}/cancel`)
      .set('Authorization', p.auth)
      .send({})
      .expect(200);
    expect(await wallet(p.auth)).toMatchObject({ balanceKobo: 70_000, owedKobo: 0 });
    expect(await balance(h, d.userId, 'driver')).toBe(24_000);
    await expectLedgerConsistent(h);
  });
});

describe('reconciliation', () => {
  it('finishes payments whose webhook never arrived, and gives up on abandoned checkouts', async () => {
    const p = await passenger(h);
    const reconcile = h.app.get(ReconcileService);
    fake(h).setWebhookSink(async () => undefined);
    const paid = await topUp(h, p.auth, 100_000);
    const abandoned = (
      await h.http
        .post('/v1/wallet/topups')
        .set('Authorization', p.auth)
        .set('Idempotency-Key', randomUUID())
        .send({ amountKobo: 50_000 })
        .expect(201)
    ).body;
    const old = new Date(Date.now() - 2 * 86_400_000);
    await h.db
      .updateTable('payments')
      .set({ created_at: old } as never)
      .where('id', 'in', [paid.payment.id, abandoned.payment.id])
      .execute();
    const report = await reconcile.run();
    expect(report).toMatchObject({ chargesChecked: 2, abandoned: 1, ledgerMismatches: 0 });
    expect(await balance(h, p.userId)).toBe(100_000);
    const rows = await h.db.selectFrom('payments').select(['id', 'status']).execute();
    expect(Object.fromEntries(rows.map((r) => [r.id, r.status]))).toEqual({
      [paid.payment.id]: 'succeeded',
      [abandoned.payment.id]: 'abandoned',
    });
  });
});
