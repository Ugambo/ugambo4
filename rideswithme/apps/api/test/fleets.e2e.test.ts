import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  DashboardView,
  FleetDriverView,
  FleetOverview,
  FleetSummary,
  LiveView,
  RideView,
} from '@rideswithme/shared-types';
import {
  createHarness,
  type Harness,
  nextPhone,
  resetState,
  signIn,
  signInWithMfa,
} from './harness';
import {
  acceptedRide,
  balance,
  expectLedgerConsistent,
  finishRide,
  topUp,
} from './payment-fixtures';
import { ask, bearer, connect } from './realtime-fixtures';
import { approvedDriver, passenger, seedCity } from './ride-fixtures';

let h: Harness;
let admin: { auth: string; userId: string };
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h.close());
beforeEach(async () => {
  await resetState(h);
  await seedCity(h);
  admin = await signInWithMfa(h, nextPhone(), 'admin');
});

/** Creates a fleet and returns its manager signed in with two-factor. */
async function fleetWithManager(name: string) {
  const phone = nextPhone();
  const created = (
    await h.http
      .post('/v1/admin/fleets')
      .set('Authorization', admin.auth)
      .send({ name, managerPhone: phone })
      .expect(201)
  ).body as FleetSummary;
  // The manager already has the fleet manager role; signing in with MFA keeps it.
  const manager = await signInWithMfa(h, phone, 'fleet_manager');
  return { fleet: created, manager, phone };
}

async function joinFleet(manager: { auth: string }, d: { auth: string; phone: string }) {
  await h.http
    .post('/v1/fleet/drivers')
    .set('Authorization', manager.auth)
    .send({ phone: d.phone })
    .expect(201);
  const { invitations } = (
    await h.http.get('/v1/driver/fleet').set('Authorization', d.auth).expect(200)
  ).body;
  await h.http
    .post(`/v1/driver/fleet-invitations/${invitations[0].id}/accept`)
    .set('Authorization', d.auth)
    .expect(200);
}

