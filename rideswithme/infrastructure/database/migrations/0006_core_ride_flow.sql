-- Core ride flow (Phase 3): service areas, pricing, quotes, rides, offers,
-- ride events, cash payments, commissions, saved places, idempotency keys.
-- Money is bigint kobo everywhere.

CREATE TABLE service_areas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key        text NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_-]{1,40}$'),
  name       text NOT NULL,
  boundary   geography(MultiPolygon, 4326) NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_areas_boundary_idx ON service_areas USING gist (boundary);
CREATE TRIGGER service_areas_set_updated_at BEFORE UPDATE ON service_areas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- One active rule per (area, vehicle category). Changes insert a new row and
-- deactivate the old one, so history is kept and rides keep their snapshot.
CREATE TABLE fare_rules (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_area_id            uuid NOT NULL REFERENCES service_areas (id),
  vehicle_category_id        uuid NOT NULL REFERENCES vehicle_categories (id),
  base_fare_kobo             bigint NOT NULL CHECK (base_fare_kobo >= 0),
  per_km_kobo                bigint NOT NULL CHECK (per_km_kobo >= 0),
  per_minute_kobo            bigint NOT NULL CHECK (per_minute_kobo >= 0),
  minimum_fare_kobo          bigint NOT NULL CHECK (minimum_fare_kobo >= 0),
  booking_fee_kobo           bigint NOT NULL DEFAULT 0 CHECK (booking_fee_kobo >= 0),
  cancellation_fee_kobo      bigint NOT NULL DEFAULT 0 CHECK (cancellation_fee_kobo >= 0),
  cancellation_grace_seconds integer NOT NULL DEFAULT 120 CHECK (cancellation_grace_seconds >= 0),
  waiting_free_minutes       integer NOT NULL DEFAULT 3 CHECK (waiting_free_minutes >= 0),
  waiting_per_minute_kobo    bigint NOT NULL DEFAULT 0 CHECK (waiting_per_minute_kobo >= 0),
  commission_bps             integer NOT NULL CHECK (commission_bps BETWEEN 0 AND 5000),
  rounding_increment_kobo    bigint NOT NULL DEFAULT 5000 CHECK (rounding_increment_kobo > 0),
  -- [{ "days": [1..7] (Mon=1), "start": "07:00", "end": "09:30", "multiplierBps": 12000 }], Nigerian time.
  peak_windows               jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active                  boolean NOT NULL DEFAULT true,
  created_by                 uuid REFERENCES users (id),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fare_rules_minimum_covers_base CHECK (minimum_fare_kobo >= base_fare_kobo)
);
CREATE UNIQUE INDEX fare_rules_one_active ON fare_rules (service_area_id, vehicle_category_id) WHERE is_active;

-- A price shown to a passenger. Booking copies it into the ride (the snapshot),
-- so later price changes never alter a confirmed ride.
CREATE TABLE fare_quotes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id        uuid NOT NULL REFERENCES users (id),
  service_area_id     uuid NOT NULL REFERENCES service_areas (id),
  vehicle_category_id uuid NOT NULL REFERENCES vehicle_categories (id),
  fare_rule_id        uuid NOT NULL REFERENCES fare_rules (id),
  pickup              geography(Point, 4326) NOT NULL,
  pickup_address      text NOT NULL,
  dropoff             geography(Point, 4326) NOT NULL,
  dropoff_address     text NOT NULL,
  distance_meters     integer NOT NULL CHECK (distance_meters >= 0),
  duration_seconds    integer NOT NULL CHECK (duration_seconds >= 0),
  route_polyline      text,
  breakdown           jsonb NOT NULL,
  total_kobo          bigint NOT NULL CHECK (total_kobo >= 0),
  expires_at          timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fare_quotes_passenger_idx ON fare_quotes (passenger_id, created_at DESC);

