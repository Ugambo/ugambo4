import { randomUUID } from 'node:crypto';
import type { TestApi } from './api';
import { withDatabase } from './services';

/** 4 rows × 3 columns with a middle aisle: two executive seats (E1, E2), then S1–S6 standard. */
export const BUS_LAYOUT = {
  name: 'Hiace 8',
  rows: 4,
  columns: 3,
  seats: [
    { label: 'E1', row: 1, col: 1, seatClass: 'executive' },
    { label: 'E2', row: 1, col: 3, seatClass: 'executive' },
    { label: 'S1', row: 2, col: 1, seatClass: 'standard' },
    { label: 'S2', row: 2, col: 3, seatClass: 'standard' },
    { label: 'S3', row: 3, col: 1, seatClass: 'standard' },
    { label: 'S4', row: 3, col: 3, seatClass: 'standard' },
    { label: 'S5', row: 4, col: 1, seatClass: 'standard' },
    { label: 'S6', row: 4, col: 3, seatClass: 'standard' },
  ],
};
export const BUS_FARES = { standard: 1_200_000, executive: 1_800_000 };

/** A Nigerian date `days` from now. */
export const lagosDate = (days = 0) =>
  new Date(Date.now() + 3_600_000 + days * 86_400_000).toISOString().slice(0, 10);

/** Bus helpers for browser tests, acting through the API as staff, operators and passengers would. */
export function testBuses(api: TestApi, databaseUrl: string) {
  /** Staff create an operator; returns it with its manager signed in with two-factor. */
  async function operator(staffToken: string, name: string, managerPhone: string) {
    const op = await api.call<{ id: string }>('/v1/admin/bus-operators', {
      method: 'POST',
      token: staffToken,
      body: { name, managerPhone },
    });
    const manager = await api.signInWithTotp(managerPhone);
    return { operatorId: op.id, managerToken: manager.token };
  }

  /** A Kano → Abuja route, the 8-seat layout, and 08:00 departures `days` ahead. */
  async function service(managerToken: string, days: number[]) {
    const route = await api.call<{ id: string }>('/v1/operator/routes', {
      method: 'POST',
      token: managerToken,
      body: {
        originCity: 'Kano',
        originTerminal: 'Naibawa Motor Park',
        destinationCity: 'Abuja',
        destinationTerminal: 'Jabi Motor Park',
        durationMinutes: 420,
      },
    });
    const layout = await api.call<{ id: string; seats: { id: string; label: string }[] }>(
      '/v1/operator/layouts',
      { method: 'POST', token: managerToken, body: BUS_LAYOUT },
    );
    const departures = await api.call<{ id: string }[]>('/v1/operator/departures', {
      method: 'POST',
      token: managerToken,
      body: {
        routeId: route.id,
        layoutId: layout.id,
        dates: days.map(lagosDate),
        departureTime: '08:00',
        fares: [
          { seatClass: 'standard', fareKobo: BUS_FARES.standard },
          { seatClass: 'executive', fareKobo: BUS_FARES.executive },
        ],
      },
    });
    const seat = (label: string) => layout.seats.find((s) => s.label === label)!.id;
    return {
      routeId: route.id,
      layoutId: layout.id,
      departures: departures.map((d) => d.id),
      seat,
    };
  }

  /** Holds seats for a passenger (pay in the browser, or with pay()). */
  async function hold(
    passengerToken: string,
    scheduleId: string,
    seats: { seatId: string; passengerName: string }[],
  ) {
    return api.call<{ id: string; reference: string }>('/v1/bus/bookings', {
      method: 'POST',
      token: passengerToken,
      headers: { 'Idempotency-Key': randomUUID() },
      body: { scheduleId, seats },
    });
  }

  /** Moves a departure to `hours` from now (boarding opens 24 hours before). */
  async function departIn(scheduleId: string, hours: number) {
    await withDatabase(databaseUrl, async (db) => {
      await db.query(
        `UPDATE bus_schedules SET departs_at = now() + make_interval(secs => $2), arrives_at = now() + make_interval(secs => $2 + 25200) WHERE id = $1`,
        [scheduleId, hours * 3600],
      );
    });
  }

  /** Pays a held booking on the (fake) payment page, as the passenger would in a browser. */
  async function payByCheckout(passengerToken: string, bookingId: string) {
    const r = await api.call<{ payment: { id: string } }>(`/v1/bus/bookings/${bookingId}/pay`, {
      method: 'POST',
      token: passengerToken,
      headers: { 'Idempotency-Key': randomUUID() },
      body: { method: 'checkout', returnTo: 'web' },
    });
    // The fake provider's checkout page: press "pay" (it then redirects the browser back).
    await fetch(`${api.apiUrl}/v1/dev/fake-checkout/${r.payment.id}/pay`, {
      method: 'POST',
      redirect: 'manual',
    });
    // Ask the API to check with the provider, as the website does on return.
    for (let i = 0; i < 20; i++) {
      const p = await api.call<{ status: string }>(`/v1/payments/${r.payment.id}?refresh=1`, {
        token: passengerToken,
      });
      if (p.status !== 'pending') break;
      await new Promise((res) => setTimeout(res, 250));
    }
    return r.payment.id;
  }

  return { operator, service, hold, departIn, payByCheckout };
}
