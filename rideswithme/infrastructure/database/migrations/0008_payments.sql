-- Payments (Phase 5): a double-entry ledger for wallets, Paystack charges,
-- saved cards, driver payouts, refunds and disputes. Money is bigint kobo.
--
-- Ledger rules, enforced here rather than trusted to application code:
--   * Every journal's lines (wallet_transactions) sum to zero: debits are
--     positive amounts, credits negative.
--   * Lines can only be added in the transaction that created their journal,
--     and neither journals nor lines can be changed or deleted.
--   * A wallet's balance is maintained only by the trigger that inserts a line,
--     never by an UPDATE, and wallets with a minimum balance (passenger
--     wallets: zero) can never go below it, however many requests race.

-- --- Accounts -----------------------------------------------------------------

CREATE TABLE wallets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Passenger and driver wallets belong to a user; system accounts to nobody.
  owner_id         uuid REFERENCES users (id),
  kind             text NOT NULL CHECK (kind IN ('passenger', 'driver', 'system')),
  system_key       text UNIQUE,
  -- Assets and expenses grow with debits; wallets, revenue and money in transit with credits.
  normal_side      text NOT NULL CHECK (normal_side IN ('debit', 'credit')),
  currency         text NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  -- Balance in the account's normal direction (a passenger's spendable money
  -- is positive). Written only by wallet_transactions_post().
  balance_kobo     bigint NOT NULL DEFAULT 0,
  -- NULL: may go negative (system accounts, driver wallets carrying commission owed).
  min_balance_kobo bigint,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallets_owner CHECK ((kind = 'system') = (owner_id IS NULL)),
  CONSTRAINT wallets_system_key CHECK ((kind = 'system') = (system_key IS NOT NULL)),
  CONSTRAINT wallets_user_side CHECK (kind = 'system' OR normal_side = 'credit'),
  UNIQUE (owner_id, kind)
);

