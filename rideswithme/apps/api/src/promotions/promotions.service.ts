import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, type Selectable, sql } from 'kysely';
import { ErrorCode, type PromotionCheck, type PromotionView } from '@rideswithme/shared-types';
import type { PromotionInput, UpdatePromotionInput } from '@rideswithme/validation';
import { AuditService } from '../audit/audit.service';
import type { Principal } from '../auth/principal';
import { AppException } from '../common/app-exception';
import type { RequestContext } from '../common/request-context';
import { DB, isUniqueViolation } from '../database/database.module';
import { koboFromDb } from '../database/geo';
import type { Database, PromotionsTable } from '../database/types';
import { promotionDiscount, type PromotionTerms } from './discount';

type Row = Selectable<PromotionsTable>;

export const terms = (p: Row): PromotionTerms => ({
  discountType: p.discount_type,
  percentBps: p.percent_bps,
  amountKobo: p.amount_kobo === null ? null : koboFromDb(p.amount_kobo),
  maxDiscountKobo: p.max_discount_kobo === null ? null : koboFromDb(p.max_discount_kobo),
  minFareKobo: koboFromDb(p.min_fare_kobo),
  categoryKeys: p.category_keys,
});

/** Marks a ride's promotion used (it completed). */
export async function usePromotion(trx: Kysely<Database>, rideId: string) {
  await trx
    .updateTable('promotion_redemptions')
    .set({ status: 'used' })
    .where('ride_id', '=', rideId)
    .where('status', '=', 'reserved')
    .execute();
}

/** Gives a ride's promotion back (cancelled, or no driver found). */
export async function releasePromotion(trx: Kysely<Database>, rideId: string) {
  await trx
    .updateTable('promotion_redemptions')
    .set({ status: 'released' })
    .where('ride_id', '=', rideId)
    .where('status', '=', 'reserved')
    .execute();
}

/**
 * Promotion codes for rides. A code is checked when fares are estimated and
 * reserved, under a lock on the promotion, when the ride is booked; it is used
 * when the ride completes and released if it does not. RideswithMe pays the
 * discount; the driver is paid on the full fare.
 */
