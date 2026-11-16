-- Phase 8: safety (SOS, trip sharing, incident reports, ride messages),
-- engagement (ratings, promotions), operations (support tickets, notifications,
-- push tokens) and NDPA account deletion requests.

-- --- SOS -------------------------------------------------------------------------

CREATE TABLE emergency_alerts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users (id),
  raised_as            text NOT NULL CHECK (raised_as IN ('passenger', 'driver')),
  ride_id              uuid REFERENCES rides (id),
  status               text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  -- Where the person was: from their phone, or the driver's last live position.
  location             geography(Point, 4326),
  location_source      text CHECK (location_source IN ('device', 'driver_position')),
  location_recorded_at timestamptz,
  note                 text CHECK (length(note) <= 500),
  acknowledged_by      uuid REFERENCES users (id),
  acknowledged_at      timestamptz,
  resolved_by          uuid REFERENCES users (id),
  resolved_at          timestamptz,
  resolution_note      text CHECK (length(resolution_note) <= 1000),
  -- Each later press while open updates the location and counts here.
  presses              integer NOT NULL DEFAULT 1,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT emergency_alerts_resolved CHECK ((status = 'resolved') = (resolved_at IS NOT NULL))
);
CREATE INDEX emergency_alerts_open_idx ON emergency_alerts (created_at) WHERE status <> 'resolved';
CREATE INDEX emergency_alerts_user_idx ON emergency_alerts (user_id, created_at DESC);
CREATE TRIGGER emergency_alerts_set_updated_at BEFORE UPDATE ON emergency_alerts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --- Trip sharing ----------------------------------------------------------------

-- A link anyone can open to follow one ride. Only a hash of the token is stored.
CREATE TABLE trip_shares (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id    uuid NOT NULL REFERENCES rides (id),
  created_by uuid NOT NULL REFERENCES users (id),
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX trip_shares_ride_idx ON trip_shares (ride_id);

-- --- Messages between passenger and driver -----------------------------------------

CREATE TABLE ride_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id    uuid NOT NULL REFERENCES rides (id),
  sender_id  uuid NOT NULL REFERENCES users (id),
  sender_role text NOT NULL CHECK (sender_role IN ('passenger', 'driver')),
  body       text NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ride_messages_ride_idx ON ride_messages (ride_id, created_at);

-- --- Incident reports --------------------------------------------------------------

CREATE TABLE incident_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     uuid NOT NULL REFERENCES users (id),
  reported_as     text NOT NULL CHECK (reported_as IN ('passenger', 'driver')),
  ride_id         uuid REFERENCES rides (id),
  category        text NOT NULL CHECK (category IN
                    ('safety', 'accident', 'harassment', 'dangerous_driving', 'lost_item', 'vehicle', 'other')),
  priority        text NOT NULL CHECK (priority IN ('high', 'normal')),
  description     text NOT NULL CHECK (length(description) BETWEEN 5 AND 2000),
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved')),
  assigned_to     uuid REFERENCES users (id),
  resolution_note text CHECK (length(resolution_note) <= 2000),
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX incident_reports_open_idx ON incident_reports (priority, created_at) WHERE status <> 'resolved';
CREATE INDEX incident_reports_reporter_idx ON incident_reports (reporter_id, created_at DESC);
CREATE TRIGGER incident_reports_set_updated_at BEFORE UPDATE ON incident_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --- Ratings -----------------------------------------------------------------------

-- One rating per ride and direction (passenger rates driver; driver rates passenger).
-- "Reviews" are the optional comment and tags.
CREATE TABLE ratings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id    uuid NOT NULL REFERENCES rides (id),
  rater_id   uuid NOT NULL REFERENCES users (id),
  ratee_id   uuid NOT NULL REFERENCES users (id),
  rated_role text NOT NULL CHECK (rated_role IN ('driver', 'passenger')),
  stars      smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  tags       text[] NOT NULL DEFAULT '{}',
  comment    text CHECK (length(comment) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ride_id, rated_role)
);
CREATE INDEX ratings_ratee_idx ON ratings (ratee_id, rated_role, created_at DESC);

-- Running totals, kept in the same transaction as each rating.
ALTER TABLE users
  ADD COLUMN rating_as_driver_sum      integer NOT NULL DEFAULT 0,
  ADD COLUMN rating_as_driver_count    integer NOT NULL DEFAULT 0,
  ADD COLUMN rating_as_passenger_sum   integer NOT NULL DEFAULT 0,
  ADD COLUMN rating_as_passenger_count integer NOT NULL DEFAULT 0;

-- --- Promotions --------------------------------------------------------------------

