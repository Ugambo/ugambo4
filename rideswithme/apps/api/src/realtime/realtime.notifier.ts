import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import type { Kysely } from 'kysely';
import type { Server } from 'socket.io';
import type {
  AdminSosAlertView,
  DriverOfferView,
  DriverPosition,
  RideMessageView,
} from '@rideswithme/shared-types';
import { DB } from '../database/database.module';
import type { Database } from '../database/types';
import { NotificationsService } from '../notifications/notifications.service';
import { REDIS } from '../redis/redis.module';
import { RideViewService } from '../rides/ride-view.service';

export const userRoom = (userId: string) => `user:${userId}`;
export const rideRoom = (rideId: string) => `ride:${rideId}`;
/** Staff watching operations (the admin live map). */
export const OPS_ROOM = 'ops';

/**
 * Pushes changes to connected apps. Every client joins its own user room; ride
 * updates go to the passenger's and driver's rooms (each in their own view), and
 * to the ride room for staff watching it. Failures are logged and never break
 * the request that caused them: apps also refetch on reconnect and poll slowly.
 */
@Injectable()
export class RealtimeNotifier {
  private readonly logger = new Logger(RealtimeNotifier.name);
  private server: Server | null = null;

  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    private readonly views: RideViewService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() @Inject(REDIS) private readonly redis?: Redis,
  ) {}

  attach(server: Server) {
    this.server = server;
  }

  /** Sends the ride's new state to its passenger, its driver and anyone watching it. */
  async rideChanged(rideId: string): Promise<void> {
    await this.safely(async (server) => {
      const row = await this.views.loadRow(rideId);
      await this.pushMilestone(row);
      const passengerView = await this.views.passengerView(row);
      server.to(userRoom(row.passenger_id)).emit('ride:updated', passengerView);
      server.to(rideRoom(rideId)).emit('ride:updated', passengerView);
      if (row.driver_id)
        server.to(userRoom(row.driver_id)).emit('ride:updated', this.views.driverView(row));
      server.to(OPS_ROOM).emit('ops:ride', {
        id: row.id,
        status: row.status,
        category: row.category_name,
        pickup: { lat: row.pickup_lat, lng: row.pickup_lng, address: row.pickup_address },
        dropoff: { lat: row.dropoff_lat, lng: row.dropoff_lng, address: row.dropoff_address },
        driverId: row.driver_id,
        requestedAt: row.requested_at.toISOString(),
      });
    });
  }

  async offerNew(driverId: string, offer: DriverOfferView): Promise<void> {
    await this.safely(async (server) => {
      server.to(userRoom(driverId)).emit('offer:new', offer);
    });
  }

  async offerClosed(
    driverId: string,
    offerId: string,
    reason: 'expired' | 'withdrawn',
  ): Promise<void> {
    await this.safely(async (server) => {
      server.to(userRoom(driverId)).emit('offer:closed', { offerId, reason });
    });
  }

  /** Shares the driver's new position with the passenger of their active ride (and nobody else). */
  async driverPosition(driverId: string, position: DriverPosition): Promise<void> {
    await this.safely(async (server) => {
      const ride = await this.db
        .selectFrom('rides')
        .select(['id', 'passenger_id'])
        .where('driver_id', '=', driverId)
        .where('status', 'in', ['driver_assigned', 'driver_arrived', 'in_progress'])
        .executeTakeFirst();
      server.to(OPS_ROOM).emit('ops:driver', {
        driverId,
        lat: position.lat,
        lng: position.lng,
        receivedAt: position.receivedAt,
        rideId: ride?.id ?? null,
      });
      if (!ride) return;
      const payload = { rideId: ride.id, position };
      server.to(userRoom(ride.passenger_id)).emit('driver:position', payload);
      server.to(rideRoom(ride.id)).emit('driver:position', payload);
    });
  }

  /** An SOS alert, to every staff member watching operations. */
  async sos(alert: AdminSosAlertView): Promise<void> {
    await this.safely(async (server) => {
      server.to(OPS_ROOM).emit('sos:alert', alert);
    });
  }

  /** A chat message, to the other side of the ride (each gets their own `mine` flag). */
  async rideMessage(recipients: { userId: string; view: RideMessageView }[]): Promise<void> {
    await this.safely(async (server) => {
      for (const r of recipients) server.to(userRoom(r.userId)).emit('ride:message', r.view);
    });
  }

  /**
   * Push to the passenger's phone when the driver is assigned or arrives (the
   * app may be in the background). Once per ride and status.
   */
  private async pushMilestone(row: Awaited<ReturnType<RideViewService['loadRow']>>) {
    if (!this.notifications || !this.redis) return;
    if (row.status !== 'driver_assigned' && row.status !== 'driver_arrived') return;
    const fresh = await this.redis.set(`pushed:${row.id}:${row.status}`, '1', 'EX', 86_400, 'NX');
    if (fresh !== 'OK') return;
    const name = (row.driver_name ?? '').trim().split(/\s+/)[0] || 'Your driver';
    await this.notifications.notify(
      row.passenger_id,
      row.status,
      {
        name,
        vehicle: `${row.colour ?? ''} ${row.make ?? ''} ${row.model ?? ''}`.trim(),
        plate: row.plate_number ?? '',
      },
      { inbox: false, data: { rideId: row.id } },
    );
  }

  private async safely(fn: (server: Server) => Promise<void>) {
    if (!this.server) return;
    try {
      await fn(this.server);
    } catch (err) {
      this.logger.warn({ err }, 'Realtime notification failed');
    }
  }
}
