import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import type Redis from 'ioredis';
import type { Kysely } from 'kysely';
import { IdempotencyService } from '../common/idempotency.service';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB, isUniqueViolation } from '../database/database.module';
import { latOf, lngOf } from '../database/geo';
import type { Database } from '../database/types';
import { DriverViewService } from '../drivers/driver-view.service';
import { REDIS } from '../redis/redis.module';
import { PresenceService } from './presence.service';
import { RealtimeNotifier } from '../realtime/realtime.notifier';
import { recordRideEvent } from './ride-events';
import { RideService } from './ride.service';
import { RidePaymentsService } from '../payments/ride-payments.service';

/** Search radius grows each time nobody suitable is found nearby. */
const RADIUS_STEPS_METERS = [3_000, 5_000, 8_000];

/**
 * Matches rides to drivers. Every DISPATCH_INTERVAL_MS it:
 *  1. starts the search for scheduled rides that are due,
 *  2. expires unanswered offers,
 *  3. offers each searching ride without an open offer to the nearest suitable driver,
 *  4. gives up on rides that have searched for SEARCH_TIMEOUT_SECONDS.
 * Safe with several API replicas: rows are claimed with FOR UPDATE SKIP LOCKED,
 * and a driver can hold only one open offer (unique index).
 */
@Injectable()
export class DispatcherService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DispatcherService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private ticks = 0;

  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly presence: PresenceService,
    private readonly drivers: DriverViewService,
    private readonly rides: RideService,
    private readonly idempotency: IdempotencyService,
    private readonly notifier: RealtimeNotifier,
    private readonly ridePayments: RidePaymentsService,
  ) {}

  onModuleInit() {
    this.rides.onRideSearching = (rideId) => {
      void this.dispatchRide(rideId).catch((err: unknown) =>
        this.logger.error({ err, rideId }, 'Immediate dispatch failed'),
      );
    };
    if (this.config.DISPATCH_INTERVAL_MS === 0) return;
    this.timer = setInterval(() => void this.safeTick(), this.config.DISPATCH_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private async safeTick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.tick();
      if (++this.ticks % 3600 === 0) await this.idempotency.purgeOld();
    } catch (err) {
      this.logger.error({ err }, 'Dispatcher tick failed');
    } finally {
      this.running = false;
    }
  }

  async tick(now = new Date()): Promise<void> {
    await this.promoteScheduled(now);
    await this.expireOffers(now);
    await this.timeOutSearches(now);
    const due = await this.db
      .selectFrom('rides as r')
      .select('r.id')
      .where('r.status', '=', 'searching')
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom('ride_requests as o')
              .select('o.id')
              .whereRef('o.ride_id', '=', 'r.id')
              .where('o.status', '=', 'offered'),
          ),
        ),
      )
      .orderBy('r.search_started_at')
      .limit(50)
      .execute();
    for (const r of due) await this.dispatchRide(r.id, now);
  }

  /** Offers one searching ride to the nearest suitable driver, if it has no open offer. */
  async dispatchRide(rideId: string, now = new Date()): Promise<string | null> {
    const offered = await this.offerNext(rideId, now);
    if (offered) {
      const view = await this.rides.currentOffer(offered.driverId, now);
      if (view) await this.notifier.offerNew(offered.driverId, view);
    }
    return offered?.offerId ?? null;
  }

  private async offerNext(
    rideId: string,
    now: Date,
  ): Promise<{ offerId: string; driverId: string } | null> {
    return this.db.transaction().execute(async (trx) => {
      const ride = await trx
        .selectFrom('rides as r')
        .innerJoin('vehicle_categories as c', 'c.id', 'r.vehicle_category_id')
        .select([
          'r.id',
          'r.status',
          'r.search_radius_meters',
          'c.key as category',
          latOf('r.pickup').as('lat'),
          lngOf('r.pickup').as('lng'),
        ])
        .where('r.id', '=', rideId)
        .forUpdate('r')
        .skipLocked()
        .executeTakeFirst();
      if (!ride || ride.status !== 'searching') return null;
      const open = await trx
        .selectFrom('ride_requests')
        .select('id')
        .where('ride_id', '=', rideId)
        .where('status', '=', 'offered')
        .executeTakeFirst();
      if (open) return null;

      const tried = new Set(
        (
          await trx
            .selectFrom('ride_requests')
            .select('driver_id')
            .where('ride_id', '=', rideId)
            .execute()
        ).map((r) => r.driver_id),
      );
      const candidates = (
        await this.presence.nearby(ride.category, ride, ride.search_radius_meters, 10, now)
      ).filter((c) => !tried.has(c.driverId));
      const busy = await this.busyDrivers(
        trx,
        candidates.map((c) => c.driverId),
      );

      for (const c of candidates) {
        if (busy.has(c.driverId)) continue;
        // Documents can expire or be withdrawn while a driver is online.
        const state = await this.drivers.load(c.driverId, trx, now).catch(() => null);
        if (!state?.view.eligibility.canGoOnline) {
          await this.presence.goOffline(c.driverId);
          continue;
        }
        try {
          const offer = await trx
            .insertInto('ride_requests')
            .values({
              ride_id: rideId,
              driver_id: c.driverId,
              distance_to_pickup_meters: c.distanceMeters,
              expires_at: new Date(now.getTime() + this.config.OFFER_TIMEOUT_SECONDS * 1000),
            })
            .returning('id')
            .executeTakeFirstOrThrow();
          await recordRideEvent(trx, {
            rideId,
            eventType: 'offer_sent',
            actorType: 'system',
            metadata: {
              offerId: offer.id,
              driverId: c.driverId,
              distanceToPickupMeters: c.distanceMeters,
            },
          });
          return { offerId: offer.id, driverId: c.driverId };
        } catch (err) {
          // Another replica just offered this driver something else.
          if (isUniqueViolation(err)) continue;
          throw err;
        }
      }

      const next = RADIUS_STEPS_METERS.find((r) => r > ride.search_radius_meters);
      if (next)
        await trx
          .updateTable('rides')
          .set({ search_radius_meters: next })
          .where('id', '=', rideId)
          .execute();
      return null;
    });
  }

  private async busyDrivers(trx: Kysely<Database>, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const active = await trx
      .selectFrom('rides')
      .select('driver_id')
      .where('driver_id', 'in', ids)
      .where('status', 'in', ['driver_assigned', 'driver_arrived', 'in_progress'])
      .execute();
    const offered = await trx
      .selectFrom('ride_requests')
      .select('driver_id')
      .where('driver_id', 'in', ids)
      .where('status', '=', 'offered')
      .execute();
    return new Set([...active.map((r) => r.driver_id!), ...offered.map((r) => r.driver_id)]);
  }

  private async promoteScheduled(now: Date) {
    const lead = new Date(now.getTime() + this.config.SCHEDULED_DISPATCH_LEAD_MINUTES * 60_000);
    const deadline = new Date(now.getTime() + this.config.SEARCH_TIMEOUT_SECONDS * 1000);
    const promoted = await this.db
      .updateTable('rides')
      .set({ status: 'searching', search_started_at: now, search_deadline: deadline })
      .where('status', '=', 'requested')
      .where('scheduled_for', '<=', lead)
      .returning('id')
      .execute();
    for (const r of promoted) {
      await recordRideEvent(this.db, {
        rideId: r.id,
        eventType: 'search_started',
        from: 'requested',
        to: 'searching',
        actorType: 'system',
        metadata: { scheduled: true },
      });
      await this.notifier.rideChanged(r.id);
    }
  }

  private async expireOffers(now: Date) {
    const expired = await this.db
      .updateTable('ride_requests')
      .set({ status: 'expired', responded_at: now })
      .where('status', '=', 'offered')
      .where('expires_at', '<=', now)
      .returning(['id', 'ride_id', 'driver_id'])
      .execute();
    for (const o of expired) {
      await recordRideEvent(this.db, {
        rideId: o.ride_id,
        eventType: 'offer_expired',
        actorType: 'system',
        metadata: { offerId: o.id, driverId: o.driver_id },
      });
      await this.notifier.offerClosed(o.driver_id, o.id, 'expired');
    }
  }

  private async timeOutSearches(now: Date) {
    const rows = await this.db
      .updateTable('rides')
      .set({ status: 'no_driver_found', cancelled_at: now })
      .where('status', '=', 'searching')
      .where('search_deadline', '<=', now)
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom('ride_requests as o')
              .select('o.id')
              .whereRef('o.ride_id', '=', 'rides.id')
              .where('o.status', '=', 'offered'),
          ),
        ),
      )
      .returning(['id', 'passenger_id', 'payment_method'])
      .execute();
    for (const r of rows) {
      // A wallet hold goes back at once (the reconciliation job catches any missed).
      if (r.payment_method === 'wallet') {
        await this.db
          .transaction()
          .execute((trx) => this.ridePayments.release(trx, r.id, r.passenger_id))
          .catch((err: unknown) =>
            this.logger.error({ err, rideId: r.id }, 'Could not return wallet hold'),
          );
      }
      await recordRideEvent(this.db, {
        rideId: r.id,
        eventType: 'no_driver_found',
        from: 'searching',
        to: 'no_driver_found',
        actorType: 'system',
      });
      await this.notifier.rideChanged(r.id);
    }
  }
}
