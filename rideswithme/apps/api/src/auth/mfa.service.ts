import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { ErrorCode, type MeResponse, type TotpSetupResponse } from '@rideswithme/shared-types';
import { maskPhone } from '@rideswithme/validation';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import { FieldEncryption } from '../common/crypto/field-encryption';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service';
import type { RequestContext } from '../common/request-context';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB } from '../database/database.module';
import type { Database } from '../database/types';
import { UsersService } from '../users/users.service';
import type { Principal } from './principal';
import { SessionService } from './session.service';
import { generateTotpSecret, otpauthUrl, verifyTotp } from './totp';

const secretContext = (userId: string) => `users.totp_secret_encrypted:${userId}`;

/** TOTP two-factor authentication, required for admin, support and fleet roles. */
@Injectable()
export class MfaService {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly encryption: FieldEncryption,
    private readonly sessions: SessionService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  /** Creates (or replaces) a pending secret. It takes effect only after activate(). */
  async setup(principal: Principal): Promise<TotpSetupResponse> {
    const user = await this.loadUser(principal.userId);
    if (user.totp_enabled_at)
      throw new AppException(ErrorCode.TOTP_ALREADY_ENABLED, 'TOTP already enabled');
    const secret = generateTotpSecret();
    await this.db
      .updateTable('users')
      .set({ totp_secret_encrypted: this.encryption.encrypt(secret, secretContext(user.id)) })
      .where('id', '=', user.id)
      .where('totp_enabled_at', 'is', null)
      .execute();
    return { secret, otpauthUrl: otpauthUrl(secret, maskPhone(user.phone_e164 ?? '')) };
  }

  async activate(principal: Principal, code: string, ctx: RequestContext): Promise<MeResponse> {
    await this.limit(principal.userId);
    const user = await this.loadUser(principal.userId);
    if (user.totp_enabled_at)
      throw new AppException(ErrorCode.TOTP_ALREADY_ENABLED, 'TOTP already enabled');
    if (!user.totp_secret_encrypted)
      throw new AppException(ErrorCode.TOTP_NOT_ENROLLED, 'Call setup first');
    const step = this.check(user.id, user.totp_secret_encrypted, code);

    await this.db.transaction().execute(async (trx) => {
      const res = await trx
        .updateTable('users')
        .set({ totp_enabled_at: new Date(), totp_last_used_step: step })
        .where('id', '=', user.id)
        .where('totp_enabled_at', 'is', null)
        .executeTakeFirst();
      if (res.numUpdatedRows === 0n)
        throw new AppException(ErrorCode.TOTP_ALREADY_ENABLED, 'TOTP already enabled');
      await this.sessions.markMfaVerified(principal.sessionId, trx);
      await this.audit.record(
        {
          actor: { type: 'user', userId: user.id },
          action: 'auth.mfa.enabled',
          target: { type: 'user', id: user.id },
          context: ctx,
        },
        trx,
      );
    });
    return this.users.getMe(user.id, true);
  }

  async verify(principal: Principal, code: string, ctx: RequestContext): Promise<MeResponse> {
    await this.limit(principal.userId);
    const user = await this.loadUser(principal.userId);
    if (!user.totp_enabled_at || !user.totp_secret_encrypted) {
      throw new AppException(ErrorCode.TOTP_NOT_ENROLLED, 'TOTP is not set up');
    }
    const step = this.check(user.id, user.totp_secret_encrypted, code);

    await this.db.transaction().execute(async (trx) => {
      // Accept each time step once, so an observed code cannot be replayed.
      const res = await trx
        .updateTable('users')
        .set({ totp_last_used_step: step })
        .where('id', '=', user.id)
        .where((eb) =>
          eb.or([
            eb('totp_last_used_step', 'is', null),
            eb('totp_last_used_step', '<', String(step)),
          ]),
        )
        .executeTakeFirst();
      if (res.numUpdatedRows === 0n)
        throw new AppException(ErrorCode.TOTP_INVALID, 'Code already used');
      await this.sessions.markMfaVerified(principal.sessionId, trx);
      await this.audit.record(
        {
          actor: { type: 'user', userId: user.id },
          action: 'auth.mfa.verified',
          target: { type: 'user_session', id: principal.sessionId },
          context: ctx,
        },
        trx,
      );
    });
    return this.users.getMe(user.id, true);
  }

  /** Clears TOTP and signs the user out everywhere. Used by support/CLI when a phone is lost. */
  async reset(
    userId: string,
    actor: { type: 'user'; userId: string } | { type: 'system' },
    ctx: Partial<RequestContext> = {},
  ) {
    await this.db.transaction().execute(async (trx) => {
      const res = await trx
        .updateTable('users')
        .set({ totp_secret_encrypted: null, totp_enabled_at: null, totp_last_used_step: null })
        .where('id', '=', userId)
        .executeTakeFirst();
      if (res.numUpdatedRows === 0n) throw new AppException(ErrorCode.NOT_FOUND, 'User not found');
      await this.sessions.revokeAllForUser(userId, 'mfa_reset', trx);
      await this.audit.record(
        { actor, action: 'auth.mfa.reset', target: { type: 'user', id: userId }, context: ctx },
        trx,
      );
    });
  }

  private check(userId: string, encrypted: string, code: string): number {
    const secret = this.encryption.decrypt(encrypted, secretContext(userId));
    const step = verifyTotp(secret, code);
    if (step === null) throw new AppException(ErrorCode.TOTP_INVALID, 'Wrong code');
    return step;
  }

  private limit(userId: string) {
    return this.rateLimiter.consume(
      { name: 'totp', limit: this.config.MFA_VERIFY_MAX_PER_15_MIN, windowSeconds: 900 },
      userId,
    );
  }

  private async loadUser(userId: string) {
    const user = await this.db
      .selectFrom('users')
      .select(['id', 'phone_e164', 'totp_secret_encrypted', 'totp_enabled_at'])
      .where('id', '=', userId)
      .executeTakeFirst();
    if (!user) throw new AppException(ErrorCode.NOT_FOUND, 'User not found');
    return user;
  }
}
