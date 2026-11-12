import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { ErrorCode, type PermissionKey, type RoleKey } from '@rideswithme/shared-types';
import { TokenService } from '../auth/token.service';
import { AppException } from '../common/app-exception';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB } from '../database/database.module';
import type { Database } from '../database/types';
import { AccessService } from '../users/access.service';

export interface RealtimeIdentity {
  userId: string;
  sessionId: string;
  roles: RoleKey[];
  /**
   * Permissions usable on this connection. Holders of two-factor roles get none
   * unless the session has passed TOTP, exactly as on the HTTP API.
   */
  permissions: PermissionKey[];
}

/** Checks the credential a realtime client connects with, and later whether its session is still valid. */
@Injectable()
export class RealtimeAuthService {
  constructor(
    private readonly tokens: TokenService,
    private readonly access: AccessService,
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async authenticate(token: unknown): Promise<RealtimeIdentity> {
    if (typeof token !== 'string' || token.length > 4096)
      throw new AppException(ErrorCode.UNAUTHENTICATED, 'Missing credential');
    const claims = await this.tokens.verifyRealtimeCredential(token);
    const valid = await this.validSessions([claims.sessionId]);
    if (!valid.has(claims.sessionId))
      throw new AppException(ErrorCode.SESSION_REVOKED, 'Session has ended');
    const session = await this.db
      .selectFrom('user_sessions')
      .select('mfa_verified_at')
      .where('id', '=', claims.sessionId)
      .executeTakeFirstOrThrow();
    const access = await this.access.load(claims.userId);
    const mfaOk =
      !access.mfaRequired ||
      (session.mfa_verified_at !== null &&
        Date.now() - session.mfa_verified_at.getTime() <
          this.config.MFA_SESSION_TTL_HOURS * 3_600_000);
    return {
      userId: claims.userId,
      sessionId: claims.sessionId,
      roles: access.roles,
      permissions: mfaOk ? [...access.permissions] : [],
    };
  }

  /** Which of these sessions are still live (not revoked or expired, account active). */
  async validSessions(sessionIds: string[]): Promise<Set<string>> {
    if (sessionIds.length === 0) return new Set();
    const now = new Date();
    const rows = await this.db
      .selectFrom('user_sessions as s')
      .innerJoin('users as u', 'u.id', 's.user_id')
      .select('s.id')
      .where('s.id', 'in', sessionIds)
      .where('s.revoked_at', 'is', null)
      .where('s.absolute_expires_at', '>', now)
      .where('u.status', '=', 'active')
      .execute();
    return new Set(rows.map((r) => r.id));
  }
}
