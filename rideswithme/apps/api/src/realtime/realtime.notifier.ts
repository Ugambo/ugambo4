import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { Server } from 'socket.io';
import type { DriverOfferView, DriverPosition } from '@rideswithme/shared-types';
import { DB } from '../database/database.module';
import type { Database } from '../database/types';
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
  ) {}

  attach(server: Server) {
    this.server = server;
  }

  /** Sends the ride's new state to its passenger, its driver and anyone watching it. */
  async rideChanged(rideId: string): Promise<void> {
    await this.safely(async (server) => {
      const row = await this.views.loadRow(rideId);
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

  private async safely(fn: (server: Server) => Promise<void>) {
    if (!this.server) return;
    try {
      await fn(this.server);
    } catch (err) {
      this.logger.warn({ err }, 'Realtime notification failed');
    }
  }
}
