import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  AdminTicketView,
  NotificationView,
  RideView,
  TicketView,
} from '@rideswithme/shared-types';
import { DeletionService } from '../src/privacy/deletion.service';
import { averageRating } from '../src/rides/ride-view.service';
import { createHarness, type Harness, nextPhone, resetState, signInWithMfa } from './harness';
import { acceptedRide, finishRide, topUp } from './payment-fixtures';
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

const inbox = async (auth: string) =>
  (await h.http.get('/v1/me/notifications').set('Authorization', auth).expect(200)).body as {
    items: NotificationView[];
    unread: number;
  };

describe('ratings', () => {
  it('both sides rate once, within the window; averages show from three ratings', async () => {
    const p = await passenger(h);
    const d = await approvedDriver(h);
    const ride = await acceptedRide(h, p, d);
    await h.http
      .post(`/v1/rides/${ride.id}/rating`)
      .set('Authorization', p.auth)
      .send({ stars: 5 })
      .expect(409);
    await finishRide(h, ride.id, d);
    let view = (await h.http.get(`/v1/rides/${ride.id}`).set('Authorization', p.auth))
      .body as RideView;
    expect(view.rating).toEqual({ given: null, canRate: true });
    await h.http
      .post(`/v1/rides/${ride.id}/rating`)
      .set('Authorization', p.auth)
      .send({ stars: 5, tags: ['clean_vehicle', 'friendly'], comment: 'Very kind' })
      .expect(201);
    await h.http
      .post(`/v1/rides/${ride.id}/rating`)
      .set('Authorization', p.auth)
      .send({ stars: 1 })
      .expect(409);
    await h.http
      .post(`/v1/rides/${ride.id}/rating`)
      .set('Authorization', d.auth)
      .send({ stars: 4 })
      .expect(201);
    view = (await h.http.get(`/v1/rides/${ride.id}`).set('Authorization', p.auth)).body;
    expect(view.rating).toEqual({ given: 5, canRate: false });
    expect(view.driver!.rating).toBeNull(); // only one rating so far

    const u = await h.db
      .selectFrom('users')
      .select(['rating_as_driver_sum', 'rating_as_driver_count'])
      .where('id', '=', d.userId)
      .executeTakeFirstOrThrow();
    expect(u).toEqual({ rating_as_driver_sum: 5, rating_as_driver_count: 1 });
    expect(averageRating(13, 3)).toBe(4.3);
    expect(averageRating(10, 2)).toBeNull();

    const staffView = (
      await h.http.get(`/v1/admin/users/${d.userId}/ratings`).set('Authorization', admin.auth)
    ).body;
    expect(staffView.asDriver).toMatchObject({ average: 5, count: 1 });
    expect(staffView.asDriver.recent[0]).toMatchObject({ comment: 'Very kind', stars: 5 });
    const own = (await h.http.get('/v1/driver/ratings').set('Authorization', d.auth)).body;
    expect(own.recent[0].raterName).toBeNull();

    await h.db
      .updateTable('rides')
      .set({ completed_at: new Date(Date.now() - 8 * 86_400_000) })
      .where('id', '=', ride.id)
      .execute();
    const closed = await h.http
      .post(`/v1/rides/${ride.id}/rating`)
      .set('Authorization', d.auth)
      .send({ stars: 3 });
    expect(closed.status).toBe(409);
  });
});

describe('support tickets', () => {
  it('a conversation between the passenger and the support team', async () => {
    const p = await passenger(h);
    const created = (
      await h.http
        .post('/v1/support/tickets')
        .set('Authorization', p.auth)
        .send({
          category: 'payment',
          subject: 'Charged twice',
          body: 'My card was charged twice on Monday.',
        })
        .expect(201)
    ).body as TicketView;
    expect(created).toMatchObject({ status: 'open', messages: [{ fromStaff: false }] });
    const support = await signInWithMfa(h, nextPhone(), 'support_agent');
    const queue = (
      await h.http.get('/v1/admin/support/tickets?status=open').set('Authorization', support.auth)
    ).body as AdminTicketView[];
    expect(queue.map((t) => t.id)).toEqual([created.id]);
    await h.http
      .post(`/v1/admin/support/tickets/${created.id}/messages`)
      .set('Authorization', support.auth)
      .send({ body: 'Sorry about that. We have refunded the second charge.' })
      .expect(201);
    const mine = (
      await h.http.get(`/v1/support/tickets/${created.id}`).set('Authorization', p.auth)
    ).body as TicketView;
    expect(mine.status).toBe('waiting_on_user');
    expect(mine.messages.map((m) => m.fromStaff)).toEqual([false, true]);
    expect((await inbox(p.auth)).items[0]).toMatchObject({
      kind: 'support_reply',
      body: 'Charged twice',
      data: { ticketId: created.id },
    });
    await h.http
      .post(`/v1/support/tickets/${created.id}/messages`)
      .set('Authorization', p.auth)
      .send({ body: 'Thank you!' })
      .expect(201);
    expect(
      (await h.http.get(`/v1/support/tickets/${created.id}`).set('Authorization', p.auth)).body
        .status,
    ).toBe('open');
    await h.http
      .post(`/v1/admin/support/tickets/${created.id}/status`)
      .set('Authorization', support.auth)
      .send({ status: 'resolved' })
      .expect(200);
    const other = await passenger(h);
    await h.http
      .get(`/v1/support/tickets/${created.id}`)
      .set('Authorization', other.auth)
      .expect(404);
    await h.http.get('/v1/admin/support/tickets').set('Authorization', p.auth).expect(403);
  });
});

