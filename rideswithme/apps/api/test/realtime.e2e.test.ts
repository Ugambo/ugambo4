import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DriverOfferView, DriverRideView, RideView } from '@rideswithme/shared-types';
import { MaintenanceService } from '../src/rides/maintenance.service';
import { RealtimeGateway } from '../src/realtime/realtime.gateway';
import { createHarness, type Harness, nextPhone, resetState, signInWithMfa } from './harness';
import { ask, bearer, connect, type TestSocket } from './realtime-fixtures';
import {
  approvedDriver,
  assignedRide,
  book,
  dispatcher,
  goOnline,
  north,
  passenger,
  PICKUP,
  seedCity,
} from './ride-fixtures';

let h: Harness;
const open: TestSocket[] = [];
async function sock(harness: Harness, auth: string) {
  const s = await connect(harness, bearer(auth));
  open.push(s);
  return s;
}

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h.close());
beforeEach(async () => {
  for (const s of open.splice(0)) s.close();
  await resetState(h);
  await seedCity(h);
});

const point = (lat: number, lng: number, secondsAgo = 0, accuracy = 8) => ({
  lat,
  lng,
  accuracy,
  recordedAt: new Date(Date.now() - secondsAgo * 1000).toISOString(),
});

describe('connecting', () => {
  it('refuses missing, invalid and revoked credentials', async () => {
    await expect(connect(h, undefined)).rejects.toThrow('UNAUTHENTICATED');
    await expect(connect(h, 'not-a-token')).rejects.toThrow('UNAUTHENTICATED');
    const p = await passenger(h);
    await h.http.post('/v1/auth/logout').set('Authorization', p.auth).expect(204);
    await expect(connect(h, bearer(p.auth))).rejects.toThrow('SESSION_REVOKED');
  });

  it('accepts a short-lived realtime ticket, which cannot be used as an API token', async () => {
    const p = await passenger(h);
    const res = await h.http
      .post('/v1/auth/realtime-ticket')
      .set('Authorization', p.auth)
      .expect(200);
    expect(res.body.expiresIn).toBe(60);
    const s = await connect(h, res.body.ticket);
    open.push(s);
    expect(s.socket.connected).toBe(true);
    await h.http.get('/v1/me').set('Authorization', `Bearer ${res.body.ticket}`).expect(401);
  });

  it('closes connections whose session is signed out', async () => {
    const p = await passenger(h);
    const s = await sock(h, p.auth);
    await h.http.post('/v1/auth/logout').set('Authorization', p.auth).expect(204);
    const ended = s.next<{ code: string }>('session:ended');
    expect(await h.app.get(RealtimeGateway).sweepSessions()).toBe(1);
    expect((await ended).code).toBe('SESSION_REVOKED');
  });
});

