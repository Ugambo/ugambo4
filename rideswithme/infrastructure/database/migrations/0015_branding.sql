-- The system's logo, uploaded by a super admin on the Settings page and shown
-- on the websites and inside the phone apps. Kept in the database (it is
-- small: the dashboard shrinks it to at most 512 x 512 before upload) so every
-- API instance serves the same file. No row: the built-in "R" mark.
CREATE TABLE branding_assets (
  key          text PRIMARY KEY CHECK (key IN ('logo')),
  content_type text NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp')),
  data         bytea NOT NULL CHECK (octet_length(data) BETWEEN 1 AND 100000),
  -- Short hash of the file: the version in its address, so browsers fetch a new logo at once.
  version      text NOT NULL,
  updated_by   uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
