import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { type Kysely, type RawBuilder, type Selectable, sql } from 'kysely';
import {
  type AdminBusBookingView,
  type BusBookingView,
  type BusPayResult,
  type CheckInResult,
  ErrorCode,
  type OperatorDepartureDetail,
} from '@rideswithme/shared-types';
import type {
  AdminBusBookingsQuery,
  CreateBusBookingInput,
  PayBusBookingInput,
} from '@rideswithme/validation';
import { applyBasisPoints } from '@rideswithme/utilities';
import { AuditService } from '../audit/audit.service';
import type { Principal } from '../auth/principal';
import { AppException } from '../common/app-exception';
import type { RequestContext } from '../common/request-context';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB, isUniqueViolation } from '../database/database.module';
import { koboFromDb } from '../database/geo';
import type { BusBookingsTable, Database, PaymentsTable } from '../database/types';
import { credit, debit, type LedgerLine, LedgerService } from '../payments/ledger.service';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../payments/payment.provider';
import { PaymentsService } from '../payments/payments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { REDIS } from '../redis/redis.module';
import { CatalogService } from './catalog.service';
import { bookingReference, qrPayload, ticketCode } from './codes';
import type { OperatorScope } from './operators.service';

type BookingRow = Selectable<BusBookingsTable>;
type CancelledBy = 'passenger' | 'operator' | 'admin';

/**
 * Seat booking. A booking holds its seats for BUS_HOLD_MINUTES while the
 * passenger pays; paying confirms it and turns each seat into a ticket.
 *
 * Seats can never be sold twice: every change to a departure's seats first
 * locks that departure's row (so changes happen one at a time and see each
 * other), and a unique index over active seats is the last line of defence.
 * A lapsed hold counts as free at once; the sweep only tidies up its status.
 */
