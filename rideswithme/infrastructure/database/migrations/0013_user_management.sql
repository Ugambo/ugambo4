-- User management by super admins: create accounts, edit them, and delete them
-- (personal data erased at once, with a recorded reason). Admins keep viewing,
-- suspending and role changes; these three are super admin only.
INSERT INTO permissions (key, description) VALUES
  ('users.create', 'Create user accounts'),
  ('users.update', 'Edit a user''s name, phone, email and language'),
  ('users.delete', 'Delete a user account (personal data is erased)');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON
  r.key = 'super_admin' AND p.key IN ('users.create', 'users.update', 'users.delete');

-- Why an account was deleted, when staff did it (NULL for the person's own request).
ALTER TABLE users ADD COLUMN deleted_reason text
  CHECK (deleted_reason IS NULL OR length(deleted_reason) <= 500);