CREATE FUNCTION wallets_guard_balance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.balance_kobo IS DISTINCT FROM OLD.balance_kobo
     AND coalesce(current_setting('rwm.ledger_posting', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'wallet balances change only through ledger lines';
  END IF;
  IF NEW.id <> OLD.id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.kind <> OLD.kind
     OR NEW.normal_side <> OLD.normal_side OR NEW.system_key IS DISTINCT FROM OLD.system_key THEN
    RAISE EXCEPTION 'wallet identity cannot change';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER wallets_guard_balance BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION wallets_guard_balance();
CREATE TRIGGER wallets_no_delete BEFORE DELETE ON wallets
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

-- The platform's own accounts. A function so test resets can recreate them.
CREATE FUNCTION ensure_system_wallets() RETURNS void LANGUAGE sql AS $$
  INSERT INTO wallets (kind, system_key, normal_side) VALUES
    ('system', 'paystack_balance',      'debit'),   -- our money held at Paystack
    ('system', 'passenger_receivables', 'debit'),   -- fares and fees passengers still owe
    ('system', 'provider_fees',         'debit'),   -- Paystack charge and transfer fees
    ('system', 'platform_revenue',      'credit'),  -- booking fees and commission
    ('system', 'ride_holds',            'credit'),  -- wallet money held for rides in progress
    ('system', 'payouts_in_transit',    'credit'),  -- driver money being transferred to banks
    ('system', 'refunds_in_transit',    'credit')   -- refunds on their way back to cards
  ON CONFLICT (system_key) DO NOTHING
$$;
SELECT ensure_system_wallets();

-- --- Saved cards, payments ------------------------------------------------------

CREATE TABLE payment_cards (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                      uuid NOT NULL REFERENCES users (id),
  -- Paystack's reusable authorization code, field-encrypted.
  authorization_code_encrypted text NOT NULL,
  -- Paystack's card fingerprint: the same card saved twice stays one card.
  signature                    text NOT NULL,
  brand                        text NOT NULL,
  last4                        text NOT NULL CHECK (last4 ~ '^\d{4}$'),
  exp_month                    smallint NOT NULL CHECK (exp_month BETWEEN 1 AND 12),
  exp_year                     smallint NOT NULL CHECK (exp_year BETWEEN 2000 AND 2100),
  bank                         text,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  removed_at                   timestamptz
);
CREATE UNIQUE INDEX payment_cards_one_per_signature ON payment_cards (user_id, signature)
  WHERE removed_at IS NULL;
CREATE INDEX payment_cards_user_idx ON payment_cards (user_id) WHERE removed_at IS NULL;

ALTER TABLE rides
  ADD COLUMN card_id uuid REFERENCES payment_cards (id),
  ADD CONSTRAINT rides_card_when_card CHECK ((payment_method = 'card') = (card_id IS NOT NULL));

ALTER TABLE payments
  ALTER COLUMN ride_id DROP NOT NULL,
  DROP CONSTRAINT payments_purpose_check,
  ADD CONSTRAINT payments_purpose_check
    CHECK (purpose IN ('ride_fare', 'cancellation_fee', 'wallet_topup', 'card_link')),
  DROP CONSTRAINT payments_status_check,
  -- pending: waiting for Paystack; succeeded: paid by card, transfer or wallet;
  -- collected: cash taken by the driver; outstanding: the passenger still owes
  -- outstanding_kobo; failed / abandoned: nothing was paid.
  ADD CONSTRAINT payments_status_check
    CHECK (status IN ('pending', 'succeeded', 'collected', 'outstanding', 'failed', 'abandoned')),
  ADD COLUMN wallet_kind        text CHECK (wallet_kind IN ('passenger', 'driver')),
  ADD COLUMN provider           text CHECK (provider IN ('paystack', 'fake')),
  ADD COLUMN provider_reference text UNIQUE,
  ADD COLUMN card_id            uuid REFERENCES payment_cards (id),
  ADD COLUMN fee_kobo           bigint NOT NULL DEFAULT 0 CHECK (fee_kobo >= 0),
  ADD COLUMN outstanding_kobo   bigint NOT NULL DEFAULT 0 CHECK (outstanding_kobo >= 0),
  ADD COLUMN refunded_kobo      bigint NOT NULL DEFAULT 0 CHECK (refunded_kobo >= 0),
  ADD COLUMN failure_reason     text,
  ADD COLUMN paid_at            timestamptz,
  ADD COLUMN updated_at         timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT payments_ride_purposes CHECK (
    (purpose IN ('ride_fare', 'cancellation_fee')) = (ride_id IS NOT NULL)),
  ADD CONSTRAINT payments_topup_wallet CHECK (
    (purpose IN ('wallet_topup', 'card_link')) = (wallet_kind IS NOT NULL)),
  ADD CONSTRAINT payments_refund_limit CHECK (refunded_kobo <= amount_kobo),
  ADD CONSTRAINT payments_outstanding_limit CHECK (outstanding_kobo <= amount_kobo);
CREATE INDEX payments_payer_idx ON payments (payer_id, created_at DESC);
CREATE INDEX payments_owed_idx ON payments (payer_id) WHERE outstanding_kobo > 0;
CREATE INDEX payments_pending_idx ON payments (created_at) WHERE status = 'pending';
CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Phase 3 recorded unpaid cash cancellation fees as 'outstanding' with the full amount owed.
UPDATE payments SET outstanding_kobo = amount_kobo WHERE status = 'outstanding';

-- --- Payouts, refunds, disputes -------------------------------------------------

ALTER TABLE driver_profiles
  ADD COLUMN payout_recipient_code    text,
  -- Payouts pause for a while after the bank account changes (account takeover protection).
  ADD COLUMN payout_account_changed_at timestamptz;

CREATE TABLE payouts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id          uuid NOT NULL REFERENCES driver_profiles (user_id),
  amount_kobo        bigint NOT NULL CHECK (amount_kobo > 0),
  fee_kobo           bigint NOT NULL DEFAULT 0 CHECK (fee_kobo >= 0),
  -- pending: debited from the wallet, transfer not yet accepted by Paystack;
  -- processing: Paystack is sending it; succeeded; failed / reversed: money back in the wallet.
  status             text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'reversed')),
  bank_code          text NOT NULL,
  account_last4      text NOT NULL,
  account_name       text NOT NULL,
  provider           text NOT NULL CHECK (provider IN ('paystack', 'fake')),
  provider_reference text NOT NULL UNIQUE,
  transfer_code      text,
  failure_reason     text,
  requested_at       timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payouts_driver_idx ON payouts (driver_id, requested_at DESC);