CREATE TYPE ride_status AS ENUM (
  'requested', 'searching', 'driver_assigned', 'driver_arrived', 'in_progress', 'completed',
  'cancelled_by_passenger', 'cancelled_by_driver', 'no_driver_found');

CREATE TABLE rides (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id          uuid NOT NULL REFERENCES users (id),
  driver_id             uuid REFERENCES driver_profiles (user_id),
  vehicle_id            uuid REFERENCES vehicles (id),
  vehicle_category_id   uuid NOT NULL REFERENCES vehicle_categories (id),
  service_area_id       uuid NOT NULL REFERENCES service_areas (id),
  fare_quote_id         uuid NOT NULL UNIQUE REFERENCES fare_quotes (id),
  status                ride_status NOT NULL DEFAULT 'requested',
  pickup                geography(Point, 4326) NOT NULL,
  pickup_address        text NOT NULL,
  dropoff               geography(Point, 4326) NOT NULL,
  dropoff_address       text NOT NULL,
  scheduled_for         timestamptz,
  -- Everything needed to price, charge and pay out this ride, frozen at booking.
  fare_snapshot         jsonb NOT NULL,
  quoted_total_kobo     bigint NOT NULL CHECK (quoted_total_kobo >= 0),
  waiting_charge_kobo   bigint NOT NULL DEFAULT 0 CHECK (waiting_charge_kobo >= 0),
  final_total_kobo      bigint CHECK (final_total_kobo >= 0),
  commission_kobo       bigint CHECK (commission_kobo >= 0),
  cancellation_fee_kobo bigint NOT NULL DEFAULT 0 CHECK (cancellation_fee_kobo >= 0),
  payment_method        text NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'wallet', 'card')),
  search_started_at     timestamptz,
  search_deadline       timestamptz,
  search_radius_meters  integer NOT NULL DEFAULT 3000,
  requested_at          timestamptz NOT NULL DEFAULT now(),
  assigned_at           timestamptz,
  arrived_at            timestamptz,
  started_at            timestamptz,
  completed_at          timestamptz,
  cancelled_at          timestamptz,
  cancellation_reason   text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rides_driver_when_assigned CHECK (
    status IN ('requested', 'searching', 'no_driver_found', 'cancelled_by_passenger') OR driver_id IS NOT NULL),
  CONSTRAINT rides_completed_has_fare CHECK (status <> 'completed' OR (final_total_kobo IS NOT NULL AND commission_kobo IS NOT NULL))
);
-- A passenger has at most one ride in progress; a driver at most one assigned ride.
CREATE UNIQUE INDEX rides_one_active_per_passenger ON rides (passenger_id)
  WHERE status IN ('requested', 'searching', 'driver_assigned', 'driver_arrived', 'in_progress') AND scheduled_for IS NULL;
CREATE UNIQUE INDEX rides_one_active_per_driver ON rides (driver_id)
  WHERE status IN ('driver_assigned', 'driver_arrived', 'in_progress');
CREATE INDEX rides_passenger_idx ON rides (passenger_id, created_at DESC);
CREATE INDEX rides_driver_idx ON rides (driver_id, created_at DESC);
CREATE INDEX rides_searching_idx ON rides (search_started_at) WHERE status = 'searching';
CREATE INDEX rides_scheduled_idx ON rides (scheduled_for) WHERE status = 'requested';
CREATE TRIGGER rides_set_updated_at BEFORE UPDATE ON rides
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Offers of a ride to drivers, one at a time, each with a countdown.
CREATE TABLE ride_requests (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id                 uuid NOT NULL REFERENCES rides (id),
  driver_id               uuid NOT NULL REFERENCES driver_profiles (user_id),
  status                  text NOT NULL DEFAULT 'offered'
                            CHECK (status IN ('offered', 'accepted', 'rejected', 'expired', 'withdrawn')),
  distance_to_pickup_meters integer NOT NULL,
  offered_at              timestamptz NOT NULL DEFAULT now(),
  expires_at              timestamptz NOT NULL,
  responded_at            timestamptz,
  UNIQUE (ride_id, driver_id)
);
-- A driver sees one offer at a time.
CREATE UNIQUE INDEX ride_requests_one_open_per_driver ON ride_requests (driver_id) WHERE status = 'offered';
CREATE INDEX ride_requests_open_idx ON ride_requests (expires_at) WHERE status = 'offered';
CREATE INDEX ride_requests_ride_idx ON ride_requests (ride_id);

