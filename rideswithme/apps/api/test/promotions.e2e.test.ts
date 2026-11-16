import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FareEstimateResponse, PromotionView } from '@rideswithme/shared-types';
import { createHarness, type Harness, nextPhone, resetState, signInWithMfa } from './harness';
import {
  acceptedRide,
  balance,
  expectLedgerConsistent,
  finishRide,
  ledger,
  system,
  topUp,
} from './payment-fixtures';
import { approvedDriver, DROPOFF, passenger, PICKUP, seedCity } from './ride-fixtures';

let h: Harness;
let admin: { auth: string };
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h.close());
beforeEach(async () => {
  await resetState(h);
  await seedCity(h);
  admin = await signInWithMfa(h, nextPhone(), 'admin');
});

async function promotion(code: string, extra: Record<string, unknown> = {}) {
  return (
    await h.http
      .post('/v1/admin/promotions')
      .set('Authorization', admin.auth)
      .send({
        code,
        description: '20% off, up to ₦500',
        discountType: 'percent',
        percentBps: 2000,
        maxDiscountKobo: 50_000,
        startsAt: new Date(Date.now() - 3_600_000).toISOString(),
        endsAt: new Date(Date.now() + 86_400_000).toISOString(),
        ...extra,
      })
      .expect(201)
  ).body as PromotionView;
}

async function estimate(auth: string, promoCode?: string): Promise<FareEstimateResponse> {
  return (
    await h.http
      .post('/v1/fares/estimate')
      .set('Authorization', auth)
      .send({ pickup: PICKUP, dropoff: DROPOFF, ...(promoCode && { promoCode }) })
      .expect(200)
  ).body;
}

const car = (e: FareEstimateResponse) => e.options.find((o) => o.category.key === 'car')!;

