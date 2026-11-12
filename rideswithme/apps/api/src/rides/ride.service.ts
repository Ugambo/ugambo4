import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Kysely, sql } from 'kysely';
import {
  type DriverOfferView,
  type DriverRideView,
  ErrorCode,
  type LatLng,
  type Paginated,
  type RideStatus,
  type RideView,
} from '@rideswithme/shared-types';
import {
  type CreateRideInput,
  type DriverCancelInput,
  type ListRidesQuery,
  SCHEDULE_MAX_AHEAD_DAYS,
  SCHEDULE_MIN_LEAD_MINUTES,
} from '@rideswithme/validation';
import { AppException } from '../common/app-exception';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB, isUniqueViolation } from '../database/database.module';
import { haversineMeters, koboFromDb, latOf, lngOf, point } from '../database/geo';
import type { Database } from '../database/types';
import { DriverViewService } from '../drivers/driver-view.service';
import { passengerCancellationFee, splitFare, waitingCharge } from '../pricing/fare-engine';
import { type FareSnapshot, ruleValues } from '../pricing/pricing.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { canTransition, recordRideEvent } from './ride-events';
import { type RideRow, RideViewService } from './ride-view.service';
import { RealtimeNotifier } from '../realtime/realtime.notifier';
import { PresenceService } from './presence.service';
import { TripLocationsService } from './trip-locations.service';

const MAX_SCHEDULED_PER_PASSENGER = 3;

