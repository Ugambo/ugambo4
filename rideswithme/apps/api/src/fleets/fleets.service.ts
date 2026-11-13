import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, sql } from 'kysely';
import {
  type DriverFleetView,
  ErrorCode,
  type FleetDriverView,
  type FleetOverview,
  type FleetPeriodTotals,
  type FleetSummary,
  type FleetTripView,
  type Paginated,
} from '@rideswithme/shared-types';
import type { CreateFleetInput, FleetTripsQuery } from '@rideswithme/validation';
import { AdminService } from '../admin/admin.service';
import { AuditService } from '../audit/audit.service';
import type { Principal } from '../auth/principal';
import { AppException } from '../common/app-exception';
import { decodeCursor, encodeCursor } from '../common/cursor';
import type { RequestContext } from '../common/request-context';
import { DB, isUniqueViolation } from '../database/database.module';
import { koboFromDb } from '../database/geo';
import type { Database } from '../database/types';
import { lagosPeriodStarts } from '../payments/payouts.service';
import { PresenceService } from '../rides/presence.service';

const zero = (): FleetPeriodTotals => ({
  trips: 0,
  faresKobo: 0,
  earningsKobo: 0,
  commissionKobo: 0,
});

/**
 * Rides a fleet may see: its drivers' rides from when they joined until they
 * left. Every fleet query goes through this join, so a manager never sees
 * another fleet's drivers, or a driver's rides from before or after membership.
 */
const memberRides = (fleetId: string) => sql`
  JOIN fleet_members m ON m.user_id = r.driver_id
    AND m.fleet_id = ${fleetId}
    AND m.member_role = 'driver'
    AND m.status IN ('active', 'removed')
    AND m.responded_at IS NOT NULL
    AND r.assigned_at >= m.responded_at
    AND (m.removed_at IS NULL OR r.assigned_at < m.removed_at)`;

export interface FleetScope {
  fleetId: string;
  name: string;
}

