/**
 * Role and permission keys. The database is the source of truth for which
 * permissions each role holds (see migration 0003); these constants exist so
 * code can refer to keys without typos.
 */
export const ROLE_KEYS = [
  'passenger',
  'driver',
  'fleet_manager',
  'support_agent',
  'admin',
  'super_admin',
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const PERMISSION_KEYS = [
  'users.read',
  'users.manage',
  'roles.read',
  'roles.assign',
  'roles.assign_privileged',
  'audit_logs.read',
  'drivers.read',
  'drivers.documents_view',
  'drivers.verify',
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export function isRoleKey(value: string): value is RoleKey {
  return (ROLE_KEYS as readonly string[]).includes(value);
}
