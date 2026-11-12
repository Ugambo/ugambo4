-- Reference data: system roles and Phase 1 permissions. Later phases add
-- permissions in their own migrations.
INSERT INTO roles (key, name, description, requires_mfa, is_privileged, is_system) VALUES
  ('passenger',     'Passenger',     'Books rides and bus seats.',                         false, false, true),
  ('driver',        'Driver',        'Accepts and completes trips once approved.',          false, false, true),
  ('fleet_manager', 'Fleet manager', 'Manages drivers and vehicles of one fleet operator.', true,  false, true),
  ('support_agent', 'Support agent', 'Helps riders and drivers; read-mostly access.',       true,  true,  true),
  ('admin',         'Admin',         'Runs day-to-day operations.',                         true,  true,  true),
  ('super_admin',   'Super admin',   'Full access, including granting admin roles.',        true,  true,  true);

INSERT INTO permissions (key, description) VALUES
  ('users.read',              'View user accounts'),
  ('users.manage',            'Suspend and reactivate user accounts'),
  ('roles.read',              'View roles and permissions'),
  ('roles.assign',            'Assign and remove non-privileged roles'),
  ('roles.assign_privileged', 'Assign and remove privileged roles (support, admin, super admin)'),
  ('audit_logs.read',         'View the audit log');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON
  (r.key = 'support_agent' AND p.key IN ('users.read')) OR
  (r.key = 'admin'         AND p.key IN ('users.read', 'users.manage', 'roles.read', 'roles.assign', 'audit_logs.read')) OR
  (r.key = 'super_admin');