describe('live ride updates', () => {
  it('pushes every step of a trip to passenger and driver, with live driver positions', async () => {
    const p = await passenger(h);
    const d = await approvedDriver(h);
    await goOnline(h, d.auth, north(PICKUP.location, 400));
    const ps = await sock(h, p.auth);
    const ds = await sock(h, d.auth);

    const ride = await book(h, p.auth);
    expect((await ps.next<RideView>('ride:updated', (r) => r.id === ride.id)).status).toBe(
      'searching',
    );

    await dispatcher(h).tick();
    const offer = await ds.next<DriverOfferView>('offer:new');
    expect(offer).toMatchObject({ rideId: ride.id, fareKobo: ride.fare.quotedTotalKobo });

    await h.http
      .post(`/v1/driver/offers/${offer.offerId}/accept`)
      .set('Authorization', d.auth)
      .expect(200);
    const assigned = await ps.next<RideView>('ride:updated', (r) => r.status === 'driver_assigned');
    expect(assigned.driver).toMatchObject({ firstName: 'Musa' });
    expect(
      (await ds.next<DriverRideView>('ride:updated', (r) => r.status === 'driver_assigned'))
        .passenger.firstName,
    ).toBeTruthy();

    // The driver's position goes to the passenger over the same connection.
    const ack = await ask<{ ok: boolean }>(ds, 'location:update', {
      points: [point(12.001, 8.5167)],
    });
    expect(ack.ok).toBe(true);
    const pos = await ps.next<{
      rideId: string;
      position: { lat: number; recordedAt: string; receivedAt: string };
    }>('driver:position');
    expect(pos.rideId).toBe(ride.id);
    expect(pos.position.lat).toBeCloseTo(12.001, 6);
    expect(pos.position.receivedAt).toBeTruthy();

    await h.http
      .post(`/v1/driver/rides/${ride.id}/arrived`)
      .set('Authorization', d.auth)
      .expect(200);
    await ps.next<RideView>('ride:updated', (r) => r.status === 'driver_arrived');
    await h.http.post(`/v1/driver/rides/${ride.id}/start`).set('Authorization', d.auth).expect(200);
    await ps.next<RideView>('ride:updated', (r) => r.status === 'in_progress');

    // Pretend the trip started a minute ago, then drive ~1.1 km north in 10 steps
    // recorded during it (sent over HTTP this time).
    await h.db
      .updateTable('rides')
      .set({
        assigned_at: new Date(Date.now() - 120_000),
        started_at: new Date(Date.now() - 60_000),
      })
      .where('id', '=', ride.id)
      .execute();
    // The earlier position (on the way to pickup) would now fall inside the backdated trip.
    await h.db.deleteFrom('trip_locations').execute();
    const points = Array.from({ length: 11 }, (_, i) =>
      point(12.0 + i * 0.001, 8.5167, 50 - i * 2),
    );
    await h.http
      .post('/v1/driver/location')
      .set('Authorization', d.auth)
      .send({ points })
      .expect(200);

    await h.http
      .post(`/v1/driver/rides/${ride.id}/complete`)
      .set('Authorization', d.auth)
      .send({ cashCollectedKobo: ride.fare.quotedTotalKobo })
      .expect(200);
    const done = await ps.next<RideView>('ride:updated', (r) => r.status === 'completed');
    expect(done.actualDistanceMeters).toBeGreaterThan(1000);
    expect(done.actualDistanceMeters).toBeLessThan(1200);
    expect(done.driver?.position).toBeNull();
  });

  it('tells the driver when an offer expires or is withdrawn', async () => {
    const p = await passenger(h);
    const d = await approvedDriver(h);
    await goOnline(h, d.auth, north(PICKUP.location, 300));
    const ds = await sock(h, d.auth);
    await book(h, p.auth);
    await dispatcher(h).tick();
    const offer = await ds.next<DriverOfferView>('offer:new');
    await dispatcher(h).tick(new Date(Date.now() + 16_000));
    expect(await ds.next('offer:closed')).toEqual({ offerId: offer.offerId, reason: 'expired' });

    const p2 = await passenger(h);
    const ride2 = await book(h, p2.auth);
    await dispatcher(h).tick();
    const offer2 = await ds.next<DriverOfferView>('offer:new', (o) => o.rideId === ride2.id);
    await h.http
      .post(`/v1/rides/${ride2.id}/cancel`)
      .set('Authorization', p2.auth)
      .send({})
      .expect(200);
    expect(await ds.next('offer:closed')).toEqual({ offerId: offer2.offerId, reason: 'withdrawn' });
  });

  it('reaches a client connected to a different API copy (Redis adapter)', async () => {
    const other = await createHarness();
    try {
      const p = await passenger(h);
      const onOther = await sock(other, p.auth);
      const ride = await book(h, p.auth); // handled by the first copy
      expect((await onOther.next<RideView>('ride:updated', (r) => r.id === ride.id)).status).toBe(
        'searching',
      );
    } finally {
      for (const s of open.splice(0)) s.close();
      await other.close();
    }
  });
});