@Injectable()
export class PromotionsService {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    private readonly audit: AuditService,
  ) {}

  /** Whether this passenger can use the code now (before looking at the fare). */
  async check(
    db: Kysely<Database>,
    passengerId: string,
    code: string,
    now: Date,
    lock = false,
  ): Promise<{ promotion: Row | null; reason: string | null }> {
    let q = db.selectFrom('promotions').selectAll().where('code', '=', code);
    if (lock) q = q.forUpdate();
    const p = await q.executeTakeFirst();
    if (!p || !p.is_active) return { promotion: null, reason: 'not_found' };
    if (p.starts_at > now) return { promotion: null, reason: 'not_started' };
    if (p.ends_at <= now) return { promotion: null, reason: 'ended' };
    const counts = await db
      .selectFrom('promotion_redemptions')
      .select([
        sql<string>`count(*)`.as('total'),
        sql<string>`count(*) FILTER (WHERE user_id = ${passengerId})`.as('mine'),
      ])
      .where('promotion_id', '=', p.id)
      .where('status', 'in', ['reserved', 'used'])
      .executeTakeFirstOrThrow();
    if (p.max_redemptions !== null && Number(counts.total) >= p.max_redemptions)
      return { promotion: null, reason: 'used_up' };
    if (Number(counts.mine) >= p.per_user_limit) return { promotion: null, reason: 'already_used' };
    if (p.first_ride_only) {
      const rode = await db
        .selectFrom('rides')
        .select('id')
        .where('passenger_id', '=', passengerId)
        .where('status', '=', 'completed')
        .executeTakeFirst();
      if (rode) return { promotion: null, reason: 'not_first_ride' };
    }
    return { promotion: p, reason: null };
  }

  /** For fare estimates: the discount per vehicle type, and what to tell the passenger. */
  async forEstimate(
    passengerId: string,
    code: string,
    options: { categoryKey: string; totalKobo: number; bookingFeeKobo: number }[],
    now: Date,
  ): Promise<{ check: PromotionCheck; discounts: number[] }> {
    const { promotion, reason } = await this.check(this.db, passengerId, code, now);
    if (!promotion)
      return {
        check: { code, valid: false, description: null, reason },
        discounts: options.map(() => 0),
      };
    const results = options.map((o) =>
      promotionDiscount(terms(promotion), o.totalKobo, o.categoryKey, o.bookingFeeKobo),
    );
    const any = results.some((r) => r.discountKobo > 0);
    return {
      check: {
        code,
        valid: any,
        description: promotion.description,
        reason: any ? null : (results[0]?.reason ?? 'min_fare'),
      },
      discounts: results.map((r) => r.discountKobo),
    };
  }

  /** At booking, inside the booking's transaction: reserves the code for the ride, or refuses. */
  async reserve(
    trx: Kysely<Database>,
    input: {
      passengerId: string;
      code: string;
      rideId: string;
      fareKobo: number;
      categoryKey: string;
      bookingFeeKobo: number;
    },
    now: Date,
  ): Promise<number> {
    const { promotion, reason } = await this.check(trx, input.passengerId, input.code, now, true);
    const result = promotion
      ? promotionDiscount(terms(promotion), input.fareKobo, input.categoryKey, input.bookingFeeKobo)
      : null;
    if (!promotion || !result || result.discountKobo <= 0)
      throw new AppException(ErrorCode.PROMO_INVALID, 'This code cannot be used for this trip', {
        details: { reason: reason ?? result?.reason ?? 'min_fare' },
      });
    await trx
      .insertInto('promotion_redemptions')
      .values({
        promotion_id: promotion.id,
        user_id: input.passengerId,
        ride_id: input.rideId,
        discount_kobo: result.discountKobo,
      })
      .execute();
    return result.discountKobo;
  }

  // --- Staff ---

  async list(): Promise<PromotionView[]> {
    const rows = await this.db
      .selectFrom('promotions as p')
      .selectAll('p')
      .select([
        sql<string>`(SELECT count(*) FROM promotion_redemptions r WHERE r.promotion_id = p.id AND r.status = 'used')`.as(
          'used',
        ),
        sql<string>`(SELECT count(*) FROM promotion_redemptions r WHERE r.promotion_id = p.id AND r.status = 'reserved')`.as(
          'reserved',
        ),
        sql<string>`(SELECT coalesce(sum(discount_kobo), 0) FROM promotion_redemptions r WHERE r.promotion_id = p.id AND r.status = 'used')`.as(
          'discount',
        ),
      ])
      .orderBy('p.created_at', 'desc')
      .execute();
    return rows.map((p) => ({
      id: p.id,
      code: p.code,
      description: p.description,
      ...terms(p),
      firstRideOnly: p.first_ride_only,
      perUserLimit: p.per_user_limit,
      maxRedemptions: p.max_redemptions,
      startsAt: p.starts_at.toISOString(),
      endsAt: p.ends_at.toISOString(),
      isActive: p.is_active,
      redemptions: {
        used: Number(p.used),
        reserved: Number(p.reserved),
        discountKobo: koboFromDb(p.discount),
      },
    }));
  }

  async create(
    principal: Principal,
    input: PromotionInput & { code: string },
    ctx: Partial<RequestContext>,
  ) {
    try {
      const id = await this.db.transaction().execute(async (trx) => {
        const p = await trx
          .insertInto('promotions')
          .values({
            code: input.code,
            description: input.description,
            discount_type: input.discountType,
            percent_bps: input.discountType === 'percent' ? (input.percentBps ?? null) : null,
            amount_kobo: input.discountType === 'fixed' ? (input.amountKobo ?? null) : null,
            max_discount_kobo: input.maxDiscountKobo ?? null,
            min_fare_kobo: input.minFareKobo ?? 0,
            category_keys: input.categoryKeys ?? [],
            first_ride_only: input.firstRideOnly ?? false,
            per_user_limit: input.perUserLimit ?? 1,
            max_redemptions: input.maxRedemptions ?? null,
            starts_at: input.startsAt,
            ends_at: input.endsAt,
            created_by: principal.userId,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await this.audit.record(
          {
            actor: { type: 'user', userId: principal.userId },
            action: 'promotions.created',
            target: { type: 'promotion', id: p.id },
            metadata: { ...input },
            context: ctx,
          },
          trx,
        );
        return p.id;
      });
      return (await this.list()).find((p) => p.id === id)!;
    } catch (err) {
      if (isUniqueViolation(err, 'promotions_code_key'))
        throw new AppException(ErrorCode.CONFLICT, 'This code already exists');
      throw err;
    }
  }

  async update(
    principal: Principal,
    id: string,
    input: UpdatePromotionInput,
    ctx: Partial<RequestContext>,
  ) {
    await this.db.transaction().execute(async (trx) => {
      const r = await trx
        .updateTable('promotions')
        .set({
          ...(input.description !== undefined && { description: input.description }),
          ...(input.endsAt !== undefined && { ends_at: input.endsAt }),
          ...(input.maxRedemptions !== undefined && { max_redemptions: input.maxRedemptions }),
          ...(input.isActive !== undefined && { is_active: input.isActive }),
        })
        .where('id', '=', id)
        .executeTakeFirst();
      if (Number(r.numUpdatedRows) === 0)
        throw new AppException(ErrorCode.NOT_FOUND, 'Promotion not found');
      await this.audit.record(
        {
          actor: { type: 'user', userId: principal.userId },
          action: 'promotions.updated',
          target: { type: 'promotion', id },
          metadata: { ...input },
          context: ctx,
        },
        trx,
      );
    });
    return (await this.list()).find((p) => p.id === id)!;
  }
}
