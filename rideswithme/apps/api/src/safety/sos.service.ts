import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, sql } from 'kysely';
import {
  type AdminSosAlertView,
  ErrorCode,
  type SosAlertView,
  type SosStatus,
} from '@rideswithme/shared-types';
import type { RaiseSosInput } from '@rideswithme/validation';
import { AuditService } from '../audit/audit.service';
import type { Principal } from '../auth/principal';
import { AppException } from '../common/app-exception';
import type { RequestContext } from '../common/request-context';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB } from '../database/database.module';
import { latOf, lngOf, point } from '../database/geo';
import type { Database } from '../database/types';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeNotifier } from '../realtime/realtime.notifier';
import { recordRideEvent } from '../rides/ride-events';
import { PresenceService } from '../rides/presence.service';
import { ACTIVE, rideForParticipant } from './ride-access';

/** Presses within this window add to the same alert instead of opening a new one. */
const SAME_ALERT_MINUTES = 30;
/** Staff are texted again for repeat presses at most this often. */
const RESEND_SMS_MINUTES = 5;

/**
 * SOS: handled before anything else. An alert is stored with the best location
 * we have, every staff member watching operations gets it at once, and the
 * on-call phones (SOS_ALERT_PHONES) get an SMS with a map link. Nothing on the
 * way can refuse a press: missing ride or location only means less detail.
 */
@Injectable()
export class SosService {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly presence: PresenceService,
    private readonly notifier: RealtimeNotifier,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async raise(
    userId: string,
    input: RaiseSosInput,
    ctx: Partial<RequestContext>,
    now = new Date(),
  ): Promise<SosAlertView> {
    // The ride: the one given (if theirs), else their current one.
    let ride: { id: string; role: 'passenger' | 'driver'; driver_id: string | null } | null = null;
    if (input.rideId) {
      ride = await rideForParticipant(this.db, input.rideId, userId).catch(() => null);
    }
    if (!ride) {
      const r = await this.db
        .selectFrom('rides')
        .select(['id', 'passenger_id', 'driver_id'])
        .where((eb) => eb.or([eb('passenger_id', '=', userId), eb('driver_id', '=', userId)]))
        .where('status', 'in', ACTIVE as never)
        .orderBy('requested_at', 'desc')
        .executeTakeFirst();
      if (r)
        ride = {
          id: r.id,
          driver_id: r.driver_id,
          role: r.passenger_id === userId ? 'passenger' : 'driver',
        };
    }
    const isDriver = !!(await this.db
      .selectFrom('driver_profiles')
      .select('user_id')
      .where('user_id', '=', userId)
      .where('status', '=', 'approved')
      .executeTakeFirst());
    const raisedAs = ride?.role ?? (isDriver ? 'driver' : 'passenger');

    // Where: the phone's own fix, else the driver's live position.
    let location: {
      lat: number;
      lng: number;
      recordedAt: Date | null;
      source: 'device' | 'driver_position';
    } | null = null;
    if (input.location) {
      location = {
        lat: input.location.lat,
        lng: input.location.lng,
        recordedAt: input.location.recordedAt ? new Date(input.location.recordedAt) : now,
        source: 'device',
      };
    } else {
      const driverId = raisedAs === 'driver' ? userId : ride?.driver_id;
      const pos = driverId ? await this.presence.position(driverId) : null;
      if (pos)
        location = {
          lat: pos.lat,
          lng: pos.lng,
          recordedAt: new Date(pos.recordedAt),
          source: 'driver_position',
        };
    }

    const { id, first, sms } = await this.db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom('emergency_alerts')
        .select(['id', 'updated_at'])
        .where('user_id', '=', userId)
        .where('status', '<>', 'resolved')
        .where('created_at', '>', new Date(now.getTime() - SAME_ALERT_MINUTES * 60_000))
        .orderBy('created_at', 'desc')
        .forUpdate()
        .executeTakeFirst();
      if (existing) {
        await trx
          .updateTable('emergency_alerts')
          .set({
            presses: sql`presses + 1`,
            ...(location && {
              location: point(location),
              location_source: location.source,
              location_recorded_at: location.recordedAt,
            }),
            ...(input.note && { note: input.note }),
          })
          .where('id', '=', existing.id)
          .execute();
        return {
          id: existing.id,
          first: false,
          sms: now.getTime() - existing.updated_at.getTime() > RESEND_SMS_MINUTES * 60_000,
        };
      }
      const a = await trx
        .insertInto('emergency_alerts')
        .values({
          user_id: userId,
          raised_as: raisedAs,
          ride_id: ride?.id ?? null,
          location: location ? point(location) : null,
          location_source: location?.source ?? null,
          location_recorded_at: location?.recordedAt ?? null,
          note: input.note ?? null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await this.audit.record(
        {
          actor: { type: 'user', userId },
          action: 'safety.sos_raised',
          target: { type: 'emergency_alert', id: a.id },
          metadata: { rideId: ride?.id ?? null, raisedAs, located: !!location },
          context: ctx,
        },
        trx,
      );
      if (ride)
        await recordRideEvent(trx, {
          rideId: ride.id,
          eventType: 'sos_raised',
          actorType: raisedAs,
          actorId: userId,
          ...(location && { location: { lat: location.lat, lng: location.lng } }),
          metadata: { alertId: a.id },
        });
      return { id: a.id, first: true, sms: true };
    });

    const view = await this.adminView(id);
    await this.notifier.sos(view);
    if (sms && this.config.SOS_ALERT_PHONES.length) {
      const who = `${view.user.name ?? 'A user'} (${view.user.phone ?? 'no phone'}), ${raisedAs}`;
      const where = view.location
        ? `https://maps.google.com/?q=${view.location.lat.toFixed(5)},${view.location.lng.toFixed(5)}`
        : 'location unknown';
      const trip = view.ride
        ? ` Ride ${view.ride.pickupAddress} -> ${view.ride.dropoffAddress}${view.ride.driver?.plate ? `, plate ${view.ride.driver.plate}` : ''}.`
        : '';
      await this.notifications.textPhones(
        this.config.SOS_ALERT_PHONES,
        `RideswithMe SOS${first ? '' : ' (pressed again)'}: ${who}.${trip} ${where}. Open the admin dashboard now.`,
      );
    }
    return this.userView(view);
  }

