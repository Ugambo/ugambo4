import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness, nextPhone, resetState, signInWithMfa } from './harness';
import {
  approvedDriver,
  assignedRide,
  book,
  currentOffer,
  dispatcher,
  DROPOFF,
  estimate,
  goOnline,
  north,
  OUTSIDE,
  passenger,
  PICKUP,
  seedCity,
} from './ride-fixtures';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h.close());
beforeEach(async () => {
  await resetState(h);
  await seedCity(h);
});

describe('fare estimates', () => {
  it('prices every enabled vehicle type with a quote and route', async () => {
    const p = await passenger(h);
    const est = await estimate(h, p.auth);
    expect(est.serviceArea).toEqual({ key: 'testville', name: 'Test City' });
    expect(est.route.distanceMeters).toBeGreaterThan(5000);
    expect(est.route.polyline).toBeTruthy();
    expect(est.options.map((o) => o.category.key)).toEqual(['car', 'keke_napep']);
    const car = est.options[0]!;
    expect(car.totalKobo % 5000).toBe(0);
    expect(car.etaSeconds).toBeNull();
    const parts = car.breakdown;
    expect(
      parts.baseKobo +
        parts.distanceKobo +
        parts.timeKobo +
        parts.peakSurchargeKobo +
        parts.minimumAdjustmentKobo +
        parts.bookingFeeKobo +
        parts.roundingKobo,
    ).toBe(car.totalKobo);
    expect(est.options[1]!.totalKobo).toBeLessThan(car.totalKobo);
    expect(await h.db.selectFrom('fare_quotes').select('id').execute()).toHaveLength(2);
  });

  it('shows the nearest driver ETA when one is online nearby', async () => {
    const d = await approvedDriver(h);
    await goOnline(h, d.auth, north(PICKUP.location, 800));
    const p = await passenger(h);
    const car = (await estimate(h, p.auth)).options.find((o) => o.category.key === 'car')!;
    expect(car.etaSeconds).toBeGreaterThan(30);
    expect(car.etaSeconds).toBeLessThan(600);
  });

  it('refuses pickups outside every service area', async () => {
    const p = await passenger(h);
    const res = await h.http
      .post('/v1/fares/estimate')
      .set('Authorization', p.auth)
      .send({ pickup: OUTSIDE, dropoff: DROPOFF })
      .expect(422);
    expect(res.body.error.code).toBe('OUTSIDE_SERVICE_AREA');
  });
});

