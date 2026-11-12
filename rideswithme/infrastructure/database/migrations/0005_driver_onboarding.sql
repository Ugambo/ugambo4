-- Drivers, vehicles and driver documents (Phase 2).

CREATE TABLE vehicle_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_]{1,30}$'),
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  -- Passenger seats offered to riders.
  seats       smallint NOT NULL CHECK (seats BETWEEN 1 AND 60),
  -- Disabled categories cannot be chosen by new drivers or booked by passengers.
  is_enabled  boolean NOT NULL DEFAULT false,
  sort_order  smallint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER vehicle_categories_set_updated_at BEFORE UPDATE ON vehicle_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Kinds of document a driver can upload. Data, not an enum, so new kinds
-- (e.g. a state permit) can be added without a schema change.
CREATE TABLE document_types (
  key             text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name            text NOT NULL,
  -- 'driver' documents belong to the person; 'vehicle' documents to their vehicle.
  scope           text NOT NULL CHECK (scope IN ('driver', 'vehicle')),
  -- 'photo' accepts JPEG/PNG; 'document' also accepts PDF.
  media           text NOT NULL CHECK (media IN ('photo', 'document')),
  requires_expiry boolean NOT NULL DEFAULT false,
  requires_number boolean NOT NULL DEFAULT false,
  sort_order      smallint NOT NULL DEFAULT 0
);

CREATE TABLE vehicle_category_document_requirements (
  vehicle_category_id uuid NOT NULL REFERENCES vehicle_categories (id) ON DELETE CASCADE,
  document_type       text NOT NULL REFERENCES document_types (key),
  PRIMARY KEY (vehicle_category_id, document_type)
);

CREATE TYPE driver_status AS ENUM ('onboarding', 'pending_review', 'approved', 'rejected', 'suspended');

CREATE TABLE driver_profiles (
  user_id                         uuid PRIMARY KEY REFERENCES users (id),
  status                          driver_status NOT NULL DEFAULT 'onboarding',
  -- National Identification Number: encrypted, plus a keyed hash to stop the
  -- same NIN registering twice, plus the last 4 digits for display.
  nin_encrypted                   text,
  nin_lookup_hash                 bytea UNIQUE,
  nin_last4                       text CHECK (nin_last4 IS NULL OR nin_last4 ~ '^\d{4}$'),
  payout_bank_code                text CHECK (payout_bank_code IS NULL OR payout_bank_code ~ '^\d{3,6}$'),
  payout_account_number_encrypted text,
  payout_account_last4            text CHECK (payout_account_last4 IS NULL OR payout_account_last4 ~ '^\d{4}$'),
  payout_account_name             text CHECK (payout_account_name IS NULL OR length(payout_account_name) BETWEEN 2 AND 100),
  submitted_at                    timestamptz,
  reviewed_at                     timestamptz,
  reviewed_by                     uuid REFERENCES users (id),
  rejection_reason                text,
  approved_at                     timestamptz,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driver_profiles_nin_complete CHECK (
    (nin_encrypted IS NULL) = (nin_lookup_hash IS NULL) AND (nin_encrypted IS NULL) = (nin_last4 IS NULL)),
  CONSTRAINT driver_profiles_payout_complete CHECK (
    (payout_account_number_encrypted IS NULL) = (payout_bank_code IS NULL)
    AND (payout_account_number_encrypted IS NULL) = (payout_account_last4 IS NULL)
    AND (payout_account_number_encrypted IS NULL) = (payout_account_name IS NULL)),
  CONSTRAINT driver_profiles_rejection_has_reason CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL),
  CONSTRAINT driver_profiles_approved_has_time CHECK (status <> 'approved' OR approved_at IS NOT NULL)
);
CREATE INDEX driver_profiles_status_idx ON driver_profiles (status, submitted_at);
CREATE TRIGGER driver_profiles_set_updated_at BEFORE UPDATE ON driver_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE vehicles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Null once fleets (Phase 6) can own vehicles without an assigned driver.
  driver_user_id      uuid REFERENCES driver_profiles (user_id),
  vehicle_category_id uuid NOT NULL REFERENCES vehicle_categories (id),
  -- Upper case, letters and digits only (e.g. ABC123DE).
  plate_number        text NOT NULL CHECK (plate_number ~ '^[A-Z0-9]{5,10}$'),
  make                text NOT NULL CHECK (length(make) BETWEEN 1 AND 40),
  model               text NOT NULL CHECK (length(model) BETWEEN 1 AND 40),
  colour              text NOT NULL CHECK (length(colour) BETWEEN 1 AND 40),
  year                smallint NOT NULL CHECK (year BETWEEN 1980 AND 2100),
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX vehicles_active_plate_key ON vehicles (plate_number) WHERE status = 'active';
CREATE UNIQUE INDEX vehicles_one_active_per_driver ON vehicles (driver_user_id) WHERE status = 'active';
CREATE TRIGGER vehicles_set_updated_at BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- An upload the API has authorised. Clients upload straight to private object
-- storage with a short-lived signed URL; they can only attach files they were
-- authorised to upload.
CREATE TABLE file_uploads (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id  uuid NOT NULL REFERENCES users (id),
  purpose        text NOT NULL CHECK (purpose IN ('driver_document')),
  object_key     text NOT NULL UNIQUE,
  content_type   text NOT NULL,
  declared_size  integer NOT NULL CHECK (declared_size > 0),
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at     timestamptz NOT NULL,
  completed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX file_uploads_owner_idx ON file_uploads (owner_user_id, created_at DESC);

CREATE TYPE document_status AS ENUM ('pending', 'approved', 'rejected', 'expired');

-- Every upload is a new row; history is kept. A driver's standing for a document
-- type comes from their latest row, and from whether any approved row is in date.
CREATE TABLE driver_documents (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_user_id            uuid NOT NULL REFERENCES driver_profiles (user_id),
  vehicle_id                uuid REFERENCES vehicles (id),
  document_type             text NOT NULL REFERENCES document_types (key),
  status                    document_status NOT NULL DEFAULT 'pending',
  file_upload_id            uuid NOT NULL UNIQUE REFERENCES file_uploads (id),
  object_key                text NOT NULL,
  content_type              text NOT NULL,
  size_bytes                integer NOT NULL CHECK (size_bytes > 0),
  document_number_encrypted text,
  document_number_last4     text,
  -- Last day the document is valid (inclusive), in Nigerian time.
  expires_on                date,
  reviewed_by               uuid REFERENCES users (id),
  reviewed_at               timestamptz,
  rejection_reason          text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driver_documents_rejection_has_reason CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL),
  CONSTRAINT driver_documents_reviewed CHECK (status = 'pending' OR reviewed_at IS NOT NULL OR status = 'expired')
);
CREATE INDEX driver_documents_driver_type_idx ON driver_documents (driver_user_id, document_type, created_at DESC);
CREATE INDEX driver_documents_pending_idx ON driver_documents (created_at) WHERE status = 'pending';
CREATE INDEX driver_documents_expiry_idx ON driver_documents (expires_on) WHERE status = 'approved' AND expires_on IS NOT NULL;
CREATE TRIGGER driver_documents_set_updated_at BEFORE UPDATE ON driver_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Reference data ------------------------------------------------------------

