import { Inject, Injectable } from '@nestjs/common';
import type { Kysely, Selectable } from 'kysely';
import { ErrorCode, type RideMessageView } from '@rideswithme/shared-types';
import { AppException } from '../common/app-exception';
import { DB } from '../database/database.module';
import type { Database, RideMessagesTable } from '../database/types';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeNotifier } from '../realtime/realtime.notifier';
import { rideForParticipant, WITH_DRIVER } from './ride-access';

const view = (m: Selectable<RideMessagesTable>, viewerId: string | null): RideMessageView => ({
  id: m.id,
  rideId: m.ride_id,
  from: m.sender_role,
  mine: m.sender_id === viewerId,
  body: m.body,
  createdAt: m.created_at.toISOString(),
});

/**
 * Messages between a passenger and their driver, from when the driver accepts
 * until the trip ends (no phone numbers are exchanged). Staff can read them
 * on the ride's page when looking into a report.
 */
@Injectable()
export class RideMessagesService {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    private readonly notifier: RealtimeNotifier,
    private readonly notifications: NotificationsService,
  ) {}

  async send(userId: string, rideId: string, body: string): Promise<RideMessageView> {
    const ride = await rideForParticipant(this.db, rideId, userId);
    if (!WITH_DRIVER.includes(ride.status))
      throw new AppException(
        ErrorCode.INVALID_STATE,
        'Messages are open while the driver is on the way or on the trip',
      );
    const m = await this.db
      .insertInto('ride_messages')
      .values({ ride_id: rideId, sender_id: userId, sender_role: ride.role, body })
      .returningAll()
      .executeTakeFirstOrThrow();
    const other = ride.role === 'passenger' ? ride.driver_id! : ride.passenger_id;
    await this.notifier.rideMessage([
      { userId, view: view(m, userId) },
      { userId: other, view: view(m, other) },
    ]);
    const sender = await this.db
      .selectFrom('users')
      .select('full_name')
      .where('id', '=', userId)
      .executeTakeFirst();
    await this.notifications.notify(
      other,
      'ride_message',
      { name: (sender?.full_name ?? '').split(' ')[0] || 'RideswithMe', body: body.slice(0, 120) },
      { inbox: false, data: { rideId } },
    );
    return view(m, userId);
  }

  async list(userId: string | null, rideId: string): Promise<RideMessageView[]> {
    if (userId) await rideForParticipant(this.db, rideId, userId);
    const rows = await this.db
      .selectFrom('ride_messages')
      .selectAll()
      .where('ride_id', '=', rideId)
      .orderBy('created_at')
      .limit(500)
      .execute();
    return rows.map((m) => view(m, userId));
  }
}
