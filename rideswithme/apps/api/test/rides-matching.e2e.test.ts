import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness, resetState } from './harness';
import {
  approvedDriver,
  assignedRide,
  book,
  currentOffer,
  dispatcher,
  goOnline,
  north,
  passenger,
  PICKUP,
  seedCity,
} from './ride-fixtures';
import { RideService } from '../src/rides/ride.service';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h.close());
beforeEach(async () => {
  await resetState(h);
  await seedCity(h);
});

const later = (seconds: number) => new Date(Date.now() + seconds * 1000);

describe('going online', () => {
  it('requires an approved driver with valid documents', async () => {
    const p = await passenger(h);
    const res = await h.http
      .post('/v1/driver/availability')
      .set('Authorization', p.auth)
      .send({
        online: true,
        location: { ...PICKUP.location, recordedAt: new Date().toISOString() },
      })
      .expect(404);
    expect(res.body.error.code).toBe('DRIVER_NOT_REGISTERED');

    const d = await approvedDriver(h);
    await h.db
      .updateTable('driver_documents')
      .set({ expires_on: '2020-01-01' })
      .where('driver_user_id', '=', d.userId)
      .where('document_type', '=', 'drivers_licence')
      .execute();
    const blocked = await h.http
      .post('/v1/driver/availability')
      .set('Authorization', d.auth)
      .send({
        online: true,
        location: { ...PICKUP.location, recordedAt: new Date().toISOString() },
      })
      .expect(403);
    expect(blocked.body.error).toMatchObject({
      code: 'DRIVER_NOT_ELIGIBLE',
      details: { blockers: [{ code: 'DOCUMENT_EXPIRED', documentType: 'drivers_licence' }] },
    });
  });

  it('keeps the newest position when buffered readings arrive late or out of order', async () => {
    const d = await approvedDriver(h);
    await goOnline(h, d.auth, PICKUP.location);
    const t = Date.now();
    const newer = { ...north(PICKUP.location, 500), recordedAt: new Date(t + 2000).toISOString() };
    const older = { ...north(PICKUP.location, 100), recordedAt: new Date(t + 1000).toISOString() };
    await h.http
      .post('/v1/driver/location')
      .set('Authorization', d.auth)
      .send({ points: [older, newer] })
      .expect(200);
    const stale = {
      ...north(PICKUP.location, 900),
      recordedAt: new Date(t - 60_000).toISOString(),
    };
    const res = await h.http
      .post('/v1/driver/location')
      .set('Authorization', d.auth)
      .send({ points: [stale] })
      .expect(200);
    expect(res.body.position.lat).toBeCloseTo(newer.lat, 6);
    expect(res.body.position.recordedAt).toBe(newer.recordedAt);
  });
});

