import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import {
  type AdminTicketView,
  ErrorCode,
  type TicketStatus,
  type TicketView,
} from '@rideswithme/shared-types';
import type { AdminTicketsQuery, CreateTicketInput } from '@rideswithme/validation';
import { AuditService } from '../audit/audit.service';
import type { Principal } from '../auth/principal';
import { AppException } from '../common/app-exception';
import type { RequestContext } from '../common/request-context';
import { DB } from '../database/database.module';
import type { Database } from '../database/types';
import { NotificationsService } from '../notifications/notifications.service';
import { rideForParticipant } from '../safety/ride-access';

/** Support tickets: a conversation between a passenger or driver and the support team. */
@Injectable()
export class SupportService {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async create(userId: string, input: CreateTicketInput): Promise<TicketView> {
    if (input.rideId) await rideForParticipant(this.db, input.rideId, userId);
    if (input.busBookingId) {
      const b = await this.db
        .selectFrom('bus_bookings')
        .select('passenger_id')
        .where('id', '=', input.busBookingId)
        .executeTakeFirst();
      if (!b || b.passenger_id !== userId)
        throw new AppException(ErrorCode.NOT_FOUND, 'Booking not found');
    }
    const id = await this.db.transaction().execute(async (trx) => {
      const t = await trx
        .insertInto('support_tickets')
        .values({
          user_id: userId,
          category: input.category,
          subject: input.subject,
          ride_id: input.rideId ?? null,
          bus_booking_id: input.busBookingId ?? null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await trx
        .insertInto('support_ticket_messages')
        .values({ ticket_id: t.id, author_id: userId, from_staff: false, body: input.body })
        .execute();
      return t.id;
    });
    return this.get(userId, id);
  }

  async mine(userId: string): Promise<TicketView[]> {
    const rows = await this.db
      .selectFrom('support_tickets')
      .select('id')
      .where('user_id', '=', userId)
      .orderBy('last_message_at', 'desc')
      .limit(50)
      .execute();
    return (
      await this.views(
        rows.map((r) => r.id),
        false,
      )
    ).map(strip);
  }

  async get(userId: string, id: string): Promise<TicketView> {
    const t = (await this.views([id], true))[0];
    if (!t || t.user.id !== userId)
      throw new AppException(ErrorCode.NOT_FOUND, 'Request not found');
    return strip(t);
  }

  /** The person adds to their request; it goes back to the team's queue. */
  async reply(userId: string, id: string, body: string): Promise<TicketView> {
    await this.get(userId, id);
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('support_ticket_messages')
        .values({ ticket_id: id, author_id: userId, from_staff: false, body })
        .execute();
      await trx
        .updateTable('support_tickets')
        .set({ status: 'open', last_message_at: new Date(), resolved_at: null })
        .where('id', '=', id)
        .execute();
    });
    return this.get(userId, id);
  }

  // --- Staff ---

  async list(q: AdminTicketsQuery): Promise<AdminTicketView[]> {
    let query = this.db
      .selectFrom('support_tickets')
      .select('id')
      .orderBy('last_message_at')
      .limit(q.limit);
    if (q.status) query = query.where('status', '=', q.status);
    if (q.userId) query = query.where('user_id', '=', q.userId);
    return this.views(
      (await query.execute()).map((r) => r.id),
      false,
    );
  }

  async adminGet(id: string): Promise<AdminTicketView> {
    const t = (await this.views([id], true))[0];
    if (!t) throw new AppException(ErrorCode.NOT_FOUND, 'Request not found');
    return t;
  }

  async staffReply(principal: Principal, id: string, body: string, ctx: Partial<RequestContext>) {
    const t = await this.adminGet(id);
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('support_ticket_messages')
        .values({ ticket_id: id, author_id: principal.userId, from_staff: true, body })
        .execute();
      await trx
        .updateTable('support_tickets')
        .set({
          status: 'waiting_on_user',
          last_message_at: new Date(),
          assigned_to: principal.userId,
        })
        .where('id', '=', id)
        .execute();
      await this.audit.record(
        {
          actor: { type: 'user', userId: principal.userId },
          action: 'support.replied',
          target: { type: 'support_ticket', id },
          context: ctx,
        },
        trx,
      );
    });
    await this.notifications.notify(
      t.user.id,
      'support_reply',
      { subject: t.subject },
      { data: { ticketId: id } },
    );
    return this.adminGet(id);
  }

  async setStatus(
    principal: Principal,
    id: string,
    status: TicketStatus,
    ctx: Partial<RequestContext>,
  ) {
    await this.adminGet(id);
    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('support_tickets')
        .set({ status, resolved_at: status === 'resolved' ? new Date() : null })
        .where('id', '=', id)
        .execute();
      await this.audit.record(
        {
          actor: { type: 'user', userId: principal.userId },
          action: `support.${status}`,
          target: { type: 'support_ticket', id },
          context: ctx,
        },
        trx,
      );
    });
    return this.adminGet(id);
  }

  private async views(ids: string[], withMessages: boolean): Promise<AdminTicketView[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .selectFrom('support_tickets as t')
      .innerJoin('users as u', 'u.id', 't.user_id')
      .leftJoin('users as s', 's.id', 't.assigned_to')
      .selectAll('t')
      .select(['u.full_name', 'u.phone_e164', 's.full_name as staff_name'])
      .where('t.id', 'in', ids)
      .execute();
    const messages = withMessages
      ? await this.db
          .selectFrom('support_ticket_messages')
          .selectAll()
          .where('ticket_id', 'in', ids)
          .orderBy('created_at')
          .execute()
      : [];
    return ids
      .map((id) => rows.find((r) => r.id === id))
      .filter((t): t is (typeof rows)[number] => !!t)
      .map((t) => ({
        id: t.id,
        category: t.category,
        subject: t.subject,
        status: t.status,
        rideId: t.ride_id,
        busBookingId: t.bus_booking_id,
        createdAt: t.created_at.toISOString(),
        lastMessageAt: t.last_message_at.toISOString(),
        messages: messages
          .filter((m) => m.ticket_id === t.id)
          .map((m) => ({
            id: m.id,
            fromStaff: m.from_staff,
            body: m.body,
            createdAt: m.created_at.toISOString(),
          })),
        user: { id: t.user_id, name: t.full_name, phone: t.phone_e164 },
        assignedTo: t.assigned_to ? { id: t.assigned_to, name: t.staff_name } : null,
      }));
  }
}

/** The person's own view: no staff names. */
function strip(t: AdminTicketView): TicketView & { user: AdminTicketView['user'] } {
  const { assignedTo, ...rest } = t;
  void assignedTo;
  return rest;
}