describe('notifications', () => {
  it('keeps an inbox with an unread count', async () => {
    const p = await passenger(h);
    await h.http.post('/v1/sos').set('Authorization', p.auth).send({}).expect(201);
    const alert = (await h.http.get('/v1/admin/sos').set('Authorization', admin.auth)).body[0];
    await h.http
      .post(`/v1/admin/sos/${alert.id}/acknowledge`)
      .set('Authorization', admin.auth)
      .expect(200);
    expect((await inbox(p.auth)).unread).toBe(1);
    await h.http
      .post('/v1/me/notifications/read')
      .set('Authorization', p.auth)
      .send({ all: true })
      .expect(204);
    expect((await inbox(p.auth)).unread).toBe(0);
  });
});

describe('account deletion (NDPA)', () => {
  it('removes personal data after the grace period, keeping trips; waits while money is left', async () => {
    const p = await passenger(h);
    const d = await approvedDriver(h);
    const ride = await acceptedRide(h, p, d);
    await finishRide(h, ride.id, d);
    const phone = (
      await h.db
        .selectFrom('users')
        .select('phone_e164')
        .where('id', '=', p.userId)
        .executeTakeFirstOrThrow()
    ).phone_e164!;

    const req = (
      await h.http.post('/v1/me/deletion-request').set('Authorization', p.auth).send({}).expect(201)
    ).body;
    expect(Date.parse(req.scheduledFor) - Date.now()).toBeGreaterThan(6.9 * 86_400_000);
    expect(h.sms.messages.at(-1)).toMatchObject({ to: phone });
    expect(h.sms.messages.at(-1)!.text).toContain('will be deleted');
    await h.http.post('/v1/me/deletion-request').set('Authorization', p.auth).send({}).expect(409);
    await h.http.delete('/v1/me/deletion-request').set('Authorization', p.auth).expect(204);
    await h.http
      .post('/v1/me/deletion-request')
      .set('Authorization', p.auth)
      .send({ reason: 'Moving abroad' })
      .expect(201);

    const deletion = h.app.get(DeletionService);
    expect(await deletion.sweep()).toEqual({ completed: 0, blocked: 0 }); // not due yet
    const later = new Date(Date.now() + 8 * 86_400_000);

    // Money in the wallet: wait (it cannot be withdrawn; support refunds it first).
    const rich = await passenger(h);
    await topUp(h, rich.auth, 100_000);
    await h.http
      .post('/v1/me/deletion-request')
      .set('Authorization', rich.auth)
      .send({})
      .expect(201);

    expect(await deletion.sweep(later)).toEqual({ completed: 1, blocked: 1 });
    const gone = await h.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', p.userId)
      .executeTakeFirstOrThrow();
    expect(gone).toMatchObject({
      phone_e164: null,
      full_name: null,
      email: null,
      status: 'deleted',
    });
    await h.http.get('/v1/me').set('Authorization', p.auth).expect(401);
    const kept = await h.db
      .selectFrom('rides')
      .select('id')
      .where('passenger_id', '=', p.userId)
      .execute();
    expect(kept).toHaveLength(1);
    const waiting = (await h.http.get('/v1/me/deletion-request').set('Authorization', rich.auth))
      .body;
    expect(waiting).toMatchObject({ status: 'blocked', blockedReason: 'wallet_balance' });

    const list = (await h.http.get('/v1/admin/deletion-requests').set('Authorization', admin.auth))
      .status;
    expect(list).toBe(403); // super admins only
    const superAdmin = await signInWithMfa(h, nextPhone(), 'super_admin');
    const all = (
      await h.http.get('/v1/admin/deletion-requests').set('Authorization', superAdmin.auth)
    ).body;
    expect(all.map((r: { status: string }) => r.status).sort()).toEqual([
      'blocked',
      'cancelled',
      'completed',
    ]);
    const staffTry = await h.http
      .post('/v1/me/deletion-request')
      .set('Authorization', admin.auth)
      .send({});
    expect(staffTry.body.error.code).toBe('DELETION_BLOCKED');
  });
});
