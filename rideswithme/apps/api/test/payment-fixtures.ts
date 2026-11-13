import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { expect } from 'vitest';
import type { CheckoutView, DriverRideView, RideView } from '@rideswithme/shared-types';
import { FakePaymentProvider, type FakeCard } from '../src/payments/fake.provider';
import { LedgerService } from '../src/payments/ledger.service';
import { PAYMENT_PROVIDER } from '../src/payments/payment.provider';
import type { Harness } from './harness';
import { currentOffer, dispatcher, estimate, goOnline, north, PICKUP } from './ride-fixtures';

export const fake = (h: Harness) => h.app.get<FakePaymentProvider>(PAYMENT_PROVIDER);
export const ledger = (h: Harness) => h.app.get(LedgerService);

/** Starts a checkout, has the payer finish it on the fake page, and waits for the webhook. */
export async function topUp(
  h: Harness,
  auth: string,
  amountKobo: number,
  opts: { path?: string; outcome?: 'pay' | 'decline' | 'cancel'; card?: FakeCard } = {},
): Promise<CheckoutView> {
  const res = await h.http
    .post(opts.path ?? '/v1/wallet/topups')
    .set('Authorization', auth)
    .set('Idempotency-Key', randomUUID())
    .send({ amountKobo, returnTo: 'web' })
    .expect(201);
  const checkout = res.body as CheckoutView;
  await fake(h).completeCheckout(checkout.payment.id, opts.outcome ?? 'pay', opts.card ?? 'good');
  await fake(h).settled();
  return checkout;
}

/** Saves a card through the fake checkout and returns its id. */
export async function addCard(h: Harness, auth: string, card: FakeCard = 'good'): Promise<string> {
  const res = await h.http
    .post('/v1/payment-cards')
    .set('Authorization', auth)
    .set('Idempotency-Key', randomUUID())
    .send({ returnTo: 'web' })
    .expect(201);
  await fake(h).completeCheckout((res.body as CheckoutView).payment.id, 'pay', card);
  await fake(h).settled();
  const cards = (await h.http.get('/v1/payment-cards').set('Authorization', auth).expect(200))
    .body as { id: string; last4: string }[];
  return cards.find((c) => c.last4 === (card === 'good' ? '4081' : '4084'))!.id;
}

export async function balance(
  h: Harness,
  userId: string,
  kind: 'passenger' | 'driver' = 'passenger',
) {
  return ledger(h).balance(userId, kind);
}

export const system = (h: Harness, key: Parameters<LedgerService['systemBalance']>[0]) =>
  ledger(h).systemBalance(key);

export async function expectLedgerConsistent(h: Harness) {
  expect(await ledger(h).mismatches()).toEqual([]);
  const total = await sql<{
    s: string | null;
  }>`SELECT sum(amount_kobo) AS s FROM wallet_transactions`.execute(h.db);
  expect(Number(total.rows[0]?.s ?? 0)).toBe(0);
}

export async function bookWith(
  h: Harness,
  auth: string,
  extra: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- response bodies vary by test
): Promise<{ status: number; body: Record<string, any> }> {
  const est = await estimate(h, auth);
  return h.http
    .post('/v1/rides')
    .set('Authorization', auth)
    .set('Idempotency-Key', randomUUID())
    .send({ quoteId: est.options.find((o) => o.category.key === 'car')!.quoteId, ...extra });
}

/** Books (with the given payment), has the driver accept, and returns the ride. */
export async function acceptedRide(
  h: Harness,
  p: { auth: string },
  d: { auth: string },
  payment: Record<string, unknown> = { paymentMethod: 'cash' },
): Promise<RideView> {
  await goOnline(h, d.auth, north(PICKUP.location, 300));
  const res = await bookWith(h, p.auth, payment);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  await dispatcher(h).tick();
  const offer = await currentOffer(h, d.auth);
  if (!offer) throw new Error('Driver received no offer');
  await h.http
    .post(`/v1/driver/offers/${offer.offerId}/accept`)
    .set('Authorization', d.auth)
    .expect(200);
  return res.body as RideView;
}

/** Arrives, (optionally) waits, starts and completes. Returns the driver's view of the finished ride. */
export async function finishRide(
  h: Harness,
  rideId: string,
  d: { auth: string },
  opts: { waitedMinutes?: number } = {},
): Promise<DriverRideView> {
  await h.http.post(`/v1/driver/rides/${rideId}/arrived`).set('Authorization', d.auth).expect(200);
  if (opts.waitedMinutes) {
    await h.db
      .updateTable('rides')
      .set({ arrived_at: new Date(Date.now() - opts.waitedMinutes * 60_000) })
      .where('id', '=', rideId)
      .execute();
  }
  await h.http.post(`/v1/driver/rides/${rideId}/start`).set('Authorization', d.auth).expect(200);
  const done = await h.http
    .post(`/v1/driver/rides/${rideId}/complete`)
    .set('Authorization', d.auth)
    .send({ cashCollectedKobo: 0 })
    .expect(200);
  await fake(h).settled();
  return done.body as DriverRideView;
}

export async function rideView(h: Harness, auth: string, rideId: string): Promise<RideView> {
  return (await h.http.get(`/v1/rides/${rideId}`).set('Authorization', auth).expect(200))
    .body as RideView;
}
