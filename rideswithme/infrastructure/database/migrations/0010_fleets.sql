-- Fleets (Phase 6): fleet operators, their managers and their drivers.
-- A fleet manager sees only their own fleet's drivers, vehicles, trips and
-- earnings, and only for trips made while the driver was in the fleet.

ALTER TABLE rides DROP CONSTRAINT rides_driver_when_assigned;
ALTER TABLE rides ADD CONSTRAINT rides_driver_when_assigned CHECK (
  status IN ('requested', 'searching', 'no_driver_found', 'cancelled_by_passenger', 'cancelled_by_admin')
  OR driver_id IS NOT NULL);

CREATE TABLE fleet_operators (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL CHECK (length(name) BETWEEN 2 AND 100),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  contact_phone text CHECK (contact_phone IS NULL OR contact_phone ~ '^\+234\d{10}$'),
  contact_email text CHECK (contact_email IS NULL OR length(contact_email) <= 254),
  created_by    uuid REFERENCES users (id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX fleet_operators_name_key ON fleet_operators (lower(name));
CREATE TRIGGER fleet_operators_set_updated_at BEFORE UPDATE ON fleet_operators
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Managers are added by staff and are active at once; drivers are invited and
-- must accept (the fleet will see their trips and earnings).
CREATE TABLE fleet_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id     uuid NOT NULL REFERENCES fleet_operators (id),
  user_id      uuid NOT NULL REFERENCES users (id),
  member_role  text NOT NULL CHECK (member_role IN ('manager', 'driver')),
  status       text NOT NULL CHECK (status IN ('invited', 'active', 'declined', 'removed')),
  invited_by   uuid REFERENCES users (id),
  invited_at   timestamptz NOT NULL DEFAULT now(),
  -- When the member joined (or declined). Fleets see a driver's trips from here on.
  responded_at timestamptz,
  removed_at   timestamptz,
  removed_by   uuid REFERENCES users (id),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleet_members_joined CHECK (status <> 'active' OR responded_at IS NOT NULL)
);
-- One fleet at a time per driver and per manager, and one open invitation per fleet and person.
CREATE UNIQUE INDEX fleet_members_one_fleet_per_driver ON fleet_members (user_id)
  WHERE member_role = 'driver' AND status = 'active';
CREATE UNIQUE INDEX fleet_members_one_fleet_per_manager ON fleet_members (user_id)
  WHERE member_role = 'manager' AND status = 'active';
CREATE UNIQUE INDEX fleet_members_one_open ON fleet_members (fleet_id, user_id, member_role)
  WHERE status IN ('invited', 'active');
CREATE INDEX fleet_members_fleet_idx ON fleet_members (fleet_id, status);
CREATE TRIGGER fleet_members_set_updated_at BEFORE UPDATE ON fleet_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO permissions (key, description) VALUES
  ('fleets.read',   'View fleet operators and their members'),
  ('fleets.manage', 'Create fleet operators, add managers, suspend fleets'),
  ('rides.manage',  'Stop rides that are stuck'),
  ('fleet.portal',  'Use the fleet portal for the fleet one manages');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON
  (r.key = 'support_agent' AND p.key = 'fleets.read') OR
  (r.key = 'admin' AND p.key IN ('fleets.read', 'fleets.manage', 'rides.manage')) OR
  (r.key = 'super_admin' AND p.key IN ('fleets.read', 'fleets.manage', 'rides.manage')) OR
  (r.key = 'fleet_manager' AND p.key = 'fleet.portal');

-- Dashboard and fleet totals read completed trips by day.
CREATE INDEX rides_completed_at_idx ON rides (completed_at) WHERE status = 'completed';
CREATE INDEX rides_driver_assigned_idx ON rides (driver_id, assigned_at DESC) WHERE driver_id IS NOT NULL;
