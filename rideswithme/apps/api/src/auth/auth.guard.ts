import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Kysely } from 'kysely';
import { ErrorCode, type PermissionKey } from '@rideswithme/shared-types';
import { AppException } from '../common/app-exception';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB } from '../database/database.module';
import type { Database } from '../database/types';
import { AccessService } from '../users/access.service';
import { IS_PUBLIC, type Principal, REQUIRED_PERMISSIONS } from './principal';
import { TokenService } from './token.service';

/**
 * Global guard. Every route needs a valid access token unless marked @Public().
 * Session state, account status and permissions are checked against the
 * database on every request so revocation and suspension are immediate.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly access: AccessService,
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; principal?: Principal }>();
    const header = req.headers.authorization;
    const match = header ? /^Bearer\s+(\S+)$/i.exec(header) : null;
    if (!match?.[1]) throw new AppException(ErrorCode.UNAUTHENTICATED, 'Missing access token');
    const claims = await this.tokens.verifyAccessToken(match[1]);

    const row = await this.db
      .selectFrom('user_sessions as s')
      .innerJoin('users as u', 'u.id', 's.user_id')
      .select([
        's.revoked_at',
        's.absolute_expires_at',
        's.mfa_verified_at',
        'u.status',
        'u.totp_enabled_at',
      ])
      .where('s.id', '=', claims.sessionId)
      .where('s.user_id', '=', claims.userId)
      .executeTakeFirst();
    const now = Date.now();
    if (
      !row ||
      row.revoked_at ||
      row.absolute_expires_at.getTime() <= now ||
      row.status === 'deleted'
    ) {
      throw new AppException(ErrorCode.SESSION_REVOKED, 'Session has ended');
    }
    if (row.status !== 'active')
      throw new AppException(ErrorCode.ACCOUNT_SUSPENDED, 'Account suspended');

    const access = await this.access.load(claims.userId);
    const mfaVerified =
      row.mfa_verified_at !== null &&
      now - row.mfa_verified_at.getTime() < this.config.MFA_SESSION_TTL_HOURS * 3_600_000;

    req.principal = {
      userId: claims.userId,
      sessionId: claims.sessionId,
      roles: access.roles,
      permissions: access.permissions,
      mfaRequired: access.mfaRequired,
      mfaEnrolled: row.totp_enabled_at !== null,
      mfaVerified,
    };
    return true;
  }
}

/** Global guard (runs after AuthGuard) enforcing @RequirePermissions and MFA. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionKey[] | undefined>(
      REQUIRED_PERMISSIONS,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;
    const principal = context.switchToHttp().getRequest<{ principal?: Principal }>().principal;
    if (!principal) throw new AppException(ErrorCode.UNAUTHENTICATED, 'Not signed in');

    const missing = required.filter((p) => !principal.permissions.has(p));
    if (missing.length) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Missing permission', { details: { missing } });
    }
    if (principal.mfaRequired && !principal.mfaVerified) {
      throw new AppException(ErrorCode.MFA_REQUIRED, 'Two-factor verification required', {
        details: { enrolled: principal.mfaEnrolled },
      });
    }
    return true;
  }
}