/** Booking, the ride state machine, and the driver's trip actions. */
@Injectable()
export class RideService {
  private readonly logger = new Logger(RideService.name);
  /** Set by the dispatcher so a new booking gets its first offer at once. */
  onRideSearching: (rideId: string) => void = () => undefined;

  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly views: RideViewService,
    private readonly presence: PresenceService,
    private readonly drivers: DriverViewService,
    private readonly storage: ObjectStorageService,
    private readonly notifier: RealtimeNotifier,
    private readonly tripLocations: TripLocationsService,
  ) {}

  // --- Passenger ---

  async book(passengerId: string, input: CreateRideInput, now = new Date()): Promise<RideView> {
    if ((input.paymentMethod ?? 'cash') !== 'cash') {
      throw new AppException(
        ErrorCode.PAYMENT_METHOD_UNAVAILABLE,
        'Only cash is available for now',
      );
    }
    const q = await this.db
      .selectFrom('fare_quotes as q')
      .innerJoin('vehicle_categories as c', 'c.id', 'q.vehicle_category_id')
      .innerJoin('service_areas as a', 'a.id', 'q.service_area_id')
      .innerJoin('fare_rules as r', 'r.id', 'q.fare_rule_id')
      .selectAll('r')
      .select([
        'q.id as quote_id',
        'q.expires_at',
        'q.breakdown',
        'q.total_kobo',
        'q.distance_meters',
        'q.duration_seconds',
        'q.route_polyline',
        'q.pickup_address',
        'q.dropoff_address',
        'q.created_at as quoted_at',
        'q.vehicle_category_id',
        'q.service_area_id',
        latOf('q.pickup').as('pickup_lat'),
        lngOf('q.pickup').as('pickup_lng'),
        latOf('q.dropoff').as('dropoff_lat'),
        lngOf('q.dropoff').as('dropoff_lng'),
        'c.key as category_key',
        'c.name as category_name',
        'c.seats',
        'c.is_enabled',
        'a.key as area_key',
        'a.name as area_name',
        'a.is_active as area_active',
      ])
      .where('q.id', '=', input.quoteId)
      .where('q.passenger_id', '=', passengerId)
      .executeTakeFirst();
    if (!q) throw new AppException(ErrorCode.NOT_FOUND, 'Quote not found');
    if (q.expires_at <= now) throw new AppException(ErrorCode.QUOTE_EXPIRED, 'Quote expired');
    if (!q.is_enabled || !q.area_active)
      throw new AppException(ErrorCode.VEHICLE_CATEGORY_UNAVAILABLE, 'Not available');

    let scheduledFor: Date | null = null;
    if (input.scheduledFor) {
      scheduledFor = new Date(input.scheduledFor);
      const lead = scheduledFor.getTime() - now.getTime();
      if (
        lead < SCHEDULE_MIN_LEAD_MINUTES * 60_000 ||
        lead > SCHEDULE_MAX_AHEAD_DAYS * 86_400_000
      ) {
        throw new AppException(
          ErrorCode.VALIDATION_FAILED,
          `Schedule between ${SCHEDULE_MIN_LEAD_MINUTES} minutes and ${SCHEDULE_MAX_AHEAD_DAYS} days ahead`,
          {
            details: { field: 'scheduledFor' },
          },
        );
      }
    }

    const snapshot: FareSnapshot = {
      fareRuleId: q.id,
      rule: ruleValues(q),
      breakdown: q.breakdown as FareSnapshot['breakdown'],
      route: {
        distanceMeters: q.distance_meters,
        durationSeconds: q.duration_seconds,
        polyline: q.route_polyline,
      },
      category: { key: q.category_key, name: q.category_name, seats: q.seats },
      serviceArea: { key: q.area_key, name: q.area_name },
      quotedAt: q.quoted_at.toISOString(),
    };
    const pickup = { lat: q.pickup_lat, lng: q.pickup_lng };

    const rideId = await this.db.transaction().execute(async (trx) => {
      if (scheduledFor) {
        const { n } = await trx
          .selectFrom('rides')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .where('passenger_id', '=', passengerId)
          .where('status', '=', 'requested')
          .where('scheduled_for', 'is not', null)
          .executeTakeFirstOrThrow();
        if (Number(n) >= MAX_SCHEDULED_PER_PASSENGER) {
          throw new AppException(
            ErrorCode.CONFLICT,
            `You can have up to ${MAX_SCHEDULED_PER_PASSENGER} scheduled rides`,
          );
        }
      }
      let ride;
      try {
        ride = await trx
          .insertInto('rides')
          .values({
            passenger_id: passengerId,
            vehicle_category_id: q.vehicle_category_id,
            service_area_id: q.service_area_id,
            fare_quote_id: q.quote_id,
            status: scheduledFor ? 'requested' : 'searching',
            pickup: point(pickup),
            pickup_address: q.pickup_address,
            dropoff: point({ lat: q.dropoff_lat, lng: q.dropoff_lng }),
            dropoff_address: q.dropoff_address,
            scheduled_for: scheduledFor,
            fare_snapshot: JSON.stringify(snapshot),
            quoted_total_kobo: koboFromDb(q.total_kobo),
            payment_method: 'cash',
            search_started_at: scheduledFor ? null : now,
            search_deadline: scheduledFor
              ? null
              : new Date(now.getTime() + this.config.SEARCH_TIMEOUT_SECONDS * 1000),
          })
          .returning('id')
          .executeTakeFirstOrThrow();
      } catch (err) {
        if (isUniqueViolation(err, 'rides_one_active_per_passenger')) {
          throw new AppException(
            ErrorCode.RIDE_ALREADY_ACTIVE,
            'You already have a ride in progress',
          );
        }
        if (isUniqueViolation(err, 'rides_fare_quote_id_key')) {
          throw new AppException(
            ErrorCode.QUOTE_EXPIRED,
            'This price was already used; check the price again',
          );
        }
        throw err;
      }
      const actor = { actorType: 'passenger' as const, actorId: passengerId };
      await recordRideEvent(trx, {
        rideId: ride.id,
        eventType: 'ride_requested',
        to: 'requested',
        ...actor,
        location: pickup,
        metadata: {
          scheduledFor: scheduledFor?.toISOString() ?? null,
          quotedTotalKobo: koboFromDb(q.total_kobo),
        },
      });
      if (!scheduledFor) {
        await recordRideEvent(trx, {
          rideId: ride.id,
          eventType: 'search_started',
          from: 'requested',
          to: 'searching',
          actorType: 'system',
        });
      }
      return ride.id;
    });

    if (!scheduledFor) this.onRideSearching(rideId);
    await this.notifier.rideChanged(rideId);
    return this.views.passengerView(await this.views.loadRow(rideId));
  }

  async getForPassenger(passengerId: string, rideId: string): Promise<RideView> {
    const row = await this.views.loadRow(rideId);
    if (row.passenger_id !== passengerId)
      throw new AppException(ErrorCode.NOT_FOUND, 'Ride not found');
    return this.views.passengerView(row);
  }

  /** The passenger's current ride and any scheduled ones. */
  async activeForPassenger(passengerId: string): Promise<RideView[]> {
    const rows = await this.db
      .selectFrom('rides')
      .select('id')
      .where('passenger_id', '=', passengerId)
      .where('status', 'in', ACTIVE_STATUSES)
      .orderBy(sql`coalesce(scheduled_for, created_at)`)
      .execute();
    return Promise.all(
      rows.map(async (r) => this.views.passengerView(await this.views.loadRow(r.id))),
    );
  }

  async historyForPassenger(passengerId: string, q: ListRidesQuery): Promise<Paginated<RideView>> {
    const page = await this.page('passenger_id', passengerId, q);
    return {
      items: await Promise.all(
        page.ids.map(async (id) => this.views.passengerView(await this.views.loadRow(id))),
      ),
      nextCursor: page.nextCursor,
    };
  }

  async historyForDriver(driverId: string, q: ListRidesQuery): Promise<Paginated<DriverRideView>> {
    const page = await this.page('driver_id', driverId, q);
    return {
      items: await Promise.all(
        page.ids.map(async (id) => this.views.driverView(await this.views.loadRow(id))),
      ),
      nextCursor: page.nextCursor,
    };
  }

  async cancelByPassenger(
    passengerId: string,
    rideId: string,
    reason: string | undefined,
    now = new Date(),
  ): Promise<RideView> {
    const withdrawn = await this.db.transaction().execute(async (trx) => {
      const ride = await this.lock(trx, rideId, { passengerId });
      const to: RideStatus = 'cancelled_by_passenger';
      if (!canTransition(ride.status, to)) {
        throw new AppException(
          ErrorCode.INVALID_STATE,
          'This ride can no longer be cancelled in the app',
          { details: { status: ride.status } },
        );
      }
      const snapshot = ride.fare_snapshot as FareSnapshot;
      const fee = passengerCancellationFee(
        snapshot.rule,
        { status: ride.status, assignedAt: ride.assigned_at },
        now,
      );
      await trx
        .updateTable('rides')
        .set({
          status: to,
          cancelled_at: now,
          cancellation_reason: reason ?? null,
          cancellation_fee_kobo: fee,
        })
        .where('id', '=', rideId)
        .execute();
      const offers = await this.withdrawOffers(trx, rideId);
      if (fee > 0) await this.recordOutstandingFee(trx, rideId, passengerId, fee);
      await recordRideEvent(trx, {
        rideId,
        eventType: 'cancelled',
        from: ride.status,
        to,
        actorType: 'passenger',
        actorId: passengerId,
        metadata: { reason: reason ?? null, feeKobo: fee },
      });
      return offers;
    });
    for (const o of withdrawn) await this.notifier.offerClosed(o.driver_id, o.id, 'withdrawn');
    await this.notifier.rideChanged(rideId);
    return this.getForPassenger(passengerId, rideId);
  }

  /** A short-lived link to the assigned driver's approved profile photo, only while the ride is active. */
  async driverPhotoUrl(passengerId: string, rideId: string) {
    const ride = await this.db
      .selectFrom('rides')
      .select(['passenger_id', 'driver_id', 'status'])
      .where('id', '=', rideId)
      .executeTakeFirst();
    if (!ride || ride.passenger_id !== passengerId)
      throw new AppException(ErrorCode.NOT_FOUND, 'Ride not found');
    if (
      !ride.driver_id ||
      !['driver_assigned', 'driver_arrived', 'in_progress'].includes(ride.status)
    ) {
      throw new AppException(ErrorCode.NOT_FOUND, 'No driver photo for this ride');
    }
    const doc = await this.db
      .selectFrom('driver_documents')
      .select(['object_key', 'content_type'])
      .where('driver_user_id', '=', ride.driver_id)
      .where('document_type', '=', 'profile_photo')
      .where('status', '=', 'approved')
      .orderBy('created_at', 'desc')
      .executeTakeFirst();
    if (!doc) throw new AppException(ErrorCode.NOT_FOUND, 'No driver photo');
    return {
      url: await this.storage.presignView(doc.object_key, doc.content_type),
      contentType: doc.content_type,
      expiresAt: new Date(Date.now() + this.config.DOWNLOAD_URL_TTL_SECONDS * 1000).toISOString(),
    };
  }

  // --- Driver ---

  async currentOffer(driverId: string, now = new Date()): Promise<DriverOfferView | null> {
    const offer = await this.db
      .selectFrom('ride_requests')
      .select(['id', 'ride_id', 'expires_at', 'distance_to_pickup_meters'])
      .where('driver_id', '=', driverId)
      .where('status', '=', 'offered')
      .where('expires_at', '>', now)
      .executeTakeFirst();
    if (!offer) return null;
    const row = await this.views.loadRow(offer.ride_id);
    const snapshot = row.fare_snapshot as FareSnapshot;
    const total = koboFromDb(row.quoted_total_kobo);
    return {
      offerId: offer.id,
      rideId: row.id,
      expiresAt: offer.expires_at.toISOString(),
      category: { key: row.category_key, name: row.category_name },
      pickup: {
        address: row.pickup_address,
        location: { lat: row.pickup_lat, lng: row.pickup_lng },
      },
      dropoff: {
        address: row.dropoff_address,
        location: { lat: row.dropoff_lat, lng: row.dropoff_lng },
      },
      distanceToPickupMeters: offer.distance_to_pickup_meters,
      trip: {
        distanceMeters: snapshot.route.distanceMeters,
        durationSeconds: snapshot.route.durationSeconds,
      },
      fareKobo: total,
      estimatedEarningsKobo: splitFare(snapshot.rule, total).driverEarningsKobo,
      paymentMethod: row.payment_method as DriverOfferView['paymentMethod'],
    };
  }

  /**
   * Accepts an offer. Two guarantees, both enforced by the database: the offer
   * must still be open and this driver's, and the ride must still be searching
   * (a single conditional UPDATE). Two drivers can never both win a ride, and a
   * driver can never hold two active rides (unique index).
   */
  async acceptOffer(driverId: string, offerId: string, now = new Date()): Promise<DriverRideView> {
    const state = await this.drivers.load(driverId);
    if (!state.view.eligibility.canGoOnline || !state.view.vehicle) {
      await this.db
        .updateTable('ride_requests')
        .set({ status: 'withdrawn', responded_at: now })
        .where('id', '=', offerId)
        .where('status', '=', 'offered')
        .execute();
      throw new AppException(ErrorCode.DRIVER_NOT_ELIGIBLE, 'You cannot take rides right now', {
        details: { blockers: state.view.eligibility.blockers },
      });
    }
    const vehicleId = state.view.vehicle.id;
    const rideId = await this.db.transaction().execute(async (trx) => {
      // Lock order everywhere is ride row first, then its offers; taking the
      // offer first would let two simultaneous accepts deadlock each other.
      const target = await trx
        .selectFrom('ride_requests')
        .select('ride_id')
        .where('id', '=', offerId)
        .executeTakeFirst();
      if (!target)
        throw new AppException(ErrorCode.OFFER_UNAVAILABLE, 'Offer expired or already answered');
      await trx
        .selectFrom('rides')
        .select('id')
        .where('id', '=', target.ride_id)
        .forUpdate()
        .execute();

      const offer = await trx
        .updateTable('ride_requests')
        .set({ status: 'accepted', responded_at: now })
        .where('id', '=', offerId)
        .where('driver_id', '=', driverId)
        .where('status', '=', 'offered')
        .where('expires_at', '>', now)
        .returning(['ride_id'])
        .executeTakeFirst();
      if (!offer)
        throw new AppException(ErrorCode.OFFER_UNAVAILABLE, 'Offer expired or already answered');

      let assigned;
      try {
        assigned = await trx
          .updateTable('rides')
          .set({
            status: 'driver_assigned',
            driver_id: driverId,
            vehicle_id: vehicleId,
            assigned_at: now,
          })
          .where('id', '=', offer.ride_id)
          .where('status', '=', 'searching')
          .where('driver_id', 'is', null)
          .returning('id')
          .executeTakeFirst();
      } catch (err) {
        if (isUniqueViolation(err, 'rides_one_active_per_driver')) {
          throw new AppException(ErrorCode.OFFER_UNAVAILABLE, 'You already have an active ride');
        }
        throw err;
      }
      if (!assigned)
        throw new AppException(ErrorCode.OFFER_UNAVAILABLE, 'This ride is no longer available');
      await this.withdrawOffers(trx, offer.ride_id);
      const position = await this.presence.position(driverId);
      await recordRideEvent(trx, {
        rideId: offer.ride_id,
        eventType: 'driver_assigned',
        from: 'searching',
        to: 'driver_assigned',
        actorType: 'driver',
        actorId: driverId,
        location: position,
        metadata: { offerId, vehicleId },
      });
      return offer.ride_id;
    });
    await this.notifier.rideChanged(rideId);
    return this.views.driverView(await this.views.loadRow(rideId));
  }

  async rejectOffer(driverId: string, offerId: string, now = new Date()): Promise<void> {
    const res = await this.db
      .updateTable('ride_requests')
      .set({ status: 'rejected', responded_at: now })
      .where('id', '=', offerId)
      .where('driver_id', '=', driverId)
      .where('status', '=', 'offered')
      .returning('ride_id')
      .executeTakeFirst();
    if (!res)
      throw new AppException(ErrorCode.OFFER_UNAVAILABLE, 'Offer expired or already answered');
    await recordRideEvent(this.db, {
      rideId: res.ride_id,
      eventType: 'offer_rejected',
      actorType: 'driver',
      actorId: driverId,
      metadata: { offerId },
    });
    this.onRideSearching(res.ride_id);
  }

  async activeForDriver(driverId: string): Promise<DriverRideView | null> {
    const ride = await this.db
      .selectFrom('rides')
      .select('id')
      .where('driver_id', '=', driverId)
      .where('status', 'in', ['driver_assigned', 'driver_arrived', 'in_progress'])
      .executeTakeFirst();
    return ride ? this.views.driverView(await this.views.loadRow(ride.id)) : null;
  }

  async getForDriver(driverId: string, rideId: string): Promise<DriverRideView> {
    const row = await this.views.loadRow(rideId);
    if (row.driver_id !== driverId) throw new AppException(ErrorCode.NOT_FOUND, 'Ride not found');
    return this.views.driverView(row);
  }

  async arrived(driverId: string, rideId: string, now = new Date()) {
    return this.driverStep(driverId, rideId, 'driver_arrived', now, async (trx, ride, position) => {
      await trx
        .updateTable('rides')
        .set({ status: 'driver_arrived', arrived_at: now })
        .where('id', '=', rideId)
        .execute();
      return {
        distanceToPickupMeters: position
          ? Math.round(haversineMeters(position, ride.pickup))
          : null,
      };
    });
  }

  async start(driverId: string, rideId: string, now = new Date()) {
    return this.driverStep(driverId, rideId, 'in_progress', now, async (trx, ride) => {
      const snapshot = ride.fare_snapshot as FareSnapshot;
      const waiting = ride.arrived_at ? waitingCharge(snapshot.rule, ride.arrived_at, now) : 0;
      await trx
        .updateTable('rides')
        .set({ status: 'in_progress', started_at: now, waiting_charge_kobo: waiting })
        .where('id', '=', rideId)
        .execute();
      return { waitingChargeKobo: waiting };
    });
  }

  /**
   * Completes a cash ride: the final fare is the booked price plus any waiting
   * charge. Records the cash payment and the commission the driver owes
   * (settled from their wallet in Phase 5).
   */
  async complete(driverId: string, rideId: string, cashCollectedKobo: number, now = new Date()) {
    return this.driverStep(driverId, rideId, 'completed', now, async (trx, ride) => {
      const snapshot = ride.fare_snapshot as FareSnapshot;
      const final = koboFromDb(ride.quoted_total_kobo) + koboFromDb(ride.waiting_charge_kobo);
      const split = splitFare(snapshot.rule, final);
      const driven = ride.started_at
        ? await this.tripLocations.drivenDistance(trx, rideId, ride.started_at, now)
        : 0;
      await trx
        .updateTable('rides')
        .set({
          status: 'completed',
          completed_at: now,
          final_total_kobo: final,
          commission_kobo: split.commissionKobo,
          actual_distance_meters: driven,
        })
        .where('id', '=', rideId)
        .execute();
      await trx
        .insertInto('payments')
        .values({
          ride_id: rideId,
          payer_id: ride.passenger_id,
          method: 'cash',
          purpose: 'ride_fare',
          amount_kobo: final,
          status: 'collected',
          collected_by: driverId,
          collected_at: now,
        })
        .execute();
      await trx
        .insertInto('commissions')
        .values({
          ride_id: rideId,
          driver_id: driverId,
          fare_kobo: final,
          booking_fee_kobo: split.bookingFeeKobo,
          commission_bps: snapshot.rule.commissionBps,
          commission_kobo: split.commissionKobo,
        })
        .execute();
      return {
        finalTotalKobo: final,
        cashCollectedKobo,
        cashShortKobo: Math.max(0, final - cashCollectedKobo),
        drivenMeters: driven,
        ...split,
      };
    });
  }

  /**
   * Driver cancels. "passenger_no_show" is allowed only after waiting at the
   * pickup for NO_SHOW_WAIT_MINUTES, and charges the passenger the
   * cancellation fee. Other reasons charge nobody.
   */
  async cancelByDriver(
    driverId: string,
    rideId: string,
    input: DriverCancelInput,
    now = new Date(),
  ) {
    return this.driverStep(driverId, rideId, 'cancelled_by_driver', now, async (trx, ride) => {
      let fee = 0;
      if (input.reason === 'passenger_no_show') {
        const waitedMs = ride.arrived_at ? now.getTime() - ride.arrived_at.getTime() : -1;
        if (
          ride.status !== 'driver_arrived' ||
          waitedMs < this.config.NO_SHOW_WAIT_MINUTES * 60_000
        ) {
          throw new AppException(
            ErrorCode.INVALID_STATE,
            `Wait ${this.config.NO_SHOW_WAIT_MINUTES} minutes at the pickup before reporting a no-show`,
            {
              details: { waitMinutes: this.config.NO_SHOW_WAIT_MINUTES },
            },
          );
        }
        fee = (ride.fare_snapshot as FareSnapshot).rule.cancellationFeeKobo;
      }
      await trx
        .updateTable('rides')
        .set({
          status: 'cancelled_by_driver',
          cancelled_at: now,
          cancellation_reason: input.reason,
          cancellation_fee_kobo: fee,
        })
        .where('id', '=', rideId)
        .execute();
      if (fee > 0) await this.recordOutstandingFee(trx, rideId, ride.passenger_id, fee);
      return { reason: input.reason, note: input.note ?? null, feeKobo: fee };
    });
  }

  // --- Internals ---

  private async driverStep(
    driverId: string,
    rideId: string,
    to: RideStatus,
    _now: Date,
    apply: (
      trx: Kysely<Database>,
      ride: LockedRide,
      position: LatLng | null,
    ) => Promise<Record<string, unknown>>,
  ): Promise<DriverRideView> {
    await this.db.transaction().execute(async (trx) => {
      const ride = await this.lock(trx, rideId, { driverId });
      if (!canTransition(ride.status, to)) {
        throw new AppException(ErrorCode.INVALID_STATE, `Cannot go from ${ride.status} to ${to}`, {
          details: { status: ride.status },
        });
      }
      const position = await this.presence.position(driverId);
      const metadata = await apply(trx, ride, position);
      await recordRideEvent(trx, {
        rideId,
        eventType: to,
        from: ride.status,
        to,
        actorType: 'driver',
        actorId: driverId,
        location: position,
        metadata,
      });
    });
    await this.notifier.rideChanged(rideId);
    return this.views.driverView(await this.views.loadRow(rideId));
  }

  private async lock(
    trx: Kysely<Database>,
    rideId: string,
    owner: { passengerId?: string; driverId?: string },
  ) {
    let q = trx
      .selectFrom('rides')
      .select([
        'id',
        'status',
        'passenger_id',
        'driver_id',
        'fare_snapshot',
        'assigned_at',
        'arrived_at',
        'started_at',
        'quoted_total_kobo',
        'waiting_charge_kobo',
        latOf('pickup').as('pickup_lat'),
        lngOf('pickup').as('pickup_lng'),
      ])
      .where('id', '=', rideId);
    if (owner.passengerId) q = q.where('passenger_id', '=', owner.passengerId);
    if (owner.driverId) q = q.where('driver_id', '=', owner.driverId);
    const r = await q.forUpdate().executeTakeFirst();
    if (!r) throw new AppException(ErrorCode.NOT_FOUND, 'Ride not found');
    return {
      ...r,
      status: r.status as RideStatus,
      pickup: { lat: r.pickup_lat, lng: r.pickup_lng },
    };
  }

  private async withdrawOffers(trx: Kysely<Database>, rideId: string) {
    return trx
      .updateTable('ride_requests')
      .set({ status: 'withdrawn', responded_at: new Date() })
      .where('ride_id', '=', rideId)
      .where('status', '=', 'offered')
      .returning(['id', 'driver_id'])
      .execute();
  }

  /** Cash fees cannot be taken on the spot; they are recorded and collected from the wallet in Phase 5. */
  private async recordOutstandingFee(
    trx: Kysely<Database>,
    rideId: string,
    payerId: string,
    amount: number,
  ) {
    await trx
      .insertInto('payments')
      .values({
        ride_id: rideId,
        payer_id: payerId,
        method: 'cash',
        purpose: 'cancellation_fee',
        amount_kobo: amount,
        status: 'outstanding',
      })
      .execute();
  }

  private async page(column: 'passenger_id' | 'driver_id', userId: string, q: ListRidesQuery) {
    let query = this.db
      .selectFrom('rides')
      .select(['id', sql<string>`created_at::text`.as('ts')])
      .where(column, '=', userId)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(q.limit + 1);
    const cursor = decodeCursor(q.cursor);
    if (cursor)
      query = query.where(
        sql<boolean>`(created_at, id) < (${cursor.ts}::timestamptz, ${cursor.id}::uuid)`,
      );
    const rows = await query.execute();
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    return {
      ids: page.map((r) => r.id),
      nextCursor: rows.length > q.limit && last ? encodeCursor({ ts: last.ts, id: last.id }) : null,
    };
  }
}

export const ACTIVE_STATUSES: RideStatus[] = [
  'requested',
  'searching',
  'driver_assigned',
  'driver_arrived',
  'in_progress',
];
type LockedRide = Awaited<ReturnType<RideService['lock']>>;
export type { RideRow };