  private userView(a: AdminSosAlertView): SosAlertView {
    return {
      id: a.id,
      status: a.status,
      rideId: a.rideId,
      createdAt: a.createdAt,
      acknowledgedAt: a.acknowledgedAt,
      resolvedAt: a.resolvedAt,
    };
  }

  /** The person's alert still open, if any (the app keeps showing "help is coming"). */
  async current(userId: string): Promise<SosAlertView | null> {
    const a = await this.db
      .selectFrom('emergency_alerts')
      .select('id')
      .where('user_id', '=', userId)
      .where('status', '<>', 'resolved')
      .orderBy('created_at', 'desc')
      .executeTakeFirst();
    return a ? this.userView(await this.adminView(a.id)) : null;
  }

  // --- Staff ---

  async list(status?: 'open' | 'resolved'): Promise<AdminSosAlertView[]> {
    let q = this.db
      .selectFrom('emergency_alerts')
      .select('id')
      .orderBy('created_at', 'desc')
      .limit(100);
    if (status === 'open') q = q.where('status', '<>', 'resolved');
    if (status === 'resolved') q = q.where('status', '=', 'resolved');
    const ids = await q.execute();
    return Promise.all(ids.map((r) => this.adminView(r.id)));
  }

  async adminView(id: string): Promise<AdminSosAlertView> {
    const a = await this.db
      .selectFrom('emergency_alerts as a')
      .innerJoin('users as u', 'u.id', 'a.user_id')
      .leftJoin('users as k', 'k.id', 'a.acknowledged_by')
      .selectAll('a')
      .select([
        'u.full_name',
        'u.phone_e164',
        'k.full_name as ack_name',
        sql<
          number | null
        >`CASE WHEN a.location IS NULL THEN NULL ELSE ${latOf('a.location')} END`.as('lat'),
        sql<
          number | null
        >`CASE WHEN a.location IS NULL THEN NULL ELSE ${lngOf('a.location')} END`.as('lng'),
      ])
      .where('a.id', '=', id)
      .executeTakeFirst();
    if (!a) throw new AppException(ErrorCode.NOT_FOUND, 'Alert not found');
    let ride: AdminSosAlertView['ride'] = null;
    if (a.ride_id) {
      const r = await this.db
        .selectFrom('rides as r')
        .innerJoin('users as p', 'p.id', 'r.passenger_id')
        .leftJoin('users as d', 'd.id', 'r.driver_id')
        .leftJoin('vehicles as v', 'v.id', 'r.vehicle_id')
        .select([
          'r.id',
          'r.status',
          'r.pickup_address',
          'r.dropoff_address',
          'r.passenger_id',
          'p.full_name as p_name',
          'p.phone_e164 as p_phone',
          'r.driver_id',
          'd.full_name as d_name',
          'd.phone_e164 as d_phone',
          'v.plate_number',
        ])
        .where('r.id', '=', a.ride_id)
        .executeTakeFirstOrThrow();
      ride = {
        id: r.id,
        status: r.status,
        pickupAddress: r.pickup_address,
        dropoffAddress: r.dropoff_address,
        passenger: { id: r.passenger_id, name: r.p_name, phone: r.p_phone },
        driver: r.driver_id
          ? { id: r.driver_id, name: r.d_name, phone: r.d_phone, plate: r.plate_number }
          : null,
      };
    }
    return {
      id: a.id,
      status: a.status as SosStatus,
      rideId: a.ride_id,
      createdAt: a.created_at.toISOString(),
      acknowledgedAt: a.acknowledged_at ? new Date(a.acknowledged_at).toISOString() : null,
      resolvedAt: a.resolved_at ? new Date(a.resolved_at).toISOString() : null,
      raisedAs: a.raised_as,
      user: { id: a.user_id, name: a.full_name, phone: a.phone_e164 },
      location:
        a.lat === null || a.lng === null
          ? null
          : {
              lat: a.lat,
              lng: a.lng,
              source: a.location_source ?? 'device',
              recordedAt: a.location_recorded_at
                ? new Date(a.location_recorded_at).toISOString()
                : null,
            },
      note: a.note,
      presses: a.presses,
      ride,
      acknowledgedBy: a.ack_name ?? (a.acknowledged_by ? 'staff' : null),
      resolutionNote: a.resolution_note,
    };
  }

