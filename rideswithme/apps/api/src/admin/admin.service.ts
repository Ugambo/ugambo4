import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, sql } from 'kysely';
import {
  type AdminUserSummary,
  type AuditLogEntry,
  ErrorCode,
  type Paginated,
  type PermissionKey,
  type RoleKey,
  type RoleSummary,
} from '@rideswithme/shared-types';
import {
  type ListAuditLogsQuery,
  type ListUsersQuery,
  normalizeNigerianPhone,
} from '@rideswithme/validation';
import { AuditService } from '../audit/audit.service';
import type { Principal } from '../auth/principal';
import { SessionService } from '../auth/session.service';
import { AppException } from '../common/app-exception';
import { decodeCursor, encodeCursor } from '../common/cursor';
import type { RequestContext } from '../common/request-context';
import { DB } from '../database/database.module';
import type { Database } from '../database/types';

type Actor = { type: 'user'; userId: string; principal: Principal } | { type: 'system' };

@Injectable()
export class AdminService {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
  ) {}

  async listUsers(q: ListUsersQuery): Promise<Paginated<AdminUserSummary>> {
    let query = this.db
      .selectFrom('users as u')
      .select(['u.id', sql<string>`u.created_at::text`.as('cursor_ts')])
      .orderBy('u.created_at', 'desc')
      .orderBy('u.id', 'desc')
      .limit(q.limit + 1);

    if (q.status) query = query.where('u.status', '=', q.status);
    if (q.role) {
      const role = q.role;
      query = query.where(({ exists, selectFrom }) =>
        exists(
          selectFrom('user_roles as ur')
            .innerJoin('roles as r', 'r.id', 'ur.role_id')
            .select(sql`1`.as('one'))
            .whereRef('ur.user_id', '=', 'u.id')
            .where('r.key', '=', role),
        ),
      );
    }
    if (q.search) {
      const phone = normalizeNigerianPhone(q.search);
      const like = `%${q.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      query = query.where((eb) =>
        eb.or([
          ...(phone ? [eb('u.phone_e164', '=', phone)] : []),
          eb('u.full_name', 'ilike', like),
          eb(sql`u.email::text`, 'ilike', like),
        ]),
      );
    }
    const cursor = decodeCursor(q.cursor);
    if (cursor) {
      query = query.where(
        sql<boolean>`(u.created_at, u.id) < (${cursor.ts}::timestamptz, ${cursor.id}::uuid)`,
      );
    }

    const rows = await query.execute();
    const page = rows.slice(0, q.limit);
    const items = await this.summaries(page.map((r) => r.id));
    const last = page[page.length - 1];
    return {
      items,
      nextCursor:
        rows.length > q.limit && last ? encodeCursor({ ts: last.cursor_ts, id: last.id }) : null,
    };
  }

  async getUser(userId: string): Promise<AdminUserSummary> {
    const [user] = await this.summaries([userId]);
    if (!user) throw new AppException(ErrorCode.NOT_FOUND, 'User not found');
    return user;
  }

  async listRoles(): Promise<RoleSummary[]> {
    const rows = await this.db
      .selectFrom('roles as r')
      .leftJoin('role_permissions as rp', 'rp.role_id', 'r.id')
      .leftJoin('permissions as p', 'p.id', 'rp.permission_id')
      .select(['r.key', 'r.name', 'r.description', 'r.requires_mfa', 'p.key as permission'])
      .orderBy('r.created_at')
      .orderBy('p.key')
      .execute();
    const roles = new Map<string, RoleSummary>();
    for (const row of rows) {
      const role = roles.get(row.key) ?? {
        key: row.key as RoleKey,
        name: row.name,
        description: row.description,
        requiresMfa: row.requires_mfa,
        permissions: [],
      };
      if (row.permission) role.permissions.push(row.permission as PermissionKey);
      roles.set(row.key, role);
    }
    return [...roles.values()];
  }

  async assignRole(
    targetUserId: string,
    roleKey: RoleKey,
    actor: Actor,
    ctx: Partial<RequestContext>,
  ) {
    await this.db.transaction().execute(async (trx) => {
      const role = await this.loadRole(trx, roleKey);
      this.assertCanManageRole(actor, role);
      const target = await this.loadUserForUpdate(trx, targetUserId);
      if (target.status === 'deleted')
        throw new AppException(ErrorCode.CONFLICT, 'User is deleted');

      const inserted = await trx
        .insertInto('user_roles')
        .values({
          user_id: targetUserId,
          role_id: role.id,
          granted_by: actor.type === 'user' ? actor.userId : null,
        })
        .onConflict((oc) => oc.columns(['user_id', 'role_id']).doNothing())
        .returning('user_id')
        .executeTakeFirst();
      if (inserted) {
        await this.audit.record(
          {
            actor: auditActor(actor),
            action: 'admin.user.role_assigned',
            target: { type: 'user', id: targetUserId },
            metadata: { role: roleKey },
            context: ctx,
          },
          trx,
        );
      }
    });
    return this.getUser(targetUserId);
  }

  async removeRole(
    targetUserId: string,
    roleKey: RoleKey,
    actor: Actor,
    ctx: Partial<RequestContext>,
  ) {
    await this.db.transaction().execute(async (trx) => {
      const role = await this.loadRole(trx, roleKey, roleKey === 'super_admin');
      this.assertCanManageRole(actor, role);
      await this.loadUserForUpdate(trx, targetUserId);
      if (roleKey === 'super_admin') await this.assertNotLastSuperAdmin(trx, targetUserId);

      const removed = await trx
        .deleteFrom('user_roles')
        .where('user_id', '=', targetUserId)
        .where('role_id', '=', role.id)
        .executeTakeFirst();
      if (removed.numDeletedRows > 0n) {
        await this.audit.record(
          {
            actor: auditActor(actor),
            action: 'admin.user.role_removed',
            target: { type: 'user', id: targetUserId },
            metadata: { role: roleKey },
            context: ctx,
          },
          trx,
        );
      }
    });
    return this.getUser(targetUserId);
  }

  async suspend(targetUserId: string, reason: string, actor: Actor, ctx: Partial<RequestContext>) {
    if (actor.type === 'user' && actor.userId === targetUserId) {
      throw new AppException(ErrorCode.FORBIDDEN, 'You cannot suspend your own account');
    }
    await this.db.transaction().execute(async (trx) => {
      await this.lockSuperAdminRole(trx);
      const target = await this.loadUserForUpdate(trx, targetUserId);
      await this.assertCanManageUser(trx, actor, targetUserId);
      if (target.status === 'deleted')
        throw new AppException(ErrorCode.CONFLICT, 'User is deleted');
      if (target.status === 'suspended') return;
      await this.assertNotLastSuperAdmin(trx, targetUserId);

      await trx
        .updateTable('users')
        .set({ status: 'suspended', suspended_reason: reason })
        .where('id', '=', targetUserId)
        .execute();
      await this.sessions.revokeAllForUser(targetUserId, 'account_suspended', trx);
      await this.audit.record(
        {
          actor: auditActor(actor),
          action: 'admin.user.suspended',
          target: { type: 'user', id: targetUserId },
          metadata: { reason },
          context: ctx,
        },
        trx,
      );
    });
    return this.getUser(targetUserId);
  }

  async reactivate(targetUserId: string, actor: Actor, ctx: Partial<RequestContext>) {
    await this.db.transaction().execute(async (trx) => {
      const target = await this.loadUserForUpdate(trx, targetUserId);
      await this.assertCanManageUser(trx, actor, targetUserId);
      if (target.status !== 'suspended') return;
      await trx
        .updateTable('users')
        .set({ status: 'active', suspended_reason: null })
        .where('id', '=', targetUserId)
        .execute();
      await this.audit.record(
        {
          actor: auditActor(actor),
          action: 'admin.user.reactivated',
          target: { type: 'user', id: targetUserId },
          context: ctx,
        },
        trx,
      );
    });
    return this.getUser(targetUserId);
  }

  async listAuditLogs(q: ListAuditLogsQuery): Promise<Paginated<AuditLogEntry>> {
    let query = this.db
      .selectFrom('audit_logs')
      .selectAll()
      .select(sql<string>`created_at::text`.as('cursor_ts'))
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(q.limit + 1);
    if (q.actorUserId) query = query.where('actor_user_id', '=', q.actorUserId);
    if (q.targetId) query = query.where('target_id', '=', q.targetId);
    if (q.action) query = query.where('action', '=', q.action);
    const cursor = decodeCursor(q.cursor);
    if (cursor)
      query = query.where(
        sql<boolean>`(created_at, id) < (${cursor.ts}::timestamptz, ${cursor.id}::uuid)`,
      );

    const rows = await query.execute();
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        id: r.id,
        actorUserId: r.actor_user_id,
        actorType: r.actor_type,
        action: r.action,
        targetType: r.target_type,
        targetId: r.target_id,
        metadata: r.metadata,
        ip: r.ip,
        requestId: r.request_id,
        createdAt: r.created_at.toISOString(),
      })),
      nextCursor:
        rows.length > q.limit && last ? encodeCursor({ ts: last.cursor_ts, id: last.id }) : null,
    };
  }

  private async summaries(ids: string[]): Promise<AdminUserSummary[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .selectFrom('users as u')
      .leftJoin('user_roles as ur', 'ur.user_id', 'u.id')
      .leftJoin('roles as r', 'r.id', 'ur.role_id')
      .select([
        'u.id',
        'u.phone_e164',
        'u.email',
        'u.full_name',
        'u.status',
        'u.created_at',
        'u.last_login_at',
        sql<
          string[]
        >`coalesce(array_agg(r.key ORDER BY r.key) FILTER (WHERE r.key IS NOT NULL), '{}')`.as(
          'roles',
        ),
      ])
      .where('u.id', 'in', ids)
      .groupBy('u.id')
      .execute();
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.flatMap((id) => {
      const r = byId.get(id);
      return r
        ? [
            {
              id: r.id,
              phone: r.phone_e164,
              email: r.email,
              fullName: r.full_name,
              status: r.status,
              roles: r.roles as RoleKey[],
              createdAt: r.created_at.toISOString(),
              lastLoginAt: r.last_login_at?.toISOString() ?? null,
            },
          ]
        : [];
    });
  }

  private async loadRole(trx: Kysely<Database>, key: RoleKey, forUpdate = false) {
    let q = trx.selectFrom('roles').select(['id', 'key', 'is_privileged']).where('key', '=', key);
    if (forUpdate) q = q.forUpdate();
    const role = await q.executeTakeFirst();
    if (!role) throw new AppException(ErrorCode.NOT_FOUND, 'Role not found');
    return role;
  }

  /** Serialises changes that could leave the system without an active super admin. */
  private async lockSuperAdminRole(trx: Kysely<Database>) {
    await trx
      .selectFrom('roles')
      .select('id')
      .where('key', '=', 'super_admin')
      .forUpdate()
      .execute();
  }

  private async loadUserForUpdate(trx: Kysely<Database>, userId: string) {
    const user = await trx
      .selectFrom('users')
      .select(['id', 'status'])
      .where('id', '=', userId)
      .forUpdate()
      .executeTakeFirst();
    if (!user) throw new AppException(ErrorCode.NOT_FOUND, 'User not found');
    return user;
  }

  private assertCanManageRole(actor: Actor, role: { is_privileged: boolean }) {
    if (actor.type === 'system') return;
    const needed: PermissionKey = role.is_privileged ? 'roles.assign_privileged' : 'roles.assign';
    if (!actor.principal.permissions.has(needed)) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Missing permission', {
        details: { missing: [needed] },
      });
    }
  }

  /** Only holders of roles.assign_privileged may act on staff accounts. */
  private async assertCanManageUser(trx: Kysely<Database>, actor: Actor, targetUserId: string) {
    if (actor.type === 'system' || actor.principal.permissions.has('roles.assign_privileged'))
      return;
    const privileged = await trx
      .selectFrom('user_roles as ur')
      .innerJoin('roles as r', 'r.id', 'ur.role_id')
      .select('r.key')
      .where('ur.user_id', '=', targetUserId)
      .where('r.is_privileged', '=', true)
      .executeTakeFirst();
    if (privileged) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Missing permission', {
        details: { missing: ['roles.assign_privileged'] },
      });
    }
  }

  private async assertNotLastSuperAdmin(trx: Kysely<Database>, targetUserId: string) {
    const isSuperAdmin = await trx
      .selectFrom('user_roles as ur')
      .innerJoin('roles as r', 'r.id', 'ur.role_id')
      .select('ur.user_id')
      .where('ur.user_id', '=', targetUserId)
      .where('r.key', '=', 'super_admin')
      .executeTakeFirst();
    if (!isSuperAdmin) return;
    const others = await trx
      .selectFrom('user_roles as ur')
      .innerJoin('roles as r', 'r.id', 'ur.role_id')
      .innerJoin('users as u', 'u.id', 'ur.user_id')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('r.key', '=', 'super_admin')
      .where('u.status', '=', 'active')
      .where('ur.user_id', '!=', targetUserId)
      .executeTakeFirstOrThrow();
    if (Number(others.n) === 0) {
      throw new AppException(
        ErrorCode.LAST_SUPER_ADMIN,
        'Cannot remove the last active super admin',
      );
    }
  }
}

function auditActor(actor: Actor) {
  return actor.type === 'user'
    ? { type: 'user' as const, userId: actor.userId }
    : { type: 'system' as const };
}
