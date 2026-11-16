-- Buses (Phase 7): third-party bus operators list routes, seat layouts and
-- departures; passengers hold seats while they pay, then get a ticket per seat.
-- RideswithMe keeps a service fee from each fare (DECISIONS D-062).

-- --- Operators -------------------------------------------------------------------

CREATE TABLE bus_operators (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL CHECK (length(name) BETWEEN 2 AND 100),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  -- RideswithMe's share of each fare, in basis points (1000 = 10%).
  service_fee_bps integer NOT NULL CHECK (service_fee_bps BETWEEN 0 AND 5000),
  contact_phone   text CHECK (contact_phone IS NULL OR contact_phone ~ '^\+234\d{10}$'),
  contact_email   text CHECK (contact_email IS NULL OR length(contact_email) <= 254),
  created_by      uuid REFERENCES users (id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX bus_operators_name_key ON bus_operators (lower(name));
CREATE TRIGGER bus_operators_set_updated_at BEFORE UPDATE ON bus_operators
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The people who run an operator's listings in the portal. One operator per person.
CREATE TABLE bus_operator_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES bus_operators (id),
  user_id     uuid NOT NULL REFERENCES users (id),
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  added_by    uuid REFERENCES users (id),
  added_at    timestamptz NOT NULL DEFAULT now(),
  removed_at  timestamptz,
  removed_by  uuid REFERENCES users (id)
);
CREATE UNIQUE INDEX bus_operator_members_one_operator ON bus_operator_members (user_id)
  WHERE status = 'active';
CREATE INDEX bus_operator_members_operator_idx ON bus_operator_members (operator_id);

-- --- Routes, seat layouts, departures -----------------------------------------------

CREATE TABLE bus_routes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id          uuid NOT NULL REFERENCES bus_operators (id),
  origin_city          text NOT NULL CHECK (length(origin_city) BETWEEN 2 AND 60),
  origin_terminal      text NOT NULL CHECK (length(origin_terminal) BETWEEN 2 AND 200),
  destination_city     text NOT NULL CHECK (length(destination_city) BETWEEN 2 AND 60),
  destination_terminal text NOT NULL CHECK (length(destination_terminal) BETWEEN 2 AND 200),
  duration_minutes     integer NOT NULL CHECK (duration_minutes BETWEEN 10 AND 2880),
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bus_routes_two_cities CHECK (lower(origin_city) <> lower(destination_city))
);
CREATE INDEX bus_routes_cities_idx ON bus_routes (lower(origin_city), lower(destination_city))
  WHERE is_active;
CREATE INDEX bus_routes_operator_idx ON bus_routes (operator_id);
CREATE TRIGGER bus_routes_set_updated_at BEFORE UPDATE ON bus_routes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A seat map: a grid of rows and columns; cells without a seat are aisles,
-- doors or the driver. Fixed once created, because tickets refer to its seats.
CREATE TABLE bus_seat_layouts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES bus_operators (id),
  name        text NOT NULL CHECK (length(name) BETWEEN 2 AND 60),
  rows        integer NOT NULL CHECK (rows BETWEEN 1 AND 30),
  columns     integer NOT NULL CHECK (columns BETWEEN 1 AND 8),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operator_id, name)
);

CREATE TABLE bus_seats (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id  uuid NOT NULL REFERENCES bus_seat_layouts (id),
  label      text NOT NULL CHECK (label ~ '^[A-Za-z0-9]{1,4}$'),
  row_no     integer NOT NULL CHECK (row_no >= 1),
  col_no     integer NOT NULL CHECK (col_no >= 1),
  seat_class text NOT NULL CHECK (seat_class IN ('standard', 'executive', 'vip')),
  UNIQUE (layout_id, label),
  UNIQUE (layout_id, row_no, col_no)
);
CREATE TRIGGER bus_seats_append_only BEFORE UPDATE OR DELETE ON bus_seats
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

