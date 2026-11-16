import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, sql } from 'kysely';
import {
  type BusCityPair,
  type BusDepartureDetail,
  type BusDepartureSummary,
  type BusRouteView,
  type BusSeatLayoutView,
  ErrorCode,
  type OperatorDepartureDetail,
  type OperatorDepartureView,
  type SeatClass,
} from '@rideswithme/shared-types';
import type {
  BusRouteInput,
  BusSearchQuery,
  BusSeatLayoutInput,
  CreateBusDeparturesInput,
  OperatorDeparturesQuery,
  UpdateBusDepartureInput,
  UpdateBusRouteInput,
} from '@rideswithme/validation';
import { AuditService } from '../audit/audit.service';
import type { Principal } from '../auth/principal';
import { AppException } from '../common/app-exception';
import type { RequestContext } from '../common/request-context';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB, isUniqueViolation } from '../database/database.module';
import type { Database } from '../database/types';
import { Departures } from './departures';
import { lagosDateTime, lagosDayStart, lagosToday } from './lagos';
import type { OperatorScope } from './operators.service';

type RouteRow = {
  id: string;
  origin_city: string;
  origin_terminal: string;
  destination_city: string;
  destination_terminal: string;
  duration_minutes: number;
  is_active: boolean;
};

const routeView = (r: RouteRow): BusRouteView => ({
  id: r.id,
  originCity: r.origin_city,
  originTerminal: r.origin_terminal,
  destinationCity: r.destination_city,
  destinationTerminal: r.destination_terminal,
  durationMinutes: r.duration_minutes,
  isActive: r.is_active,
});

