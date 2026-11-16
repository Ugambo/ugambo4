import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  AdminIncidentView,
  AdminSosAlertView,
  NotificationView,
  PublicTripView,
  RideMessageView,
  SosAlertView,
} from '@rideswithme/shared-types';
import { LogPushProvider, PUSH_PROVIDER } from '../src/notifications/push.provider';
import { createHarness, type Harness, nextPhone, resetState, signInWithMfa } from './harness';
import { acceptedRide, finishRide } from './payment-fixtures';
import { ask, bearer, connect } from './realtime-fixtures';
import { approvedDriver, goOnline, north, passenger, PICKUP, seedCity } from './ride-fixtures';

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

const inbox = async (auth: string) =>
  (await h.http.get('/v1/me/notifications').set('Authorization', auth).expect(200)).body as {
    items: NotificationView[];
    unread: number;
  };

describe('SOS', () => {
  it('alerts staff at once with location, ride and phones; repeat presses add to the same alert', async () => {
    const p = await passenger(h);
    const d = await approvedDriver(h);
    const ride = await acceptedRide(h, p, d);
    const staff = await connect(h, bearer(admin.auth));
    expect(await ask(staff, 'ops:subscribe', {})).toEqual({ ok: true });
    const pushed = staff.next<AdminSosAlertView>('sos:alert');

    const res = await h.http
      .post('/v1/sos')
      .set('Authorization', p.auth)
      .send({ location: { lat: 12.001, lng: 8.517 }, note: 'Driver is not following the route' })
      .expect(201);
    const alert = res.body as SosAlertView;
    expect(alert).toMatchObject({ status: 'open', rideId: ride.id });

    const live = await pushed;
    expect(live).toMatchObject({
      id: alert.id,
      raisedAs: 'passenger',
      location: { lat: 12.001, lng: 8.517, source: 'device' },
      ride: { id: ride.id, driver: { plate: expect.any(String) } },
    });
    expect(live.ride!.driver!.phone).toMatch(/^\+234/);
    const texts = h.sms.messages.filter((m) => m.to.startsWith('+234809999'));
    expect(texts).toHaveLength(2);
    expect(texts[0]!.text).toContain('RideswithMe SOS');
    expect(texts[0]!.text).toContain('https://maps.google.com/?q=12.00100,8.51700');

    const again = (await h.http.post('/v1/sos').set('Authorization', p.auth).send({}).expect(201))
      .body;
    expect(again.id).toBe(alert.id);
    expect(h.sms.messages.filter((m) => m.to.startsWith('+234809999'))).toHaveLength(2);
    const list = (await h.http.get('/v1/admin/sos?status=open').set('Authorization', admin.auth))
      .body;
    expect(list).toHaveLength(1);
    expect(list[0].presses).toBe(2);
    const events = await h.db
      .selectFrom('ride_events')
      .select('event_type')
      .where('ride_id', '=', ride.id)
      .execute();
    expect(events.map((e) => e.event_type)).toContain('sos_raised');
    staff.close();
  });

  it('never refuses a press: no ride and no location still raise an alert, located by the driver', async () => {
    const p = await passenger(h);
    const bare = (await h.http.post('/v1/sos').set('Authorization', p.auth).send({}).expect(201))
      .body;
    expect(bare.rideId).toBeNull();
    const v = (await h.http.get(`/v1/admin/sos/${bare.id}`).set('Authorization', admin.auth)).body;
    expect(v.location).toBeNull();

    const d = await approvedDriver(h);
    await goOnline(h, d.auth, north(PICKUP.location, 500));
    const byDriver = (
      await h.http.post('/v1/sos').set('Authorization', d.auth).send({}).expect(201)
    ).body;
    const dv = (await h.http.get(`/v1/admin/sos/${byDriver.id}`).set('Authorization', admin.auth))
      .body;
    expect(dv).toMatchObject({ raisedAs: 'driver', location: { source: 'driver_position' } });
  });

  it('staff acknowledge and resolve; the person is told; only safety staff see alerts', async () => {
    const p = await passenger(h);
    const a = (await h.http.post('/v1/sos').set('Authorization', p.auth).send({}).expect(201)).body;
    const support = await signInWithMfa(h, nextPhone(), 'support_agent');
    await h.http.get('/v1/admin/sos').set('Authorization', support.auth).expect(200);
    await h.http.get('/v1/admin/sos').set('Authorization', p.auth).expect(403);

    await h.http
      .post(`/v1/admin/sos/${a.id}/acknowledge`)
      .set('Authorization', support.auth)
      .expect(200);
    expect((await h.http.get('/v1/sos/current').set('Authorization', p.auth)).body.status).toBe(
      'acknowledged',
    );
    expect((await inbox(p.auth)).items[0]!.title).toBe('Help is coming');
    await h.http
      .post(`/v1/admin/sos/${a.id}/resolve`)
      .set('Authorization', support.auth)
      .send({ note: 'Called the passenger; they are safe at home' })
      .expect(200);
    expect((await h.http.get('/v1/sos/current').set('Authorization', p.auth)).body).toEqual({});
    await h.http
      .post(`/v1/admin/sos/${a.id}/resolve`)
      .set('Authorization', support.auth)
      .send({ note: 'again' })
      .expect(409);
    const audit = await h.db
      .selectFrom('audit_logs')
      .select('action')
      .where('action', 'like', 'safety.%')
      .execute();
    expect(audit.map((x) => x.action)).toEqual(
      expect.arrayContaining([
        'safety.sos_raised',
        'safety.sos_acknowledged',
        'safety.sos_resolved',
      ]),
    );
  });
});