CREATE TABLE bus_schedules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id      uuid NOT NULL REFERENCES bus_routes (id),
  -- Copied from the route so every operator query is a single filter.
  operator_id   uuid NOT NULL REFERENCES bus_operators (id),
  layout_id     uuid NOT NULL REFERENCES bus_seat_layouts (id),
  departs_at    timestamptz NOT NULL,
  arrives_at    timestamptz NOT NULL,
  vehicle_plate text CHECK (vehicle_plate IS NULL OR vehicle_plate ~ '^[A-Z0-9]{5,10}$'),
  -- A departure is "departed" once its time has passed; only cancellation is stored.
  status        text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  cancel_reason text,
  cancelled_at  timestamptz,
  cancelled_by  uuid REFERENCES users (id),
  created_by    uuid REFERENCES users (id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bus_schedules_times CHECK (arrives_at > departs_at),
  CONSTRAINT bus_schedules_cancelled CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  -- The same route never departs twice at the same minute.
  UNIQUE (route_id, departs_at)
);
CREATE INDEX bus_schedules_departs_idx ON bus_schedules (departs_at) WHERE status = 'scheduled';
CREATE INDEX bus_schedules_operator_idx ON bus_schedules (operator_id, departs_at);
CREATE TRIGGER bus_schedules_set_updated_at BEFORE UPDATE ON bus_schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Fares by departure and seat class (set from the route's last fares by the portal).
CREATE TABLE bus_schedule_fares (
  schedule_id uuid NOT NULL REFERENCES bus_schedules (id),
  seat_class  text NOT NULL CHECK (seat_class IN ('standard', 'executive', 'vip')),
  fare_kobo   bigint NOT NULL CHECK (fare_kobo BETWEEN 10000 AND 100000000),
  PRIMARY KEY (schedule_id, seat_class)
);

-- --- Bookings and tickets --------------------------------------------------------

CREATE TABLE bus_bookings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Short code passengers quote to staff and operators.
  reference        text NOT NULL UNIQUE CHECK (reference ~ '^[A-Z0-9]{8}$'),
  passenger_id     uuid NOT NULL REFERENCES users (id),
  schedule_id      uuid NOT NULL REFERENCES bus_schedules (id),
  -- held: seats reserved until hold_expires_at while the passenger pays;
  -- confirmed: paid, tickets valid; expired: not paid in time; cancelled.
  status           text NOT NULL DEFAULT 'held'
                   CHECK (status IN ('held', 'confirmed', 'expired', 'cancelled')),
  hold_expires_at  timestamptz NOT NULL,
  -- Snapshot at booking: what the passenger pays and RideswithMe's share.
  total_kobo       bigint NOT NULL CHECK (total_kobo > 0),
  service_fee_kobo bigint NOT NULL CHECK (service_fee_kobo >= 0 AND service_fee_kobo <= total_kobo),
  service_fee_bps  integer NOT NULL,
  payment_method   text CHECK (payment_method IN ('wallet', 'card')),
  confirmed_at     timestamptz,
  cancelled_at     timestamptz,
  cancelled_by     text CHECK (cancelled_by IN ('passenger', 'operator', 'admin')),
  cancel_reason    text,
  refunded_kobo    bigint NOT NULL DEFAULT 0 CHECK (refunded_kobo >= 0 AND refunded_kobo <= total_kobo),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bus_bookings_confirmed CHECK (status <> 'confirmed' OR confirmed_at IS NOT NULL),
  CONSTRAINT bus_bookings_cancelled CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);
