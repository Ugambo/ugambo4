import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, sql } from 'kysely';
import {
  type BusOperatorSummary,
  type BusPeriodTotals,
  ErrorCode,
  type OperatorOverview,
  type WalletEntryView,
} from '@rideswithme/shared-types';
import type {
  CreateBusOperatorInput,
  OperatorSettlementInput,
  UpdateBusOperatorInput,
} from '@rideswithme/validation';
import { AdminService } from '../admin/admin.service';
import { AuditService } from '../audit/audit.service';
import type { Principal } from '../auth/principal';
import { AppException } from '../common/app-exception';
import type { RequestContext } from '../common/request-context';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB, isUniqueViolation } from '../database/database.module';
import { koboFromDb } from '../database/geo';
import type { Database } from '../database/types';
import { credit, debit, LedgerService } from '../payments/ledger.service';
import { lagosPeriodStarts } from '../payments/payouts.service';

export interface OperatorScope {
  operatorId: string;
  name: string;
}

/**
 * Bus operators: created by staff, run by their managers in the portal.
 * Everything a manager does goes through scope(), so they only ever touch
 * their own operator's routes, buses, departures and passengers.
 */
@Injectable()
export class OperatorsService {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly admin: AdminService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
  ) {}

  // --- Staff ---

  async list(): Promise<BusOperatorSummary[]> {
    const ops = await this.db.selectFrom('bus_operators').selectAll().orderBy('name').execute();
    if (ops.length === 0) return [];
    const members = await this.db
      .selectFrom('bus_operator_members as m')
      .innerJoin('users as u', 'u.id', 'm.user_id')
      .select(['m.operator_id', 'm.user_id', 'u.full_name', 'u.phone_e164'])
      .where('m.status', '=', 'active')
      .execute();
    const balances = await this.db
      .selectFrom('wallets')
      .select(['operator_id', 'balance_kobo'])
      .where('kind', '=', 'bus_operator')
      .execute();
    return ops.map((o) => ({
      id: o.id,
      name: o.name,
      status: o.status,
      serviceFeeBps: o.service_fee_bps,
      contactPhone: o.contact_phone,
      contactEmail: o.contact_email,
      managers: members
        .filter((m) => m.operator_id === o.id)
        .map((m) => ({ userId: m.user_id, name: m.full_name, phone: m.phone_e164 })),
      balanceKobo: koboFromDb(balances.find((b) => b.operator_id === o.id)?.balance_kobo ?? 0),
      createdAt: o.created_at.toISOString(),
    }));
  }

  async get(operatorId: string): Promise<BusOperatorSummary> {
    const o = (await this.list()).find((x) => x.id === operatorId);
    if (!o) throw new AppException(ErrorCode.NOT_FOUND, 'Bus operator not found');
    return o;
  }

  async create(
    principal: Principal,
    input: CreateBusOperatorInput & { managerPhone: string },
    ctx: Partial<RequestContext>,
  ): Promise<BusOperatorSummary> {
    let id: string;
    try {
      id = await this.db.transaction().execute(async (trx) => {
        const op = await trx
          .insertInto('bus_operators')
          .values({
            name: input.name,
            service_fee_bps: input.serviceFeeBps ?? this.config.BUS_DEFAULT_SERVICE_FEE_BPS,
            contact_phone: input.contactPhone ?? null,
            contact_email: input.contactEmail ?? null,
            created_by: principal.userId,
          })
          .returning(['id', 'service_fee_bps'])
          .executeTakeFirstOrThrow();
        await this.audit.record(
          {
            actor: { type: 'user', userId: principal.userId },
            action: 'buses.operator_created',
            target: { type: 'bus_operator', id: op.id },
            metadata: { name: input.name, serviceFeeBps: op.service_fee_bps },
            context: ctx,
          },
          trx,
        );
        return op.id;
      });
    } catch (err) {
      if (isUniqueViolation(err, 'bus_operators_name_key'))
        throw new AppException(ErrorCode.CONFLICT, 'An operator with this name already exists');
      throw err;
    }
    return this.addManager(principal, id, input.managerPhone, ctx);
  }

  async update(
    principal: Principal,
    operatorId: string,
    input: UpdateBusOperatorInput,
    ctx: Partial<RequestContext>,
  ): Promise<BusOperatorSummary> {
    const before = await this.row(operatorId);
    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('bus_operators')
        .set({
          ...(input.serviceFeeBps !== undefined && { service_fee_bps: input.serviceFeeBps }),
          ...(input.contactPhone !== undefined && { contact_phone: input.contactPhone }),
          ...(input.contactEmail !== undefined && { contact_email: input.contactEmail }),
        })
        .where('id', '=', operatorId)
        .execute();
      await this.audit.record(
        {
          actor: { type: 'user', userId: principal.userId },
          action: 'buses.operator_updated',
          target: { type: 'bus_operator', id: operatorId },
          metadata: { before: { serviceFeeBps: before.service_fee_bps }, changes: input },
          context: ctx,
        },
        trx,
      );
    });
    return this.get(operatorId);
  }

  async addManager(
    principal: Principal,
    operatorId: string,
    phone: string,
    ctx: Partial<RequestContext>,
  ): Promise<BusOperatorSummary> {
    await this.row(operatorId);
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
      'bus_operator',
      { type: 'user', userId: principal.userId, principal },
      ctx,
    );
    try {
      await this.db.transaction().execute(async (trx) => {
        await trx
          .insertInto('bus_operator_members')
          .values({ operator_id: operatorId, user_id: user.id, added_by: principal.userId })
          .execute();
        await this.audit.record(
          {
            actor: { type: 'user', userId: principal.userId },
            action: 'buses.manager_added',
            target: { type: 'bus_operator', id: operatorId },
            metadata: { userId: user.id },
            context: ctx,
          },
          trx,
        );
      });
    } catch (err) {
      if (isUniqueViolation(err))
        throw new AppException(ErrorCode.CONFLICT, 'This person already manages a bus operator');
      throw err;
    }
    return this.get(operatorId);
  }

  async setStatus(
    principal: Principal,
    operatorId: string,
    status: 'active' | 'suspended',
    ctx: Partial<RequestContext>,
  ): Promise<BusOperatorSummary> {
    await this.row(operatorId);
    await this.db.transaction().execute(async (trx) => {
      await trx.updateTable('bus_operators').set({ status }).where('id', '=', operatorId).execute();
      await this.audit.record(
        {
          actor: { type: 'user', userId: principal.userId },
          action:
            status === 'suspended' ? 'buses.operator_suspended' : 'buses.operator_reactivated',
          target: { type: 'bus_operator', id: operatorId },
          context: ctx,
        },
        trx,
      );
    });
    return this.get(operatorId);
  }

  /**
   * Records money paid to the operator outside the app (for now, a transfer
   * staff make from the Paystack dashboard): it leaves our Paystack balance and
   * reduces what we owe the operator.
   */
  async recordSettlement(
    principal: Principal,
    operatorId: string,
    input: OperatorSettlementInput,
    ctx: Partial<RequestContext>,
  ): Promise<BusOperatorSummary> {
    await this.row(operatorId);
    await this.db.transaction().execute(async (trx) => {
      const posted = await this.ledger.post(trx, {
        kind: 'operator_settlement',
        reference: `operator:${operatorId}:settlement:${randomUUID()}`,
        busOperatorId: operatorId,
        createdBy: principal.userId,
        memo: input.note,
        lines: [
          debit({ operator: operatorId }, input.amountKobo),
          credit({ system: 'paystack_balance' }, input.amountKobo),
        ],
      });
      await this.audit.record(
        {
          actor: { type: 'user', userId: principal.userId },
          action: 'buses.settlement_recorded',
          target: { type: 'bus_operator', id: operatorId },
          metadata: {
            amountKobo: input.amountKobo,
            note: input.note,
            journalId: posted?.journalId,
          },
          context: ctx,
        },
        trx,
      );
    });
    return this.get(operatorId);
  }

  /** The operator's account lines, newest first: sales (+), refunds and settlements (−). */
  async statement(operatorId: string, limit = 100): Promise<WalletEntryView[]> {
    const rows = await this.db
      .selectFrom('wallet_transactions as t')
      .innerJoin('wallets as w', 'w.id', 't.wallet_id')
      .innerJoin('ledger_journals as j', 'j.id', 't.journal_id')
      .leftJoin('bus_bookings as b', 'b.id', 'j.bus_booking_id')
      .select([
        't.id',
        'j.kind',
        't.amount_kobo',
        't.balance_after_kobo',
        'j.memo',
        'b.reference',
        't.created_at',
      ])
      .where('w.operator_id', '=', operatorId)
      .orderBy('t.seq', 'desc')
      .limit(limit)
      .execute();
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind as WalletEntryView['kind'],
      amountKobo: -koboFromDb(r.amount_kobo),
      balanceAfterKobo: koboFromDb(r.balance_after_kobo),
      rideId: null,
      memo: r.reference ? `${r.reference}${r.memo ? ` · ${r.memo}` : ''}` : r.memo,
      createdAt: r.created_at.toISOString(),
    }));
  }

  private async row(operatorId: string) {
    const o = await this.db
      .selectFrom('bus_operators')
      .selectAll()
      .where('id', '=', operatorId)
      .executeTakeFirst();
    if (!o) throw new AppException(ErrorCode.NOT_FOUND, 'Bus operator not found');
    return o;
  }

  // --- Operator managers ---

  /** The operator this person runs; refused if none or if staff suspended it. */
  async scope(principal: Principal): Promise<OperatorScope> {
    const m = await this.db
      .selectFrom('bus_operator_members as m')
      .innerJoin('bus_operators as o', 'o.id', 'm.operator_id')
      .select(['o.id', 'o.name', 'o.status'])
      .where('m.user_id', '=', principal.userId)
      .where('m.status', '=', 'active')
      .executeTakeFirst();
    if (!m) throw new AppException(ErrorCode.FORBIDDEN, 'You do not manage a bus operator');
    if (m.status !== 'active')
      throw new AppException(ErrorCode.FORBIDDEN, 'This bus operator is suspended');
    return { operatorId: m.id, name: m.name };
  }

  async overview(scope: OperatorScope, now = new Date()): Promise<OperatorOverview> {
    const o = await this.row(scope.operatorId);
    const { today, week } = lagosPeriodStarts(now);
    const totals = async (since: Date): Promise<BusPeriodTotals> => {
      const r = await sql<{ seats: string; fares: string; earnings: string }>`
        SELECT
          (SELECT count(*) FROM bus_booking_seats bs JOIN bus_bookings b ON b.id = bs.booking_id
            JOIN bus_schedules s ON s.id = b.schedule_id
            WHERE s.operator_id = ${scope.operatorId} AND b.status = 'confirmed'
              AND b.confirmed_at >= ${since}) AS seats,
          (SELECT coalesce(sum(b.total_kobo), 0) FROM bus_bookings b JOIN bus_schedules s ON s.id = b.schedule_id
            WHERE s.operator_id = ${scope.operatorId} AND b.status = 'confirmed'
              AND b.confirmed_at >= ${since}) AS fares,
          (SELECT coalesce(sum(b.total_kobo - b.service_fee_kobo), 0) FROM bus_bookings b
            JOIN bus_schedules s ON s.id = b.schedule_id
            WHERE s.operator_id = ${scope.operatorId} AND b.status = 'confirmed'
              AND b.confirmed_at >= ${since}) AS earnings`.execute(this.db);
      const row = r.rows[0]!;
      return {
        seatsSold: Number(row.seats),
        faresKobo: koboFromDb(row.fares),
        earningsKobo: koboFromDb(row.earnings),
      };
    };
    const upcoming = await this.db
      .selectFrom('bus_schedules')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('operator_id', '=', scope.operatorId)
      .where('status', '=', 'scheduled')
      .where('departs_at', '>', now)
      .executeTakeFirstOrThrow();
    return {
      operator: { id: o.id, name: o.name, status: o.status, serviceFeeBps: o.service_fee_bps },
      upcomingDepartures: Number(upcoming.n),
      today: await totals(today),
      week: await totals(week),
      balanceKobo: await this.ledger.operatorBalance(scope.operatorId),
    };
  }
}
