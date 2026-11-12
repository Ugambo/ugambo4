import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { PermissionKey, RoleKey } from '@rideswithme/shared-types';
import { DB } from '../database/database.module';
import type { Database } from '../database/types';

export interface UserAccess {
  roles: RoleKey[];
  permissions: Set<PermissionKey>;
  mfaRequired: boolean;
}

@Injectable()
export class AccessService {
  constructor(@Inject(DB) private readonly db: Kysely<Database>) {}

  async load(userId: string, trx: Kysely<Database> = this.db): Promise<UserAccess> {
    const rows = await trx
      .selectFrom('user_roles as ur')
      .innerJoin('roles as r', 'r.id', 'ur.role_id')
      .leftJoin('role_permissions as rp', 'rp.role_id', 'r.id')
      .leftJoin('permissions as p', 'p.id', 'rp.permission_id')
      .select(['r.key as role', 'r.requires_mfa', 'p.key as permission'])
      .where('ur.user_id', '=', userId)
      .execute();

    const roles = new Set<RoleKey>();
    const permissions = new Set<PermissionKey>();
    let mfaRequired = false;
    for (const row of rows) {
      roles.add(row.role as RoleKey);
      if (row.permission) permissions.add(row.permission as PermissionKey);
      if (row.requires_mfa) mfaRequired = true;
    }
    return { roles: [...roles].sort(), permissions, mfaRequired };
  }
}
