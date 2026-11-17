import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { type Kysely, sql } from 'kysely';
import {
  type AdminDeletionRequestView,
  type DeletionRequestView,
  ErrorCode,
} from '@rideswithme/shared-types';
import { AuditService } from '../audit/audit.service';
import { SessionService } from '../auth/session.service';
import { AppException } from '../common/app-exception';
import type { RequestContext } from '../common/request-context';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB, isUniqueViolation } from '../database/database.module';
import { koboFromDb } from '../database/geo';
import type { Database } from '../database/types';
import { NotificationsService } from '../notifications/notifications.service';
import { REDIS } from '../redis/redis.module';
import { ObjectStorageService } from '../storage/object-storage.service';

const PRIVILEGED = ['support_agent', 'admin', 'super_admin'];

/**
 * Account deletion requests (NDPA right to erasure). After DELETION_GRACE_DAYS
 * the person's personal data is removed: name, phone, email, saved places,
 * cards, devices, notifications, ID details and documents. Trips, payments and
 * the ledger stay, linked to the now-anonymous account, because financial and
 * safety records must be kept (DECISIONS D-074). A request waits ("blocked")
 * while something is still open: a trip, a bus booking, money either way.
 */
@Injectable()
export class DeletionService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DeletionService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly sessions: SessionService,
    private readonly storage: ObjectStorageService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    const m = this.config.DELETION_SWEEP_MINUTES;
    if (m === 0) return;
    this.timer = setInterval(() => void this.sweepWithLock(), m * 60_000);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async request(
    userId: string,
    reason: string | undefined,
    ctx: Partial<RequestContext>,
    now = new Date(),
  ): Promise<DeletionRequestView> {
    const roles = await this.roles(userId);
    if (roles.some((r) => PRIVILEGED.includes(r)))
      throw new AppException(
        ErrorCode.DELETION_BLOCKED,
        'Staff accounts are closed by a super admin',
        { details: { reasons: ['staff_account'] } },
      );
    const scheduledFor = new Date(now.getTime() + this.config.DELETION_GRACE_DAYS * 86_400_000);
    try {
      await this.db.transaction().execute(async (trx) => {
        await trx
          .insertInto('account_deletion_requests')
          .values({ user_id: userId, reason: reason ?? null, scheduled_for: scheduledFor })
          .execute();
        await this.audit.record(
          {
            actor: { type: 'user', userId },
            action: 'privacy.deletion_requested',
            target: { type: 'user', id: userId },
            context: ctx,
          },
          trx,
        );
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppException(ErrorCode.CONFLICT, 'Already requested');
      throw err;
    }
    await this.notifications.notify(
      userId,
      'deletion_scheduled',
      { date: scheduledFor.toISOString().slice(0, 10) },
      { sms: true },
    );
    return (await this.mine(userId))!;
  }

  async cancel(userId: string, ctx: Partial<RequestContext>): Promise<void> {
    const r = await this.db
      .updateTable('account_deletion_requests')
      .set({ status: 'cancelled' })
      .where('user_id', '=', userId)
      .where('status', 'in', ['pending', 'blocked'])
      .executeTakeFirst();
    if (Number(r.numUpdatedRows) === 0)
      throw new AppException(ErrorCode.NOT_FOUND, 'No deletion request');
    await this.audit.record({
      actor: { type: 'user', userId },
      action: 'privacy.deletion_cancelled',
      target: { type: 'user', id: userId },
      context: ctx,
    });
  }

  async mine(userId: string): Promise<DeletionRequestView | null> {
    const r = await this.db
      .selectFrom('account_deletion_requests')
      .selectAll()
      .where('user_id', '=', userId)
      .where('status', 'in', ['pending', 'blocked'])
      .executeTakeFirst();
    return r
      ? {
          id: r.id,
          status: r.status,
          scheduledFor: r.scheduled_for.toISOString(),
          blockedReason: r.blocked_reason,
          createdAt: r.created_at.toISOString(),
        }
      : null;
  }

  async list(): Promise<AdminDeletionRequestView[]> {
    const rows = await this.db
      .selectFrom('account_deletion_requests as d')
      .innerJoin('users as u', 'u.id', 'd.user_id')
      .selectAll('d')
      .select(['u.full_name', 'u.phone_e164'])
      .orderBy('d.created_at', 'desc')
      .limit(200)
      .execute();
    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        status: r.status,
        scheduledFor: r.scheduled_for.toISOString(),
        blockedReason: r.blocked_reason,
        createdAt: r.created_at.toISOString(),
        user: {
          id: r.user_id,
          name: r.full_name,
          phone: r.phone_e164,
          roles: await this.roles(r.user_id),
        },
      })),
    );
  }

  /** What still stops this account being deleted (empty: nothing). */
  async blockers(userId: string, now = new Date()): Promise<string[]> {
    const out: string[] = [];
    const ride = await this.db
      .selectFrom('rides')
      .select('id')
      .where((eb) => eb.or([eb('passenger_id', '=', userId), eb('driver_id', '=', userId)]))
      .where('status', 'in', [
        'requested',
        'searching',
        'driver_assigned',
        'driver_arrived',
        'in_progress',
      ])
      .executeTakeFirst();
    if (ride) out.push('active_trip');
    const bus = await this.db
      .selectFrom('bus_bookings as b')
      .innerJoin('bus_schedules as s', 's.id', 'b.schedule_id')
      .select('b.id')
      .where('b.passenger_id', '=', userId)
      .where('b.status', '=', 'confirmed')
      .where('s.departs_at', '>', now)
      .executeTakeFirst();
    if (bus) out.push('upcoming_bus_trip');
    const owed = await this.db
      .selectFrom('payments')
      .select(sql<string>`coalesce(sum(outstanding_kobo), 0)`.as('n'))
      .where('payer_id', '=', userId)
      .where('status', '=', 'outstanding')
      .executeTakeFirstOrThrow();
    if (koboFromDb(owed.n) > 0) out.push('money_owed');
    const wallets = await this.db
      .selectFrom('wallets')
      .select(['kind', 'balance_kobo'])
      .where('owner_id', '=', userId)
      .execute();
    for (const w of wallets) {
      if (koboFromDb(w.balance_kobo) !== 0)
        out.push(w.kind === 'driver' ? 'driver_wallet_not_zero' : 'wallet_balance');
    }
    const payout = await this.db
      .selectFrom('payouts')
      .select('id')
      .where('driver_id', '=', userId)
      .where('status', 'in', ['pending', 'processing'])
      .executeTakeFirst();
    if (payout) out.push('payout_in_progress');
    const manages =
      (await this.db
        .selectFrom('fleet_members')
        .select('id')
        .where('user_id', '=', userId)
        .where('member_role', '=', 'manager')
        .where('status', '=', 'active')
        .executeTakeFirst()) ??
      (await this.db
        .selectFrom('bus_operator_members')
        .select('id')
        .where('user_id', '=', userId)
        .where('status', '=', 'active')
        .executeTakeFirst());
    if (manages) out.push('manages_a_partner');
    if ((await this.roles(userId)).some((r) => PRIVILEGED.includes(r))) out.push('staff_account');
    return out;
  }

  /** Carries out due requests, or marks them blocked with the reason. */
  async sweep(now = new Date()): Promise<{ completed: number; blocked: number }> {
    const due = await this.db
      .selectFrom('account_deletion_requests')
      .select(['id', 'user_id', 'status', 'blocked_reason'])
      .where('status', 'in', ['pending', 'blocked'])
      .where('scheduled_for', '<=', now)
      .limit(100)
      .execute();
    const result = { completed: 0, blocked: 0 };
    for (const r of due) {
      const blockers = await this.blockers(r.user_id, now);
      if (blockers.length) {
        const reason = blockers.join(', ');
        await this.db
          .updateTable('account_deletion_requests')
          .set({ status: 'blocked', blocked_reason: reason })
          .where('id', '=', r.id)
          .execute();
        if (r.blocked_reason !== reason)
          await this.notifications.notify(
            r.user_id,
            'deletion_blocked',
            { reason: reason.replace(/_/g, ' ') },
            { sms: true },
          );
        result.blocked++;
        continue;
      }
      await this.erase(r.user_id, r.id, now);
      result.completed++;
    }
    return result;
  }

  /**
   * A super admin deletes an account now, with a reason (no grace period). The
   * same things stop it as stop a person's own request, except being staff:
   * the roles go with the account. `guard` runs first inside the transaction,
   * for the caller's own checks (not their own account, not the last super admin).
   */
  async deleteByStaff(
    userId: string,
    reason: string,
    staff: { userId: string; ctx: Partial<RequestContext> },
    guard: (trx: Kysely<Database>) => Promise<void>,
    now = new Date(),
  ): Promise<void> {
    const blockers = (await this.blockers(userId, now)).filter((b) => b !== 'staff_account');
    if (blockers.length) {
      throw new AppException(
        ErrorCode.DELETION_BLOCKED,
        `Cannot delete yet: ${blockers.join(', ').replace(/_/g, ' ')}`,
        { details: { blockers } },
      );
    }
    const open = await this.db
      .selectFrom('account_deletion_requests')
      .select('id')
      .where('user_id', '=', userId)
      .where('status', 'in', ['pending', 'blocked'])
      .executeTakeFirst();
    await this.erase(userId, open?.id ?? null, now, { ...staff, reason, guard });
  }

  private async erase(
    userId: string,
    requestId: string | null,
    now: Date,
    staff?: {
      userId: string;
      reason: string;
      ctx: Partial<RequestContext>;
      guard: (trx: Kysely<Database>) => Promise<void>;
    },
  ) {
    const documents = await this.db
      .selectFrom('driver_documents')
      .select('object_key')
      .where('driver_user_id', '=', userId)
      .execute();
    // The passenger identity check's photos go too (D-083).
    const kyc = await this.db
      .selectFrom('passenger_verifications')
      .select(['id_object_key', 'selfie_object_key'])
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (kyc)
      documents.push({ object_key: kyc.id_object_key }, { object_key: kyc.selfie_object_key });
    await this.db.transaction().execute(async (trx) => {
      if (staff) await staff.guard(trx);
      await trx
        .updateTable('users')
        .set({
          phone_e164: null,
          phone_verified_at: null,
          email: null,
          email_verified_at: null,
          full_name: null,
          gender: null,
          date_of_birth: null,
          emergency_contact_name: null,
          emergency_contact_phone: null,
          status: 'deleted',
          deleted_at: now,
          deleted_reason: staff?.reason ?? null,
          suspended_reason: null,
          totp_secret_encrypted: null,
          totp_enabled_at: null,
        })
        .where('id', '=', userId)
        .execute();
      await this.sessions.revokeAllForUser(userId, 'account_deleted', trx);
      await trx.deleteFrom('user_roles').where('user_id', '=', userId).execute();
      await trx.deleteFrom('saved_places').where('user_id', '=', userId).execute();
      await trx.deleteFrom('passenger_verifications').where('user_id', '=', userId).execute();
      await trx.deleteFrom('push_tokens').where('user_id', '=', userId).execute();
      await trx.deleteFrom('notifications').where('user_id', '=', userId).execute();
      await trx
        .updateTable('payment_cards')
        .set({ removed_at: now })
        .where('user_id', '=', userId)
        .where('removed_at', 'is', null)
        .execute();
      await trx
        .updateTable('driver_profiles')
        .set({
          nin_encrypted: null,
          nin_lookup_hash: null,
          nin_last4: null,
          payout_bank_code: null,
          payout_account_number_encrypted: null,
          payout_account_last4: null,
          payout_account_name: null,
          payout_recipient_code: null,
        })
        .where('user_id', '=', userId)
        .execute();
      if (requestId)
        await trx
          .updateTable('account_deletion_requests')
          .set({ status: 'completed', completed_at: now, blocked_reason: null })
          .where('id', '=', requestId)
          .execute();
      await this.audit.record(
        staff
          ? {
              actor: { type: 'user', userId: staff.userId },
              action: 'admin.user.deleted',
              target: { type: 'user', id: userId },
              metadata: { reason: staff.reason, documents: documents.length },
              context: staff.ctx,
            }
          : {
              actor: { type: 'system' },
              action: 'privacy.account_deleted',
              target: { type: 'user', id: userId },
              metadata: { documents: documents.length },
            },
        trx,
      );
    });
    // Driver documents (ID, licence, photos) leave storage too; the rows keep only their status.
    for (const d of documents) {
      await this.storage
        .delete(d.object_key)
        .catch((err: unknown) =>
          this.logger.error(
            { err: (err as Error).message, userId },
            'Document not deleted from storage',
          ),
        );
    }
  }

  private async roles(userId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('user_roles as ur')
      .innerJoin('roles as r', 'r.id', 'ur.role_id')
      .select('r.key')
      .where('ur.user_id', '=', userId)
      .execute();
    return rows.map((r) => r.key);
  }

  private async sweepWithLock() {
    if ((await this.redis.set('lock:deletion-sweep', '1', 'EX', 600, 'NX')) !== 'OK') return;
    try {
      const r = await this.sweep();
      if (r.completed || r.blocked) this.logger.log(r, 'Account deletion requests processed');
    } catch (err) {
      this.logger.error({ err }, 'Deletion sweep failed');
    } finally {
      await this.redis.del('lock:deletion-sweep');
    }
  }
}