CREATE INDEX bus_bookings_passenger_idx ON bus_bookings (passenger_id, created_at DESC);
CREATE INDEX bus_bookings_schedule_idx ON bus_bookings (schedule_id);
CREATE INDEX bus_bookings_held_idx ON bus_bookings (hold_expires_at) WHERE status = 'held';
CREATE TRIGGER bus_bookings_set_updated_at BEFORE UPDATE ON bus_bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- One row per seat in a booking; when confirmed it is that seat's ticket.
CREATE TABLE bus_booking_seats (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     uuid NOT NULL REFERENCES bus_bookings (id),
  schedule_id    uuid NOT NULL REFERENCES bus_schedules (id),
  seat_id        uuid NOT NULL REFERENCES bus_seats (id),
  -- active: held or sold (follows the booking); released: free again.
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released')),
  passenger_name text NOT NULL CHECK (length(passenger_name) BETWEEN 2 AND 100),
  seat_class     text NOT NULL CHECK (seat_class IN ('standard', 'executive', 'vip')),
  fare_kobo      bigint NOT NULL CHECK (fare_kobo > 0),
  ticket_code    text NOT NULL UNIQUE CHECK (ticket_code ~ '^[A-Z0-9]{10}$'),
  checked_in_at  timestamptz,
  checked_in_by  uuid REFERENCES users (id),
  UNIQUE (booking_id, seat_id)
);
-- No seat can be held or sold twice on one departure (B-6: released seats can be sold again).
CREATE UNIQUE INDEX bus_booking_seats_one_active ON bus_booking_seats (schedule_id, seat_id)
  WHERE status = 'active';
CREATE INDEX bus_booking_seats_booking_idx ON bus_booking_seats (booking_id);

-- --- Money -----------------------------------------------------------------------

-- Each operator has a ledger account: what RideswithMe owes it for seats sold.
ALTER TABLE wallets
  ADD COLUMN operator_id uuid UNIQUE REFERENCES bus_operators (id),
  DROP CONSTRAINT wallets_kind_check,
  ADD CONSTRAINT wallets_kind_check CHECK (kind IN ('passenger', 'driver', 'system', 'bus_operator')),
  DROP CONSTRAINT wallets_owner,
  ADD CONSTRAINT wallets_owner CHECK ((kind IN ('passenger', 'driver')) = (owner_id IS NOT NULL)),
  ADD CONSTRAINT wallets_operator CHECK ((kind = 'bus_operator') = (operator_id IS NOT NULL));

ALTER TABLE payments
  ADD COLUMN bus_booking_id uuid REFERENCES bus_bookings (id),
  DROP CONSTRAINT payments_purpose_check,
  ADD CONSTRAINT payments_purpose_check
    CHECK (purpose IN ('ride_fare', 'cancellation_fee', 'wallet_topup', 'card_link', 'bus_booking')),
  ADD CONSTRAINT payments_bus_booking CHECK ((purpose = 'bus_booking') = (bus_booking_id IS NOT NULL));
CREATE INDEX payments_bus_booking_idx ON payments (bus_booking_id) WHERE bus_booking_id IS NOT NULL;

ALTER TABLE ledger_journals
  ADD COLUMN bus_booking_id uuid REFERENCES bus_bookings (id),
  ADD COLUMN bus_operator_id uuid REFERENCES bus_operators (id),
  DROP CONSTRAINT ledger_journals_kind_check,
  ADD CONSTRAINT ledger_journals_kind_check CHECK (kind IN (
    'wallet_topup', 'ride_hold', 'ride_hold_release', 'ride_settlement',
    'cash_commission', 'cancellation_fee', 'card_charge', 'outstanding_collection',
    'payout', 'payout_completed', 'payout_returned', 'refund', 'refund_completed',
    'refund_returned', 'chargeback', 'adjustment', 'opening_balance',
    'bus_booking', 'bus_refund', 'operator_settlement'));
CREATE INDEX ledger_journals_bus_booking_idx ON ledger_journals (bus_booking_id)
  WHERE bus_booking_id IS NOT NULL;

-- --- Roles and permissions -------------------------------------------------------

INSERT INTO roles (key, name, description, requires_mfa, is_privileged, is_system) VALUES
  ('bus_operator', 'Bus operator', 'Lists one bus operator''s routes, departures and seat maps.', true, false, true);

INSERT INTO permissions (key, description) VALUES
  ('buses.read',     'View bus operators, departures and bookings'),
  ('buses.manage',   'Create bus operators, set their fees, cancel departures and bookings, record settlements'),
  ('bus.operator',   'Use the portal for the bus operator one manages');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON
  (r.key = 'support_agent' AND p.key = 'buses.read') OR
  (r.key IN ('admin', 'super_admin') AND p.key IN ('buses.read', 'buses.manage')) OR
  (r.key = 'bus_operator' AND p.key = 'bus.operator');