INSERT INTO vehicle_categories (key, name, description, seats, is_enabled, sort_order) VALUES
  ('car',        'Car',        'Private car, up to 4 passengers.',    4, true,  10),
  ('keke_napep', 'Keke Napep', 'Tricycle, up to 3 passengers.',       3, true,  20),
  ('taxi',       'Taxi',       'Licensed taxi, up to 4 passengers.',  4, false, 30),
  ('motorcycle', 'Motorcycle', 'Motorcycle, 1 passenger.',            1, false, 40);

INSERT INTO document_types (key, name, scope, media, requires_expiry, requires_number, sort_order) VALUES
  ('profile_photo',              'Profile photo',                  'driver',  'photo',    false, false, 10),
  ('national_id',                'National ID (NIN slip or card)', 'driver',  'document', false, false, 20),
  ('drivers_licence',            'Driver''s licence',              'driver',  'document', true,  true,  30),
  ('vehicle_registration',       'Vehicle licence / registration', 'vehicle', 'document', true,  false, 40),
  ('vehicle_photo_front',        'Vehicle photo: front',           'vehicle', 'photo',    false, false, 50),
  ('vehicle_photo_rear',         'Vehicle photo: back',            'vehicle', 'photo',    false, false, 60),
  ('vehicle_photo_interior',     'Vehicle photo: inside',          'vehicle', 'photo',    false, false, 70),
  ('insurance_certificate',      'Insurance certificate',          'vehicle', 'document', true,  false, 80),
  ('roadworthiness_certificate', 'Roadworthiness certificate',     'vehicle', 'document', true,  false, 90),
  ('operating_permit',           'Operating permit',               'vehicle', 'document', true,  false, 100);

-- Default requirements; admins will edit these in Phase 6.
INSERT INTO vehicle_category_document_requirements (vehicle_category_id, document_type)
SELECT c.id, d.key
FROM vehicle_categories c
JOIN document_types d ON
  d.key IN ('profile_photo', 'national_id', 'drivers_licence', 'vehicle_registration',
            'vehicle_photo_front', 'vehicle_photo_rear', 'insurance_certificate')
  OR (c.key IN ('car', 'taxi') AND d.key IN ('vehicle_photo_interior', 'roadworthiness_certificate'))
  OR (c.key IN ('taxi', 'keke_napep', 'motorcycle') AND d.key = 'operating_permit');

INSERT INTO permissions (key, description) VALUES
  ('drivers.read',           'View driver applications and profiles'),
  ('drivers.documents_view', 'Open driver documents (each view is audited)'),
  ('drivers.verify',         'Approve or reject driver documents and applications');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON
  (r.key = 'support_agent' AND p.key IN ('drivers.read')) OR
  (r.key IN ('admin', 'super_admin') AND p.key IN ('drivers.read', 'drivers.documents_view', 'drivers.verify'));