describe('booking', () => {
  it('requires an Idempotency-Key and returns the same ride for a retried request', async () => {
    const p = await passenger(h);
    const quoteId = (await estimate(h, p.auth)).options[0]!.quoteId;
    const missing = await h.http
      .post('/v1/rides')
      .set('Authorization', p.auth)
      .send({ quoteId })
      .expect(422);
    expect(missing.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

    const key = randomUUID();
    const first = await h.http
      .post('/v1/rides')
      .set('Authorization', p.auth)
      .set('Idempotency-Key', key)
      .send({ quoteId })
      .expect(201);
    const retry = await h.http
      .post('/v1/rides')
      .set('Authorization', p.auth)
      .set('Idempotency-Key', key)
      .send({ quoteId })
      .expect(201);
    expect(retry.body.id).toBe(first.body.id);
    expect(await h.db.selectFrom('rides').select('id').execute()).toHaveLength(1);

    const misuse = await h.http
      .post('/v1/rides')
      .set('Authorization', p.auth)
      .set('Idempotency-Key', key)
      .send({ quoteId, paymentMethod: 'card' })
      .expect(422);
    expect(misuse.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('books once even when the same request arrives several times at once', async () => {
    const p = await passenger(h);
    const quoteId = (await estimate(h, p.auth)).options[0]!.quoteId;
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        h.http
          .post('/v1/rides')
          .set('Authorization', p.auth)
          .set('Idempotency-Key', key)
          .send({ quoteId }),
      ),
    );
    expect(results.filter((r) => r.status === 201).length).toBeGreaterThanOrEqual(1);
    expect(
      results.every((r) => r.status === 201 || r.body.error.code === 'IDEMPOTENCY_CONFLICT'),
    ).toBe(true);
    expect(await h.db.selectFrom('rides').select('id').execute()).toHaveLength(1);
  });

  it('snapshots the fare, starts searching and records the first events', async () => {
    const p = await passenger(h);
    const ride = await book(h, p.auth);
    expect(ride).toMatchObject({
      status: 'searching',
      paymentMethod: 'cash',
      category: { key: 'car' },
      driver: null,
      scheduledFor: null,
    });
    expect(ride.pickup.location.lat).toBeCloseTo(PICKUP.location.lat, 5);
    const events = await h.db
      .selectFrom('ride_events')
      .select(['event_type', 'to_status'])
      .orderBy('seq')
      .execute();
    expect(events.map((e) => e.event_type)).toEqual(['ride_requested', 'search_started']);
  });

  it('refuses expired quotes, non-cash payment and a second active ride', async () => {
    const p = await passenger(h);
    const est = await estimate(h, p.auth);
    await h.db
      .updateTable('fare_quotes')
      .set({ expires_at: new Date(Date.now() - 1000) })
      .where('id', '=', est.options[0]!.quoteId)
      .execute();
    const expired = await h.http
      .post('/v1/rides')
      .set('Authorization', p.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ quoteId: est.options[0]!.quoteId })
      .expect(422);
    expect(expired.body.error.code).toBe('QUOTE_EXPIRED');

    const card = await h.http
      .post('/v1/rides')
      .set('Authorization', p.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ quoteId: est.options[1]!.quoteId, paymentMethod: 'card' })
      .expect(422);
    expect(card.body.error.code).toBe('PAYMENT_METHOD_UNAVAILABLE');

    await book(h, p.auth);
    const quoteId = (await estimate(h, p.auth)).options[0]!.quoteId;
    const second = await h.http
      .post('/v1/rides')
      .set('Authorization', p.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ quoteId })
      .expect(409);
    expect(second.body.error.code).toBe('RIDE_ALREADY_ACTIVE');
  });

  it('keeps the booked price when fares change afterwards', async () => {
    const p = await passenger(h);
    const d = await approvedDriver(h);
    await goOnline(h, d.auth, north(PICKUP.location, 300));
    const ride = await assignedRide(h, p, d);
    await sql`UPDATE fare_rules SET is_active = false`.execute(h.db);
    await sql`INSERT INTO fare_rules (service_area_id, vehicle_category_id, base_fare_kobo, per_km_kobo, per_minute_kobo, minimum_fare_kobo, commission_bps)
              SELECT service_area_id, vehicle_category_id, 999900, 999900, 999900, 999900, 4000 FROM fare_rules WHERE is_active = false`.execute(
      h.db,
    );
    for (const step of ['arrived', 'start'])
      await h.http
        .post(`/v1/driver/rides/${ride.id}/${step}`)
        .set('Authorization', d.auth)
        .expect(200);
    const done = await h.http
      .post(`/v1/driver/rides/${ride.id}/complete`)
      .set('Authorization', d.auth)
      .send({ cashCollectedKobo: ride.fare.quotedTotalKobo })
      .expect(200);
    expect(done.body.fare.finalTotalKobo).toBe(ride.fare.quotedTotalKobo);
  });

  it('accepts scheduled rides and starts searching shortly before the time', async () => {
    const p = await passenger(h);
    const at = new Date(Date.now() + 30 * 60_000);
    const ride = await book(h, p.auth, 'car', { scheduledFor: at.toISOString() });
    expect(ride.status).toBe('requested');
    expect(ride.scheduledFor).toBe(at.toISOString());

    const tooSoon = await estimate(h, p.auth);
    await h.http
      .post('/v1/rides')
      .set('Authorization', p.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        quoteId: tooSoon.options[0]!.quoteId,
        scheduledFor: new Date(Date.now() + 5 * 60_000).toISOString(),
      })
      .expect(422);

    await dispatcher(h).tick(new Date(Date.now() + 15 * 60_000));
    expect(
      (await h.http.get(`/v1/rides/${ride.id}`).set('Authorization', p.auth).expect(200)).body
        .status,
    ).toBe('requested');
    await dispatcher(h).tick(new Date(Date.now() + 21 * 60_000));
    expect(
      (await h.http.get(`/v1/rides/${ride.id}`).set('Authorization', p.auth).expect(200)).body
        .status,
    ).toBe('searching');
  });

  it('lets passengers see only their own rides', async () => {
    const a = await passenger(h);
    const b = await passenger(h);
    const ride = await book(h, a.auth);
    await h.http.get(`/v1/rides/${ride.id}`).set('Authorization', b.auth).expect(404);
    await h.http
      .post(`/v1/rides/${ride.id}/cancel`)
      .set('Authorization', b.auth)
      .send({})
      .expect(404);
  });
});