/** Routes, seat layouts and departures (operators), and finding a bus (passengers). */
@Injectable()
export class CatalogService {
  readonly departures: Departures;

  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly audit: AuditService,
  ) {
    this.departures = new Departures(db, { salesCloseMinutes: config.BUS_SALES_CLOSE_MINUTES });
  }

  // --- Routes ---

  async routes(scope: OperatorScope): Promise<BusRouteView[]> {
    const rows = await this.db
      .selectFrom('bus_routes')
      .selectAll()
      .where('operator_id', '=', scope.operatorId)
      .orderBy('origin_city')
      .orderBy('destination_city')
      .execute();
    return rows.map(routeView);
  }

  async createRoute(scope: OperatorScope, input: BusRouteInput): Promise<BusRouteView> {
    const r = await this.db
      .insertInto('bus_routes')
      .values({
        operator_id: scope.operatorId,
        origin_city: input.originCity,
        origin_terminal: input.originTerminal,
        destination_city: input.destinationCity,
        destination_terminal: input.destinationTerminal,
        duration_minutes: input.durationMinutes,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return routeView(r);
  }

  async updateRoute(
    scope: OperatorScope,
    routeId: string,
    input: UpdateBusRouteInput,
  ): Promise<BusRouteView> {
    const r = await this.db
      .updateTable('bus_routes')
      .set({
        ...(input.originTerminal !== undefined && { origin_terminal: input.originTerminal }),
        ...(input.destinationTerminal !== undefined && {
          destination_terminal: input.destinationTerminal,
        }),
        ...(input.durationMinutes !== undefined && { duration_minutes: input.durationMinutes }),
        ...(input.isActive !== undefined && { is_active: input.isActive }),
      })
      .where('id', '=', routeId)
      .where('operator_id', '=', scope.operatorId)
      .returningAll()
      .executeTakeFirst();
    if (!r) throw new AppException(ErrorCode.NOT_FOUND, 'Route not found');
    return routeView(r);
  }

  // --- Seat layouts ---

  async layouts(operatorId: string, layoutId?: string): Promise<BusSeatLayoutView[]> {
    let q = this.db
      .selectFrom('bus_seat_layouts as l')
      .selectAll('l')
      .select((eb) =>
        eb
          .exists(
            eb.selectFrom('bus_schedules as s').select('s.id').whereRef('s.layout_id', '=', 'l.id'),
          )
          .as('in_use'),
      )
      .where('l.operator_id', '=', operatorId)
      .orderBy('l.name');
    if (layoutId) q = q.where('l.id', '=', layoutId);
    const layouts = await q.execute();
    if (layouts.length === 0) return [];
    const seats = await this.db
      .selectFrom('bus_seats')
      .selectAll()
      .where(
        'layout_id',
        'in',
        layouts.map((l) => l.id),
      )
      .orderBy('row_no')
      .orderBy('col_no')
      .execute();
    return layouts.map((l) => ({
      id: l.id,
      name: l.name,
      rows: l.rows,
      columns: l.columns,
      inUse: Boolean(l.in_use),
      seats: seats
        .filter((s) => s.layout_id === l.id)
        .map((s) => ({
          id: s.id,
          label: s.label,
          row: s.row_no,
          col: s.col_no,
          seatClass: s.seat_class,
        })),
    }));
  }

  async createLayout(scope: OperatorScope, input: BusSeatLayoutInput): Promise<BusSeatLayoutView> {
    try {
      const id = await this.db.transaction().execute(async (trx) => {
        const l = await trx
          .insertInto('bus_seat_layouts')
          .values({
            operator_id: scope.operatorId,
            name: input.name,
            rows: input.rows,
            columns: input.columns,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await trx
          .insertInto('bus_seats')
          .values(
            input.seats.map((s) => ({
              layout_id: l.id,
              label: s.label,
              row_no: s.row,
              col_no: s.col,
              seat_class: s.seatClass,
            })),
          )
          .execute();
        return l.id;
      });
      return (await this.layouts(scope.operatorId, id))[0]!;
    } catch (err) {
      if (isUniqueViolation(err, 'bus_seat_layouts_operator_id_name_key'))
        throw new AppException(ErrorCode.CONFLICT, 'A seat layout with this name already exists');
      throw err;
    }
  }

  // --- Departures ---

  async listDepartures(
    operatorId: string,
    q: OperatorDeparturesQuery,
    now = new Date(),
  ): Promise<OperatorDepartureView[]> {
    const from = lagosDayStart(q.from ?? lagosToday(now));
    const to = q.to ? new Date(lagosDayStart(q.to).getTime() + 86_400_000) : null;
    return this.departures.operatorViews(
      sql<boolean>`s.operator_id = ${operatorId} AND s.departs_at >= ${from}
        ${to ? sql`AND s.departs_at < ${to}` : sql``}
        ${q.routeId ? sql`AND s.route_id = ${q.routeId}` : sql``}`,
      now,
      q.limit,
    );
  }

  /** One departure per date, at the same local time, with the same bus and fares. */
  async createDepartures(
    principal: Principal,
    scope: OperatorScope,
    input: CreateBusDeparturesInput,
    ctx: Partial<RequestContext>,
    now = new Date(),
  ): Promise<OperatorDepartureView[]> {
    const route = await this.db
      .selectFrom('bus_routes')
      .selectAll()
      .where('id', '=', input.routeId)
      .where('operator_id', '=', scope.operatorId)
      .executeTakeFirst();
    if (!route) throw new AppException(ErrorCode.NOT_FOUND, 'Route not found');
    if (!route.is_active)
      throw new AppException(ErrorCode.INVALID_STATE, 'This route is switched off');
    const layout = (await this.layouts(scope.operatorId, input.layoutId))[0];
    if (!layout) throw new AppException(ErrorCode.NOT_FOUND, 'Seat layout not found');
    this.checkFares(layout, input.fares);

    const times = input.dates.map((d) => lagosDateTime(d, input.departureTime));
    if (times.some((t) => t.getTime() <= now.getTime())) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'Departures must be in the future');
    }
    const ids = await this.db.transaction().execute(async (trx) => {
      const created: string[] = [];
      for (const departs of times) {
        const s = await trx
          .insertInto('bus_schedules')
          .values({
            route_id: route.id,
            operator_id: scope.operatorId,
            layout_id: layout.id,
            departs_at: departs,
            arrives_at: new Date(departs.getTime() + route.duration_minutes * 60_000),
            vehicle_plate: input.vehiclePlate ?? null,
            created_by: principal.userId,
          })
          .onConflict((oc) => oc.columns(['route_id', 'departs_at']).doNothing())
          .returning('id')
          .executeTakeFirst();
        if (!s) continue;
        await trx
          .insertInto('bus_schedule_fares')
          .values(
            input.fares.map((f) => ({
              schedule_id: s.id,
              seat_class: f.seatClass,
              fare_kobo: f.fareKobo,
            })),
          )
          .execute();
        created.push(s.id);
      }
      if (created.length)
        await this.audit.record(
          {
            actor: { type: 'user', userId: principal.userId },
            action: 'buses.departures_created',
            target: { type: 'bus_operator', id: scope.operatorId },
            metadata: { routeId: route.id, count: created.length, fares: input.fares },
            context: ctx,
          },
          trx,
        );
      return created;
    });
    if (ids.length === 0)
      throw new AppException(ErrorCode.CONFLICT, 'These departures already exist');
    return this.departures.operatorViews(sql<boolean>`s.id IN (${sql.join(ids)})`, now);
  }

  /** Fares apply to bookings made after the change; tickets already sold keep their price. */
  async updateDeparture(
    principal: Principal,
    scope: OperatorScope,
    id: string,
    input: UpdateBusDepartureInput,
    ctx: Partial<RequestContext>,
    now = new Date(),
  ): Promise<OperatorDepartureDetail> {
    const s = await this.db
      .selectFrom('bus_schedules')
      .selectAll()
      .where('id', '=', id)
      .where('operator_id', '=', scope.operatorId)
      .executeTakeFirst();
    if (!s) throw new AppException(ErrorCode.NOT_FOUND, 'Departure not found');
    if (s.status !== 'scheduled' || s.departs_at <= now)
      throw new AppException(ErrorCode.INVALID_STATE, 'This departure can no longer change');
    if (input.fares) {
      const layout = (await this.layouts(scope.operatorId, s.layout_id))[0]!;
      this.checkFares(layout, input.fares);
    }
    await this.db.transaction().execute(async (trx) => {
      if (input.vehiclePlate !== undefined)
        await trx
          .updateTable('bus_schedules')
          .set({ vehicle_plate: input.vehiclePlate })
          .where('id', '=', id)
          .execute();
      if (input.fares) {
        await trx.deleteFrom('bus_schedule_fares').where('schedule_id', '=', id).execute();
        await trx
          .insertInto('bus_schedule_fares')
          .values(
            input.fares.map((f) => ({
              schedule_id: id,
              seat_class: f.seatClass,
              fare_kobo: f.fareKobo,
            })),
          )
          .execute();
        await this.audit.record(
          {
            actor: { type: 'user', userId: principal.userId },
            action: 'buses.fares_changed',
            target: { type: 'bus_schedule', id },
            metadata: { fares: input.fares },
            context: ctx,
          },
          trx,
        );
      }
    });
    return this.departureDetail(scope.operatorId, id, now);
  }

  private checkFares(
    layout: BusSeatLayoutView,
    fares: { seatClass: SeatClass; fareKobo: number }[],
  ) {
    const classes = new Set(layout.seats.map((s) => s.seatClass));
    const missing = [...classes].filter((c) => !fares.some((f) => f.seatClass === c));
    if (missing.length)
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'Set a fare for every seat class on the bus',
        {
          details: { missingSeatClasses: missing },
        },
      );
  }

  /** A departure with its passenger list. operatorId null: staff (any operator). */
  async departureDetail(
    operatorId: string | null,
    id: string,
    now = new Date(),
  ): Promise<OperatorDepartureDetail> {
    const found = await this.departures.one(id, now);
    if (!found || (operatorId && found.row.operator_id !== operatorId))
      throw new AppException(ErrorCode.NOT_FOUND, 'Departure not found');
    const manifest = await this.db
      .selectFrom('bus_booking_seats as bs')
      .innerJoin('bus_bookings as b', 'b.id', 'bs.booking_id')
      .innerJoin('bus_seats as st', 'st.id', 'bs.seat_id')
      .select([
        'st.label',
        'st.row_no',
        'st.col_no',
        'bs.seat_class',
        'bs.passenger_name',
        'b.reference',
        'bs.checked_in_at',
      ])
      .where('bs.schedule_id', '=', id)
      .where('bs.status', '=', 'active')
      .where('b.status', '=', 'confirmed')
      .orderBy('st.row_no')
      .orderBy('st.col_no')
      .execute();
    return {
      ...this.departures.operatorView(found.row, found.fares, now),
      manifest: manifest.map((m) => ({
        seatLabel: m.label,
        seatClass: m.seat_class,
        passengerName: m.passenger_name,
        bookingReference: m.reference,
        checkedInAt: m.checked_in_at ? new Date(m.checked_in_at).toISOString() : null,
      })),
    };
  }

  // --- Passengers ---

  /** City pairs with an active route (for the search form). */
  async cities(): Promise<BusCityPair[]> {
    const rows = await this.db
      .selectFrom('bus_routes as r')
      .innerJoin('bus_operators as o', 'o.id', 'r.operator_id')
      .select(['r.origin_city', 'r.destination_city'])
      .distinct()
      .where('r.is_active', '=', true)
      .where('o.status', '=', 'active')
      .orderBy('r.origin_city')
      .orderBy('r.destination_city')
      .execute();
    return rows.map((r) => ({ originCity: r.origin_city, destinationCity: r.destination_city }));
  }

  /** Departures between two cities on a Nigerian calendar day that have not left yet. */
  async search(q: BusSearchQuery, now = new Date()): Promise<BusDepartureSummary[]> {
    const start = lagosDayStart(q.date);
    const end = new Date(start.getTime() + 86_400_000);
    return this.departures.summaries(
      sql<boolean>`lower(r.origin_city) = lower(${q.from}) AND lower(r.destination_city) = lower(${q.to})
        AND s.status = 'scheduled' AND o.status = 'active' AND r.is_active
        AND s.departs_at >= ${start} AND s.departs_at < ${end} AND s.departs_at > ${now}`,
      now,
    );
  }

  /** The seat map as one passenger sees it ("yours": seats they are holding). */
  async seatMap(id: string, viewerId: string, now = new Date()): Promise<BusDepartureDetail> {
    const found = await this.departures.one(id, now);
    if (!found) throw new AppException(ErrorCode.NOT_FOUND, 'Departure not found');
    const { row, fares } = found;
    const seats = await sql<{
      id: string;
      label: string;
      row_no: number;
      col_no: number;
      seat_class: SeatClass;
      holder: string | null;
    }>`
      SELECT st.id, st.label, st.row_no, st.col_no, st.seat_class,
        (SELECT b.passenger_id FROM bus_booking_seats bs JOIN bus_bookings b ON b.id = bs.booking_id
          WHERE bs.schedule_id = ${id} AND bs.seat_id = st.id AND bs.status = 'active'
            AND (b.status = 'confirmed' OR (b.status = 'held' AND b.hold_expires_at > ${now}))
          LIMIT 1) AS holder
      FROM bus_seats st WHERE st.layout_id = ${row.layout_id}
      ORDER BY st.row_no, st.col_no`.execute(this.db);
    const layout = await this.db
      .selectFrom('bus_seat_layouts')
      .select(['rows', 'columns'])
      .where('id', '=', row.layout_id)
      .executeTakeFirstOrThrow();
    const fareOf = new Map(fares.map((f) => [f.seatClass, f.fareKobo]));
    return {
      ...this.departures.summary(row, fares, now),
      layout: {
        rows: layout.rows,
        columns: layout.columns,
        seats: seats.rows.map((s) => ({
          id: s.id,
          label: s.label,
          row: s.row_no,
          col: s.col_no,
          seatClass: s.seat_class,
          fareKobo: fareOf.get(s.seat_class) ?? 0,
          state: s.holder === null ? 'available' : s.holder === viewerId ? 'yours' : 'taken',
        })),
      },
    };
  }
}
