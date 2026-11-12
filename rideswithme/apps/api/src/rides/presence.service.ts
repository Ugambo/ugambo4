import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import type { DriverPosition, LatLng } from '@rideswithme/shared-types';
import type { LocationPoint } from '@rideswithme/validation';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { REDIS } from '../redis/redis.module';

const presenceKey = (driverId: string) => `driver:presence:${driverId}`;
const geoKey = (categoryKey: string) => `drivers:geo:${categoryKey}`;
/** Phones may lag or lead the server clock; readings further in the future are clamped. */
const MAX_CLOCK_SKEW_MS = 120_000;

export interface NearbyDriver {
  driverId: string;
  distanceMeters: number;
}

/**
 * Live driver state in Redis: online flag, vehicle category and the latest
 * position, plus one geo index per vehicle category for nearest-driver search.
 * Every position keeps both the phone's time (recordedAt) and the server's
 * (receivedAt); a driver whose last position is older than
 * DRIVER_POSITION_STALE_SECONDS is never offered rides.
 */
@Injectable()
export class PresenceService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async goOnline(
    driverId: string,
    categoryKey: string,
    vehicleId: string,
    point: LocationPoint,
    now = new Date(),
  ) {
    const recordedAt = clampRecordedAt(point.recordedAt, now);
    await this.redis
      .multi()
      .hset(presenceKey(driverId), {
        online: '1',
        category: categoryKey,
        vehicleId,
        lat: String(point.lat),
        lng: String(point.lng),
        recordedAt,
        receivedAt: now.toISOString(),
      })
      .expire(presenceKey(driverId), 86_400)
      .geoadd(geoKey(categoryKey), point.lng, point.lat, driverId)
      .exec();
  }

  async goOffline(driverId: string) {
    const category = await this.redis.hget(presenceKey(driverId), 'category');
    const tx = this.redis.multi().hset(presenceKey(driverId), { online: '0' });
    if (category) tx.zrem(geoKey(category), driverId);
    await tx.exec();
  }

  async isOnline(driverId: string): Promise<boolean> {
    return (await this.redis.hget(presenceKey(driverId), 'online')) === '1';
  }

  /**
   * Stores the newest of a batch of readings. Readings older than the one
   * already stored are ignored, so a phone syncing a backlog after a network
   * drop cannot move the driver backwards.
   */
  async updatePosition(
    driverId: string,
    points: LocationPoint[],
    now = new Date(),
  ): Promise<DriverPosition | null> {
    const latest = [...points].sort(
      (a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt),
    )[0];
    if (!latest) return this.position(driverId);
    const recordedAt = clampRecordedAt(latest.recordedAt, now);
    const state = await this.redis.hgetall(presenceKey(driverId));
    if (state.recordedAt && Date.parse(state.recordedAt) >= Date.parse(recordedAt))
      return this.position(driverId);

    const tx = this.redis
      .multi()
      .hset(presenceKey(driverId), {
        lat: String(latest.lat),
        lng: String(latest.lng),
        recordedAt,
        receivedAt: now.toISOString(),
      })
      .expire(presenceKey(driverId), 86_400);
    if (state.online === '1' && state.category)
      tx.geoadd(geoKey(state.category), latest.lng, latest.lat, driverId);
    await tx.exec();
    return { lat: latest.lat, lng: latest.lng, recordedAt, receivedAt: now.toISOString() };
  }

  async position(driverId: string): Promise<DriverPosition | null> {
    const s = await this.redis.hgetall(presenceKey(driverId));
    if (!s.lat || !s.lng || !s.recordedAt || !s.receivedAt) return null;
    return {
      lat: Number(s.lat),
      lng: Number(s.lng),
      recordedAt: s.recordedAt,
      receivedAt: s.receivedAt,
    };
  }

  /**
   * Online drivers of a category within the radius, nearest first, whose last
   * position is fresh. Stale entries are removed from the index as they are found.
   */
  async nearby(
    categoryKey: string,
    at: LatLng,
    radiusMeters: number,
    limit = 10,
    now = new Date(),
  ): Promise<NearbyDriver[]> {
    const raw = (await this.redis.geosearch(
      geoKey(categoryKey),
      'FROMLONLAT',
      at.lng,
      at.lat,
      'BYRADIUS',
      radiusMeters,
      'm',
      'ASC',
      'COUNT',
      limit * 3,
      'WITHDIST',
    )) as [string, string][];
    const result: NearbyDriver[] = [];
    for (const [driverId, dist] of raw) {
      const s = await this.redis.hmget(presenceKey(driverId), 'online', 'receivedAt');
      const fresh =
        s[1] &&
        now.getTime() - Date.parse(s[1]) <= this.config.DRIVER_POSITION_STALE_SECONDS * 1000;
      if (s[0] !== '1' || !fresh) {
        if (s[0] !== '1') await this.redis.zrem(geoKey(categoryKey), driverId);
        continue;
      }
      result.push({ driverId, distanceMeters: Math.round(Number(dist)) });
      if (result.length >= limit) break;
    }
    return result;
  }
}

function clampRecordedAt(iso: string, now: Date): string {
  const t = Date.parse(iso);
  return new Date(Math.min(t, now.getTime() + MAX_CLOCK_SKEW_MS)).toISOString();
}

/** Rough pickup time from straight-line distance: road factor 1.35 at 22 km/h. */
export function etaSecondsFromDistance(meters: number): number {
  return Math.round((meters * 1.35) / (22_000 / 3600)) + 30;
}