describe('a complete cash trip', () => {
  it('goes from request to completion, records cash, commission and every event', async () => {
    const p = await passenger(h);
    const d = await approvedDriver(h);
    await goOnline(h, d.auth, north(PICKUP.location, 500));
    const ride = await book(h, p.auth);

    await dispatcher(h).tick();
    const offer = await currentOffer(h, d.auth);
    expect(offer).toMatchObject({ rideId: ride.id, fareKobo: ride.fare.quotedTotalKobo });
    expect(offer!.distanceToPickupMeters).toBeGreaterThan(400);
    expect(offer!.estimatedEarningsKobo).toBeLessThan(offer!.fareKobo);

    const accepted = await h.http
      .post(`/v1/driver/offers/${offer!.offerId}/accept`)
      .set('Authorization', d.auth)
      .expect(200);
    expect(accepted.body).toMatchObject({
      status: 'driver_assigned',
      passenger: { firstName: expect.any(String) },
    });

    const seen = (await h.http.get(`/v1/rides/${ride.id}`).set('Authorization', p.auth).expect(200))
      .body;
    expect(seen.driver).toMatchObject({
      firstName: 'Musa',
      hasPhoto: true,
      vehicle: { make: 'Toyota', model: 'Corolla', colour: 'Silver' },
    });
    expect(seen.driver.position).toMatchObject({
      lat: expect.any(Number),
      receivedAt: expect.any(String),
    });
    const photo = await h.http
      .get(`/v1/rides/${ride.id}/driver-photo`)
      .set('Authorization', p.auth)
      .expect(200);
    expect((await fetch(photo.body.url)).ok).toBe(true);

    await h.http.post(`/v1/driver/rides/${ride.id}/start`).set('Authorization', d.auth).expect(409);
    await h.http
      .post(`/v1/driver/rides/${ride.id}/arrived`)
      .set('Authorization', d.auth)
      .expect(200);
    await h.http.post(`/v1/driver/rides/${ride.id}/start`).set('Authorization', d.auth).expect(200);
    const cancelInTrip = await h.http
      .post(`/v1/rides/${ride.id}/cancel`)
      .set('Authorization', p.auth)
      .send({})
      .expect(409);
    expect(cancelInTrip.body.error.code).toBe('INVALID_STATE');

    const done = await h.http
      .post(`/v1/driver/rides/${ride.id}/complete`)
      .set('Authorization', d.auth)
      .send({ cashCollectedKobo: ride.fare.quotedTotalKobo })
      .expect(200);
    const final = ride.fare.quotedTotalKobo;
    expect(done.body).toMatchObject({
      status: 'completed',
      fare: { finalTotalKobo: final, waitingChargeKobo: 0 },
    });
    const e = done.body.earnings;
    expect(e.fareKobo).toBe(final);
    expect(e.bookingFeeKobo + e.commissionKobo + e.netKobo).toBe(final);
    expect(e.bookingFeeKobo).toBe(10_000);
    expect(e.commissionKobo).toBe(Math.round((final - 10_000) * 0.2));

    const payment = await h.db.selectFrom('payments').selectAll().executeTakeFirstOrThrow();
    expect(payment).toMatchObject({
      method: 'cash',
      purpose: 'ride_fare',
      status: 'collected',
      amount_kobo: String(final),
    });
    const commission = await h.db.selectFrom('commissions').selectAll().executeTakeFirstOrThrow();
    expect(commission).toMatchObject({
      status: 'pending_settlement',
      commission_kobo: String(e.commissionKobo),
      booking_fee_kobo: '10000',
    });

    const events = await h.db
      .selectFrom('ride_events')
      .select(['event_type', 'from_status', 'to_status'])
      .where('ride_id', '=', ride.id)
      .orderBy('seq')
      .execute();
    expect(events.filter((x) => x.to_status).map((x) => x.to_status)).toEqual([
      'requested',
      'searching',
      'driver_assigned',
      'driver_arrived',
      'in_progress',
      'completed',
    ]);
    expect(events.map((x) => x.event_type)).toContain('offer_sent');

    // Finished rides no longer expose the driver's live position.
    const after = (
      await h.http.get(`/v1/rides/${ride.id}`).set('Authorization', p.auth).expect(200)
    ).body;
    expect(after.driver.position).toBeNull();
    await h.http.get(`/v1/rides/${ride.id}/driver-photo`).set('Authorization', p.auth).expect(404);

    const driverHistory = await h.http
      .get('/v1/driver/rides')
      .set('Authorization', d.auth)
      .expect(200);
    expect(driverHistory.body.items[0].earnings.netKobo).toBe(e.netKobo);
    const passengerHistory = await h.http.get('/v1/rides').set('Authorization', p.auth).expect(200);
    expect(passengerHistory.body.items.map((r: { id: string }) => r.id)).toEqual([ride.id]);
  });

  it('adds a waiting charge after the free minutes at pickup', async () => {
    const p = await passenger(h);
    const d = await approvedDriver(h);
    await goOnline(h, d.auth, north(PICKUP.location, 300));
    const ride = await assignedRide(h, p, d);
    await h.http
      .post(`/v1/driver/rides/${ride.id}/arrived`)
      .set('Authorization', d.auth)
      .expect(200);
    await h.db
      .updateTable('rides')
      .set({ arrived_at: new Date(Date.now() - 9.5 * 60_000) })
      .where('id', '=', ride.id)
      .execute();
    const started = await h.http
      .post(`/v1/driver/rides/${ride.id}/start`)
      .set('Authorization', d.auth)
      .expect(200);
    // 9.5 minutes waited, 3 free: 6.5 minutes, so 7 started minutes at ₦20.
    expect(started.body.fare.waitingChargeKobo).toBe(14_000);
    const done = await h.http
      .post(`/v1/driver/rides/${ride.id}/complete`)
      .set('Authorization', d.auth)
      .send({ cashCollectedKobo: 0 })
      .expect(200);
    expect(done.body.fare.finalTotalKobo).toBe(ride.fare.quotedTotalKobo + 14_000);
  });
});

