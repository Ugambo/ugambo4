import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { PermissionKey, RoleKey } from '@rideswithme/shared-types';

/** The authenticated caller, attached to the request by AuthGuard. */
export interface Principal {
  userId: string;
  sessionId: string;
  roles: RoleKey[];
  permissions: ReadonlySet<PermissionKey>;
  mfaRequired: boolean;
  mfaEnrolled: boolean;
  mfaVerified: boolean;
}

export const IS_PUBLIC = 'rwm:isPublic';
export const REQUIRED_PERMISSIONS = 'rwm:requiredPermissions';

/** Route needs no access token. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * Route needs every listed permission. Holders of MFA-required roles must also
 * have passed TOTP in this session.
 */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);

export const CurrentPrincipal = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Principal => {
    const principal = ctx.switchToHttp().getRequest<{ principal?: Principal }>().principal;
    if (!principal) throw new Error('CurrentPrincipal used on a public route');
    return principal;
  },
);