describe('fleet operators', () => {
  it('lets staff create a fleet with a manager, once per name and once per manager', async () => {
    const { fleet, phone } = await fleetWithManager('Kano Express');
    expect(fleet).toMatchObject({
      name: 'Kano Express',
      status: 'active',
      drivers: 0,
      managers: [{ phone }],
    });
    await h.http
      .post('/v1/admin/fleets')
      .set('Authorization', admin.auth)
      .send({ name: 'kano express', managerPhone: nextPhone() })
      .expect(409);
    const other = (
      await h.http
        .post('/v1/admin/fleets')
        .set('Authorization', admin.auth)
        .send({ name: 'Other', managerPhone: nextPhone() })
        .expect(201)
    ).body;
    const dup = await h.http
      .post(`/v1/admin/fleets/${other.id}/managers`)
      .set('Authorization', admin.auth)
      .send({ phone })
      .expect(409);
    expect(dup.body.error.message).toMatch(/already manages/);
    const agent = await signInWithMfa(h, nextPhone(), 'support_agent');
    await h.http.get('/v1/admin/fleets').set('Authorization', agent.auth).expect(200);
    await h.http
      .post('/v1/admin/fleets')
      .set('Authorization', agent.auth)
      .send({ name: 'Nope', managerPhone: nextPhone() })
      .expect(403);
    const actions = (await h.db.selectFrom('audit_logs').select('action').execute()).map(
      (a) => a.action,
    );
    expect(actions).toEqual(expect.arrayContaining(['fleets.created', 'fleets.manager_added']));
  });

  it('invites drivers, who must accept before the fleet sees anything about them', async () => {
    const { manager } = await fleetWithManager('Kano Express');
    const d = await approvedDriver(h);
    const unknown = await h.http
      .post('/v1/fleet/drivers')
      .set('Authorization', manager.auth)
      .send({ phone: nextPhone() })
      .expect(404);
    expect(unknown.body.error.code).toBe('DRIVER_NOT_REGISTERED');

    await h.http
      .post('/v1/fleet/drivers')
      .set('Authorization', manager.auth)
      .send({ phone: d.phone })
      .expect(201);
    await h.http
      .post('/v1/fleet/drivers')
      .set('Authorization', manager.auth)
      .send({ phone: d.phone })
      .expect(409);
    let [invited] = (
      await h.http.get('/v1/fleet/drivers').set('Authorization', manager.auth).expect(200)
    ).body as FleetDriverView[];
    expect(invited).toMatchObject({
      membership: { status: 'invited' },
      name: null,
      vehicle: null,
      driverStatus: null,
    });

    const mine = (await h.http.get('/v1/driver/fleet').set('Authorization', d.auth).expect(200))
      .body;
    expect(mine).toMatchObject({
      current: null,
      invitations: [{ fleet: { name: 'Kano Express' } }],
    });
    await h.http
      .post(`/v1/driver/fleet-invitations/${mine.invitations[0].id}/accept`)
      .set('Authorization', d.auth)
      .expect(200);
    [invited] = (
      await h.http.get('/v1/fleet/drivers').set('Authorization', manager.auth).expect(200)
    ).body as FleetDriverView[];
    expect(invited).toMatchObject({
      membership: { status: 'active', joinedAt: expect.any(String) },
      name: 'Musa Abdullahi',
      driverStatus: 'approved',
      vehicle: { plateNumber: expect.any(String) },
    });
  });

  it('keeps each fleet to its own drivers and trips', async () => {
    const a = await fleetWithManager('Fleet A');
    const b = await fleetWithManager('Fleet B');
    const d = await approvedDriver(h);
    await joinFleet(a.manager, d);
    await h.http
      .get(`/v1/fleet/drivers/${d.userId}`)
      .set('Authorization', a.manager.auth)
      .expect(200);
    await h.http
      .get(`/v1/fleet/drivers/${d.userId}`)
      .set('Authorization', b.manager.auth)
      .expect(404);
    await h.http
      .delete(`/v1/fleet/drivers/${d.userId}`)
      .set('Authorization', b.manager.auth)
      .expect(404);
    expect(
      (await h.http.get('/v1/fleet/drivers').set('Authorization', b.manager.auth).expect(200)).body,
    ).toEqual([]);

    const p = await passenger(h);
    const ride = await acceptedRide(h, p, d);
    await finishRide(h, ride.id, d);
    expect(
      (await h.http.get('/v1/fleet/trips').set('Authorization', a.manager.auth).expect(200)).body
        .items,
    ).toHaveLength(1);
    expect(
      (await h.http.get('/v1/fleet/trips').set('Authorization', b.manager.auth).expect(200)).body
        .items,
    ).toHaveLength(0);

    // A driver in one fleet cannot join another without leaving.
    await h.http
      .post('/v1/fleet/drivers')
      .set('Authorization', b.manager.auth)
      .send({ phone: d.phone })
      .expect(201);
    const inv = (await h.http.get('/v1/driver/fleet').set('Authorization', d.auth).expect(200)).body
      .invitations[0];
    expect(
      (
        await h.http
          .post(`/v1/driver/fleet-invitations/${inv.id}/accept`)
          .set('Authorization', d.auth)
          .expect(409)
      ).body.error.message,
    ).toMatch(/Leave your current fleet/);
  });

  it('shows trips only from when the driver joined until they left', async () => {
    const { manager } = await fleetWithManager('Kano Express');
    const d = await approvedDriver(h);
    const p = await passenger(h);
    const before = await acceptedRide(h, p, d);
    const doneBefore = await finishRide(h, before.id, d);
    await joinFleet(manager, d);
    const during = await acceptedRide(h, p, d, { paymentMethod: 'cash' });
    const doneDuring = await finishRide(h, during.id, d);
    await h.http.post('/v1/driver/fleet/leave').set('Authorization', d.auth).expect(200);
    const after = await acceptedRide(h, p, d);
    await finishRide(h, after.id, d);

    const trips = (
      await h.http.get('/v1/fleet/trips').set('Authorization', manager.auth).expect(200)
    ).body.items;
    expect(trips.map((t: { id: string }) => t.id)).toEqual([during.id]);
    expect(trips[0]).toMatchObject({
      fareKobo: doneDuring.fare.finalTotalKobo,
      earningsKobo: doneDuring.earnings!.netKobo,
    });
    expect(doneBefore.id).toBe(before.id);
    const overview = (await h.http.get('/v1/fleet').set('Authorization', manager.auth).expect(200))
      .body as FleetOverview;
    expect(overview.today).toMatchObject({ trips: 1, earningsKobo: doneDuring.earnings!.netKobo });
    expect(overview.drivers.active).toBe(0);
  });

  it('needs a manager with two-factor and an active fleet', async () => {
    const { fleet, manager, phone } = await fleetWithManager('Kano Express');
    const p = await passenger(h);
    await h.http.get('/v1/fleet').set('Authorization', p.auth).expect(403);
    const noMfa = await signIn(h, phone);
    const res = await h.http
      .get('/v1/fleet')
      .set('Authorization', `Bearer ${noMfa.tokens.accessToken}`)
      .expect(403);
    expect(res.body.error.code).toBe('MFA_REQUIRED');
    await h.http
      .post(`/v1/admin/fleets/${fleet.id}/suspend`)
      .set('Authorization', admin.auth)
      .expect(200);
    expect(
      (await h.http.get('/v1/fleet').set('Authorization', manager.auth).expect(403)).body.error
        .message,
    ).toMatch(/suspended/);
  });
});