@Injectable()
export class FleetsService {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    private readonly admin: AdminService,
    private readonly audit: AuditService,
    private readonly presence: PresenceService,
  ) {}

  // --- Staff ---

  async list(): Promise<FleetSummary[]> {
    const fleets = await this.db
      .selectFrom('fleet_operators')
      .selectAll()
      .orderBy('name')
      .execute();
    if (fleets.length === 0) return [];
    const members = await this.db
      .selectFrom('fleet_members as m')
      .innerJoin('users as u', 'u.id', 'm.user_id')
      .select(['m.fleet_id', 'm.user_id', 'm.member_role', 'u.full_name', 'u.phone_e164'])
      .where('m.status', '=', 'active')
      .execute();
    return fleets.map((f) => ({
      id: f.id,
      name: f.name,
      status: f.status,
      contactPhone: f.contact_phone,
      contactEmail: f.contact_email,
      drivers: members.filter((m) => m.fleet_id === f.id && m.member_role === 'driver').length,
      managers: members
        .filter((m) => m.fleet_id === f.id && m.member_role === 'manager')
        .map((m) => ({ userId: m.user_id, name: m.full_name, phone: m.phone_e164 })),
      createdAt: f.created_at.toISOString(),
    }));
  }

  async get(fleetId: string): Promise<FleetSummary> {
    const f = (await this.list()).find((x) => x.id === fleetId);
    if (!f) throw new AppException(ErrorCode.NOT_FOUND, 'Fleet not found');
    return f;
  }

  /** Creates a fleet with its first manager (given the fleet manager role; they sign in with an SMS code and set up two-factor). */
  async create(
    principal: Principal,
    input: CreateFleetInput & { managerPhone: string },
    ctx: Partial<RequestContext>,
  ): Promise<FleetSummary> {
    let fleetId: string;
    try {
      fleetId = await this.db.transaction().execute(async (trx) => {
        const fleet = await trx
          .insertInto('fleet_operators')
          .values({
            name: input.name,
            contact_phone: input.contactPhone ?? null,
            contact_email: input.contactEmail ?? null,
            created_by: principal.userId,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await this.audit.record(
          {
            actor: { type: 'user', userId: principal.userId },
            action: 'fleets.created',
            target: { type: 'fleet', id: fleet.id },
            metadata: { name: input.name },
            context: ctx,
          },
          trx,
        );
        return fleet.id;
      });
    } catch (err) {
      if (isUniqueViolation(err, 'fleet_operators_name_key'))
        throw new AppException(ErrorCode.CONFLICT, 'A fleet with this name already exists');
      throw err;
    }
    await this.addManager(principal, fleetId, input.managerPhone, ctx);
    return this.get(fleetId);
  }

  async addManager(
    principal: Principal,
    fleetId: string,
    phone: string,
    ctx: Partial<RequestContext>,
  ): Promise<FleetSummary> {
    await this.fleetRow(fleetId);
    const user =
      (await this.db
        .selectFrom('users')
        .select('id')
        .where('phone_e164', '=', phone)
        .executeTakeFirst()) ??
      (await this.db
        .insertInto('users')
        .values({ phone_e164: phone })
        .returning('id')
        .executeTakeFirstOrThrow());
    await this.admin.assignRole(
      user.id,
      'fleet_manager',
      { type: 'user', userId: principal.userId, principal },
      ctx,
    );
    try {
      await this.db.transaction().execute(async (trx) => {
        await trx
          .insertInto('fleet_members')
          .values({
            fleet_id: fleetId,
            user_id: user.id,
            member_role: 'manager',
            status: 'active',
            invited_by: principal.userId,
            responded_at: new Date(),
          })
          .execute();
        await this.audit.record(
          {
            actor: { type: 'user', userId: principal.userId },
            action: 'fleets.manager_added',
            target: { type: 'fleet', id: fleetId },
            metadata: { userId: user.id },
            context: ctx,
          },
          trx,
        );
      });
    } catch (err) {
      if (isUniqueViolation(err))
        throw new AppException(ErrorCode.CONFLICT, 'This person already manages a fleet');
      throw err;
    }
    return this.get(fleetId);
  }

  async setStatus(
    principal: Principal,
    fleetId: string,
    status: 'active' | 'suspended',
    ctx: Partial<RequestContext>,
  ) {
    await this.fleetRow(fleetId);
    await this.db.transaction().execute(async (trx) => {
      await trx.updateTable('fleet_operators').set({ status }).where('id', '=', fleetId).execute();
      await this.audit.record(
        {
          actor: { type: 'user', userId: principal.userId },
          action: status === 'suspended' ? 'fleets.suspended' : 'fleets.reactivated',
          target: { type: 'fleet', id: fleetId },
          context: ctx,
        },
        trx,
      );
    });
    return this.get(fleetId);
  }

  private async fleetRow(fleetId: string) {
    const f = await this.db
      .selectFrom('fleet_operators')
      .selectAll()
      .where('id', '=', fleetId)
      .executeTakeFirst();
    if (!f) throw new AppException(ErrorCode.NOT_FOUND, 'Fleet not found');
    return f;
  }

  // --- Fleet managers ---

  /** The fleet this manager runs. Everything a manager does is scoped by it. */
  async scope(principal: Principal): Promise<FleetScope> {
    const m = await this.db
      .selectFrom('fleet_members as m')
      .innerJoin('fleet_operators as f', 'f.id', 'm.fleet_id')
      .select(['f.id', 'f.name', 'f.status'])
      .where('m.user_id', '=', principal.userId)
      .where('m.member_role', '=', 'manager')
      .where('m.status', '=', 'active')
      .executeTakeFirst();
    if (!m) throw new AppException(ErrorCode.FORBIDDEN, 'You do not manage a fleet');
    if (m.status !== 'active')
      throw new AppException(ErrorCode.FORBIDDEN, 'This fleet is suspended');
    return { fleetId: m.id, name: m.name };
  }

  async overview(scope: FleetScope, now = new Date()): Promise<FleetOverview> {
    const members = await this.memberRows(scope.fleetId);
    const active = members.filter((m) => m.status === 'active').map((m) => m.user_id);
    const states = await this.presence.states(active);
    const onTrip = active.length
      ? await this.db
          .selectFrom('rides')
          .select('driver_id')
          .where('driver_id', 'in', active)
          .where('status', 'in', ['driver_assigned', 'driver_arrived', 'in_progress'])
          .execute()
      : [];
    const totals = await this.totals(scope.fleetId, now);
    const sum = (k: 'today' | 'week') =>
      [...totals.values()].reduce((acc, t) => {
        const p = t[k];
        return {
          trips: acc.trips + p.trips,
          faresKobo: acc.faresKobo + p.faresKobo,
          earningsKobo: acc.earningsKobo + p.earningsKobo,
          commissionKobo: acc.commissionKobo + p.commissionKobo,
        };
      }, zero());
    const fleet = await this.fleetRow(scope.fleetId);
    return {
      fleet: { id: fleet.id, name: fleet.name, status: fleet.status },
      drivers: {
        active: active.length,
        invited: members.filter((m) => m.status === 'invited').length,
        online: [...states.values()].filter((s) => s.online).length,
        onTrip: onTrip.length,
      },
      today: sum('today'),
      week: sum('week'),
    };
  }

  private memberRows(fleetId: string) {
    return this.db
      .selectFrom('fleet_members as m')
      .innerJoin('users as u', 'u.id', 'm.user_id')
      .leftJoin('driver_profiles as p', 'p.user_id', 'm.user_id')
      .select([
        'm.user_id',
        'm.status',
        'm.invited_at',
        'm.responded_at',
        'u.full_name',
        'u.phone_e164',
        'p.status as driver_status',
      ])
      .where('m.fleet_id', '=', fleetId)
      .where('m.member_role', '=', 'driver')
      .where('m.status', 'in', ['invited', 'active'])
      .orderBy('u.full_name')
      .execute();
  }

  /** Today's and this week's totals per driver, counting only rides while in this fleet. */
  private async totals(fleetId: string, now: Date) {
    const { today, week } = lagosPeriodStarts(now);
    const rows = await sql<{
      driver_id: string;
      t_trips: string;
      t_fares: string;
      t_earn: string;
      t_comm: string;
      w_trips: string;
      w_fares: string;
      w_earn: string;
      w_comm: string;
    }>`
      SELECT c.driver_id,
        count(*) FILTER (WHERE r.completed_at >= ${today}) AS t_trips,
        coalesce(sum(c.fare_kobo) FILTER (WHERE r.completed_at >= ${today}), 0) AS t_fares,
        coalesce(sum(c.fare_kobo - c.booking_fee_kobo - c.commission_kobo) FILTER (WHERE r.completed_at >= ${today}), 0) AS t_earn,
        coalesce(sum(c.commission_kobo + c.booking_fee_kobo) FILTER (WHERE r.completed_at >= ${today}), 0) AS t_comm,
        count(*) AS w_trips,
        coalesce(sum(c.fare_kobo), 0) AS w_fares,
        coalesce(sum(c.fare_kobo - c.booking_fee_kobo - c.commission_kobo), 0) AS w_earn,
        coalesce(sum(c.commission_kobo + c.booking_fee_kobo), 0) AS w_comm
      FROM commissions c
      JOIN rides r ON r.id = c.ride_id
      ${memberRides(fleetId)}
      WHERE r.completed_at >= ${week}
      GROUP BY c.driver_id`.execute(this.db);
    return new Map(
      rows.rows.map((r) => [
        r.driver_id,
        {
          today: {
            trips: Number(r.t_trips),
            faresKobo: koboFromDb(r.t_fares),
            earningsKobo: koboFromDb(r.t_earn),
            commissionKobo: koboFromDb(r.t_comm),
          },
          week: {
            trips: Number(r.w_trips),
            faresKobo: koboFromDb(r.w_fares),
            earningsKobo: koboFromDb(r.w_earn),
            commissionKobo: koboFromDb(r.w_comm),
          },
        },
      ]),
    );
  }

  async drivers(scope: FleetScope, now = new Date()): Promise<FleetDriverView[]> {
    const members = await this.memberRows(scope.fleetId);
    const ids = members.map((m) => m.user_id);
    const [states, totals, vehicles] = await Promise.all([
      this.presence.states(ids),
      this.totals(scope.fleetId, now),
      this.vehicleRows(ids),
    ]);
    return members.map((m) => {
      const active = m.status === 'active';
      const v = vehicles.find((x) => x.driver_user_id === m.user_id);
      const t = totals.get(m.user_id);
      return {
        userId: m.user_id,
        name: active ? m.full_name : null,
        phone: m.phone_e164,
        membership: {
          status: m.status,
          invitedAt: m.invited_at.toISOString(),
          joinedAt: m.responded_at ? new Date(m.responded_at).toISOString() : null,
        },
        driverStatus: active ? m.driver_status : null,
        // Until a driver accepts, the fleet sees only what it typed in: their phone number and name.
        online: active ? (states.get(m.user_id)?.online ?? false) : false,
        lastSeenAt: active ? (states.get(m.user_id)?.receivedAt ?? null) : null,
        vehicle:
          active && v
            ? {
                category: v.category,
                make: v.make,
                model: v.model,
                colour: v.colour,
                plateNumber: v.plate_number,
              }
            : null,
        today: t?.today ?? zero(),
        week: t?.week ?? zero(),
      };
    });
  }

  async driver(scope: FleetScope, userId: string): Promise<FleetDriverView> {
    const d = (await this.drivers(scope)).find((x) => x.userId === userId);
    if (!d) throw new AppException(ErrorCode.NOT_FOUND, 'Not a driver in your fleet');
    return d;
  }

  private vehicleRows(driverIds: string[]) {
    if (driverIds.length === 0) return Promise.resolve([]);
    return this.db
      .selectFrom('vehicles as v')
      .innerJoin('vehicle_categories as c', 'c.id', 'v.vehicle_category_id')
      .select([
        'v.driver_user_id',
        'v.make',
        'v.model',
        'v.colour',
        'v.plate_number',
        'v.year',
        'c.name as category',
      ])
      .where('v.driver_user_id', 'in', driverIds)
      .where('v.status', '=', 'active')
      .execute();
  }

  async vehicles(scope: FleetScope) {
    const active = (await this.memberRows(scope.fleetId)).filter((m) => m.status === 'active');
    const rows = await this.vehicleRows(active.map((m) => m.user_id));
    return rows.map((v) => ({
      driver: {
        userId: v.driver_user_id,
        name: active.find((m) => m.user_id === v.driver_user_id)?.full_name ?? null,
      },
      category: v.category,
      make: v.make,
      model: v.model,
      colour: v.colour,
      year: v.year,
      plateNumber: v.plate_number,
    }));
  }

  async trips(scope: FleetScope, q: FleetTripsQuery): Promise<Paginated<FleetTripView>> {
    const cursor = decodeCursor(q.cursor);
    const rows = await sql<{
      id: string;
      status: string;
      driver_id: string;
      full_name: string | null;
      category: string;
      pickup_address: string;
      dropoff_address: string;
      payment_method: 'cash' | 'wallet' | 'card';
      final_total_kobo: string | null;
      commission_kobo: string | null;
      booking_fee_kobo: string | null;
      requested_at: Date;
      completed_at: Date | null;
      ts: string;
    }>`
      SELECT r.id, r.status, r.driver_id, u.full_name, vc.name AS category, r.pickup_address, r.dropoff_address,
        r.payment_method, r.final_total_kobo, c.commission_kobo, c.booking_fee_kobo, r.requested_at, r.completed_at,
        r.requested_at::text AS ts
      FROM rides r
      ${memberRides(scope.fleetId)}
      JOIN users u ON u.id = r.driver_id
      JOIN vehicle_categories vc ON vc.id = r.vehicle_category_id
      LEFT JOIN commissions c ON c.ride_id = r.id
      WHERE true
        ${q.driverId ? sql`AND r.driver_id = ${q.driverId}` : sql``}
        ${q.from ? sql`AND r.requested_at >= (${q.from}::date AT TIME ZONE 'Africa/Lagos')` : sql``}
        ${q.to ? sql`AND r.requested_at < ((${q.to}::date + 1) AT TIME ZONE 'Africa/Lagos')` : sql``}
        ${cursor ? sql`AND (r.requested_at, r.id) < (${cursor.ts}::timestamptz, ${cursor.id}::uuid)` : sql``}
      ORDER BY r.requested_at DESC, r.id DESC
      LIMIT ${q.limit + 1}`.execute(this.db);
    const page = rows.rows.slice(0, q.limit);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => {
        const fare = r.final_total_kobo === null ? null : koboFromDb(r.final_total_kobo);
        const fees =
          r.commission_kobo === null
            ? null
            : koboFromDb(r.commission_kobo) + koboFromDb(r.booking_fee_kobo);
        return {
          id: r.id,
          status: r.status,
          driver: { userId: r.driver_id, name: r.full_name },
          category: r.category,
          pickupAddress: r.pickup_address,
          dropoffAddress: r.dropoff_address,
          paymentMethod: r.payment_method,
          fareKobo: fare,
          commissionKobo: fees,
          earningsKobo: fare !== null && fees !== null ? fare - fees : null,
          requestedAt: r.requested_at.toISOString(),
          completedAt: r.completed_at?.toISOString() ?? null,
        };
      }),
      nextCursor:
        rows.rows.length > q.limit && last ? encodeCursor({ ts: last.ts, id: last.id }) : null,
    };
  }

  /** Invites a registered driver by phone. They accept in the driver app. */
  async invite(
    principal: Principal,
    scope: FleetScope,
    phone: string,
    ctx: Partial<RequestContext>,
  ): Promise<FleetDriverView> {
    const user = await this.db
      .selectFrom('users as u')
      .innerJoin('driver_profiles as p', 'p.user_id', 'u.id')
      .select('u.id')
      .where('u.phone_e164', '=', phone)
      .executeTakeFirst();
    if (!user)
      throw new AppException(ErrorCode.DRIVER_NOT_REGISTERED, 'No driver with this phone number');
    try {
      await this.db.transaction().execute(async (trx) => {
        await trx
          .insertInto('fleet_members')
          .values({
            fleet_id: scope.fleetId,
            user_id: user.id,
            member_role: 'driver',
            status: 'invited',
            invited_by: principal.userId,
          })
          .execute();
        await this.audit.record(
          {
            actor: { type: 'user', userId: principal.userId },
            action: 'fleets.driver_invited',
            target: { type: 'fleet', id: scope.fleetId },
            metadata: { driverId: user.id },
            context: ctx,
          },
          trx,
        );
      });
    } catch (err) {
      if (isUniqueViolation(err))
        throw new AppException(ErrorCode.CONFLICT, 'Already invited or in your fleet');
      throw err;
    }
    return this.driver(scope, user.id);
  }

  async removeDriver(
    principal: Principal,
    scope: FleetScope,
    userId: string,
    ctx: Partial<RequestContext>,
  ): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const r = await trx
        .updateTable('fleet_members')
        .set({ status: 'removed', removed_at: new Date(), removed_by: principal.userId })
        .where('fleet_id', '=', scope.fleetId)
        .where('user_id', '=', userId)
        .where('member_role', '=', 'driver')
        .where('status', 'in', ['invited', 'active'])
        .executeTakeFirst();
      if (Number(r.numUpdatedRows) === 0)
        throw new AppException(ErrorCode.NOT_FOUND, 'Not a driver in your fleet');
      await this.audit.record(
        {
          actor: { type: 'user', userId: principal.userId },
          action: 'fleets.driver_removed',
          target: { type: 'fleet', id: scope.fleetId },
          metadata: { driverId: userId },
          context: ctx,
        },
        trx,
      );
    });
  }

  // --- Drivers ---

  async driverFleet(userId: string): Promise<DriverFleetView> {
    const rows = await this.db
      .selectFrom('fleet_members as m')
      .innerJoin('fleet_operators as f', 'f.id', 'm.fleet_id')
      .select([
        'm.id',
        'm.status',
        'm.invited_at',
        'm.responded_at',
        'f.id as fleet_id',
        'f.name',
        'f.status as fleet_status',
      ])
      .where('m.user_id', '=', userId)
      .where('m.member_role', '=', 'driver')
      .where('m.status', 'in', ['invited', 'active'])
      .orderBy('m.invited_at', 'desc')
      .execute();
    const current = rows.find((r) => r.status === 'active');
    return {
      current: current
        ? {
            id: current.fleet_id,
            name: current.name,
            joinedAt: new Date(current.responded_at!).toISOString(),
          }
        : null,
      invitations: rows
        .filter((r) => r.status === 'invited' && r.fleet_status === 'active')
        .map((r) => ({
          id: r.id,
          fleet: { id: r.fleet_id, name: r.name },
          invitedAt: r.invited_at.toISOString(),
        })),
    };
  }

  async respond(
    userId: string,
    invitationId: string,
    accept: boolean,
    ctx: Partial<RequestContext>,
  ): Promise<DriverFleetView> {
    try {
      await this.db.transaction().execute(async (trx) => {
        const r = await trx
          .updateTable('fleet_members')
          .set({ status: accept ? 'active' : 'declined', responded_at: new Date() })
          .where('id', '=', invitationId)
          .where('user_id', '=', userId)
          .where('member_role', '=', 'driver')
          .where('status', '=', 'invited')
          .returning('fleet_id')
          .executeTakeFirst();
        if (!r) throw new AppException(ErrorCode.NOT_FOUND, 'Invitation not found');
        await this.audit.record(
          {
            actor: { type: 'user', userId },
            action: accept ? 'fleets.invitation_accepted' : 'fleets.invitation_declined',
            target: { type: 'fleet', id: r.fleet_id },
            context: ctx,
          },
          trx,
        );
      });
    } catch (err) {
      if (isUniqueViolation(err, 'fleet_members_one_fleet_per_driver'))
        throw new AppException(ErrorCode.CONFLICT, 'Leave your current fleet first');
      throw err;
    }
    return this.driverFleet(userId);
  }

  async leave(userId: string, ctx: Partial<RequestContext>): Promise<DriverFleetView> {
    await this.db.transaction().execute(async (trx) => {
      const r = await trx
        .updateTable('fleet_members')
        .set({ status: 'removed', removed_at: new Date(), removed_by: userId })
        .where('user_id', '=', userId)
        .where('member_role', '=', 'driver')
        .where('status', '=', 'active')
        .returning('fleet_id')
        .executeTakeFirst();
      if (!r) throw new AppException(ErrorCode.NOT_FOUND, 'You are not in a fleet');
      await this.audit.record(
        {
          actor: { type: 'user', userId },
          action: 'fleets.driver_left',
          target: { type: 'fleet', id: r.fleet_id },
          context: ctx,
        },
        trx,
      );
    });
    return this.driverFleet(userId);
  }
}