describe('cancellations', () => {
  it('is free while searching and within the grace period, then charges the fee', async () => {
    const p = await passenger(h);
    const free = await book(h, p.auth);
    const c1 = await h.http
      .post(`/v1/rides/${free.id}/cancel`)
      .set('Authorization', p.auth)
      .send({ reason: 'Changed my mind' })
      .expect(200);
    expect(c1.body).toMatchObject({
      status: 'cancelled_by_passenger',
      fare: { cancellationFeeKobo: 0 },
      cancellationReason: 'Changed my mind',
    });

    const d = await approvedDriver(h);
    await goOnline(h, d.auth, north(PICKUP.location, 300));
    const ride = await assignedRide(h, p, d);
    await h.db
      .updateTable('rides')
      .set({ assigned_at: new Date(Date.now() - 5 * 60_000) })
      .where('id', '=', ride.id)
      .execute();
    const c2 = await h.http
      .post(`/v1/rides/${ride.id}/cancel`)
      .set('Authorization', p.auth)
      .send({})
      .expect(200);
    expect(c2.body.fare.cancellationFeeKobo).toBe(30_000);
    const fee = await h.db
      .selectFrom('payments')
      .selectAll()
      .where('ride_id', '=', ride.id)
      .executeTakeFirstOrThrow();
    expect(fee).toMatchObject({
      purpose: 'cancellation_fee',
      status: 'outstanding',
      amount_kobo: '30000',
    });

    // The driver is free again and can be offered the next ride.
    expect(
      (await h.http.get('/v1/driver/rides/active').set('Authorization', d.auth).expect(200)).body
        .ride,
    ).toBeNull();
  });

  it('lets the driver report a no-show only after waiting, charging the passenger', async () => {
    const p = await passenger(h);
    const d = await approvedDriver(h);
    await goOnline(h, d.auth, north(PICKUP.location, 300));
    const ride = await assignedRide(h, p, d);
    await h.http
      .post(`/v1/driver/rides/${ride.id}/cancel`)
      .set('Authorization', d.auth)
      .send({ reason: 'passenger_no_show' })
      .expect(409);
    await h.http
      .post(`/v1/driver/rides/${ride.id}/arrived`)
      .set('Authorization', d.auth)
      .expect(200);
    const early = await h.http
      .post(`/v1/driver/rides/${ride.id}/cancel`)
      .set('Authorization', d.auth)
      .send({ reason: 'passenger_no_show' })
      .expect(409);
    expect(early.body.error.details.waitMinutes).toBe(5);
    await h.db
      .updateTable('rides')
      .set({ arrived_at: new Date(Date.now() - 6 * 60_000) })
      .where('id', '=', ride.id)
      .execute();
    const res = await h.http
      .post(`/v1/driver/rides/${ride.id}/cancel`)
      .set('Authorization', d.auth)
      .send({ reason: 'passenger_no_show' })
      .expect(200);
    expect(res.body).toMatchObject({
      status: 'cancelled_by_driver',
      fare: { cancellationFeeKobo: 30_000 },
    });
  });

  it('charges nobody when the driver cancels for another reason', async () => {
    const p = await passenger(h);
    const d = await approvedDriver(h);
    await goOnline(h, d.auth, north(PICKUP.location, 300));
    const ride = await assignedRide(h, p, d);
    const res = await h.http
      .post(`/v1/driver/rides/${ride.id}/cancel`)
      .set('Authorization', d.auth)
      .send({ reason: 'vehicle_problem', note: 'Flat tyre' })
      .expect(200);
    expect(res.body.fare.cancellationFeeKobo).toBe(0);
    const seen = (await h.http.get(`/v1/rides/${ride.id}`).set('Authorization', p.auth).expect(200))
      .body;
    expect(seen.status).toBe('cancelled_by_driver');
  });
});

