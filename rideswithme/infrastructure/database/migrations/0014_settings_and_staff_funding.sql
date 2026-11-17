-- System settings that super admins change from the dashboard, and wider staff
-- powers: admins may open passenger and driver accounts and fund wallets (up to
-- a limit that is itself a setting; super admins have no limit).

-- A value here replaces the API's .env value of the same name while the API
-- runs. Deleting the row returns to the .env value.
CREATE TABLE system_settings (
  key        text PRIMARY KEY CHECK (key ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  value      jsonb NOT NULL,
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO permissions (key, description) VALUES
  ('settings.manage',          'Change system settings and vehicle types'),
  ('wallets.adjust_unlimited', 'Fund or adjust a wallet by any amount (others are limited)');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON
  (r.key = 'super_admin' AND p.key IN ('settings.manage', 'wallets.adjust_unlimited')) OR
  (r.key = 'admin' AND p.key IN ('users.create', 'wallets.adjust'))
ON CONFLICT DO NOTHING;