-- Every state change of a ride, append-only.
CREATE TABLE ride_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Strict order of events, even several in one transaction (same now()).
  seq         bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  ride_id     uuid NOT NULL REFERENCES rides (id),
  event_type  text NOT NULL,
  from_status ride_status,
  to_status   ride_status,
  actor_type  text NOT NULL CHECK (actor_type IN ('passenger', 'driver', 'admin', 'system')),
  actor_id    uuid REFERENCES users (id),
  location    geography(Point, 4326),
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ride_events_ride_idx ON ride_events (ride_id, seq);
CREATE TRIGGER ride_events_append_only BEFORE UPDATE OR DELETE ON ride_events
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

CREATE TABLE payments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id      uuid NOT NULL REFERENCES rides (id),
  payer_id     uuid NOT NULL REFERENCES users (id),
  method       text NOT NULL CHECK (method IN ('cash', 'wallet', 'card')),
  purpose      text NOT NULL CHECK (purpose IN ('ride_fare', 'cancellation_fee')),
  amount_kobo  bigint NOT NULL CHECK (amount_kobo > 0),
  status       text NOT NULL CHECK (status IN ('pending', 'collected', 'outstanding', 'failed')),
  collected_by uuid REFERENCES users (id),
  collected_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ride_id, purpose)
);

-- Platform commission owed per ride. For cash rides the driver holds the money,
-- so Phase 5 settles these into the driver's wallet ledger.
CREATE TABLE commissions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id          uuid NOT NULL UNIQUE REFERENCES rides (id),
  driver_id        uuid NOT NULL REFERENCES driver_profiles (user_id),
  fare_kobo        bigint NOT NULL CHECK (fare_kobo >= 0),
  booking_fee_kobo bigint NOT NULL CHECK (booking_fee_kobo >= 0),
  commission_bps   integer NOT NULL,
  commission_kobo  bigint NOT NULL CHECK (commission_kobo >= 0),
  status           text NOT NULL DEFAULT 'pending_settlement' CHECK (status IN ('pending_settlement', 'settled', 'waived')),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commissions_driver_idx ON commissions (driver_id, created_at DESC);

CREATE TABLE saved_places (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  label      text NOT NULL CHECK (label IN ('home', 'work', 'other')),
  name       text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  address    text NOT NULL CHECK (length(address) BETWEEN 1 AND 300),
  location   geography(Point, 4326) NOT NULL,
  place_id   text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX saved_places_one_home_work ON saved_places (user_id, label) WHERE label IN ('home', 'work');
CREATE INDEX saved_places_user_idx ON saved_places (user_id);

-- Makes create requests safe to retry: the same key returns the first response.
CREATE TABLE idempotency_keys (
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key             text NOT NULL CHECK (length(key) BETWEEN 8 AND 128),
  scope           text NOT NULL,
  request_hash    text NOT NULL,
  status          text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  response_status integer,
  response_body   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
CREATE INDEX idempotency_keys_created_idx ON idempotency_keys (created_at);

INSERT INTO permissions (key, description) VALUES
  ('rides.read',             'View rides and their event timelines'),
  ('service_areas.manage',   'Create and edit service areas'),
  ('pricing.manage',         'Change fare rules');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON
  (r.key = 'support_agent' AND p.key = 'rides.read') OR
  (r.key = 'admin' AND p.key = 'rides.read') OR
  (r.key = 'super_admin' AND p.key IN ('rides.read', 'service_areas.manage', 'pricing.manage'));