describe('places and admin', () => {
  it('searches places and saves home and work (replacing the old one)', async () => {
    const p = await passenger(h);
    const found = await h.http
      .get('/v1/places/autocomplete')
      .query({ q: 'kurmi', lat: 12, lng: 8.5 })
      .set('Authorization', p.auth)
      .expect(200);
    expect(found.body[0]).toMatchObject({ primaryText: 'Kurmi Market' });
    const details = await h.http
      .get(`/v1/places/details/${found.body[0].placeId}`)
      .set('Authorization', p.auth)
      .expect(200);
    expect(details.body.location.lat).toBeCloseTo(11.9906, 3);

    const home = {
      label: 'home',
      name: 'Home',
      address: 'Gyadi-Gyadi, Kano',
      location: { lat: 11.97, lng: 8.53 },
    };
    await h.http.post('/v1/me/saved-places').set('Authorization', p.auth).send(home).expect(201);
    await h.http
      .post('/v1/me/saved-places')
      .set('Authorization', p.auth)
      .send({ ...home, address: 'Nassarawa GRA, Kano' })
      .expect(201);
    const list = await h.http.get('/v1/me/saved-places').set('Authorization', p.auth).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      label: 'home',
      address: 'Nassarawa GRA, Kano',
      location: { lat: 11.97, lng: 8.53 },
    });
  });

  it('lets only pricing managers change fares, audits it, and shows ride timelines', async () => {
    const admin = await signInWithMfa(h, nextPhone(), 'admin');
    const root = await signInWithMfa(h, nextPhone(), 'super_admin');
    const rules = await h.http
      .get('/v1/admin/fare-rules')
      .set('Authorization', admin.auth)
      .expect(200);
    const car = rules.body.find((r: { category: { key: string } }) => r.category.key === 'car');
    const { id: _id, serviceArea: _a, category: _c, createdAt: _t, ...values } = car;
    await h.http
      .put('/v1/admin/fare-rules/testville/car')
      .set('Authorization', admin.auth)
      .send(values)
      .expect(403);
    await h.http
      .put('/v1/admin/fare-rules/testville/car')
      .set('Authorization', root.auth)
      .send({ ...values, perKmKobo: 15_000 })
      .expect(200);
    const audit = await h.db
      .selectFrom('audit_logs')
      .selectAll()
      .where('action', '=', 'admin.fare_rule.changed')
      .where('actor_user_id', '=', root.userId)
      .executeTakeFirstOrThrow();
    expect(audit.metadata).toMatchObject({
      category: 'car',
      next: { perKmKobo: 15_000 },
      previous: { perKmKobo: 12_000 },
    });
    expect(
      await h.db.selectFrom('fare_rules').select('id').where('is_active', '=', false).execute(),
    ).toHaveLength(1);

    const p = await passenger(h);
    const ride = await book(h, p.auth);
    const detail = await h.http
      .get(`/v1/admin/rides/${ride.id}`)
      .set('Authorization', admin.auth)
      .expect(200);
    expect(detail.body.events.map((e: { eventType: string }) => e.eventType)).toEqual([
      'ride_requested',
      'search_started',
    ]);
  });
});
