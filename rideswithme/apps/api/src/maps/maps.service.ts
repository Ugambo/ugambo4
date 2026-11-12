import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import {
  ErrorCode,
  type Language,
  type LatLng,
  type Place,
  type PlaceSuggestion,
  type RouteSummary,
} from '@rideswithme/shared-types';
import { AppException } from '../common/app-exception';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service';
import { REDIS } from '../redis/redis.module';
import { MAPS_PROVIDER, type MapsProvider } from './maps.provider';

const ROUTE_CACHE_SECONDS = 600;

/** Calls the maps vendor with rate limits, caching and consistent errors. */
@Injectable()
export class MapsService {
  private readonly logger = new Logger(MapsService.name);

  constructor(
    @Inject(MAPS_PROVIDER) private readonly provider: MapsProvider,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  async autocomplete(
    userId: string,
    query: string,
    language: Language,
    near?: LatLng,
    sessionToken?: string,
  ): Promise<PlaceSuggestion[]> {
    await this.rateLimiter.consume({ name: 'places', limit: 120, windowSeconds: 60 }, userId);
    return this.wrap(() =>
      this.provider.autocomplete(query, {
        language,
        ...(near && { near }),
        ...(sessionToken && { sessionToken }),
      }),
    );
  }

  async placeDetails(
    userId: string,
    placeId: string,
    language: Language,
    sessionToken?: string,
  ): Promise<Place | null> {
    await this.rateLimiter.consume({ name: 'places', limit: 120, windowSeconds: 60 }, userId);
    return this.wrap(() =>
      this.provider.placeDetails(placeId, { language, ...(sessionToken && { sessionToken }) }),
    );
  }

  async reverseGeocode(userId: string, location: LatLng, language: Language): Promise<Place> {
    await this.rateLimiter.consume({ name: 'places', limit: 120, windowSeconds: 60 }, userId);
    return this.wrap(() => this.provider.reverseGeocode(location, language));
  }

  /** Driving route, cached for 10 minutes per ~10 m grid cell at both ends. */
  async route(origin: LatLng, destination: LatLng): Promise<RouteSummary> {
    const key = `route:${this.provider.name}:${cell(origin)}:${cell(destination)}`;
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached) as RouteSummary;
    const route = await this.wrap(() => this.provider.route(origin, destination));
    if (!route) throw new AppException(ErrorCode.ROUTE_NOT_FOUND, 'No route between these points');
    await this.redis.set(key, JSON.stringify(route), 'EX', ROUTE_CACHE_SECONDS);
    return route;
  }

  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof AppException) throw err;
      this.logger.error({ err, provider: this.provider.name }, 'Maps request failed');
      throw new AppException(ErrorCode.MAPS_UNAVAILABLE, 'Maps are unavailable');
    }
  }
}

const cell = (p: LatLng) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
