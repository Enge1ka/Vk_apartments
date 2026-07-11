-- VK Apartments — action audit log
-- Run once in the Supabase SQL Editor after supabase-refunds-shorten.sql.
-- Idempotent (CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE / DROP+CREATE TRIGGER).
--
-- Records who did what: booking created, room checked in/out, extended,
-- shortened, edited, cancelled, and payments/refunds. Implemented as table
-- triggers rather than by editing the eight booking/payment RPCs — the triggers
-- see every write regardless of path, and there's no risk of a rewritten RPC
-- regressing. Admin-only read.

CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid REFERENCES auth.users(id),
  actor_name  text,
  entity_type text NOT NULL,          -- 'booking'
  entity_id   uuid,                    -- the booking id
  action      text NOT NULL,           -- create_booking | check_in | check_out | extend | ...
  details     jsonb,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx  ON audit_log (entity_type, entity_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
-- Admin-only read; no INSERT policy — only the SECURITY DEFINER triggers write.
DROP POLICY IF EXISTS "admin_read_audit_log" ON audit_log;
CREATE POLICY "admin_read_audit_log" ON audit_log
  FOR SELECT TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- The staff member behind the current statement, or 'System (auto)' for the
-- 10:00 cron (which runs without a JWT, so auth.uid() is null).
CREATE OR REPLACE FUNCTION audit_actor_name()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT COALESCE(
    (SELECT COALESCE(full_name, email) FROM profiles WHERE id = auth.uid()),
    'System (auto)'
  );
$$;

-- ============================================================
-- bookings — a new booking header
-- ============================================================
CREATE OR REPLACE FUNCTION audit_bookings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO audit_log (actor_id, actor_name, entity_type, entity_id, action, details)
  VALUES (auth.uid(), audit_actor_name(), 'booking', NEW.id, 'create_booking',
          jsonb_build_object('reference', NEW.booking_reference));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_bookings ON bookings;
CREATE TRIGGER trg_audit_bookings AFTER INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION audit_bookings();

-- ============================================================
-- booking_apartments — room lifecycle (the bulk of the trail)
-- ============================================================
CREATE OR REPLACE FUNCTION audit_booking_apartments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_action  text;
  v_details jsonb;
  v_apt     text;
BEGIN
  SELECT apartment_number INTO v_apt FROM apartments WHERE id = NEW.apartment_id;

  IF TG_OP = 'INSERT' THEN
    v_action  := 'add_room';
    v_details := jsonb_build_object('apartment', v_apt,
                   'check_in', NEW.check_in_date, 'check_out', NEW.check_out_date, 'rate', NEW.rate_per_day);
  ELSE  -- UPDATE: classify the change; skip no-op rollup touches
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_action := CASE NEW.status
        WHEN 'checked_in'  THEN 'check_in'
        WHEN 'checked_out' THEN 'check_out'
        WHEN 'cancelled'   THEN 'cancel'
        ELSE 'status_change' END;
    ELSIF NEW.check_out_date IS DISTINCT FROM OLD.check_out_date AND NEW.check_out_date > OLD.check_out_date THEN
      v_action := 'extend';
    ELSIF NEW.check_out_date IS DISTINCT FROM OLD.check_out_date AND NEW.check_out_date < OLD.check_out_date THEN
      v_action := 'shorten';
    ELSIF NEW.check_in_date IS DISTINCT FROM OLD.check_in_date OR NEW.rate_per_day IS DISTINCT FROM OLD.rate_per_day THEN
      v_action := 'edit_room';
    ELSE
      RETURN NEW;  -- nothing an operator would care about
    END IF;
    v_details := jsonb_build_object('apartment', v_apt,
      'from', jsonb_build_object('check_in', OLD.check_in_date, 'check_out', OLD.check_out_date, 'rate', OLD.rate_per_day, 'status', OLD.status),
      'to',   jsonb_build_object('check_in', NEW.check_in_date, 'check_out', NEW.check_out_date, 'rate', NEW.rate_per_day, 'status', NEW.status));
  END IF;

  INSERT INTO audit_log (actor_id, actor_name, entity_type, entity_id, action, details)
  VALUES (auth.uid(), audit_actor_name(), 'booking', NEW.booking_id, v_action, v_details);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_booking_apartments ON booking_apartments;
CREATE TRIGGER trg_audit_booking_apartments AFTER INSERT OR UPDATE ON booking_apartments
  FOR EACH ROW EXECUTE FUNCTION audit_booking_apartments();

-- ============================================================
-- payments — payments and refunds
-- ============================================================
CREATE OR REPLACE FUNCTION audit_payments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO audit_log (actor_id, actor_name, entity_type, entity_id, action, details)
  VALUES (auth.uid(), audit_actor_name(), 'booking', NEW.booking_id,
          CASE WHEN NEW.payment_type = 'refund' THEN 'refund' ELSE 'payment' END,
          jsonb_build_object('amount', NEW.amount, 'method', NEW.payment_method, 'receipt', NEW.receipt_number));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_payments ON payments;
CREATE TRIGGER trg_audit_payments AFTER INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION audit_payments();
