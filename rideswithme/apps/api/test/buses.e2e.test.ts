import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  AdminBusBookingView,
  BusBookingView,
  BusDepartureDetail,
  BusDepartureSummary,
  BusOperatorSummary,
  BusPayResult,
  CheckInResult,
  OperatorDepartureDetail,
  OperatorOverview,
  WalletEntryView,
} from '@rideswithme/shared-types';
import { BookingsService } from '../src/buses/bookings.service';
import { createHarness, type Harness, nextPhone, resetState, signInWithMfa } from './harness';
import {
  busService,
  daysAhead,
  EXECUTIVE,
  hold,
  LAYOUT,
  operatorWithManager,
  pay,
  seat,
  STANDARD,
} from './bus-fixtures';
import {
  addCard,
  balance,
  expectLedgerConsistent,
  fake,
  ledger,
  system,
  topUp,
} from './payment-fixtures';
import { passenger } from './ride-fixtures';

let h: Harness;
let admin: { auth: string; userId: string };
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h.close());
beforeEach(async () => {
  await resetState(h);
  admin = await signInWithMfa(h, nextPhone(), 'admin');
});

const FEE = (total: number) => total / 10; // default service fee: 10%

/** Moves a departure to `hours` from now (for cut-offs and boarding). */
async function departIn(id: string, hours: number) {
  const at = new Date(Date.now() + hours * 3_600_000);
  await h.db
    .updateTable('bus_schedules')
    .set({ departs_at: at, arrives_at: new Date(at.getTime() + 7 * 3_600_000) })
    .where('id', '=', id)
    .execute();
}

async function lapseHold(bookingId: string) {
  await h.db
    .updateTable('bus_bookings')
    .set({ hold_expires_at: new Date(Date.now() - 1000) })
    .where('id', '=', bookingId)
    .execute();
}

const ticketCodeOf = async (bookingId: string) =>
  (
    await h.db
      .selectFrom('bus_booking_seats')
      .select('ticket_code')
      .where('booking_id', '=', bookingId)
      .executeTakeFirstOrThrow()
  ).ticket_code;