describe('matching', () => {
  it('offers the ride to the nearest driver first, then the next when the offer expires', async () => {
    const near = await approvedDriver(h);
    const far = await approvedDriver(h);
    await goOnline(h, near.auth, north(PICKUP.location, 300));
    await goOnline(h, far.auth, north(PICKUP.location, 1500));
    const p = await passenger(h);
    const ride = await book(h, p.auth);

    await dispatcher(h).tick();
    const first = await currentOffer(h, near.auth);
    expect(first?.rideId).toBe(ride.id);
    expect(await currentOffer(h, far.auth)).toBeNull();

    await dispatcher(h).tick(later(16));
    expect(await currentOffer(h, far.auth)).toMatchObject({ rideId: ride.id });
    const late = await h.http
      .post(`/v1/driver/offers/${first!.offerId}/accept`)
      .set('Authorization', near.auth)
      .expect(409);
    expect(late.body.error.code).toBe('OFFER_UNAVAILABLE');

    const events = await h.db
      .selectFrom('ride_events')
      .select('event_type')
      .where('ride_id', '=', ride.id)
      .orderBy('seq')
      .execute();
    expect(events.map((e) => e.event_type)).toEqual([
      'ride_requested',
      'search_started',
      'offer_sent',
      'offer_expired',
      'offer_sent',
    ]);
  });

  it('moves on immediately when a driver rejects', async () => {
    const a = await approvedDriver(h);
    const b = await approvedDriver(h);
    await goOnline(h, a.auth, north(PICKUP.location, 200));
    await goOnline(h, b.auth, north(PICKUP.location, 900));
    const p = await passenger(h);
    await book(h, p.auth);
    await dispatcher(h).tick();
    const offer = await currentOffer(h, a.auth);
    await h.http
      .post(`/v1/driver/offers/${offer!.offerId}/reject`)
      .set('Authorization', a.auth)
      .expect(204);
    await dispatcher(h).tick();
    expect(await currentOffer(h, b.auth)).not.toBeNull();
    // A driver who said no is not asked again for the same ride.
    await dispatcher(h).tick(later(16));
    expect(await currentOffer(h, a.auth)).toBeNull();
  });

  it('only matches the booked vehicle type', async () => {
    const keke = await approvedDriver(h, 'keke_napep');
    await goOnline(h, keke.auth, north(PICKUP.location, 200));
    const p = await passenger(h);
    await book(h, p.auth, 'car');
    await dispatcher(h).tick();
    expect(await currentOffer(h, keke.auth)).toBeNull();
  });

  it('skips drivers whose position is stale, who are offline, busy, or no longer eligible', async () => {
    const stale = await approvedDriver(h);
    const offline = await approvedDriver(h);
    const busy = await approvedDriver(h);
    const expired = await approvedDriver(h);
    for (const d of [stale, offline, busy, expired])
      await goOnline(h, d.auth, north(PICKUP.location, 300));
    await h.redis.hset(
      `driver:presence:${stale.userId}`,
      'receivedAt',
      new Date(Date.now() - 5 * 60_000).toISOString(),
    );
    await h.http
      .post('/v1/driver/availability')
      .set('Authorization', offline.auth)
      .send({ online: false })
      .expect(200);
    await h.db
      .updateTable('driver_documents')
      .set({ expires_on: '2020-01-01' })
      .where('driver_user_id', '=', expired.userId)
      .where('document_type', '=', 'insurance_certificate')
      .execute();
    // "busy" takes a ride first.
    const first = await passenger(h);
    await h.redis.hset(`driver:presence:${stale.userId}`, 'online', '0');
    await h.redis.hset(`driver:presence:${expired.userId}`, 'online', '0');
    await assignedRide(h, first, busy);
    await h.redis.hset(`driver:presence:${stale.userId}`, 'online', '1');
    await h.redis.hset(`driver:presence:${expired.userId}`, 'online', '1');
    await h.redis.geoadd(
      'drivers:geo:car',
      PICKUP.location.lng,
      north(PICKUP.location, 300).lat,
      stale.userId,
      PICKUP.location.lng,
      north(PICKUP.location, 300).lat,
      expired.userId,
    );

    const p = await passenger(h);
    await book(h, p.auth);
    await dispatcher(h).tick();
    for (const d of [stale, offline, busy, expired])
      expect(await currentOffer(h, d.auth)).toBeNull();
    // The driver whose documents lapsed was taken offline.
    expect(
      (await h.http.get('/v1/driver/availability').set('Authorization', expired.auth).expect(200))
        .body.online,
    ).toBe(false);
  });

  it('gives up with no_driver_found after the search time limit', async () => {
    const p = await passenger(h);
    const ride = await book(h, p.auth);
    await dispatcher(h).tick(later(100));
    expect(
      (await h.http.get(`/v1/rides/${ride.id}`).set('Authorization', p.auth).expect(200)).body
        .status,
    ).toBe('searching');
    await dispatcher(h).tick(later(181));
    expect(
      (await h.http.get(`/v1/rides/${ride.id}`).set('Authorization', p.auth).expect(200)).body
        .status,
    ).toBe('no_driver_found');
  });

  it('widens the search radius when nobody is near', async () => {
    const d = await approvedDriver(h);
    await goOnline(h, d.auth, north(PICKUP.location, 4_000));
    const p = await passenger(h);
    await book(h, p.auth);
    await dispatcher(h).tick();
    expect(await currentOffer(h, d.auth)).toBeNull(); // 3 km
    await dispatcher(h).tick();
    expect(await currentOffer(h, d.auth)).not.toBeNull(); // 5 km
  });

  it('dispatches straight after booking without waiting for the next tick', async () => {
    const d = await approvedDriver(h);
    await goOnline(h, d.auth, north(PICKUP.location, 300));
    const svc = h.app.get(RideService);
    let dispatched: Promise<unknown> = Promise.resolve();
    svc.onRideSearching = (rideId) => {
      dispatched = dispatcher(h).dispatchRide(rideId);
    };
    const p = await passenger(h);
    await book(h, p.auth);
    await dispatched;
    expect(await currentOffer(h, d.auth)).not.toBeNull();
  });
});