describe('watching rides', () => {
  it('lets only the passenger, the driver and verified staff subscribe to a ride', async () => {
    const p = await passenger(h);
    const stranger = await passenger(h);
    const ride = await book(h, p.auth);
    expect(await ask(await sock(h, p.auth), 'ride:subscribe', { rideId: ride.id })).toEqual({
      ok: true,
    });
    expect(await ask(await sock(h, stranger.auth), 'ride:subscribe', { rideId: ride.id })).toEqual({
      ok: false,
      code: 'NOT_FOUND',
    });

    const admin = await signInWithMfa(h, nextPhone(), 'admin');
    const staff = await sock(h, admin.auth);
    expect(await ask(staff, 'ride:subscribe', { rideId: ride.id })).toEqual({ ok: true });
    const watched = staff.next<RideView>(
      'ride:updated',
      (r) => r.status === 'cancelled_by_passenger',
    );
    await h.http
      .post(`/v1/rides/${ride.id}/cancel`)
      .set('Authorization', p.auth)
      .send({})
      .expect(200);
    await watched;

    // Staff whose session has not passed two-factor get no staff powers over realtime either.
    const unverified = await approvedStaffWithoutMfa();
    expect(await ask(await sock(h, unverified), 'ride:subscribe', { rideId: ride.id })).toEqual({
      ok: false,
      code: 'NOT_FOUND',
    });
  });

  it('accepts locations only from drivers', async () => {
    const p = await passenger(h);
    expect(
      await ask(await sock(h, p.auth), 'location:update', { points: [point(12, 8.5)] }),
    ).toEqual({ ok: false, code: 'FORBIDDEN' });
  });
});

describe('location history', () => {
  it('stores readings only while a ride is assigned, attributing late uploads to the right ride', async () => {
    const p = await passenger(h);
    const d = await approvedDriver(h);
    await goOnline(h, d.auth, north(PICKUP.location, 300));
    // Not on a ride: not stored.
    const idle = await h.http
      .post('/v1/driver/location')
      .set('Authorization', d.auth)
      .send({ points: [point(12, 8.51)] })
      .expect(200);
    expect(idle.body.stored).toBe(0);

    const ride = await assignedRide(h, p, d);
    const during = point(12.0005, 8.5167);
    await h.http
      .post(`/v1/driver/rides/${ride.id}/cancel`)
      .set('Authorization', d.auth)
      .send({ reason: 'other' })
      .expect(200);
    // Uploaded after the ride ended (e.g. buffered offline), but recorded during it.
    const late = await h.http
      .post('/v1/driver/location')
      .set('Authorization', d.auth)
      .send({ points: [during, point(12.002, 8.5167)] })
      .expect(200);
    expect(late.body.stored).toBe(1);
    const rows = await h.db.selectFrom('trip_locations').select(['ride_id', 'driver_id']).execute();
    expect(rows).toEqual([{ ride_id: ride.id, driver_id: d.userId }]);

    // Readings older than the 48 h window are dropped.
    const ancient = await h.http
      .post('/v1/driver/location')
      .set('Authorization', d.auth)
      .send({ points: [point(12, 8.5, 72 * 3600)] })
      .expect(200);
    expect(ancient.body.stored).toBe(0);
  });

  it('keeps daily partitions ready and drops days past retention', async () => {
    const m = h.app.get(MaintenanceService);
    const future = new Date(Date.now() + 30 * 86_400_000);
    expect((await m.maintainPartitions(future)).created).toBeGreaterThanOrEqual(8);
    expect((await m.maintainPartitions(future)).created).toBe(0);
    // 200 days later, partitions from today are past 90-day retention.
    expect(
      (await m.maintainPartitions(new Date(Date.now() + 200 * 86_400_000))).dropped,
    ).toBeGreaterThan(0);
  });
});

async function approvedStaffWithoutMfa() {
  const { signIn, grantRole } = await import('./harness');
  const s = await signIn(h, nextPhone());
  await grantRole(h, s.user.id, 'admin');
  return `Bearer ${s.tokens.accessToken}`;
}