describe('promotions', () => {
  it('shows the discount on the estimate, ignoring case and spaces in the code', async () => {
    await promotion('WELCOME20');
    const p = await passenger(h);
    const e = await estimate(p.auth, 'welcome 20');
    expect(e.promotion).toEqual({
      code: 'WELCOME20',
      valid: true,
      description: '20% off, up to ₦500',
      reason: null,
    });
    const o = car(e);
    expect(o.discountKobo).toBe(Math.min(50_000, Math.round(o.totalKobo * 0.2)));
    expect(o.payableKobo).toBe(o.totalKobo - o.discountKobo);
    const none = await estimate(p.auth, 'NOSUCHCODE');
    expect(none.promotion).toMatchObject({ valid: false, reason: 'not_found' });
    expect(car(none).discountKobo).toBe(0);
    const staffOnly = await passenger(h);
    await h.http
      .post('/v1/admin/promotions')
      .set('Authorization', staffOnly.auth)
      .send({})
      .expect(403);
  });

  it('cash ride: the passenger pays less, the driver is paid on the full fare, RideswithMe funds the discount', async () => {
    await promotion('WELCOME20');
    const p = await passenger(h);
    const d = await approvedDriver(h);
    const ride = await acceptedRide(h, p, d, { paymentMethod: 'cash', promoCode: 'WELCOME20' });
    const discount = ride.fare.discountKobo;
    expect(discount).toBeGreaterThan(0);
    expect(ride.fare.promotionCode).toBe('WELCOME20');
    expect(ride.fare.payableKobo).toBe(ride.fare.quotedTotalKobo - discount);

    const promosBefore = await system(h, 'promotions');
    const done = await finishRide(h, ride.id, d);
    const fees = done.earnings!.bookingFeeKobo + done.earnings!.commissionKobo;
    expect(done.earnings!.fareKobo).toBe(ride.fare.quotedTotalKobo);
    expect(done.fare.payableKobo).toBe(ride.fare.quotedTotalKobo - discount);
    // Cash: the driver collected the discounted fare; RideswithMe pays them the discount.
    expect(await balance(h, d.userId, 'driver')).toBe(discount - fees);
    expect((await system(h, 'promotions')) - promosBefore).toBe(discount);
    const payment = await h.db
      .selectFrom('payments')
      .select('amount_kobo')
      .where('ride_id', '=', ride.id)
      .executeTakeFirstOrThrow();
    expect(Number(payment.amount_kobo)).toBe(ride.fare.quotedTotalKobo - discount);
    const used = await h.db
      .selectFrom('promotion_redemptions')
      .select('status')
      .where('ride_id', '=', ride.id)
      .executeTakeFirstOrThrow();
    expect(used.status).toBe('used');
    await expectLedgerConsistent(h);

    // Once per passenger.
    expect((await estimate(p.auth, 'WELCOME20')).promotion).toMatchObject({
      valid: false,
      reason: 'already_used',
    });
  });

  it('wallet ride: holds and takes only the discounted fare', async () => {
    await promotion('WALLET20');
    const p = await passenger(h);
    const d = await approvedDriver(h);
    await topUp(h, p.auth, 1_000_000);
    const ride = await acceptedRide(h, p, d, { paymentMethod: 'wallet', promoCode: 'WALLET20' });
    expect(await balance(h, p.userId)).toBe(1_000_000 - ride.fare.payableKobo);
    const done = await finishRide(h, ride.id, d);
    expect(await balance(h, p.userId)).toBe(1_000_000 - done.fare.payableKobo);
    expect(await balance(h, d.userId, 'driver')).toBe(done.earnings!.netKobo);
    expect(await ledger(h).mismatches()).toEqual([]);
    await expectLedgerConsistent(h);
  });

  it('gives the code back when the ride is cancelled', async () => {
    await promotion('AGAIN20');
    const p = await passenger(h);
    const est = await estimate(p.auth, 'AGAIN20');
    const res = await h.http
      .post('/v1/rides')
      .set('Authorization', p.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ quoteId: car(est).quoteId, paymentMethod: 'cash', promoCode: 'AGAIN20' })
      .expect(201);
    expect((await estimate(p.auth, 'AGAIN20')).promotion?.reason).toBe('already_used');
    await h.http
      .post(`/v1/rides/${res.body.id}/cancel`)
      .set('Authorization', p.auth)
      .send({})
      .expect(200);
    expect((await estimate(p.auth, 'AGAIN20')).promotion?.valid).toBe(true);
  });

  it('never goes over its total limit when passengers book at the same moment', async () => {
    await promotion('FIRST3', { maxRedemptions: 3, perUserLimit: 1 });
    const people = await Promise.all(Array.from({ length: 6 }, () => passenger(h)));
    const quotes = await Promise.all(people.map(async (p) => car(await estimate(p.auth)).quoteId));
    const results = await Promise.all(
      people.map((p, i) =>
        h.http
          .post('/v1/rides')
          .set('Authorization', p.auth)
          .set('Idempotency-Key', randomUUID())
          .send({ quoteId: quotes[i], paymentMethod: 'cash', promoCode: 'FIRST3' }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    const refused = results.filter((r) => r.status === 422);
    expect(refused).toHaveLength(3);
    expect(refused[0]!.body.error).toMatchObject({
      code: 'PROMO_INVALID',
      details: { reason: 'used_up' },
    });
    const list = (await h.http.get('/v1/admin/promotions').set('Authorization', admin.auth))
      .body as PromotionView[];
    expect(list[0]!.redemptions).toMatchObject({ reserved: 3, used: 0 });
  });

  it('respects first-ride-only, minimum fare and switching a promotion off', async () => {
    const promo = await promotion('BIGTRIP', { minFareKobo: 100_000_000 });
    const p = await passenger(h);
    expect((await estimate(p.auth, 'BIGTRIP')).promotion).toMatchObject({
      valid: false,
      reason: 'min_fare',
    });
    await h.http
      .patch(`/v1/admin/promotions/${promo.id}`)
      .set('Authorization', admin.auth)
      .send({ isActive: false })
      .expect(200);
    expect((await estimate(p.auth, 'BIGTRIP')).promotion?.reason).toBe('not_found');

    await promotion('NEWBIE', { firstRideOnly: true });
    const d = await approvedDriver(h);
    const ride = await acceptedRide(h, p, d, { paymentMethod: 'cash', promoCode: 'NEWBIE' });
    await finishRide(h, ride.id, d);
    await promotion('NEWBIE2', { firstRideOnly: true });
    expect((await estimate(p.auth, 'NEWBIE2')).promotion?.reason).toBe('not_first_ride');
    const audit = await h.db
      .selectFrom('audit_logs')
      .select('action')
      .where('action', 'like', 'promotions.%')
      .execute();
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(['promotions.created', 'promotions.updated']),
    );
  });
});
