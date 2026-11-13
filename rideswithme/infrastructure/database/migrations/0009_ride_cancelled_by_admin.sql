-- migrate:no-transaction
-- Staff can stop a ride that is stuck (Phase 6). A new value cannot be used in
-- the transaction that adds it, so it gets its own migration.
ALTER TYPE ride_status ADD VALUE IF NOT EXISTS 'cancelled_by_admin';