describe('trip sharing', () => {
  it('lets anyone with the link follow the trip, without phone numbers, until shortly after it ends', async () => {
    const p = await passenger(h);
    const d = await approvedDriver(h);
    const ride = await acceptedRide(h, p, d);
    await h.http.post(`/v1/rides/${ride.id}/share`).set('Authorization', d.auth).expect(404);
    const first = (
      await h.http.post(`/v1/rides/${ride.id}/share`).set('Authorization', p.auth).expect(201)
    ).body;
    expect(first.url).toMatch(/^http:\/\/localhost:3002\/track\/[A-Za-z0-9_-]{32}$/);
    const token = (url: string) => url.split('/').pop()!;

    const seen = (await h.http.get(`/v1/share/${token(first.url)}`).expect(200))
      .body as PublicTripView;
    expect(seen).toMatchObject({
      status: 'driver_assigned',
      active: true,
      pickupAddress: ride.pickup.address,
    });
    expect(seen.driver?.vehicle.plateNumber).toBeTruthy();
    expect(seen.position).not.toBeNull();
    expect(JSON.stringify(seen)).not.toMatch(/\+234/);

    // A new link replaces the old one.
    const second = (
      await h.http.post(`/v1/rides/${ride.id}/share`).set('Authorization', p.auth).expect(201)
    ).body;
    await h.http.get(`/v1/share/${token(first.url)}`).expect(404);
    await finishRide(h, ride.id, d);
    const after = (await h.http.get(`/v1/share/${token(second.url)}`).expect(200)).body;
    expect(after).toMatchObject({ status: 'completed', active: false, position: null });
    await h.db
      .updateTable('rides')
      .set({ completed_at: new Date(Date.now() - 40 * 60_000) })
      .where('id', '=', ride.id)
      .execute();
    await h.http.get(`/v1/share/${token(second.url)}`).expect(404);
    await h.http.get('/v1/share/not-a-real-token-at-all').expect(404);
  });
});

describe('messages between passenger and driver', () => {
  it('open while the driver is on the way or on the trip, live to the other side, readable by safety staff', async () => {
    const p = await passenger(h);
    const d = await approvedDriver(h);
    const ride = await acceptedRide(h, p, d);
    const push = h.app.get<LogPushProvider>(PUSH_PROVIDER);
    await h.http
      .put('/v1/me/push-token')
      .set('Authorization', d.auth)
      .send({ token: 'ExponentPushToken[driver-device-1]', app: 'driver', platform: 'android' })
      .expect(204);
    const driverSocket = await connect(h, bearer(d.auth));
    const incoming = driverSocket.next<RideMessageView>('ride:message');
    const sent = (
      await h.http
        .post(`/v1/rides/${ride.id}/messages`)
        .set('Authorization', p.auth)
        .send({ body: 'I am by the blue gate' })
        .expect(201)
    ).body as RideMessageView;
    expect(sent).toMatchObject({ from: 'passenger', mine: true });
    expect(await incoming).toMatchObject({ body: 'I am by the blue gate', mine: false });
    expect(push.sent.at(-1)).toMatchObject({
      tokens: ['ExponentPushToken[driver-device-1]'],
      body: 'I am by the blue gate',
    });
    const forDriver = (
      await h.http.get(`/v1/rides/${ride.id}/messages`).set('Authorization', d.auth)
    ).body;
    expect(forDriver).toHaveLength(1);
    const outsider = await passenger(h);
    await h.http
      .get(`/v1/rides/${ride.id}/messages`)
      .set('Authorization', outsider.auth)
      .expect(404);
    expect(
      (await h.http.get(`/v1/admin/rides/${ride.id}/messages`).set('Authorization', admin.auth))
        .body,
    ).toHaveLength(1);
    await finishRide(h, ride.id, d);
    await h.http
      .post(`/v1/rides/${ride.id}/messages`)
      .set('Authorization', d.auth)
      .send({ body: 'Thanks' })
      .expect(409);
    driverSocket.close();
  });
});

describe('incident reports', () => {
  it('puts safety reports first and keeps the reporter informed', async () => {
    const p = await passenger(h);
    const d = await approvedDriver(h);
    const ride = await acceptedRide(h, p, d);
    await h.http
      .post('/v1/incidents')
      .set('Authorization', p.auth)
      .send({ category: 'lost_item', description: 'Left my phone charger' })
      .expect(201);
    const serious = (
      await h.http
        .post('/v1/incidents')
        .set('Authorization', p.auth)
        .send({
          rideId: ride.id,
          category: 'harassment',
          description: 'The driver made rude remarks',
        })
        .expect(201)
    ).body;
    expect(serious.priority).toBe('high');
    const queue = (
      await h.http.get('/v1/admin/incidents?status=open').set('Authorization', admin.auth)
    ).body as AdminIncidentView[];
    expect(queue.map((i) => i.priority)).toEqual(['high', 'normal']);
    expect(queue[0]!.reporter.phone).toMatch(/^\+234/);
    await h.http
      .patch(`/v1/admin/incidents/${serious.id}`)
      .set('Authorization', admin.auth)
      .send({ status: 'resolved' })
      .expect(422);
    await h.http
      .patch(`/v1/admin/incidents/${serious.id}`)
      .set('Authorization', admin.auth)
      .send({ status: 'resolved', note: 'Spoke to the driver; warning recorded' })
      .expect(200);
    const mine = (await h.http.get('/v1/incidents').set('Authorization', p.auth)).body;
    expect(mine.find((i: { id: string }) => i.id === serious.id)).toMatchObject({
      status: 'resolved',
      resolutionNote: 'Spoke to the driver; warning recorded',
    });
    expect((await inbox(p.auth)).items[0]!.body).toBe('Your report is now resolved.');
  });
});
