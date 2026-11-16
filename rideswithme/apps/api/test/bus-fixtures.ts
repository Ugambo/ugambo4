import { randomUUID } from 'node:crypto';
import type {
  ApiErrorBody,
  BusBookingView,
  BusPayResult,
  BusOperatorSummary,
  BusRouteView,
  BusSeatLayoutView,
  OperatorDepartureView,
} from '@rideswithme/shared-types';
import { lagosToday } from '../src/buses/lagos';
import { type Harness, nextPhone, signInWithMfa } from './harness';

export const STANDARD = 1_200_000;
export const EXECUTIVE = 1_800_000;

/** A Nigerian date `n` days from now. */
export const daysAhead = (n: number) => lagosToday(new Date(Date.now() + n * 86_400_000));

/** Staff create an operator; its manager signs in with two-factor. */
export async function operatorWithManager(h: Harness, admin: { auth: string }, name: string) {
  const phone = nextPhone();
  const operator = (
    await h.http
      .post('/v1/admin/bus-operators')
      .set('Authorization', admin.auth)
      .send({ name, managerPhone: phone })
      .expect(201)
  ).body as BusOperatorSummary;
  const manager = await signInWithMfa(h, phone, 'bus_operator');
  return { operator, manager, phone };
}

/**
 * 4 rows × 3 columns, the middle column an aisle: two executive seats at the
 * front (E1, E2), then six standard seats (S1–S6).
 */
export const LAYOUT = {
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

/** A Kano → Abuja route, the 8-seat layout, and departures at 08:00 on the given days. */
export async function busService(
  h: Harness,
  manager: { auth: string },
  days: number[] = [3],
  origin = 'Kano',
) {
  const route = (
    await h.http
      .post('/v1/operator/routes')
      .set('Authorization', manager.auth)
      .send({
        originCity: origin,
        originTerminal: 'Naibawa Motor Park',
        destinationCity: 'Abuja',
        destinationTerminal: 'Jabi Motor Park',
        durationMinutes: 420,
      })
      .expect(201)
  ).body as BusRouteView;
  const layout = (
    await h.http
      .post('/v1/operator/layouts')
      .set('Authorization', manager.auth)
      .send(LAYOUT)
      .expect(201)
  ).body as BusSeatLayoutView;
  const departures = (
    await h.http
      .post('/v1/operator/departures')
      .set('Authorization', manager.auth)
      .send({
        routeId: route.id,
        layoutId: layout.id,
        dates: days.map(daysAhead),
        departureTime: '08:00',
        fares: [
          { seatClass: 'standard', fareKobo: STANDARD },
          { seatClass: 'executive', fareKobo: EXECUTIVE },
        ],
        vehiclePlate: 'KAN 123 XY',
      })
      .expect(201)
  ).body as OperatorDepartureView[];
  return { route, layout, departures };
}

export const seat = (layout: BusSeatLayoutView, label: string) =>
  layout.seats.find((s) => s.label === label)!.id;

export async function hold(
  h: Harness,
  auth: string,
  scheduleId: string,
  seats: { seatId: string; passengerName: string }[],
  expect = 201,
) {
  const res = await h.http
    .post('/v1/bus/bookings')
    .set('Authorization', auth)
    .set('Idempotency-Key', randomUUID())
    .send({ scheduleId, seats });
  if (res.status !== expect) throw new Error(`hold: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as BusBookingView;
}

export async function pay(
  h: Harness,
  auth: string,
  bookingId: string,
  body: object,
): Promise<{ status: number; body: BusPayResult & ApiErrorBody }> {
  return h.http
    .post(`/v1/bus/bookings/${bookingId}/pay`)
    .set('Authorization', auth)
    .set('Idempotency-Key', randomUUID())
    .send(body);
}