describe('operators', () => {
  it('lets staff create an operator once per name, with a manager who runs one operator', async () => {
    const { operator, phone } = await operatorWithManager(h, admin, 'Kano Line');
    expect(operator).toMatchObject({
      name: 'Kano Line',
      status: 'active',
      serviceFeeBps: 1000,
      balanceKobo: 0,
      managers: [{ phone }],
    });
    await h.http
      .post('/v1/admin/bus-operators')
      .set('Authorization', admin.auth)
      .send({ name: 'kano line', managerPhone: nextPhone() })
      .expect(409);
    await h.http
      .post('/v1/admin/bus-operators')
      .set('Authorization', admin.auth)
      .send({ name: 'Second Line', managerPhone: phone })
      .expect(409);
    const support = await signInWithMfa(h, nextPhone(), 'support_agent');
    await h.http.get('/v1/admin/bus-operators').set('Authorization', support.auth).expect(200);
    await h.http
      .post('/v1/admin/bus-operators')
      .set('Authorization', support.auth)
      .send({ name: 'Nope', managerPhone: nextPhone() })
      .expect(403);
    const audit = await h.db
      .selectFrom('audit_logs')
      .select('action')
      .where('action', 'like', 'buses.%')
      .execute();
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(['buses.operator_created', 'buses.manager_added']),
    );
  });

  it('checks seat layouts and fares, and refuses duplicate departures', async () => {
    const { manager } = await operatorWithManager(h, admin, 'Kano Line');
    await h.http
      .post('/v1/operator/layouts')
      .set('Authorization', manager.auth)
      .send({
        ...LAYOUT,
        seats: [...LAYOUT.seats, { label: 'X1', row: 9, col: 1, seatClass: 'vip' }],
      })
      .expect(422);
    await h.http
      .post('/v1/operator/layouts')
      .set('Authorization', manager.auth)
      .send({
        ...LAYOUT,
        seats: [...LAYOUT.seats, { label: 'S1', row: 4, col: 2, seatClass: 'vip' }],
      })
      .expect(422);
    const { route, layout, departures } = await busService(h, manager, [3, 4]);
    expect(departures).toHaveLength(2);
    expect(departures[0]).toMatchObject({
      seatsTotal: 8,
      seatsLeft: 8,
      salesOpen: true,
      vehiclePlate: 'KAN123XY',
      fares: [
        { seatClass: 'standard', fareKobo: STANDARD },
        { seatClass: 'executive', fareKobo: EXECUTIVE },
      ],
    });
    // Same route, same day and time.
    const again = {
      routeId: route.id,
      layoutId: layout.id,
      dates: [daysAhead(3)],
      departureTime: '08:00',
      fares: [
        { seatClass: 'standard', fareKobo: STANDARD },
        { seatClass: 'executive', fareKobo: EXECUTIVE },
      ],
    };
    await h.http
      .post('/v1/operator/departures')
      .set('Authorization', manager.auth)
      .send(again)
      .expect(409);
    const missing = await h.http
      .post('/v1/operator/departures')
      .set('Authorization', manager.auth)
      .send({
        ...again,
        dates: [daysAhead(5)],
        fares: [{ seatClass: 'standard', fareKobo: STANDARD }],
      })
      .expect(422);
    expect(missing.body.error.details).toEqual({ missingSeatClasses: ['executive'] });
    const layouts = (await h.http.get('/v1/operator/layouts').set('Authorization', manager.auth))
      .body;
    expect(layouts[0].inUse).toBe(true);
  });

  it("never lets one operator see or change another's routes, departures or tickets", async () => {
    const a = await operatorWithManager(h, admin, 'Kano Line');
    const b = await operatorWithManager(h, admin, 'Abuja Line');
    const { route, departures } = await busService(h, a.manager);
    await h.http
      .patch(`/v1/operator/routes/${route.id}`)
      .set('Authorization', b.manager.auth)
      .send({ isActive: false })
      .expect(404);
    await h.http
      .get(`/v1/operator/departures/${departures[0]!.id}`)
      .set('Authorization', b.manager.auth)
      .expect(404);
    await h.http
      .post(`/v1/operator/departures/${departures[0]!.id}/cancel`)
      .set('Authorization', b.manager.auth)
      .send({ reason: 'Not ours' })
      .expect(404);
    const listed = await h.http.get('/v1/operator/departures').set('Authorization', b.manager.auth);
    expect(listed.body).toEqual([]);
    // A passenger cannot use the portal.
    const p = await passenger(h);
    await h.http.get('/v1/operator').set('Authorization', p.auth).expect(403);
  });
});