CREATE TABLE promotions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 text NOT NULL CHECK (code ~ '^[A-Z0-9]{4,20}$'),
  description          text NOT NULL CHECK (length(description) BETWEEN 3 AND 200),
  discount_type        text NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  percent_bps          integer CHECK (percent_bps BETWEEN 1 AND 10000),
  amount_kobo          bigint CHECK (amount_kobo > 0),
  max_discount_kobo    bigint CHECK (max_discount_kobo > 0),
  min_fare_kobo        bigint NOT NULL DEFAULT 0 CHECK (min_fare_kobo >= 0),
  -- Vehicle category keys it applies to; empty = all.
  category_keys        text[] NOT NULL DEFAULT '{}',
  first_ride_only      boolean NOT NULL DEFAULT false,
  per_user_limit       integer NOT NULL DEFAULT 1 CHECK (per_user_limit >= 1),
  max_redemptions      integer CHECK (max_redemptions >= 1),
  starts_at            timestamptz NOT NULL,
  ends_at              timestamptz NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  created_by           uuid REFERENCES users (id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotions_window CHECK (ends_at > starts_at),
  CONSTRAINT promotions_amount CHECK (
    (discount_type = 'percent' AND percent_bps IS NOT NULL AND amount_kobo IS NULL)
    OR (discount_type = 'fixed' AND amount_kobo IS NOT NULL AND percent_bps IS NULL))
);
CREATE UNIQUE INDEX promotions_code_key ON promotions (code);
CREATE TRIGGER promotions_set_updated_at BEFORE UPDATE ON promotions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A promotion used on a ride: reserved at booking, used at completion, released if the ride ends otherwise.
CREATE TABLE promotion_redemptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id  uuid NOT NULL REFERENCES promotions (id),
  user_id       uuid NOT NULL REFERENCES users (id),
  ride_id       uuid NOT NULL UNIQUE REFERENCES rides (id),
  discount_kobo bigint NOT NULL CHECK (discount_kobo > 0),
  status        text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'used', 'released')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX promotion_redemptions_counting_idx ON promotion_redemptions (promotion_id, user_id)
  WHERE status IN ('reserved', 'used');
CREATE TRIGGER promotion_redemptions_set_updated_at BEFORE UPDATE ON promotion_redemptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The discount the passenger does not pay; the driver is paid on the full fare.
ALTER TABLE rides
  ADD COLUMN discount_kobo bigint NOT NULL DEFAULT 0 CHECK (discount_kobo >= 0);

-- Discounts are a platform expense, kept in their own ledger account.
CREATE OR REPLACE FUNCTION ensure_system_wallets() RETURNS void LANGUAGE sql AS $$
  INSERT INTO wallets (kind, system_key, normal_side) VALUES
    ('system', 'paystack_balance',      'debit'),
    ('system', 'passenger_receivables', 'debit'),
    ('system', 'provider_fees',         'debit'),
    ('system', 'platform_revenue',      'credit'),
    ('system', 'ride_holds',            'credit'),
    ('system', 'payouts_in_transit',    'credit'),
    ('system', 'refunds_in_transit',    'credit'),
    ('system', 'promotions',            'debit')    -- discounts given to passengers
  ON CONFLICT (system_key) DO NOTHING
$$;
SELECT ensure_system_wallets();

-- --- Support tickets ---------------------------------------------------------------

CREATE TABLE support_tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users (id),
  category        text NOT NULL CHECK (category IN ('payment', 'ride', 'bus', 'account', 'driver', 'other')),
  subject         text NOT NULL CHECK (length(subject) BETWEEN 3 AND 120),
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'waiting_on_user', 'resolved')),
  ride_id         uuid REFERENCES rides (id),
  bus_booking_id  uuid REFERENCES bus_bookings (id),
  assigned_to     uuid REFERENCES users (id),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_tickets_queue_idx ON support_tickets (status, last_message_at);
CREATE INDEX support_tickets_user_idx ON support_tickets (user_id, created_at DESC);
CREATE TRIGGER support_tickets_set_updated_at BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE support_ticket_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES support_tickets (id),
  author_id   uuid NOT NULL REFERENCES users (id),
  from_staff  boolean NOT NULL,
  body        text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_ticket_messages_ticket_idx ON support_ticket_messages (ticket_id, created_at);

-- --- Notifications ------------------------------------------------------------------

CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id),
  kind       text NOT NULL CHECK (length(kind) <= 60),
  title      text NOT NULL,
  body       text NOT NULL,
  -- What to open (e.g. { "rideId": ... }); never personal data of others.
  data       jsonb NOT NULL DEFAULT '{}',
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

CREATE TABLE push_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id),
  token        text NOT NULL UNIQUE CHECK (length(token) <= 300),
  app          text NOT NULL CHECK (app IN ('passenger', 'driver')),
  platform     text NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_tokens_user_idx ON push_tokens (user_id);

-- --- Account deletion (NDPA) ----------------------------------------------------------

CREATE TABLE account_deletion_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users (id),
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'cancelled', 'blocked', 'completed')),
  reason        text CHECK (length(reason) <= 500),
  -- Carried out from this time (a grace period to change one's mind).
  scheduled_for timestamptz NOT NULL,
  -- Why it could not be carried out yet (money owed, an active trip...).
  blocked_reason text,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX account_deletion_one_open ON account_deletion_requests (user_id)
  WHERE status IN ('pending', 'blocked');
CREATE TRIGGER account_deletion_requests_set_updated_at BEFORE UPDATE ON account_deletion_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --- Permissions -----------------------------------------------------------------------

INSERT INTO permissions (key, description) VALUES
  ('safety.read',       'See SOS alerts and incident reports'),
  ('safety.manage',     'Acknowledge and resolve SOS alerts and incident reports'),
  ('support.read',      'See support tickets'),
  ('support.manage',    'Reply to and resolve support tickets'),
  ('promotions.manage', 'Create and change promotions'),
  ('privacy.manage',    'See and process account deletion requests');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON
  (r.key = 'support_agent' AND p.key IN ('safety.read', 'safety.manage', 'support.read', 'support.manage')) OR
  (r.key IN ('admin', 'super_admin') AND p.key IN
     ('safety.read', 'safety.manage', 'support.read', 'support.manage', 'promotions.manage')) OR
  (r.key = 'super_admin' AND p.key = 'privacy.manage');