@Injectable()
export class BookingsService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(BookingsService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly ledger: LedgerService,
    private readonly payments: PaymentsService,
    private readonly catalog: CatalogService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {
    payments.onBusCharge((trx, p, received) => this.onCardPaid(trx, p, received));
  }

  onModuleInit() {
    const minutes = this.config.BUS_HOLD_SWEEP_MINUTES;
    if (minutes === 0) return;
    this.timer = setInterval(() => void this.sweepWithLock(), minutes * 60_000);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  // --- Holding seats ---

  async hold(
    passengerId: string,
    input: CreateBusBookingInput,
    now = new Date(),
  ): Promise<BusBookingView> {
    const id = await this.db
      .transaction()
      .execute(async (trx) => {
        const s = await this.lockSchedule(trx, input.scheduleId);
        await this.assertOnSale(trx, s, now);

        await this.payments.collectOutstanding(trx, passengerId);
        const owed = await this.payments.owedKobo(passengerId, trx);
        if (owed > 0)
          throw new AppException(ErrorCode.OUTSTANDING_BALANCE, 'Pay what you owe first', {
            details: { owedKobo: owed },
          });

        await this.releaseLapsed(trx, s.id, now);
        // Choosing seats again replaces this passenger's earlier unpaid choice on the same bus.
        const earlier = await trx
          .selectFrom('bus_bookings')
          .select('id')
          .where('schedule_id', '=', s.id)
          .where('passenger_id', '=', passengerId)
          .where('status', '=', 'held')
          .execute();
        for (const b of earlier)
          await this.close(trx, b.id, 'cancelled', 'passenger', 'Seats chosen again', now);

        const seatIds = input.seats.map((x) => x.seatId);
        const seats = await trx
          .selectFrom('bus_seats')
          .select(['id', 'seat_class'])
          .where('layout_id', '=', s.layout_id)
          .where('id', 'in', seatIds)
          .execute();
        if (seats.length !== seatIds.length)
          throw new AppException(ErrorCode.VALIDATION_FAILED, 'Choose seats on this bus');
        const fares = await trx
          .selectFrom('bus_schedule_fares')
          .select(['seat_class', 'fare_kobo'])
          .where('schedule_id', '=', s.id)
          .execute();
        const fareOf = new Map(fares.map((f) => [f.seat_class, koboFromDb(f.fare_kobo)]));
        if (seats.some((x) => !fareOf.has(x.seat_class)))
          throw new AppException(ErrorCode.BOOKING_CLOSED, 'Some of these seats are not on sale');

        const taken = await trx
          .selectFrom('bus_booking_seats')
          .select('seat_id')
          .where('schedule_id', '=', s.id)
          .where('seat_id', 'in', seatIds)
          .where('status', '=', 'active')
          .execute();
        if (taken.length)
          throw new AppException(ErrorCode.SEAT_UNAVAILABLE, 'Some of these seats are taken', {
            details: { seatIds: taken.map((t) => t.seat_id) },
          });

        const op = await trx
          .selectFrom('bus_operators')
          .select('service_fee_bps')
          .where('id', '=', s.operator_id)
          .executeTakeFirstOrThrow();
        const total = seats.reduce((sum, x) => sum + fareOf.get(x.seat_class)!, 0);
        const booking = await trx
          .insertInto('bus_bookings')
          .values({
            reference: bookingReference(),
            passenger_id: passengerId,
            schedule_id: s.id,
            hold_expires_at: new Date(now.getTime() + this.config.BUS_HOLD_MINUTES * 60_000),
            total_kobo: total,
            service_fee_kobo: applyBasisPoints(total, op.service_fee_bps),
            service_fee_bps: op.service_fee_bps,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        const classOf = new Map(seats.map((x) => [x.id, x.seat_class]));
        await trx
          .insertInto('bus_booking_seats')
          .values(
            input.seats.map((x) => ({
              booking_id: booking.id,
              schedule_id: s.id,
              seat_id: x.seatId,
              passenger_name: x.passengerName,
              seat_class: classOf.get(x.seatId)!,
              fare_kobo: fareOf.get(classOf.get(x.seatId)!)!,
              ticket_code: ticketCode(),
            })),
          )
          .execute();
        return booking.id;
      })
      .catch((err: unknown) => {
        if (isUniqueViolation(err, 'bus_booking_seats_one_active'))
          throw new AppException(ErrorCode.SEAT_UNAVAILABLE, 'Some of these seats are taken');
        throw err;
      });
    return this.get(passengerId, id, now);
  }

  // --- Paying ---

  async pay(
    passengerId: string,
    bookingId: string,
    input: PayBusBookingInput,
    now = new Date(),
  ): Promise<BusPayResult> {
    if (input.method === 'wallet') {
      await this.db.transaction().execute(async (trx) => {
        const b = await this.lockForPayment(trx, passengerId, bookingId, now);
        const total = koboFromDb(b.total_kobo);
        const paymentId = randomUUID();
        await trx
          .insertInto('payments')
          .values({
            id: paymentId,
            payer_id: passengerId,
            method: 'wallet',
            purpose: 'bus_booking',
            bus_booking_id: b.id,
            amount_kobo: total,
            status: 'succeeded',
            paid_at: now,
          })
          .execute();
        await this.ledger.post(trx, {
          kind: 'bus_booking',
          reference: `payment:${paymentId}:wallet`,
          paymentId,
          busBookingId: b.id,
          memo: 'Bus ticket',
          lines: [debit({ user: passengerId, kind: 'passenger' }, total), ...this.sale(b)],
        });
        await this.confirm(trx, b.id, 'wallet', now);
      });
      return {
        booking: await this.get(passengerId, bookingId, now),
        checkoutUrl: null,
        payment: null,
      };
    }

    // Card or checkout: keep the seats while the payment is processed.
    const b = await this.db.transaction().execute(async (trx) => {
      const row = await this.lockForPayment(trx, passengerId, bookingId, now);
      const until = new Date(now.getTime() + this.config.BUS_HOLD_MINUTES * 60_000);
      if (row.hold_expires_at < until)
        await trx
          .updateTable('bus_bookings')
          .set({ hold_expires_at: until })
          .where('id', '=', row.id)
          .execute();
      return row;
    });
    const total = koboFromDb(b.total_kobo);

    if (input.method === 'checkout') {
      const { checkoutUrl, payment } = await this.payments.startBusCheckout(
        passengerId,
        b.id,
        total,
        input.returnTo ?? 'app',
      );
      return { booking: await this.get(passengerId, bookingId, now), checkoutUrl, payment };
    }

    const authorizationCode = await this.payments.cardAuthorization(
      this.db,
      passengerId,
      input.cardId,
    );
    const paymentId = randomUUID();
    await this.db
      .insertInto('payments')
      .values({
        id: paymentId,
        payer_id: passengerId,
        method: 'card',
        purpose: 'bus_booking',
        bus_booking_id: b.id,
        card_id: input.cardId,
        amount_kobo: total,
        status: 'pending',
        provider: this.provider.name,
        provider_reference: paymentId,
      })
      .execute();
    try {
      const result = await this.provider.chargeCard({
        reference: paymentId,
        authorizationCode,
        email: await this.payments.email(passengerId),
        amountKobo: total,
        metadata: { paymentId, busBookingId: b.id },
      });
      await this.payments.applyCharge(result);
    } catch (err) {
      this.logger.warn({ err: (err as Error).message, paymentId }, 'Bus card charge failed');
      await this.db
        .updateTable('payments')
        .set({ status: 'failed', failure_reason: 'Payment provider unavailable' })
        .where('id', '=', paymentId)
        .where('status', '=', 'pending')
        .execute();
      throw new AppException(
        ErrorCode.PAYMENT_PROVIDER_UNAVAILABLE,
        'Card payments are not available right now; try again or pay from your wallet',
      );
    }
    return {
      booking: await this.get(passengerId, bookingId, now),
      checkoutUrl: null,
      payment: null,
    };
  }

  /**
   * A card payment for a booking succeeded (from the charge, a webhook or a
   * verify call). The booking is confirmed if its seats can still be had and
   * the bus has not gone; otherwise the money goes to the passenger's wallet.
   */
  private async onCardPaid(
    trx: Kysely<Database>,
    p: Selectable<PaymentsTable>,
    received: LedgerLine[],
    now = new Date(),
  ) {
    const amount = koboFromDb(p.amount_kobo);
    const pre = await trx
      .selectFrom('bus_bookings')
      .select('schedule_id')
      .where('id', '=', p.bus_booking_id!)
      .executeTakeFirstOrThrow();
    await this.lockSchedule(trx, pre.schedule_id);
    const b = await this.lockBooking(trx, p.bus_booking_id!);
    const keep =
      amount === koboFromDb(b.total_kobo) &&
      (b.status === 'held' || b.status === 'expired') &&
      (await this.keepSeats(trx, b, now));
    if (keep) {
      const posted = await this.ledger.post(trx, {
        kind: 'bus_booking',
        reference: `payment:${p.id}:charge`,
        paymentId: p.id,
        busBookingId: b.id,
        memo: 'Bus ticket',
        lines: [...received, ...this.sale(b)],
      });
      if (posted?.created) await this.confirm(trx, b.id, 'card', now);
      return posted;
    }
    if (b.status === 'held') await this.close(trx, b.id, 'expired', null, null, now);
    return this.ledger.post(trx, {
      kind: 'bus_booking',
      reference: `payment:${p.id}:charge`,
      paymentId: p.id,
      busBookingId: b.id,
      memo: 'Bus booking could not be completed: added to your wallet',
      lines: [...received, credit({ user: p.payer_id, kind: 'passenger' }, amount)],
    });
  }

  /** The operator's share and RideswithMe's service fee for a booking. */
  private sale(b: BookingRow): LedgerLine[] {
    const total = koboFromDb(b.total_kobo);
    const fee = koboFromDb(b.service_fee_kobo);
    const operatorId = (b as BookingRow & { operator_id?: string }).operator_id;
    if (!operatorId) throw new Error('Booking loaded without its operator');
    return [
      credit({ operator: operatorId }, total - fee),
      credit({ system: 'platform_revenue' }, fee),
    ];
  }

  /** Locks the booking for paying it; re-takes its seats if the hold lapsed and they are still free. */
  private async lockForPayment(
    trx: Kysely<Database>,
    passengerId: string,
    bookingId: string,
    now: Date,
  ) {
    const pre = await trx
      .selectFrom('bus_bookings')
      .select(['schedule_id', 'passenger_id'])
      .where('id', '=', bookingId)
      .executeTakeFirst();
    if (!pre || pre.passenger_id !== passengerId)
      throw new AppException(ErrorCode.NOT_FOUND, 'Booking not found');
    const s = await this.lockSchedule(trx, pre.schedule_id);
    const b = await this.lockBooking(trx, bookingId);
    if (b.status === 'confirmed') throw new AppException(ErrorCode.CONFLICT, 'Already paid');
    if (b.status === 'cancelled')
      throw new AppException(ErrorCode.INVALID_STATE, 'This booking was cancelled');
    await this.assertOnSale(trx, s, now);
    if (!(await this.keepSeats(trx, b, now)))
      throw new AppException(ErrorCode.HOLD_EXPIRED, 'Your seats were released; choose again');
    return b;
  }

  /**
   * True if the booking's seats are (still, or again) its own: a lapsed hold is
   * renewed when nobody else has taken the seats and the bus has not left.
   * Call with the departure locked.
   */
  private async keepSeats(trx: Kysely<Database>, b: BookingRow, now: Date): Promise<boolean> {
    const s = await trx
      .selectFrom('bus_schedules')
      .select(['status', 'departs_at'])
      .where('id', '=', b.schedule_id)
      .executeTakeFirstOrThrow();
    if (s.status !== 'scheduled' || s.departs_at <= now) return false;
    if (b.status === 'held' && b.hold_expires_at > now) return true;
    await this.releaseLapsed(trx, b.schedule_id, now);
    const mine = await trx
      .selectFrom('bus_booking_seats')
      .select('seat_id')
      .where('booking_id', '=', b.id)
      .execute();
    const others = await trx
      .selectFrom('bus_booking_seats')
      .select('seat_id')
      .where('schedule_id', '=', b.schedule_id)
      .where(
        'seat_id',
        'in',
        mine.map((m) => m.seat_id),
      )
      .where('status', '=', 'active')
      .where('booking_id', '<>', b.id)
      .execute();
    if (others.length) return false;
    await trx
      .updateTable('bus_booking_seats')
      .set({ status: 'active' })
      .where('booking_id', '=', b.id)
      .execute();
    await trx
      .updateTable('bus_bookings')
      .set({
        status: 'held',
        hold_expires_at: new Date(now.getTime() + this.config.BUS_HOLD_MINUTES * 60_000),
      })
      .where('id', '=', b.id)
      .execute();
    return true;
  }

  private async confirm(trx: Kysely<Database>, id: string, method: 'wallet' | 'card', now: Date) {
    await trx
      .updateTable('bus_bookings')
      .set({ status: 'confirmed', confirmed_at: now, payment_method: method })
      .where('id', '=', id)
      .execute();
  }

  // --- Cancelling ---

  /** Unpaid: releases the seats. Paid: a full refund to the wallet until BUS_CANCEL_CUTOFF_HOURS before departure. */
  async cancelByPassenger(
    passengerId: string,
    bookingId: string,
    ctx: Partial<RequestContext>,
    now = new Date(),
  ): Promise<BusBookingView> {
    await this.db.transaction().execute(async (trx) => {
      const pre = await trx
        .selectFrom('bus_bookings')
        .select(['schedule_id', 'passenger_id'])
        .where('id', '=', bookingId)
        .executeTakeFirst();
      if (!pre || pre.passenger_id !== passengerId)
        throw new AppException(ErrorCode.NOT_FOUND, 'Booking not found');
      const s = await this.lockSchedule(trx, pre.schedule_id);
      const b = await this.lockBooking(trx, bookingId);
      if (b.status === 'held') {
        await this.close(trx, b.id, 'cancelled', 'passenger', null, now);
        return;
      }
      if (b.status !== 'confirmed')
        throw new AppException(ErrorCode.INVALID_STATE, 'This booking is not active');
      if (now >= this.cancelDeadline(s.departs_at))
        throw new AppException(
          ErrorCode.INVALID_STATE,
          `Bookings can be cancelled until ${this.config.BUS_CANCEL_CUTOFF_HOURS} hours before departure`,
        );
      await this.refundAndCancel(trx, b, 'passenger', null, passengerId, now);
      await this.audit.record(
        {
          actor: { type: 'user', userId: passengerId },
          action: 'buses.booking_cancelled',
          target: { type: 'bus_booking', id: b.id },
          metadata: { by: 'passenger', refundKobo: koboFromDb(b.total_kobo) },
          context: ctx,
        },
        trx,
      );
    });
    return this.get(passengerId, bookingId, now);
  }

  /** Staff: cancels one booking with a full refund to the wallet, at any time. */
  async cancelByAdmin(
    principal: Principal,
    bookingId: string,
    reason: string,
    ctx: Partial<RequestContext>,
    now = new Date(),
  ): Promise<AdminBusBookingView> {
    await this.db.transaction().execute(async (trx) => {
      const pre = await trx
        .selectFrom('bus_bookings')
        .select('schedule_id')
        .where('id', '=', bookingId)
        .executeTakeFirst();
      if (!pre) throw new AppException(ErrorCode.NOT_FOUND, 'Booking not found');
      await this.lockSchedule(trx, pre.schedule_id);
      const b = await this.lockBooking(trx, bookingId);
      if (b.status !== 'held' && b.status !== 'confirmed')
        throw new AppException(ErrorCode.INVALID_STATE, 'This booking is not active');
      await this.refundAndCancel(trx, b, 'admin', reason, principal.userId, now);
      await this.audit.record(
        {
          actor: { type: 'user', userId: principal.userId },
          action: 'buses.booking_cancelled',
          target: { type: 'bus_booking', id: b.id },
          metadata: {
            by: 'admin',
            reason,
            refundKobo: b.status === 'confirmed' ? koboFromDb(b.total_kobo) : 0,
          },
          context: ctx,
        },
        trx,
      );
    });
    return (await this.adminViews(sql<boolean>`b.id = ${bookingId}`, now))[0]!;
  }

  /** Cancels a departure: every passenger is refunded in full to their wallet. */
  async cancelDeparture(
    principal: Principal,
    operatorId: string | null,
    scheduleId: string,
    reason: string,
    ctx: Partial<RequestContext>,
    now = new Date(),
  ): Promise<OperatorDepartureDetail> {
    const by: CancelledBy = operatorId ? 'operator' : 'admin';
    const affected = await this.db.transaction().execute(async (trx) => {
      const s = await this.lockSchedule(trx, scheduleId);
      if (operatorId && s.operator_id !== operatorId)
        throw new AppException(ErrorCode.NOT_FOUND, 'Departure not found');
      if (s.status !== 'scheduled' || s.departs_at <= now)
        throw new AppException(
          ErrorCode.INVALID_STATE,
          'This departure can no longer be cancelled',
        );
      await trx
        .updateTable('bus_schedules')
        .set({
          status: 'cancelled',
          cancel_reason: reason,
          cancelled_at: now,
          cancelled_by: principal.userId,
        })
        .where('id', '=', s.id)
        .execute();
      const bookings = await trx
        .selectFrom('bus_bookings')
        .select('id')
        .where('schedule_id', '=', s.id)
        .where('status', 'in', ['held', 'confirmed'])
        .orderBy('id')
        .execute();
      let refunded = 0;
      const people: { passengerId: string; refundKobo: number }[] = [];
      for (const { id } of bookings) {
        const b = await this.lockBooking(trx, id);
        if (b.status === 'confirmed') refunded += koboFromDb(b.total_kobo);
        people.push({
          passengerId: b.passenger_id,
          refundKobo: b.status === 'confirmed' ? koboFromDb(b.total_kobo) : 0,
        });
        await this.refundAndCancel(trx, b, by, reason, principal.userId, now);
      }
      await this.audit.record(
        {
          actor: { type: 'user', userId: principal.userId },
          action: 'buses.departure_cancelled',
          target: { type: 'bus_schedule', id: s.id },
          metadata: { by, reason, bookings: bookings.length, refundedKobo: refunded },
          context: ctx,
        },
        trx,
      );
      return people;
    });
    const detail = await this.catalog.departureDetail(operatorId, scheduleId, now);
    // Everyone booked hears at once, by SMS too: they may be on their way to the park.
    for (const p of affected)
      await this.notifications.notify(
        p.passengerId,
        'bus_departure_cancelled',
        {
          route: `${detail.route.originCity} → ${detail.route.destinationCity}`,
          date: new Date(new Date(detail.departsAt).getTime() + 3_600_000)
            .toISOString()
            .slice(0, 16)
            .replace('T', ' '),
          reason,
          amount: `₦${(p.refundKobo / 100).toLocaleString('en-NG')}`,
        },
        { sms: true, data: { scheduleId } },
      );
    return detail;
  }

  private async refundAndCancel(
    trx: Kysely<Database>,
    b: BookingRow,
    by: CancelledBy,
    reason: string | null,
    actorId: string,
    now: Date,
  ) {
    if (b.status === 'confirmed') {
      const total = koboFromDb(b.total_kobo);
      const fee = koboFromDb(b.service_fee_kobo);
      const operatorId = (b as BookingRow & { operator_id: string }).operator_id;
      await this.ledger.post(trx, {
        kind: 'bus_refund',
        reference: `bus:${b.id}:refund`,
        busBookingId: b.id,
        createdBy: actorId,
        memo: by === 'passenger' ? 'Bus booking cancelled' : 'Bus trip cancelled: refunded',
        lines: [
          debit({ operator: operatorId }, total - fee),
          debit({ system: 'platform_revenue' }, fee),
          credit({ user: b.passenger_id, kind: 'passenger' }, total),
        ],
      });
      await trx
        .updateTable('bus_bookings')
        .set({ refunded_kobo: total })
        .where('id', '=', b.id)
        .execute();
    }
    await this.close(trx, b.id, 'cancelled', by, reason, now);
  }

  /** Ends a booking (cancelled or expired) and frees its seats. */
  private async close(
    trx: Kysely<Database>,
    id: string,
    status: 'cancelled' | 'expired',
    by: CancelledBy | null,
    reason: string | null,
    now: Date,
  ) {
    await trx
      .updateTable('bus_bookings')
      .set(
        status === 'cancelled'
          ? { status, cancelled_at: now, cancelled_by: by, cancel_reason: reason }
          : { status },
      )
      .where('id', '=', id)
      .execute();
    await trx
      .updateTable('bus_booking_seats')
      .set({ status: 'released' })
      .where('booking_id', '=', id)
      .where('status', '=', 'active')
      .execute();
  }

  // --- Lapsed holds ---

  /** Marks lapsed holds on one departure expired and frees their seats. Call with the departure locked. */
  private async releaseLapsed(trx: Kysely<Database>, scheduleId: string, now: Date) {
    const lapsed = await trx
      .selectFrom('bus_bookings')
      .select('id')
      .where('schedule_id', '=', scheduleId)
      .where('status', '=', 'held')
      .where('hold_expires_at', '<=', now)
      .execute();
    for (const b of lapsed) await this.close(trx, b.id, 'expired', null, null, now);
  }

  async sweep(now = new Date()): Promise<number> {
    const schedules = await this.db
      .selectFrom('bus_bookings')
      .select('schedule_id')
      .distinct()
      .where('status', '=', 'held')
      .where('hold_expires_at', '<=', now)
      .limit(500)
      .execute();
    let n = 0;
    for (const { schedule_id } of schedules) {
      await this.db.transaction().execute(async (trx) => {
        await this.lockSchedule(trx, schedule_id);
        const before = await trx
          .selectFrom('bus_bookings')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .where('schedule_id', '=', schedule_id)
          .where('status', '=', 'held')
          .where('hold_expires_at', '<=', now)
          .executeTakeFirstOrThrow();
        n += Number(before.n);
        await this.releaseLapsed(trx, schedule_id, now);
      });
    }
    return n;
  }

  private async sweepWithLock() {
    if ((await this.redis.set('lock:bus-hold-sweep', '1', 'EX', 120, 'NX')) !== 'OK') return;
    try {
      await this.sweep();
    } catch (err) {
      this.logger.error({ err }, 'Bus hold sweep failed');
    } finally {
      await this.redis.del('lock:bus-hold-sweep');
    }
  }

  // --- Boarding ---

  async checkIn(
    principal: Principal,
    scope: OperatorScope,
    code: string,
    now = new Date(),
  ): Promise<CheckInResult> {
    return this.db.transaction().execute(async (trx) => {
      const t = await trx
        .selectFrom('bus_booking_seats as bs')
        .innerJoin('bus_bookings as b', 'b.id', 'bs.booking_id')
        .innerJoin('bus_schedules as s', 's.id', 'bs.schedule_id')
        .innerJoin('bus_routes as r', 'r.id', 's.route_id')
        .innerJoin('bus_seats as st', 'st.id', 'bs.seat_id')
        .select([
          'bs.id',
          'bs.status as seat_status',
          'bs.passenger_name',
          'bs.checked_in_at',
          'st.label',
          'b.reference',
          'b.status as booking_status',
          's.id as schedule_id',
          's.operator_id',
          's.status as schedule_status',
          's.departs_at',
          'r.origin_city',
          'r.destination_city',
        ])
        .where('bs.ticket_code', '=', code)
        .forUpdate('bs')
        .executeTakeFirst();
      if (!t || t.operator_id !== scope.operatorId)
        throw new AppException(ErrorCode.TICKET_INVALID, 'Not a ticket for your buses');
      if (
        t.seat_status !== 'active' ||
        t.booking_status !== 'confirmed' ||
        t.schedule_status !== 'scheduled'
      )
        throw new AppException(ErrorCode.TICKET_INVALID, 'This ticket was cancelled');
      const hours = (t.departs_at.getTime() - now.getTime()) / 3_600_000;
      if (hours > 24 || hours < -12)
        throw new AppException(ErrorCode.TICKET_INVALID, 'This ticket is for another day', {
          details: { departsAt: t.departs_at.toISOString() },
        });
      const already = t.checked_in_at !== null;
      if (!already)
        await trx
          .updateTable('bus_booking_seats')
          .set({ checked_in_at: now, checked_in_by: principal.userId })
          .where('id', '=', t.id)
          .execute();
      return {
        seatLabel: t.label,
        passengerName: t.passenger_name,
        bookingReference: t.reference,
        departure: {
          id: t.schedule_id,
          departsAt: t.departs_at.toISOString(),
          originCity: t.origin_city,
          destinationCity: t.destination_city,
        },
        alreadyCheckedIn: already,
        checkedInAt: (already ? new Date(t.checked_in_at!) : now).toISOString(),
      };
    });
  }

  // --- Reading ---

  async get(passengerId: string, id: string, now = new Date()): Promise<BusBookingView> {
    const v = (
      await this.views(sql<boolean>`b.id = ${id} AND b.passenger_id = ${passengerId}`, now)
    )[0];
    if (!v) throw new AppException(ErrorCode.NOT_FOUND, 'Booking not found');
    return v;
  }

  async mine(passengerId: string, now = new Date()): Promise<BusBookingView[]> {
    return this.views(sql<boolean>`b.passenger_id = ${passengerId} AND b.status <> 'expired'`, now);
  }

  async adminList(q: AdminBusBookingsQuery, now = new Date()): Promise<AdminBusBookingView[]> {
    const parts = [sql<boolean>`true`];
    if (q.reference) parts.push(sql<boolean>`b.reference = ${q.reference}`);
    if (q.scheduleId) parts.push(sql<boolean>`b.schedule_id = ${q.scheduleId}`);
    if (q.phone)
      parts.push(
        sql<boolean>`b.passenger_id IN (SELECT id FROM users WHERE phone_e164 = ${q.phone})`,
      );
    return this.adminViews(sql.join(parts, sql` AND `) as RawBuilder<boolean>, now, q.limit);
  }

  async adminGet(id: string, now = new Date()): Promise<AdminBusBookingView> {
    const v = (await this.adminViews(sql<boolean>`b.id = ${id}`, now))[0];
    if (!v) throw new AppException(ErrorCode.NOT_FOUND, 'Booking not found');
    return v;
  }

  private async adminViews(where: RawBuilder<boolean>, now: Date, limit = 50) {
    const views = await this.views(where, now, limit);
    if (views.length === 0) return [];
    const people = await this.db
      .selectFrom('bus_bookings as b')
      .innerJoin('users as u', 'u.id', 'b.passenger_id')
      .select(['b.id', 'u.id as user_id', 'u.full_name', 'u.phone_e164'])
      .where(
        'b.id',
        'in',
        views.map((v) => v.id),
      )
      .execute();
    return views.map((v) => {
      const p = people.find((x) => x.id === v.id)!;
      return { ...v, passenger: { id: p.user_id, name: p.full_name, phone: p.phone_e164 } };
    });
  }

  private async views(
    where: RawBuilder<boolean>,
    now: Date,
    limit = 50,
  ): Promise<BusBookingView[]> {
    const rows = await sql<BookingRow & { departs_at: Date }>`
      SELECT b.*, s.departs_at FROM bus_bookings b JOIN bus_schedules s ON s.id = b.schedule_id
      WHERE ${where} ORDER BY b.created_at DESC LIMIT ${limit}`.execute(this.db);
    if (rows.rows.length === 0) return [];
    const ids = rows.rows.map((r) => r.id);
    const seats = await this.db
      .selectFrom('bus_booking_seats as bs')
      .innerJoin('bus_seats as st', 'st.id', 'bs.seat_id')
      .select([
        'bs.id',
        'bs.booking_id',
        'bs.seat_class',
        'bs.passenger_name',
        'bs.fare_kobo',
        'bs.ticket_code',
        'bs.checked_in_at',
        'st.label',
        'st.row_no',
        'st.col_no',
      ])
      .where('bs.booking_id', 'in', ids)
      .orderBy('st.row_no')
      .orderBy('st.col_no')
      .execute();
    const departures = await this.catalog.departures.summaries(
      sql<boolean>`s.id IN (${sql.join([...new Set(rows.rows.map((r) => r.schedule_id))])})`,
      now,
      500,
    );
    const pending = await this.db
      .selectFrom('payments')
      .select('bus_booking_id')
      .where('bus_booking_id', 'in', ids)
      .where('status', '=', 'pending')
      .execute();
    return rows.rows.map((b) => {
      const lapsed = b.status === 'held' && b.hold_expires_at <= now;
      const status = lapsed ? 'expired' : b.status;
      const paid = status === 'confirmed';
      const departure = departures.find((d) => d.id === b.schedule_id)!;
      const deadline = this.cancelDeadline(b.departs_at);
      return {
        id: b.id,
        reference: b.reference,
        status,
        holdExpiresAt: b.hold_expires_at.toISOString(),
        totalKobo: koboFromDb(b.total_kobo),
        paymentMethod: b.payment_method,
        paymentPending: pending.some((p) => p.bus_booking_id === b.id),
        departure,
        tickets: seats
          .filter((s) => s.booking_id === b.id)
          .map((s) => ({
            id: s.id,
            seatLabel: s.label,
            seatClass: s.seat_class,
            passengerName: s.passenger_name,
            fareKobo: koboFromDb(s.fare_kobo),
            ticketCode: paid ? s.ticket_code : null,
            qrPayload: paid ? qrPayload(s.ticket_code) : null,
            checkedInAt: s.checked_in_at ? new Date(s.checked_in_at).toISOString() : null,
          })),
        cancelUntil:
          status === 'held'
            ? b.hold_expires_at.toISOString()
            : paid && departure.status === 'scheduled' && now < deadline
              ? deadline.toISOString()
              : null,
        cancelledAt: b.cancelled_at ? new Date(b.cancelled_at).toISOString() : null,
        cancelledBy: b.cancelled_by,
        cancelReason: b.cancel_reason,
        refundedKobo: koboFromDb(b.refunded_kobo),
        createdAt: new Date(b.created_at).toISOString(),
        confirmedAt: b.confirmed_at ? new Date(b.confirmed_at).toISOString() : null,
      };
    });
  }

  private cancelDeadline(departsAt: Date) {
    return new Date(departsAt.getTime() - this.config.BUS_CANCEL_CUTOFF_HOURS * 3_600_000);
  }

  // --- Locks ---

  /** Locks a departure: every change to its seats happens one at a time. */
  private async lockSchedule(trx: Kysely<Database>, id: string) {
    const s = await trx
      .selectFrom('bus_schedules')
      .selectAll()
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
    if (!s) throw new AppException(ErrorCode.NOT_FOUND, 'Departure not found');
    return s;
  }

  /** Locks a booking (with its departure's operator, for the ledger). */
  private async lockBooking(trx: Kysely<Database>, id: string) {
    return (await trx
      .selectFrom('bus_bookings as b')
      .innerJoin('bus_schedules as s', 's.id', 'b.schedule_id')
      .selectAll('b')
      .select('s.operator_id')
      .where('b.id', '=', id)
      .forUpdate('b')
      .executeTakeFirstOrThrow()) as BookingRow & { operator_id: string };
  }

  private async assertOnSale(
    trx: Kysely<Database>,
    s: { status: string; departs_at: Date; operator_id: string; route_id: string },
    now: Date,
  ) {
    const ok = await trx
      .selectFrom('bus_operators as o')
      .innerJoin('bus_routes as r', 'r.operator_id', 'o.id')
      .select('o.id')
      .where('o.id', '=', s.operator_id)
      .where('r.id', '=', s.route_id)
      .where('o.status', '=', 'active')
      .where('r.is_active', '=', true)
      .executeTakeFirst();
    const closes = s.departs_at.getTime() - this.config.BUS_SALES_CLOSE_MINUTES * 60_000;
    if (!ok || s.status !== 'scheduled' || closes <= now.getTime())
      throw new AppException(ErrorCode.BOOKING_CLOSED, 'Booking for this departure has closed');
  }
}
