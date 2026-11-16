import { type Kysely, type RawBuilder, sql } from 'kysely';
import type {
  BusDepartureStatus,
  BusDepartureSummary,
  BusFare,
  OperatorDepartureView,
} from '@rideswithme/shared-types';
import { SEAT_CLASSES } from '@rideswithme/shared-types';
import { koboFromDb } from '../database/geo';
import type { Database } from '../database/types';

interface Row {
  id: string;
  route_id: string;
  layout_id: string;
  layout_name: string;
  departs_at: Date;
  arrives_at: Date;
  vehicle_plate: string | null;
  status: 'scheduled' | 'cancelled';
  cancel_reason: string | null;
  operator_id: string;
  operator_name: string;
  operator_status: 'active' | 'suspended';
  origin_city: string;
  origin_terminal: string;
  destination_city: string;
  destination_terminal: string;
  duration_minutes: number;
  route_active: boolean;
  seats_total: string;
  seats_sold: string;
  seats_held: string;
  checked_in: string;
  fares_kobo: string;
}

/**
 * A seat is taken while its booking is paid, or held and the hold has not lapsed.
 * Lapsed holds count as free at once, whether or not the sweep has run.
 */
export const takenSeat = (now: Date) => sql<boolean>`(
  bs.status = 'active' AND (b.status = 'confirmed' OR (b.status = 'held' AND b.hold_expires_at > ${now})))`;

export interface DepartureRules {
  salesCloseMinutes: number;
}

export class Departures {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly rules: DepartureRules,
  ) {}

  /** Departures matching a SQL condition on `s` (bus_schedules), `r` (route) or `o` (operator). */
  async rows(where: RawBuilder<boolean>, now: Date, order = sql`s.departs_at`, limit = 200) {
    const r = await sql<Row>`
      SELECT s.id, s.route_id, s.layout_id, l.name AS layout_name, s.departs_at, s.arrives_at,
        s.vehicle_plate, s.status, s.cancel_reason,
        o.id AS operator_id, o.name AS operator_name, o.status AS operator_status,
        r.origin_city, r.origin_terminal, r.destination_city, r.destination_terminal,
        r.duration_minutes, r.is_active AS route_active,
        (SELECT count(*) FROM bus_seats st WHERE st.layout_id = s.layout_id) AS seats_total,
        (SELECT count(*) FROM bus_booking_seats bs JOIN bus_bookings b ON b.id = bs.booking_id
          WHERE bs.schedule_id = s.id AND bs.status = 'active' AND b.status = 'confirmed') AS seats_sold,
        (SELECT count(*) FROM bus_booking_seats bs JOIN bus_bookings b ON b.id = bs.booking_id
          WHERE bs.schedule_id = s.id AND bs.status = 'active' AND b.status = 'held'
            AND b.hold_expires_at > ${now}) AS seats_held,
        (SELECT count(*) FROM bus_booking_seats bs JOIN bus_bookings b ON b.id = bs.booking_id
          WHERE bs.schedule_id = s.id AND bs.status = 'active' AND b.status = 'confirmed'
            AND bs.checked_in_at IS NOT NULL) AS checked_in,
        (SELECT coalesce(sum(b.total_kobo), 0) FROM bus_bookings b
          WHERE b.schedule_id = s.id AND b.status = 'confirmed') AS fares_kobo
      FROM bus_schedules s
      JOIN bus_routes r ON r.id = s.route_id
      JOIN bus_operators o ON o.id = s.operator_id
      JOIN bus_seat_layouts l ON l.id = s.layout_id
      WHERE ${where}
      ORDER BY ${order}
      LIMIT ${limit}`.execute(this.db);
    return r.rows;
  }

  /** Fares for the seat classes each departure's bus actually has. */
  async fares(ids: string[]): Promise<Map<string, BusFare[]>> {
    const out = new Map<string, BusFare[]>();
    if (ids.length === 0) return out;
    const rows = await this.db
      .selectFrom('bus_schedule_fares as f')
      .innerJoin('bus_schedules as s', 's.id', 'f.schedule_id')
      .select(['f.schedule_id', 'f.seat_class', 'f.fare_kobo'])
      .where('f.schedule_id', 'in', ids)
      .where(({ exists, selectFrom }) =>
        exists(
          selectFrom('bus_seats as st')
            .select('st.id')
            .whereRef('st.layout_id', '=', 's.layout_id')
            .whereRef('st.seat_class', '=', 'f.seat_class'),
        ),
      )
      .execute();
    for (const r of rows) {
      const list = out.get(r.schedule_id) ?? [];
      list.push({ seatClass: r.seat_class, fareKobo: koboFromDb(r.fare_kobo) });
      out.set(r.schedule_id, list);
    }
    for (const list of out.values())
      list.sort((a, b) => SEAT_CLASSES.indexOf(a.seatClass) - SEAT_CLASSES.indexOf(b.seatClass));
    return out;
  }

  status(row: Pick<Row, 'status' | 'departs_at'>, now: Date): BusDepartureStatus {
    if (row.status === 'cancelled') return 'cancelled';
    return row.departs_at <= now ? 'departed' : 'scheduled';
  }

  salesOpen(row: Row, now: Date): boolean {
    return (
      row.status === 'scheduled' &&
      row.operator_status === 'active' &&
      row.route_active &&
      row.departs_at.getTime() - this.rules.salesCloseMinutes * 60_000 > now.getTime()
    );
  }

  summary(row: Row, fares: BusFare[], now: Date): BusDepartureSummary {
    const sold = Number(row.seats_sold);
    const held = Number(row.seats_held);
    return {
      id: row.id,
      operator: { id: row.operator_id, name: row.operator_name },
      route: {
        id: row.route_id,
        originCity: row.origin_city,
        originTerminal: row.origin_terminal,
        destinationCity: row.destination_city,
        destinationTerminal: row.destination_terminal,
        durationMinutes: row.duration_minutes,
      },
      departsAt: row.departs_at.toISOString(),
      arrivesAt: row.arrives_at.toISOString(),
      vehiclePlate: row.vehicle_plate,
      status: this.status(row, now),
      salesOpen: this.salesOpen(row, now),
      seatsTotal: Number(row.seats_total),
      seatsLeft: Math.max(0, Number(row.seats_total) - sold - held),
      fares,
    };
  }

  operatorView(row: Row, fares: BusFare[], now: Date): OperatorDepartureView {
    return {
      ...this.summary(row, fares, now),
      routeId: row.route_id,
      layout: { id: row.layout_id, name: row.layout_name },
      seatsSold: Number(row.seats_sold),
      seatsHeld: Number(row.seats_held),
      checkedIn: Number(row.checked_in),
      faresKobo: koboFromDb(row.fares_kobo),
      cancelReason: row.cancel_reason,
    };
  }

  async summaries(where: RawBuilder<boolean>, now: Date, limit?: number) {
    const rows = await this.rows(where, now, undefined, limit);
    const fares = await this.fares(rows.map((r) => r.id));
    return rows.map((r) => this.summary(r, fares.get(r.id) ?? [], now));
  }

  async operatorViews(where: RawBuilder<boolean>, now: Date, limit?: number) {
    const rows = await this.rows(where, now, undefined, limit);
    const fares = await this.fares(rows.map((r) => r.id));
    return rows.map((r) => this.operatorView(r, fares.get(r.id) ?? [], now));
  }

  async one(id: string, now: Date) {
    const rows = await this.rows(sql<boolean>`s.id = ${id}`, now);
    const row = rows[0];
    if (!row) return null;
    const fares = (await this.fares([id])).get(id) ?? [];
    return { row, fares };
  }
}
