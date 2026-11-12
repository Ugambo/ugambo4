import { timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Kysely, sql } from 'kysely';
import {
  type AuthTokens,
  type DevicePlatform,
  ErrorCode,
  type SessionSummary,
} from '@rideswithme/shared-types';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import type { RequestContext } from '../common/request-context';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB } from '../database/database.module';
import type { Database, SessionRevokedReason } from '../database/types';
import { hashRefreshSecret, TokenService } from './token.service';

const DAY_MS = 86_400_000;

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async create(
    trx: Kysely<Database>,
    userId: string,
    device: { name?: string | undefined; platform: DevicePlatform },
    ctx: RequestContext,
  ): Promise<AuthTokens> {
    const now = Date.now();
    const absolute = new Date(now + this.config.REFRESH_ABSOLUTE_TTL_DAYS * DAY_MS);
    const idle = new Date(
      Math.min(now + this.config.REFRESH_IDLE_TTL_DAYS * DAY_MS, absolute.getTime()),
    );
    const { secret, hash } = this.tokens.newRefreshSecret();
    const session = await trx
      .insertInto('user_sessions')
      .values({
        user_id: userId,
        refresh_token_hash: hash,
        device_name: device.name ?? null,
        platform: device.platform,
        ip: ctx.ip,
        user_agent: ctx.userAgent,
        idle_expires_at: idle,
        absolute_expires_at: absolute,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return this.buildTokens(userId, session.id, secret, idle);
  }

  /**
   * Rotates the refresh token. Presenting an already-rotated token is treated
   * as theft and revokes the session, except within a short grace window after
   * rotation: on a bad network the client may never receive the new token and
   * retry with the old one. In that case we rotate again (the lost token dies).
   */
  async refresh(refreshToken: string, ctx: RequestContext): Promise<AuthTokens> {
    const parsed = TokenService.parseRefreshToken(refreshToken);
    if (!parsed) throw invalid();
    const presented = hashRefreshSecret(parsed.secret);

    const outcome = await this.db.transaction().execute(async (trx) => {
      const s = await trx
        .selectFrom('user_sessions as s')
        .innerJoin('users as u', 'u.id', 's.user_id')
        .select([
          's.id',
          's.user_id',
          's.refresh_token_hash',
          's.previous_refresh_token_hash',
          's.rotated_at',
          's.revoked_at',
          's.idle_expires_at',
          's.absolute_expires_at',
          'u.status',
        ])
        .where('s.id', '=', parsed.sessionId)
        .forUpdate('s')
        .executeTakeFirst();

      const now = new Date();
      if (!s || s.revoked_at || s.idle_expires_at <= now || s.absolute_expires_at <= now) {
        return { kind: 'invalid' as const };
      }
      if (s.status !== 'active') return { kind: 'suspended' as const };

      const matchesCurrent = safeEqual(presented, s.refresh_token_hash);
      const matchesPrevious =
        s.previous_refresh_token_hash !== null &&
        safeEqual(presented, s.previous_refresh_token_hash);
      const withinGrace =
        matchesPrevious &&
        s.rotated_at !== null &&
        now.getTime() - s.rotated_at.getTime() <= this.config.REFRESH_REUSE_GRACE_SECONDS * 1000;

      if (matchesPrevious && !withinGrace) {
        await this.revokeInTrx(trx, s.id, 'refresh_token_reuse');
        await this.audit.record(
          {
            actor: { type: 'system' },
            action: 'auth.session.refresh_token_reused',
            target: { type: 'user_session', id: s.id },
            metadata: { userId: s.user_id },
            context: ctx,
          },
          trx,
        );
        return { kind: 'reuse' as const };
      }
      if (!matchesCurrent && !withinGrace) return { kind: 'invalid' as const };

      const { secret, hash } = this.tokens.newRefreshSecret();
      const idle = new Date(
        Math.min(
          now.getTime() + this.config.REFRESH_IDLE_TTL_DAYS * DAY_MS,
          s.absolute_expires_at.getTime(),
        ),
      );
      await trx
        .updateTable('user_sessions')
        .set({
          refresh_token_hash: hash,
          // In the grace case keep the original previous hash and rotation time,
          // so the grace window cannot be stretched by repeated retries.
          ...(matchesCurrent && {
            previous_refresh_token_hash: s.refresh_token_hash,
            rotated_at: now,
          }),
          rotation_count: sql`rotation_count + 1`,
          last_used_at: now,
          idle_expires_at: idle,
          ip: ctx.ip,
          user_agent: ctx.userAgent,
        })
        .where('id', '=', s.id)
        .execute();
      return { kind: 'ok' as const, userId: s.user_id, sessionId: s.id, secret, idle };
    });

    switch (outcome.kind) {
      case 'ok':
        return this.buildTokens(outcome.userId, outcome.sessionId, outcome.secret, outcome.idle);
      case 'suspended':
        throw new AppException(ErrorCode.ACCOUNT_SUSPENDED, 'Account suspended');
      case 'reuse':
        this.logger.warn(
          { sessionId: parsed.sessionId },
          'Refresh token reuse detected; session revoked',
        );
        throw invalid();
      case 'invalid':
        throw invalid();
    }
  }

  async revoke(sessionId: string, reason: SessionRevokedReason, trx: Kysely<Database> = this.db) {
    await this.revokeInTrx(trx, sessionId, reason);
  }

  async revokeAllForUser(
    userId: string,
    reason: SessionRevokedReason,
    trx: Kysely<Database> = this.db,
  ) {
    await trx
      .updateTable('user_sessions')
      .set({ revoked_at: new Date(), revoked_reason: reason })
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .execute();
  }

  /** Revokes one of the user's own sessions. Returns false if it is not theirs. */
  async revokeOwn(userId: string, sessionId: string): Promise<boolean> {
    const res = await this.db
      .updateTable('user_sessions')
      .set({ revoked_at: new Date(), revoked_reason: 'revoked_by_user' })
      .where('id', '=', sessionId)
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    return res.numUpdatedRows > 0n;
  }

  async listActive(userId: string, currentSessionId: string): Promise<SessionSummary[]> {
    const now = new Date();
    const rows = await this.db
      .selectFrom('user_sessions')
      .select(['id', 'device_name', 'platform', 'created_at', 'last_used_at'])
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .where('idle_expires_at', '>', now)
      .where('absolute_expires_at', '>', now)
      .orderBy('last_used_at', 'desc')
      .execute();
    return rows.map((r) => ({
      id: r.id,
      deviceName: r.device_name,
      platform: r.platform,
      createdAt: r.created_at.toISOString(),
      lastUsedAt: r.last_used_at.toISOString(),
      current: r.id === currentSessionId,
    }));
  }

  async markMfaVerified(sessionId: string, trx: Kysely<Database> = this.db) {
    await trx
      .updateTable('user_sessions')
      .set({ mfa_verified_at: new Date() })
      .where('id', '=', sessionId)
      .execute();
  }

  private async revokeInTrx(
    trx: Kysely<Database>,
    sessionId: string,
    reason: SessionRevokedReason,
  ) {
    await trx
      .updateTable('user_sessions')
      .set({ revoked_at: new Date(), revoked_reason: reason })
      .where('id', '=', sessionId)
      .where('revoked_at', 'is', null)
      .execute();
  }

  private async buildTokens(
    userId: string,
    sessionId: string,
    secret: string,
    idle: Date,
  ): Promise<AuthTokens> {
    return {
      accessToken: await this.tokens.signAccessToken({ userId, sessionId }),
      accessTokenExpiresIn: this.config.JWT_ACCESS_TTL_SECONDS,
      refreshToken: TokenService.formatRefreshToken(sessionId, secret),
      refreshTokenExpiresAt: idle.toISOString(),
    };
  }
}

function safeEqual(a: Buffer, b: Buffer) {
  return a.length === b.length && timingSafeEqual(a, b);
}

function invalid() {
  return new AppException(ErrorCode.REFRESH_TOKEN_INVALID, 'Refresh token is not valid');
}