describe('acceptance is atomic', () => {
  it('lets exactly one of two drivers win a ride when both accept at the same moment', async () => {
    const a = await approvedDriver(h);
    const b = await approvedDriver(h);
    await goOnline(h, a.auth, north(PICKUP.location, 200));
    await goOnline(h, b.auth, north(PICKUP.location, 250));
    const p = await passenger(h);
    const ride = await book(h, p.auth);
    // Force the worst case: both drivers hold an open offer for the same ride.
    const expires = later(15);
    const offers = await h.db
      .insertInto('ride_requests')
      .values([
        {
          ride_id: ride.id,
          driver_id: a.userId,
          distance_to_pickup_meters: 200,
          expires_at: expires,
        },
        {
          ride_id: ride.id,
          driver_id: b.userId,
          distance_to_pickup_meters: 250,
          expires_at: expires,
        },
      ])
      .returning(['id', 'driver_id'])
      .execute();

    for (let round = 0; round < 5; round++) {
      const results = await Promise.all(
        offers.map((o) =>
          h.http
            .post(`/v1/driver/offers/${o.id}/accept`)
            .set('Authorization', o.driver_id === a.userId ? a.auth : b.auth),
        ),
      );
      if (round === 0) {
        expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
        const winner = results.find((r) => r.status === 200)!;
        const row = await h.db
          .selectFrom('rides')
          .select(['driver_id', 'status'])
          .where('id', '=', ride.id)
          .executeTakeFirstOrThrow();
        expect(row.status).toBe('driver_assigned');
        expect(winner.body.id).toBe(ride.id);
        const assigned = await h.db
          .selectFrom('ride_events')
          .select('event_type')
          .where('ride_id', '=', ride.id)
          .where('event_type', '=', 'driver_assigned')
          .execute();
        expect(assigned).toHaveLength(1);
        const loserOffer = await h.db
          .selectFrom('ride_requests')
          .select('status')
          .where('driver_id', '!=', row.driver_id!)
          .where('ride_id', '=', ride.id)
          .executeTakeFirstOrThrow();
        expect(['withdrawn', 'offered']).toContain(loserOffer.status);
      } else {
        // Retrying changes nothing.
        expect(results.every((r) => r.status === 409)).toBe(true);
      }
    }
  });

  it('never gives one driver two active rides', async () => {
    const d = await approvedDriver(h);
    await goOnline(h, d.auth, north(PICKUP.location, 200));
    const p1 = await passenger(h);
    const p2 = await passenger(h);
    await assignedRide(h, p1, d);
    const second = await book(h, p2.auth);
    const offer = await h.db
      .insertInto('ride_requests')
      .values({
        ride_id: second.id,
        driver_id: d.userId,
        distance_to_pickup_meters: 200,
        expires_at: later(15),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const res = await h.http
      .post(`/v1/driver/offers/${offer.id}/accept`)
      .set('Authorization', d.auth)
      .expect(409);
    expect(res.body.error.code).toBe('OFFER_UNAVAILABLE');
    expect(
      (
        await h.db
          .selectFrom('rides')
          .select('status')
          .where('id', '=', second.id)
          .executeTakeFirstOrThrow()
      ).status,
    ).toBe('searching');
  });

  it('stops drivers acting on rides that are not theirs', async () => {
    const d = await approvedDriver(h);
    const other = await approvedDriver(h);
    await goOnline(h, d.auth, north(PICKUP.location, 200));
    const p = await passenger(h);
    const ride = await assignedRide(h, p, d);
    await h.http
      .post(`/v1/driver/rides/${ride.id}/arrived`)
      .set('Authorization', other.auth)
      .expect(404);
    await h.http.get(`/v1/driver/rides/${ride.id}`).set('Authorization', other.auth).expect(404);
  });
});
