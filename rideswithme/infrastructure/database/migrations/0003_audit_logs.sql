-- Operations domain (partial): audit_logs is needed from Phase 1 because role
-- changes and suspensions are admin actions. Append-only.
CREATE TABLE audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Users are anonymised, never hard-deleted, so this reference always resolves.
  actor_user_id uuid REFERENCES users (id),
  actor_type    text NOT NULL CHECK (actor_type IN ('user', 'system')),
  action        text NOT NULL CHECK (action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  target_type   text,
  target_id     uuid,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip            inet,
  user_agent    text,
  request_id    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_user_actor CHECK (actor_type = 'system' OR actor_user_id IS NOT NULL)
);
CREATE INDEX audit_logs_created_at_idx ON audit_logs (created_at DESC, id DESC);
CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_user_id, created_at DESC);
CREATE INDEX audit_logs_target_idx ON audit_logs (target_id, created_at DESC);

CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