CREATE INDEX payouts_open_idx ON payouts (updated_at) WHERE status IN ('pending', 'processing');
CREATE TRIGGER payouts_set_updated_at BEFORE UPDATE ON payouts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE payment_disputes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id             uuid REFERENCES rides (id),
  payment_id          uuid REFERENCES payments (id),
  -- passenger: raised from the receipt; provider: a card chargeback reported by Paystack.
  source              text NOT NULL CHECK (source IN ('passenger', 'provider')),
  raised_by           uuid REFERENCES users (id),
  status              text NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'refunded', 'rejected', 'won', 'lost')),
  reason              text NOT NULL CHECK (length(reason) BETWEEN 1 AND 60),
  details             text CHECK (length(details) <= 1000),
  amount_kobo         bigint CHECK (amount_kobo >= 0),
  provider_dispute_id text UNIQUE,
  resolution_note     text,
  resolved_by         uuid REFERENCES users (id),
  resolved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_disputes_subject CHECK (ride_id IS NOT NULL OR payment_id IS NOT NULL)
);
-- A passenger can dispute each ride once.
CREATE UNIQUE INDEX payment_disputes_one_per_ride ON payment_disputes (ride_id) WHERE source = 'passenger';
CREATE INDEX payment_disputes_open_idx ON payment_disputes (created_at) WHERE status = 'open';
CREATE TRIGGER payment_disputes_set_updated_at BEFORE UPDATE ON payment_disputes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE refunds (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id         uuid NOT NULL REFERENCES payments (id),
  amount_kobo        bigint NOT NULL CHECK (amount_kobo > 0),
  -- wallet: credited at once; card: sent back through Paystack.
  destination        text NOT NULL CHECK (destination IN ('wallet', 'card')),
  -- Who bears it: the platform's revenue, or the driver's wallet.
  funded_by          text NOT NULL CHECK (funded_by IN ('platform', 'driver')),
  status             text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
  reason             text NOT NULL CHECK (length(reason) BETWEEN 3 AND 500),
  dispute_id         uuid REFERENCES payment_disputes (id),
  provider_reference text UNIQUE,
  failure_reason     text,
  created_by         uuid NOT NULL REFERENCES users (id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refunds_payment_idx ON refunds (payment_id);
CREATE TRIGGER refunds_set_updated_at BEFORE UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Every correctly signed webhook, stored once. Processing is idempotent per event.
CREATE TABLE payment_webhook_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     text NOT NULL CHECK (provider IN ('paystack', 'fake')),
  event        text NOT NULL,
  event_key    text NOT NULL,
  payload      jsonb NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts     integer NOT NULL DEFAULT 0,
  last_error   text,
  UNIQUE (provider, event_key)
);
CREATE INDEX payment_webhook_events_unprocessed_idx ON payment_webhook_events (received_at)
  WHERE processed_at IS NULL;

-- --- Journal and lines ----------------------------------------------------------

CREATE TABLE ledger_journals (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       text NOT NULL CHECK (kind IN (
               'wallet_topup', 'ride_hold', 'ride_hold_release', 'ride_settlement',
               'cash_commission', 'cancellation_fee', 'card_charge', 'outstanding_collection',
               'payout', 'payout_completed', 'payout_returned', 'refund', 'refund_completed',
               'refund_returned', 'chargeback', 'adjustment', 'opening_balance')),
  -- Idempotency: posting the same reference twice returns the first journal.
  reference  text NOT NULL UNIQUE,
  ride_id    uuid REFERENCES rides (id),
  payment_id uuid REFERENCES payments (id),
  payout_id  uuid REFERENCES payouts (id),
  refund_id  uuid REFERENCES refunds (id),
  dispute_id uuid REFERENCES payment_disputes (id),
  memo       text,
  created_by uuid REFERENCES users (id),
  tx_id      bigint NOT NULL DEFAULT txid_current(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ledger_journals_ride_idx ON ledger_journals (ride_id) WHERE ride_id IS NOT NULL;
CREATE TRIGGER ledger_journals_append_only BEFORE UPDATE OR DELETE ON ledger_journals
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

-- The double-entry lines ("wallet transactions"). Debits positive, credits negative.
CREATE TABLE wallet_transactions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq                bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  journal_id         uuid NOT NULL REFERENCES ledger_journals (id),
  wallet_id          uuid NOT NULL REFERENCES wallets (id),
  amount_kobo        bigint NOT NULL CHECK (amount_kobo <> 0),
  -- The wallet's balance (normal direction) right after this line.
  balance_after_kobo bigint NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX wallet_transactions_wallet_idx ON wallet_transactions (wallet_id, seq DESC);
CREATE INDEX wallet_transactions_journal_idx ON wallet_transactions (journal_id);
CREATE TRIGGER wallet_transactions_append_only BEFORE UPDATE OR DELETE ON wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

-- Applies a line to its wallet: locks the wallet, enforces its minimum balance
-- (SQLSTATE RWM01 = insufficient funds) and records the balance after.
CREATE FUNCTION wallet_transactions_post() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  w wallets%ROWTYPE;
  delta bigint;
  journal_tx bigint;
BEGIN
  SELECT tx_id INTO journal_tx FROM ledger_journals WHERE id = NEW.journal_id;
  IF journal_tx IS DISTINCT FROM txid_current() THEN
    RAISE EXCEPTION 'lines can only be added in the transaction that created the journal';
  END IF;
  SELECT * INTO w FROM wallets WHERE id = NEW.wallet_id FOR UPDATE;
  delta := CASE w.normal_side WHEN 'debit' THEN NEW.amount_kobo ELSE -NEW.amount_kobo END;
  IF delta < 0 AND w.min_balance_kobo IS NOT NULL AND w.balance_kobo + delta < w.min_balance_kobo THEN
    RAISE EXCEPTION 'insufficient funds in wallet %', w.id USING ERRCODE = 'RWM01';
  END IF;
  PERFORM set_config('rwm.ledger_posting', 'on', true);
  UPDATE wallets SET balance_kobo = balance_kobo + delta WHERE id = w.id;
  PERFORM set_config('rwm.ledger_posting', 'off', true);
  NEW.balance_after_kobo := w.balance_kobo + delta;
  RETURN NEW;
END $$;
CREATE TRIGGER wallet_transactions_post BEFORE INSERT ON wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION wallet_transactions_post();

-- At commit, every journal touched must balance and have at least two lines.
CREATE FUNCTION ledger_journal_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  jid uuid;
  total numeric;
  lines integer;
BEGIN
  IF TG_TABLE_NAME = 'ledger_journals' THEN
    jid := NEW.id;
  ELSE
    jid := NEW.journal_id;
  END IF;
  SELECT coalesce(sum(amount_kobo), 0), count(*) INTO total, lines
  FROM wallet_transactions WHERE journal_id = jid;
  IF total <> 0 OR lines < 2 THEN
    RAISE EXCEPTION 'journal % does not balance (sum %, % lines)', jid, total, lines
      USING ERRCODE = 'RWM02';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ledger_journals_balanced AFTER INSERT ON ledger_journals
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_journal_balanced();
CREATE CONSTRAINT TRIGGER wallet_transactions_balanced AFTER INSERT ON wallet_transactions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_journal_balanced();

-- Integrity check for monitoring and tests: wallets whose stored balance differs
-- from the sum of their lines (should always return no rows).
CREATE FUNCTION ledger_balance_mismatches()
RETURNS TABLE (wallet_id uuid, stored_kobo bigint, derived_kobo bigint) LANGUAGE sql STABLE AS $$
  SELECT w.id, w.balance_kobo,
         coalesce(sum(CASE w.normal_side WHEN 'debit' THEN t.amount_kobo ELSE -t.amount_kobo END), 0)::bigint
  FROM wallets w LEFT JOIN wallet_transactions t ON t.wallet_id = w.id
  GROUP BY w.id
  HAVING w.balance_kobo <> coalesce(sum(CASE w.normal_side WHEN 'debit' THEN t.amount_kobo ELSE -t.amount_kobo END), 0)
$$;

ALTER TABLE commissions
  ADD COLUMN journal_id uuid REFERENCES ledger_journals (id);

-- --- Bring Phase 3 records into the ledger ---------------------------------------
-- Cash commissions not yet settled are taken from the driver's wallet, and unpaid
-- cancellation fees become money the passenger owes (the driver is credited their
-- share, as for new fees).

INSERT INTO wallets (owner_id, kind, normal_side)
SELECT DISTINCT driver_id, 'driver', 'credit' FROM commissions WHERE status = 'pending_settlement'
UNION
SELECT DISTINCT r.driver_id, 'driver', 'credit' FROM payments p JOIN rides r ON r.id = p.ride_id
WHERE p.status = 'outstanding' AND r.driver_id IS NOT NULL
ON CONFLICT (owner_id, kind) DO NOTHING;

DO $$
DECLARE
  c record;
  f record;
  j uuid;
  revenue uuid := (SELECT id FROM wallets WHERE system_key = 'platform_revenue');
  receivables uuid := (SELECT id FROM wallets WHERE system_key = 'passenger_receivables');
  owed bigint;
  cut bigint;
BEGIN
  FOR c IN SELECT * FROM commissions WHERE status = 'pending_settlement' LOOP
    owed := c.commission_kobo + c.booking_fee_kobo;
    IF owed > 0 THEN
      INSERT INTO ledger_journals (kind, reference, ride_id, memo)
      VALUES ('cash_commission', 'ride:' || c.ride_id || ':cash_commission', c.ride_id,
              'Phase 3 cash commission brought into the ledger')
      RETURNING id INTO j;
      INSERT INTO wallet_transactions (journal_id, wallet_id, amount_kobo)
      SELECT j, id, owed FROM wallets WHERE owner_id = c.driver_id AND kind = 'driver';
      INSERT INTO wallet_transactions (journal_id, wallet_id, amount_kobo) VALUES (j, revenue, -owed);
      UPDATE commissions SET status = 'settled', journal_id = j WHERE id = c.id;
    ELSE
      UPDATE commissions SET status = 'settled' WHERE id = c.id;
    END IF;
  END LOOP;

  FOR f IN
    SELECT p.id, p.ride_id, p.amount_kobo, r.driver_id,
           (r.fare_snapshot -> 'rule' ->> 'commissionBps')::bigint AS bps
    FROM payments p JOIN rides r ON r.id = p.ride_id
    WHERE p.status = 'outstanding' AND p.purpose = 'cancellation_fee'
  LOOP
    cut := (f.amount_kobo * coalesce(f.bps, 0) * 2 + 10000) / 20000;  -- half-up basis points
    INSERT INTO ledger_journals (kind, reference, ride_id, payment_id, memo)
    VALUES ('cancellation_fee', 'payment:' || f.id || ':fee', f.ride_id, f.id,
            'Phase 3 unpaid cancellation fee brought into the ledger')
    RETURNING id INTO j;
    INSERT INTO wallet_transactions (journal_id, wallet_id, amount_kobo) VALUES (j, receivables, f.amount_kobo);
    IF cut > 0 THEN
      INSERT INTO wallet_transactions (journal_id, wallet_id, amount_kobo) VALUES (j, revenue, -cut);
    END IF;
    IF f.amount_kobo - cut > 0 THEN
      INSERT INTO wallet_transactions (journal_id, wallet_id, amount_kobo)
      SELECT j, id, -(f.amount_kobo - cut) FROM wallets WHERE owner_id = f.driver_id AND kind = 'driver';
    END IF;
  END LOOP;
END $$;

-- --- Permissions ------------------------------------------------------------------

INSERT INTO permissions (key, description) VALUES
  ('payments.read',   'View payments, wallets, payouts, refunds and disputes'),
  ('payments.refund', 'Issue refunds and resolve payment disputes'),
  ('payouts.manage',  'Retry or cancel driver payouts'),
  ('wallets.adjust',  'Make manual wallet adjustments');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON
  (r.key = 'support_agent' AND p.key = 'payments.read') OR
  (r.key = 'admin' AND p.key IN ('payments.read', 'payments.refund', 'payouts.manage')) OR
  (r.key = 'super_admin' AND p.key IN ('payments.read', 'payments.refund', 'payouts.manage', 'wallets.adjust'));
