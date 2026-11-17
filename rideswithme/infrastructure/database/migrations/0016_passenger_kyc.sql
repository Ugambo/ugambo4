-- Passenger details and identity checks (KYC). After their first sign-in a
-- passenger gives their name, gender, date of birth and an emergency contact
-- (texted when they press SOS), then their NIN, a photo of an ID and a selfie,
-- which staff review. Bookings wait for approval while PASSENGER_KYC_REQUIRED
-- is on (DECISIONS D-083).

CREATE TYPE gender AS ENUM ('female', 'male');

ALTER TABLE users
  ADD COLUMN gender gender,
  ADD COLUMN date_of_birth date CHECK (date_of_birth IS NULL OR date_of_birth >= DATE '1900-01-01'),
  ADD COLUMN emergency_contact_name text
    CHECK (emergency_contact_name IS NULL OR length(emergency_contact_name) BETWEEN 2 AND 80),
  ADD COLUMN emergency_contact_phone text
    CHECK (emergency_contact_phone IS NULL OR emergency_contact_phone ~ '^\+[1-9][0-9]{7,14}$');

ALTER TABLE file_uploads DROP CONSTRAINT file_uploads_purpose_check;
ALTER TABLE file_uploads ADD CONSTRAINT file_uploads_purpose_check
  CHECK (purpose IN ('driver_document', 'passenger_kyc'));

-- One current check per passenger; a new submission after a rejection replaces it.
CREATE TABLE passenger_verifications (
  user_id             uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  id_type             text NOT NULL
                      CHECK (id_type IN ('nin_slip', 'national_id_card', 'drivers_licence', 'voters_card', 'passport')),
  -- NIN encrypted by the application, a keyed hash to stop one NIN verifying two
  -- accounts, and the last 4 digits for staff.
  nin_encrypted       text NOT NULL,
  nin_lookup_hash     bytea NOT NULL,
  nin_last4           text NOT NULL CHECK (nin_last4 ~ '^\d{4}$'),
  id_object_key       text NOT NULL,
  id_content_type     text NOT NULL,
  selfie_object_key   text NOT NULL,
  selfie_content_type text NOT NULL,
  submitted_at        timestamptz NOT NULL DEFAULT now(),
  reviewed_at         timestamptz,
  reviewed_by         uuid REFERENCES users (id) ON DELETE SET NULL,
  rejection_reason    text CHECK (rejection_reason IS NULL OR length(rejection_reason) <= 500),
  CONSTRAINT passenger_verifications_rejection_has_reason
    CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL)
);
CREATE UNIQUE INDEX passenger_verifications_nin_key
  ON passenger_verifications (nin_lookup_hash) WHERE status <> 'rejected';
CREATE INDEX passenger_verifications_queue_idx ON passenger_verifications (status, submitted_at);

INSERT INTO permissions (key, description) VALUES
  ('passengers.verify', 'Review passenger identity checks (see ID photos and selfies)');
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON
  r.key IN ('admin', 'super_admin') AND p.key = 'passengers.verify';
