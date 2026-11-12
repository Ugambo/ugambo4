-- Identity domain: users, roles, permissions, sessions, consents.

CREATE TYPE user_status AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE app_language AS ENUM ('en', 'ha');
CREATE TYPE device_platform AS ENUM ('ios', 'android', 'web', 'unknown');

CREATE TABLE users (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- E.164. Cleared (NULL) when an account is deleted under an NDPA erasure request.
  phone_e164             text CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  phone_verified_at      timestamptz,
  email                  citext CHECK (email IS NULL OR length(email) <= 254),
  email_verified_at      timestamptz,
  full_name              text CHECK (full_name IS NULL OR length(full_name) BETWEEN 1 AND 120),
  preferred_language     app_language NOT NULL DEFAULT 'en',
  status                 user_status NOT NULL DEFAULT 'active',
  suspended_reason       text,
  -- TOTP secret encrypted by the application (AES-256-GCM); never stored in plain text.
  totp_secret_encrypted  text,
  totp_enabled_at        timestamptz,
  -- Last accepted TOTP time step, so a code cannot be replayed.
  totp_last_used_step    bigint,
  last_login_at          timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz,
  CONSTRAINT users_phone_required_unless_deleted
    CHECK (phone_e164 IS NOT NULL OR status = 'deleted'),
  CONSTRAINT users_totp_enabled_has_secret
    CHECK (totp_enabled_at IS NULL OR totp_secret_encrypted IS NOT NULL)
);
CREATE UNIQUE INDEX users_phone_e164_key ON users (phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE UNIQUE INDEX users_email_key ON users (email) WHERE email IS NOT NULL;
CREATE INDEX users_created_at_idx ON users (created_at DESC, id DESC);
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE roles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_]{1,49}$'),
  name          text NOT NULL,
  description   text NOT NULL DEFAULT '',
  -- Holders of this role must pass TOTP before using any permission.
  requires_mfa  boolean NOT NULL DEFAULT false,
  -- Assigning or removing this role needs roles.assign_privileged.
  is_privileged boolean NOT NULL DEFAULT false,
  -- System roles are created by migrations and cannot be deleted from the admin UI.
  is_system     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER roles_set_updated_at BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  description text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE role_permissions (
  role_id       uuid NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);
CREATE INDEX role_permissions_permission_idx ON role_permissions (permission_id);

CREATE TABLE user_roles (
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role_id    uuid NOT NULL REFERENCES roles (id) ON DELETE RESTRICT,
  granted_by uuid REFERENCES users (id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);
CREATE INDEX user_roles_role_idx ON user_roles (role_id);

-- One row per signed-in device. The refresh token itself is never stored, only
-- its SHA-256 hash. Rotation keeps the previous hash so reuse can be detected.
CREATE TABLE user_sessions (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  refresh_token_hash          bytea NOT NULL,
  previous_refresh_token_hash bytea,
  rotated_at                  timestamptz,
  rotation_count              integer NOT NULL DEFAULT 0,
  device_name                 text CHECK (device_name IS NULL OR length(device_name) <= 100),
  platform                    device_platform NOT NULL DEFAULT 'unknown',
  ip                          inet,
  user_agent                  text CHECK (user_agent IS NULL OR length(user_agent) <= 512),
  mfa_verified_at             timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  last_used_at                timestamptz NOT NULL DEFAULT now(),
  idle_expires_at             timestamptz NOT NULL,
  absolute_expires_at         timestamptz NOT NULL,
  revoked_at                  timestamptz,
  revoked_reason              text CHECK (revoked_reason IS NULL OR revoked_reason IN (
                                'logout', 'revoked_by_user', 'revoked_by_admin', 'refresh_token_reuse',
                                'account_suspended', 'account_deleted', 'mfa_reset'))
);
CREATE INDEX user_sessions_user_active_idx ON user_sessions (user_id) WHERE revoked_at IS NULL;

-- Consent records for the Nigeria Data Protection Act. Append a new row for each
-- policy version accepted; set withdrawn_at to record withdrawal.
CREATE TABLE user_consents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  consent_type text NOT NULL CHECK (consent_type IN ('terms_and_privacy', 'marketing')),
  version      text NOT NULL CHECK (length(version) BETWEEN 1 AND 32),
  granted_at   timestamptz NOT NULL DEFAULT now(),
  ip           inet,
  user_agent   text,
  withdrawn_at timestamptz,
  UNIQUE (user_id, consent_type, version)
);