describe('finding a bus and holding seats', () => {
  it('finds departures by city and day, with the seat map', async () => {
    const { manager } = await operatorWithManager(h, admin, 'Kano Line');
    const { departures } = await busService(h, manager, [3, 4]);
    const p = await passenger(h);
    const cities = await h.http.get('/v1/bus/cities').set('Authorization', p.auth).expect(200);
    expect(cities.body).toEqual([{ originCity: 'Kano', destinationCity: 'Abuja' }]);
    const found = (
      await h.http
        .get('/v1/bus/search')
        .query({ from: 'kano', to: 'ABUJA', date: daysAhead(3) })
        .set('Authorization', p.auth)
        .expect(200)
    ).body as BusDepartureSummary[];
    expect(found.map((d) => d.id)).toEqual([departures[0]!.id]);
    expect(found[0]!.operator.name).toBe('Kano Line');
    const none = await h.http
      .get('/v1/bus/search')
      .query({ from: 'Abuja', to: 'Kano', date: daysAhead(3) })
      .set('Authorization', p.auth);
    expect(none.body).toEqual([]);
    const map = (
      await h.http.get(`/v1/bus/departures/${departures[0]!.id}`).set('Authorization', p.auth)
    ).body as BusDepartureDetail;
    expect(map.layout).toMatchObject({ rows: 4, columns: 3 });
    expect(map.layout.seats).toHaveLength(8);
    expect(map.layout.seats.find((s) => s.label === 'E1')).toMatchObject({
      state: 'available',
      seatClass: 'executive',
      fareKobo: EXECUTIVE,
    });
  });

  it('holds seats for one passenger at a time and prices them by class', async () => {
    const { manager } = await operatorWithManager(h, admin, 'Kano Line');
    const { layout, departures } = await busService(h, manager);
    const dep = departures[0]!.id;
    const p1 = await passenger(h);
    const p2 = await passenger(h);
    const b = await hold(h, p1.auth, dep, [
      { seatId: seat(layout, 'E1'), passengerName: 'Amina Bello' },
      { seatId: seat(layout, 'S1'), passengerName: 'Musa Bello' },
    ]);
    expect(b).toMatchObject({
      status: 'held',
      totalKobo: EXECUTIVE + STANDARD,
      paymentMethod: null,
    });
    expect(b.reference).toMatch(/^[A-Z0-9]{8}$/);
    // Not paid yet: no ticket codes.
    expect(b.tickets.map((t) => [t.seatLabel, t.passengerName, t.ticketCode])).toEqual([
      ['E1', 'Amina Bello', null],
      ['S1', 'Musa Bello', null],
    ]);
    const err = await h.http
      .post('/v1/bus/bookings')
      .set('Authorization', p2.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ scheduleId: dep, seats: [{ seatId: seat(layout, 'S1'), passengerName: 'Sani' }] })
      .expect(409);
    expect(err.body.error.code).toBe('SEAT_UNAVAILABLE');
    const map = (await h.http.get(`/v1/bus/departures/${dep}`).set('Authorization', p2.auth)).body;
    expect(map.seatsLeft).toBe(6);
    expect(map.layout.seats.find((s: { label: string }) => s.label === 'S1').state).toBe('taken');
    const mine = (await h.http.get(`/v1/bus/departures/${dep}`).set('Authorization', p1.auth)).body;
    expect(mine.layout.seats.find((s: { label: string }) => s.label === 'S1').state).toBe('yours');
    // Choosing again replaces the first choice.
    const again = await hold(h, p1.auth, dep, [
      { seatId: seat(layout, 'S1'), passengerName: 'Musa Bello' },
    ]);
    expect(again.totalKobo).toBe(STANDARD);
    const first = (await h.http.get(`/v1/bus/bookings/${b.id}`).set('Authorization', p1.auth)).body;
    expect(first.status).toBe('cancelled');
  });

  it('sells a seat only once when many passengers try at the same moment', async () => {
    const { manager } = await operatorWithManager(h, admin, 'Kano Line');
    const { layout, departures } = await busService(h, manager);
    const people = await Promise.all(Array.from({ length: 8 }, () => passenger(h)));
    const results = await Promise.all(
      people.map((p) =>
        h.http
          .post('/v1/bus/bookings')
          .set('Authorization', p.auth)
          .set('Idempotency-Key', randomUUID())
          .send({
            scheduleId: departures[0]!.id,
            seats: [{ seatId: seat(layout, 'S3'), passengerName: 'Someone' }],
          }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(7);
    const active = await h.db
      .selectFrom('bus_booking_seats')
      .select('id')
      .where('seat_id', '=', seat(layout, 'S3'))
      .where('status', '=', 'active')
      .execute();
    expect(active).toHaveLength(1);
  });

  it('frees seats when a hold lapses; the first passenger can pay only if nobody took them', async () => {
    const { manager } = await operatorWithManager(h, admin, 'Kano Line');
    const { layout, departures } = await busService(h, manager);
    const dep = departures[0]!.id;
    const p1 = await passenger(h);
    const p2 = await passenger(h);
    await topUp(h, p1.auth, 5_000_000);
    const a = await hold(h, p1.auth, dep, [{ seatId: seat(layout, 'S2'), passengerName: 'Amina' }]);
    const b = await hold(h, p1.auth, dep, [{ seatId: seat(layout, 'S2'), passengerName: 'Amina' }]);
    expect(a.id).not.toBe(b.id);
    await lapseHold(b.id);
    // Lapsed but nobody took the seat: paying takes it again.
    const paid = await pay(h, p1.auth, b.id, { method: 'wallet' });
    expect(paid.status).toBe(200);
    expect((paid.body as BusPayResult).booking.status).toBe('confirmed');

    const c = await hold(h, p1.auth, dep, [{ seatId: seat(layout, 'S4'), passengerName: 'Amina' }]);
    await lapseHold(c.id);
    const viewed = (await h.http.get(`/v1/bus/bookings/${c.id}`).set('Authorization', p1.auth))
      .body;
    expect(viewed.status).toBe('expired');
    await hold(h, p2.auth, dep, [{ seatId: seat(layout, 'S4'), passengerName: 'Sani' }]);
    const late = await pay(h, p1.auth, c.id, { method: 'wallet' });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('HOLD_EXPIRED');
    expect(await balance(h, p1.userId)).toBe(5_000_000 - STANDARD);
  });

  it('closes booking shortly before departure and when the operator is suspended', async () => {
    const { operator, manager } = await operatorWithManager(h, admin, 'Kano Line');
    const { layout, departures } = await busService(h, manager, [3, 4]);
    const p = await passenger(h);
    await departIn(departures[0]!.id, 0.25);
    const closed = await h.http
      .post('/v1/bus/bookings')
      .set('Authorization', p.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        scheduleId: departures[0]!.id,
        seats: [{ seatId: seat(layout, 'S1'), passengerName: 'Amina' }],
      })
      .expect(409);
    expect(closed.body.error.code).toBe('BOOKING_CLOSED');

    await h.http
      .post(`/v1/admin/bus-operators/${operator.id}/suspend`)
      .set('Authorization', admin.auth)
      .expect(200);
    const search = await h.http
      .get('/v1/bus/search')
      .query({ from: 'Kano', to: 'Abuja', date: daysAhead(4) })
      .set('Authorization', p.auth);
    expect(search.body).toEqual([]);
    await hold(
      h,
      p.auth,
      departures[1]!.id,
      [{ seatId: seat(layout, 'S1'), passengerName: 'AA Test' }],
      409,
    );
    await h.http.get('/v1/operator').set('Authorization', manager.auth).expect(403);
  });

  it('marks lapsed holds expired in the background sweep', async () => {
    const { manager } = await operatorWithManager(h, admin, 'Kano Line');
    const { layout, departures } = await busService(h, manager);
    const p = await passenger(h);
    const b = await hold(h, p.auth, departures[0]!.id, [
      { seatId: seat(layout, 'S1'), passengerName: 'AA Test' },
    ]);
    await lapseHold(b.id);
    expect(await h.app.get(BookingsService).sweep()).toBe(1);
    const row = await h.db
      .selectFrom('bus_bookings')
      .select('status')
      .where('id', '=', b.id)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('expired');
    const seats = await h.db
      .selectFrom('bus_booking_seats')
      .select('status')
      .where('booking_id', '=', b.id)
      .execute();
    expect(seats.map((s) => s.status)).toEqual(['released']);
  });
});

describe('paying', () => {
  it('pays from the wallet: the operator is owed the fare less the service fee', async () => {
    const { operator, manager } = await operatorWithManager(h, admin, 'Kano Line');
    const { layout, departures } = await busService(h, manager);
    const p = await passenger(h);
    const b = await hold(h, p.auth, departures[0]!.id, [
      { seatId: seat(layout, 'E1'), passengerName: 'Amina Bello' },
      { seatId: seat(layout, 'E2'), passengerName: 'Musa Bello' },
    ]);
    const total = 2 * EXECUTIVE;
    const poor = await pay(h, p.auth, b.id, { method: 'wallet' });
    expect(poor.status).toBe(422);
    expect(poor.body.error.code).toBe('WALLET_INSUFFICIENT_FUNDS');

    await topUp(h, p.auth, 5_000_000);
    const revenueBefore = await system(h, 'platform_revenue');
    const res = await pay(h, p.auth, b.id, { method: 'wallet' });
    expect(res.status).toBe(200);
    const booking = (res.body as BusPayResult).booking;
    expect(booking).toMatchObject({
      status: 'confirmed',
      paymentMethod: 'wallet',
      paymentPending: false,
    });
    for (const t of booking.tickets) {
      expect(t.ticketCode).toMatch(/^[A-Z0-9]{10}$/);
      expect(t.qrPayload).toBe(`RWMBUS:${t.ticketCode}`);
    }
    expect(await balance(h, p.userId)).toBe(5_000_000 - total);
    expect(await ledger(h).operatorBalance(operator.id)).toBe(total - FEE(total));
    expect((await system(h, 'platform_revenue')) - revenueBefore).toBe(FEE(total));
    await pay(h, p.auth, b.id, { method: 'wallet' }).then((r) => expect(r.status).toBe(409));
    await expectLedgerConsistent(h);

    const overview = (await h.http.get('/v1/operator').set('Authorization', manager.auth))
      .body as OperatorOverview;
    expect(overview.today).toEqual({
      seatsSold: 2,
      faresKobo: total,
      earningsKobo: total - FEE(total),
    });
    expect(overview.balanceKobo).toBe(total - FEE(total));
    const detail = (
      await h.http
        .get(`/v1/operator/departures/${departures[0]!.id}`)
        .set('Authorization', manager.auth)
    ).body as OperatorDepartureDetail;
    expect(detail).toMatchObject({ seatsSold: 2, seatsHeld: 0, faresKobo: total });
    expect(detail.manifest.map((m) => [m.seatLabel, m.passengerName, m.bookingReference])).toEqual([
      ['E1', 'Amina Bello', b.reference],
      ['E2', 'Musa Bello', b.reference],
    ]);
  });

  it('pays with a saved card; a declined card leaves the seats held to try again', async () => {
    const { operator, manager } = await operatorWithManager(h, admin, 'Kano Line');
    const { layout, departures } = await busService(h, manager);
    const p = await passenger(h);
    const bad = await addCard(h, p.auth, 'declines_later');
    const good = await addCard(h, p.auth, 'good');
    const b = await hold(h, p.auth, departures[0]!.id, [
      { seatId: seat(layout, 'S1'), passengerName: 'Amina' },
    ]);
    const declined = await pay(h, p.auth, b.id, { method: 'card', cardId: bad });
    expect(declined.status).toBe(200);
    expect((declined.body as BusPayResult).booking.status).toBe('held');
    const failed = await h.db
      .selectFrom('payments')
      .select('status')
      .where('bus_booking_id', '=', b.id)
      .executeTakeFirstOrThrow();
    expect(failed.status).toBe('failed');

    const ok = await pay(h, p.auth, b.id, { method: 'card', cardId: good });
    await fake(h).settled();
    expect((ok.body as BusPayResult).booking).toMatchObject({
      status: 'confirmed',
      paymentMethod: 'card',
    });
    expect(await ledger(h).operatorBalance(operator.id)).toBe(STANDARD - FEE(STANDARD));
    await expectLedgerConsistent(h);
  });

  it('pays on the provider page; if the seats were lost meanwhile the money goes to the wallet', async () => {
    const { operator, manager } = await operatorWithManager(h, admin, 'Kano Line');
    const { layout, departures } = await busService(h, manager);
    const dep = departures[0]!.id;
    const p = await passenger(h);
    const other = await passenger(h);
    const b = await hold(h, p.auth, dep, [{ seatId: seat(layout, 'S1'), passengerName: 'Amina' }]);
    const res = await pay(h, p.auth, b.id, { method: 'checkout', returnTo: 'web' });
    const started = res.body as BusPayResult;
    expect(started.checkoutUrl).toContain('/v1/dev/fake-checkout/');
    expect(started.booking.paymentPending).toBe(true);
    const payment = await h.db
      .selectFrom('payments')
      .select('id')
      .where('bus_booking_id', '=', b.id)
      .executeTakeFirstOrThrow();
    await fake(h).completeCheckout(payment.id, 'pay');
    await fake(h).settled();
    const done = (await h.http.get(`/v1/bus/bookings/${b.id}`).set('Authorization', p.auth))
      .body as BusBookingView;
    expect(done).toMatchObject({
      status: 'confirmed',
      paymentMethod: 'card',
      paymentPending: false,
    });

    // A second booking whose seat goes to someone else before the checkout is finished.
    const c = await hold(h, p.auth, dep, [{ seatId: seat(layout, 'S2'), passengerName: 'Amina' }]);
    await pay(h, p.auth, c.id, { method: 'checkout', returnTo: 'web' });
    await lapseHold(c.id);
    await hold(h, other.auth, dep, [{ seatId: seat(layout, 'S2'), passengerName: 'Sani' }]);
    const second = await h.db
      .selectFrom('payments')
      .select('id')
      .where('bus_booking_id', '=', c.id)
      .executeTakeFirstOrThrow();
    await fake(h).completeCheckout(second.id, 'pay');
    await fake(h).settled();
    const lost = (await h.http.get(`/v1/bus/bookings/${c.id}`).set('Authorization', p.auth))
      .body as BusBookingView;
    expect(lost.status).toBe('expired');
    expect(await balance(h, p.userId)).toBe(STANDARD);
    expect(await ledger(h).operatorBalance(operator.id)).toBe(STANDARD - FEE(STANDARD));
    await expectLedgerConsistent(h);
  });
});

describe('cancelling', () => {
  it('lets a passenger cancel for a full refund until the cut-off, and not after', async () => {
    const { operator, manager } = await operatorWithManager(h, admin, 'Kano Line');
    const { layout, departures } = await busService(h, manager, [3, 4]);
    const p = await passenger(h);
    await topUp(h, p.auth, 5_000_000);
    const held = await hold(h, p.auth, departures[0]!.id, [
      { seatId: seat(layout, 'S1'), passengerName: 'AA Test' },
    ]);
    const released = await h.http
      .post(`/v1/bus/bookings/${held.id}/cancel`)
      .set('Authorization', p.auth)
      .expect(200);
    expect(released.body.status).toBe('cancelled');

    const b = await hold(h, p.auth, departures[0]!.id, [
      { seatId: seat(layout, 'S1'), passengerName: 'AA Test' },
    ]);
    await pay(h, p.auth, b.id, { method: 'wallet' });
    const before = (await h.http.get(`/v1/bus/bookings/${b.id}`).set('Authorization', p.auth))
      .body as BusBookingView;
    expect(before.cancelUntil).not.toBeNull();
    const cancelled = (
      await h.http.post(`/v1/bus/bookings/${b.id}/cancel`).set('Authorization', p.auth).expect(200)
    ).body as BusBookingView;
    expect(cancelled).toMatchObject({
      status: 'cancelled',
      cancelledBy: 'passenger',
      refundedKobo: STANDARD,
    });
    expect(cancelled.tickets[0]!.ticketCode).toBeNull();
    expect(await balance(h, p.userId)).toBe(5_000_000);
    expect(await ledger(h).operatorBalance(operator.id)).toBe(0);

    const late = await hold(h, p.auth, departures[1]!.id, [
      { seatId: seat(layout, 'S1'), passengerName: 'AA Test' },
    ]);
    await pay(h, p.auth, late.id, { method: 'wallet' });
    await departIn(departures[1]!.id, 3);
    const refused = await h.http
      .post(`/v1/bus/bookings/${late.id}/cancel`)
      .set('Authorization', p.auth)
      .expect(409);
    expect(refused.body.error.code).toBe('INVALID_STATE');
    // Staff can still cancel it, with a full refund.
    const byStaff = (
      await h.http
        .post(`/v1/admin/bus-bookings/${late.id}/cancel`)
        .set('Authorization', admin.auth)
        .send({ reason: 'Passenger was ill' })
        .expect(200)
    ).body as AdminBusBookingView;
    expect(byStaff).toMatchObject({
      status: 'cancelled',
      cancelledBy: 'admin',
      refundedKobo: STANDARD,
    });
    expect(byStaff.passenger.id).toBe(p.userId);
    expect(await balance(h, p.userId)).toBe(5_000_000);
    await expectLedgerConsistent(h);
  });

  it('refunds every passenger when the operator cancels a departure', async () => {
    const { operator, manager } = await operatorWithManager(h, admin, 'Kano Line');
    const { layout, departures } = await busService(h, manager);
    const dep = departures[0]!.id;
    const paid = await passenger(h);
    const unpaid = await passenger(h);
    await topUp(h, paid.auth, 5_000_000);
    const b = await hold(h, paid.auth, dep, [
      { seatId: seat(layout, 'E1'), passengerName: 'AA Test' },
      { seatId: seat(layout, 'S1'), passengerName: 'BB Test' },
    ]);
    await pay(h, paid.auth, b.id, { method: 'wallet' });
    const u = await hold(h, unpaid.auth, dep, [
      { seatId: seat(layout, 'S2'), passengerName: 'CC Test' },
    ]);
    const detail = (
      await h.http
        .post(`/v1/operator/departures/${dep}/cancel`)
        .set('Authorization', manager.auth)
        .send({ reason: 'Bus broke down' })
        .expect(200)
    ).body as OperatorDepartureDetail;
    expect(detail).toMatchObject({
      status: 'cancelled',
      cancelReason: 'Bus broke down',
      seatsSold: 0,
    });
    const view = (await h.http.get(`/v1/bus/bookings/${b.id}`).set('Authorization', paid.auth))
      .body as BusBookingView;
    expect(view).toMatchObject({
      status: 'cancelled',
      cancelledBy: 'operator',
      cancelReason: 'Bus broke down',
      refundedKobo: EXECUTIVE + STANDARD,
    });
    expect(view.departure.status).toBe('cancelled');
    expect(await balance(h, paid.userId)).toBe(5_000_000);
    expect(await ledger(h).operatorBalance(operator.id)).toBe(0);
    const uv = (await h.http.get(`/v1/bus/bookings/${u.id}`).set('Authorization', unpaid.auth))
      .body;
    expect(uv.status).toBe('cancelled');
    await h.http
      .post(`/v1/operator/departures/${dep}/cancel`)
      .set('Authorization', manager.auth)
      .send({ reason: 'Again' })
      .expect(409);
    await expectLedgerConsistent(h);
  });
});

describe('boarding', () => {
  it('checks tickets in once, for the right operator, on the right day', async () => {
    const a = await operatorWithManager(h, admin, 'Kano Line');
    const other = await operatorWithManager(h, admin, 'Abuja Line');
    const { layout, departures } = await busService(h, a.manager, [3, 4]);
    const p = await passenger(h);
    await topUp(h, p.auth, 5_000_000);
    const b = await hold(h, p.auth, departures[0]!.id, [
      { seatId: seat(layout, 'S1'), passengerName: 'Amina' },
    ]);
    const unpaidCode = await ticketCodeOf(b.id);
    const checkIn = (auth: string, code: string) =>
      h.http.post('/v1/operator/check-in').set('Authorization', auth).send({ code });
    await departIn(departures[0]!.id, 2);
    expect((await checkIn(a.manager.auth, unpaidCode)).body.error.code).toBe('TICKET_INVALID');

    const res = await pay(h, p.auth, b.id, { method: 'wallet' });
    const code = (res.body as BusPayResult).booking.tickets[0]!.ticketCode!;
    expect((await checkIn(other.manager.auth, code)).status).toBe(404);
    const first = (await checkIn(a.manager.auth, `rwmbus:${code.toLowerCase()}`))
      .body as CheckInResult;
    expect(first).toMatchObject({
      seatLabel: 'S1',
      passengerName: 'Amina',
      bookingReference: b.reference,
      alreadyCheckedIn: false,
    });
    const second = (await checkIn(a.manager.auth, code)).body as CheckInResult;
    expect(second.alreadyCheckedIn).toBe(true);
    expect(second.checkedInAt).toBe(first.checkedInAt);

    const tomorrow = await hold(h, p.auth, departures[1]!.id, [
      { seatId: seat(layout, 'S1'), passengerName: 'Amina' },
    ]);
    const t2 = (await pay(h, p.auth, tomorrow.id, { method: 'wallet' })).body as BusPayResult;
    const wrongDay = await checkIn(a.manager.auth, t2.booking.tickets[0]!.ticketCode!);
    expect(wrongDay.status).toBe(404);
    expect(wrongDay.body.error.message).toMatch(/another day/);
  });
});

describe('staff', () => {
  it('sets fees, records settlements and finds bookings', async () => {
    const { operator, manager } = await operatorWithManager(h, admin, 'Kano Line');
    await h.http
      .patch(`/v1/admin/bus-operators/${operator.id}`)
      .set('Authorization', admin.auth)
      .send({ serviceFeeBps: 500 })
      .expect(200);
    const { layout, departures } = await busService(h, manager);
    const p = await passenger(h);
    await topUp(h, p.auth, 5_000_000);
    const b = await hold(h, p.auth, departures[0]!.id, [
      { seatId: seat(layout, 'S1'), passengerName: 'AA Test' },
    ]);
    await pay(h, p.auth, b.id, { method: 'wallet' });
    const owed = STANDARD - STANDARD / 20;
    expect(await ledger(h).operatorBalance(operator.id)).toBe(owed);

    const paystackBefore = await system(h, 'paystack_balance');
    const after = (
      await h.http
        .post(`/v1/admin/bus-operators/${operator.id}/settlements`)
        .set('Authorization', admin.auth)
        .send({ amountKobo: owed, note: 'Bank transfer 14 Nov' })
        .expect(201)
    ).body as BusOperatorSummary;
    expect(after.balanceKobo).toBe(0);
    expect(await system(h, 'paystack_balance')).toBe(paystackBefore - owed);
    const statement = (
      await h.http.get('/v1/operator/statement').set('Authorization', manager.auth)
    ).body as WalletEntryView[];
    expect(statement.map((e) => [e.kind, e.amountKobo])).toEqual([
      ['operator_settlement', -owed],
      ['bus_booking', owed],
    ]);
    await expectLedgerConsistent(h);

    const byRef = (
      await h.http
        .get('/v1/admin/bus-bookings')
        .query({ reference: b.reference.toLowerCase() })
        .set('Authorization', admin.auth)
        .expect(200)
    ).body as AdminBusBookingView[];
    expect(byRef.map((x) => x.id)).toEqual([b.id]);
    const phone = (
      await h.db
        .selectFrom('users')
        .select('phone_e164')
        .where('id', '=', p.userId)
        .executeTakeFirstOrThrow()
    ).phone_e164!;
    const byPhone = (
      await h.http.get('/v1/admin/bus-bookings').query({ phone }).set('Authorization', admin.auth)
    ).body as AdminBusBookingView[];
    expect(byPhone).toHaveLength(1);
    const audit = await sql<{
      action: string;
    }>`SELECT action FROM audit_logs WHERE action LIKE 'buses.%'`.execute(h.db);
    expect(audit.rows.map((r) => r.action)).toEqual(
      expect.arrayContaining([
        'buses.operator_updated',
        'buses.settlement_recorded',
        'buses.departures_created',
      ]),
    );
  });
});