  async acknowledge(principal: Principal, id: string, ctx: Partial<RequestContext>) {
    const userId = await this.db.transaction().execute(async (trx) => {
      const r = await trx
        .updateTable('emergency_alerts')
        .set({
          status: 'acknowledged',
          acknowledged_by: principal.userId,
          acknowledged_at: new Date(),
        })
        .where('id', '=', id)
        .where('status', '=', 'open')
        .returning('user_id')
        .executeTakeFirst();
      if (!r) throw new AppException(ErrorCode.INVALID_STATE, 'This alert is not open');
      await this.audit.record(
        {
          actor: { type: 'user', userId: principal.userId },
          action: 'safety.sos_acknowledged',
          target: { type: 'emergency_alert', id },
          context: ctx,
        },
        trx,
      );
      return r.user_id;
    });
    await this.notifications.notify(
      userId,
      'sos_acknowledged',
      {},
      { sms: true, data: { alertId: id } },
    );
    const view = await this.adminView(id);
    await this.notifier.sos(view);
    return view;
  }

  async resolve(principal: Principal, id: string, note: string, ctx: Partial<RequestContext>) {
    const userId = await this.db.transaction().execute(async (trx) => {
      const r = await trx
        .updateTable('emergency_alerts')
        .set({
          status: 'resolved',
          resolved_by: principal.userId,
          resolved_at: new Date(),
          resolution_note: note,
          acknowledged_by: sql`coalesce(acknowledged_by, ${principal.userId}::uuid)`,
          acknowledged_at: sql`coalesce(acknowledged_at, now())`,
        })
        .where('id', '=', id)
        .where('status', '<>', 'resolved')
        .returning('user_id')
        .executeTakeFirst();
      if (!r) throw new AppException(ErrorCode.INVALID_STATE, 'This alert is already resolved');
      await this.audit.record(
        {
          actor: { type: 'user', userId: principal.userId },
          action: 'safety.sos_resolved',
          target: { type: 'emergency_alert', id },
          metadata: { note },
          context: ctx,
        },
        trx,
      );
      return r.user_id;
    });
    await this.notifications.notify(userId, 'sos_resolved', {}, { data: { alertId: id } });
    const view = await this.adminView(id);
    await this.notifier.sos(view);
    return view;
  }
}
