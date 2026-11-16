import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import {
  type AdminIncidentView,
  ErrorCode,
  type IncidentCategory,
  type IncidentView,
} from '@rideswithme/shared-types';
import type { ReportIncidentInput, UpdateIncidentInput } from '@rideswithme/validation';
import { AuditService } from '../audit/audit.service';
import type { Principal } from '../auth/principal';
import { AppException } from '../common/app-exception';
import type { RequestContext } from '../common/request-context';
import { DB } from '../database/database.module';
import type { Database } from '../database/types';
import { NotificationsService } from '../notifications/notifications.service';
import { recordRideEvent } from '../rides/ride-events';
import { rideForParticipant } from './ride-access';

/** Reports about someone's safety go to the top of the staff queue. */
const HIGH: IncidentCategory[] = ['safety', 'accident', 'harassment', 'dangerous_driving'];

/** Incident reports: safety problems and other things that went wrong on a trip. */
@Injectable()
export class IncidentsService {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async report(
    userId: string,
    input: ReportIncidentInput,
    ctx: Partial<RequestContext>,
  ): Promise<IncidentView> {
    let reportedAs: 'passenger' | 'driver' = 'passenger';
    if (input.rideId) reportedAs = (await rideForParticipant(this.db, input.rideId, userId)).role;
    else {
      const driver = await this.db
        .selectFrom('driver_profiles')
        .select('user_id')
        .where('user_id', '=', userId)
        .executeTakeFirst();
      if (driver) reportedAs = 'driver';
    }
    const id = await this.db.transaction().execute(async (trx) => {
      const r = await trx
        .insertInto('incident_reports')
        .values({
          reporter_id: userId,
          reported_as: reportedAs,
          ride_id: input.rideId ?? null,
          category: input.category,
          priority: HIGH.includes(input.category) ? 'high' : 'normal',
          description: input.description,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      if (input.rideId)
        await recordRideEvent(trx, {
          rideId: input.rideId,
          eventType: 'incident_reported',
          actorType: reportedAs,
          actorId: userId,
          metadata: { incidentId: r.id, category: input.category },
        });
      await this.audit.record(
        {
          actor: { type: 'user', userId },
          action: 'safety.incident_reported',
          target: { type: 'incident_report', id: r.id },
          metadata: { category: input.category, rideId: input.rideId ?? null },
          context: ctx,
        },
        trx,
      );
      return r.id;
    });
    return (await this.views([id]))[0]!;
  }

  async mine(userId: string): Promise<IncidentView[]> {
    const rows = await this.db
      .selectFrom('incident_reports')
      .select('id')
      .where('reporter_id', '=', userId)
      .orderBy('created_at', 'desc')
      .limit(50)
      .execute();
    return (await this.views(rows.map((r) => r.id))).map(
      ({ reportedAs, reporter, assignedTo, ...v }) => {
        void reportedAs;
        void reporter;
        void assignedTo;
        return v;
      },
    );
  }

  async list(status?: 'open' | 'resolved'): Promise<AdminIncidentView[]> {
    let q = this.db
      .selectFrom('incident_reports')
      .select('id')
      .orderBy('priority')
      .orderBy('created_at', 'desc')
      .limit(200);
    if (status === 'open') q = q.where('status', '<>', 'resolved');
    if (status === 'resolved') q = q.where('status', '=', 'resolved');
    return this.views((await q.execute()).map((r) => r.id));
  }

  async get(id: string): Promise<AdminIncidentView> {
    const v = (await this.views([id]))[0];
    if (!v) throw new AppException(ErrorCode.NOT_FOUND, 'Report not found');
    return v;
  }

  async update(
    principal: Principal,
    id: string,
    input: UpdateIncidentInput,
    ctx: Partial<RequestContext>,
  ) {
    const reporter = await this.db.transaction().execute(async (trx) => {
      const r = await trx
        .updateTable('incident_reports')
        .set({
          status: input.status,
          assigned_to: principal.userId,
          ...(input.status === 'resolved' && {
            resolution_note: input.note ?? null,
            resolved_at: new Date(),
          }),
        })
        .where('id', '=', id)
        .where('status', '<>', 'resolved')
        .returning('reporter_id')
        .executeTakeFirst();
      if (!r) throw new AppException(ErrorCode.INVALID_STATE, 'This report is closed');
      await this.audit.record(
        {
          actor: { type: 'user', userId: principal.userId },
          action: `safety.incident_${input.status}`,
          target: { type: 'incident_report', id },
          metadata: { note: input.note ?? null },
          context: ctx,
        },
        trx,
      );
      return r.reporter_id;
    });
    await this.notifications.notify(
      reporter,
      'incident_update',
      { status: input.status === 'resolved' ? 'resolved' : 'being looked into' },
      { data: { incidentId: id } },
    );
    return this.get(id);
  }

  private async views(ids: string[]): Promise<AdminIncidentView[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .selectFrom('incident_reports as i')
      .innerJoin('users as u', 'u.id', 'i.reporter_id')
      .leftJoin('users as s', 's.id', 'i.assigned_to')
      .selectAll('i')
      .select(['u.full_name', 'u.phone_e164', 's.full_name as staff_name'])
      .where('i.id', 'in', ids)
      .execute();
    return ids
      .map((id) => rows.find((r) => r.id === id)!)
      .map((i) => ({
        id: i.id,
        rideId: i.ride_id,
        category: i.category,
        priority: i.priority,
        description: i.description,
        status: i.status,
        resolutionNote: i.resolution_note,
        createdAt: i.created_at.toISOString(),
        resolvedAt: i.resolved_at ? new Date(i.resolved_at).toISOString() : null,
        reportedAs: i.reported_as,
        reporter: { id: i.reporter_id, name: i.full_name, phone: i.phone_e164 },
        assignedTo: i.assigned_to ? { id: i.assigned_to, name: i.staff_name } : null,
      }));
  }
}