describe('stopping a stuck ride', () => {
  it('lets staff stop a ride: nobody is charged, the hold goes back, and it is audited', async () => {
    const p = await passenger(h);
    const d = await approvedDriver(h);
    await topUp(h, p.auth, 500_000);
    const ride = await acceptedRide(h, p, d, { paymentMethod: 'wallet' });
    await h.http
      .post(`/v1/driver/rides/${ride.id}/arrived`)
      .set('Authorization', d.auth)
      .expect(200);
    await h.http.post(`/v1/driver/rides/${ride.id}/start`).set('Authorization', d.auth).expect(200);

    const agent = await signInWithMfa(h, nextPhone(), 'support_agent');
    await h.http
      .post(`/v1/admin/rides/${ride.id}/cancel`)
      .set('Authorization', agent.auth)
      .send({ reason: 'Driver phone lost' })
      .expect(403);
    const stopped = (
      await h.http
        .post(`/v1/admin/rides/${ride.id}/cancel`)
        .set('Authorization', admin.auth)
        .send({ reason: 'Driver phone lost' })
        .expect(200)
    ).body as RideView;
    expect(stopped).toMatchObject({
      status: 'cancelled_by_admin',
      cancellationReason: 'Driver phone lost',
    });
    expect(await balance(h, p.userId)).toBe(500_000);
    await h.http
      .post(`/v1/admin/rides/${ride.id}/cancel`)
      .set('Authorization', admin.auth)
      .send({ reason: 'Again' })
      .expect(409);
    // The driver is free for new rides.
    expect(
      (await h.http.get('/v1/driver/rides/active').set('Authorization', d.auth).expect(200)).body
        .ride,
    ).toBeNull();
    const detail = (
      await h.http.get(`/v1/admin/rides/${ride.id}`).set('Authorization', admin.auth).expect(200)
    ).body;
    expect(detail.events.map((e: { eventType: string }) => e.eventType)).toContain(
      'cancelled_by_admin',
    );
    expect(
      (
        await h.db
          .selectFrom('audit_logs')
          .select('action')
          .where('action', '=', 'rides.cancelled_by_admin')
          .execute()
      ).length,
    ).toBe(1);
    await expectLedgerConsistent(h);
  });
});

describe('dashboard', () => {
  it('counts riders, drivers, trips and revenue today, by Nigerian day', async () => {
    const p = await passenger(h);
    const d = await approvedDriver(h);
    const ride = await acceptedRide(h, p, d);
    const done = await finishRide(h, ride.id, d);
    const view = (
      await h.http.get('/v1/admin/dashboard').set('Authorization', admin.auth).expect(200)
    ).body as DashboardView;
    expect(view.kpis).toMatchObject({
      tripsToday: 1,
      drivers: 1,
      driversOnline: 1,
      activeRides: 0,
      faresTodayKobo: done.fare.finalTotalKobo,
      revenueTodayKobo: done.earnings!.bookingFeeKobo + done.earnings!.commissionKobo,
    });
    expect(view.kpis.riders).toBeGreaterThanOrEqual(1);
    expect(view.days).toHaveLength(14);
    expect(view.days.at(-1)).toMatchObject({ trips: 1, faresKobo: done.fare.finalTotalKobo });
  });

  it('shows online drivers and active rides, then streams changes to staff only', async () => {
    const p = await passenger(h);
    const d = await approvedDriver(h);
    const ride = await acceptedRide(h, p, d);
    const live = (await h.http.get('/v1/admin/live').set('Authorization', admin.auth).expect(200))
      .body as LiveView;
    expect(live.drivers).toEqual([
      expect.objectContaining({ driverId: d.userId, rideId: ride.id, name: 'Musa Abdullahi' }),
    ]);
    expect(live.rides).toEqual([
      expect.objectContaining({ id: ride.id, status: 'driver_assigned', driverId: d.userId }),
    ]);

    const staff = await connect(h, bearer(admin.auth));
    const rider = await connect(h, bearer(p.auth));
    try {
      expect(await ask(staff, 'ops:subscribe', {})).toEqual({ ok: true });
      expect(await ask(rider, 'ops:subscribe', {})).toEqual({ ok: false, code: 'FORBIDDEN' });
      await h.http
        .post(`/v1/driver/rides/${ride.id}/arrived`)
        .set('Authorization', d.auth)
        .expect(200);
      const update = await staff.next<{ id: string; status: string }>(
        'ops:ride',
        (r) => r.status === 'driver_arrived',
      );
      expect(update.id).toBe(ride.id);
      await h.http
        .post('/v1/driver/location')
        .set('Authorization', d.auth)
        .send({ points: [{ lat: 12.0001, lng: 8.5167, recordedAt: new Date().toISOString() }] })
        .expect(200);
      expect(await staff.next('ops:driver')).toMatchObject({ driverId: d.userId, rideId: ride.id });
    } finally {
      staff.close();
      rider.close();
    }
  });
});
