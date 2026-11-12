import { Injectable } from '@nestjs/common';
import type { DriverPosition } from '@rideswithme/shared-types';
import type { LocationPoint } from '@rideswithme/validation';
import { RealtimeNotifier } from '../realtime/realtime.notifier';
import { PresenceService } from './presence.service';
import { TripLocationsService } from './trip-locations.service';

/** One way in for driver locations, over HTTP or the realtime connection. */
@Injectable()
export class LocationService {
  constructor(
    private readonly presence: PresenceService,
    private readonly history: TripLocationsService,
    private readonly notifier: RealtimeNotifier,
  ) {}

  async ingest(
    driverId: string,
    points: LocationPoint[],
  ): Promise<{ position: DriverPosition | null; stored: number }> {
    const before = await this.presence.position(driverId);
    const position = await this.presence.updatePosition(driverId, points);
    const stored = await this.history.record(driverId, points);
    if (position && position.receivedAt !== before?.receivedAt)
      await this.notifier.driverPosition(driverId, position);
    return { position, stored };
  }
}
