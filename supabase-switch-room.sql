-- VK Apartments — mid-stay room switch
-- Run once in the Supabase SQL Editor after supabase-extend-segment.sql.
-- Idempotent (CREATE OR REPLACE).
--
-- switch_room() moves the remainder of a room's stay to a different apartment
-- from a chosen switch date. Nights already stayed keep their apartment and
-- rate (the source segment is truncated to [check_in, switch)); the remaining
-- nights become a new segment on the target apartment at the given rate. If
-- the switch date IS the check-in date, truncating would leave a zero-night
-- segment (violates ba_checkout_after_checkin) — the whole segment moves
-- instead. The half-open [) ranges make the truncated and new segments
-- contiguous without tripping the per-apartment exclusion constraint; a
-- genuine clash on the TARGET apartment still raises 23P01, which the client
-- maps to a friendly message (same as extend_room_new_rate).
--
-- Pricing: the moved nights are billed at p_rate_per_day. This is the
-- "adjust the amount" provision — the UI prefills it from the target
-- apartment's daily_rate but it's a free numeric field, exactly like every
-- other rate input in this app. total_amount stays derived (sum of
-- line_total via refresh_booking_rollup); no schema change needed.
--
-- Unlike shorten_room, this RPC syncs BOTH apartments' status immediately
-- (frees the vacated room, holds the new one) rather than leaving the old
-- room "occupied" until the 10:00 auto-checkout cron catches up.

-- ============================================================
-- 1. Audit trigger: recognise an apartment_id change as 'switch_room', and
--    let switch_room() suppress the raw UPDATE/INSERT rows it would
--    otherwise also produce (it writes one explicit, truthful entry instead).
-- ============================================================
CREATE OR REPLACE FUNCTION audit_booking_apartments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_action  text;
  v_details jsonb;
  v_apt     text;
  v_old_apt text;
BEGIN
  -- switch_room() logs itself as a single 'switch_room' row; skip the
  -- shorten/check_out/add_room noise its two-statement write would otherwise
  -- produce. Transaction-local, so it can never leak into another session.
  IF current_setting('vk.suppress_room_audit', true) = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT apartment_number INTO v_apt FROM apartments WHERE id = NEW.apartment_id;

  IF TG_OP = 'INSERT' THEN
    v_action  := 'add_room';
    v_details := jsonb_build_object('apartment', v_apt,
                   'check_in', NEW.check_in_date, 'check_out', NEW.check_out_date, 'rate', NEW.rate_per_day);
  ELSE  -- UPDATE: classify the change; skip no-op rollup touches
    IF NEW.apartment_id IS DISTINCT FROM OLD.apartment_id THEN
      -- Safety net for any direct write outside switch_room() (which
      -- suppresses this trigger and writes its own audit row instead).
      SELECT apartment_number INTO v_old_apt FROM apartments WHERE id = OLD.apartment_id;
      v_action := 'switch_room';
      v_details := jsonb_build_object('apartment', v_apt,
        'from', jsonb_build_object('check_in', OLD.check_in_date, 'check_out', OLD.check_out_date, 'rate', OLD.rate_per_day, 'status', OLD.status),
        'to',   jsonb_build_object('check_in', NEW.check_in_date, 'check_out', NEW.check_out_date, 'rate', NEW.rate_per_day, 'status', NEW.status))
        || jsonb_build_object('from_apartment', v_old_apt, 'to_apartment', v_apt);
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      v_action := CASE NEW.status
        WHEN 'checked_in'  THEN 'check_in'
        WHEN 'checked_out' THEN 'check_out'
        WHEN 'cancelled'   THEN 'cancel'
        ELSE 'status_change' END;
      v_details := jsonb_build_object('apartment', v_apt,
        'from', jsonb_build_object('check_in', OLD.check_in_date, 'check_out', OLD.check_out_date, 'rate', OLD.rate_per_day, 'status', OLD.status),
        'to',   jsonb_build_object('check_in', NEW.check_in_date, 'check_out', NEW.check_out_date, 'rate', NEW.rate_per_day, 'status', NEW.status));
    ELSIF NEW.check_out_date IS DISTINCT FROM OLD.check_out_date AND NEW.check_out_date > OLD.check_out_date THEN
      v_action := 'extend';
      v_details := jsonb_build_object('apartment', v_apt,
        'from', jsonb_build_object('check_in', OLD.check_in_date, 'check_out', OLD.check_out_date, 'rate', OLD.rate_per_day, 'status', OLD.status),
        'to',   jsonb_build_object('check_in', NEW.check_in_date, 'check_out', NEW.check_out_date, 'rate', NEW.rate_per_day, 'status', NEW.status));
    ELSIF NEW.check_out_date IS DISTINCT FROM OLD.check_out_date AND NEW.check_out_date < OLD.check_out_date THEN
      v_action := 'shorten';
      v_details := jsonb_build_object('apartment', v_apt,
        'from', jsonb_build_object('check_in', OLD.check_in_date, 'check_out', OLD.check_out_date, 'rate', OLD.rate_per_day, 'status', OLD.status),
        'to',   jsonb_build_object('check_in', NEW.check_in_date, 'check_out', NEW.check_out_date, 'rate', NEW.rate_per_day, 'status', NEW.status));
    ELSIF NEW.check_in_date IS DISTINCT FROM OLD.check_in_date OR NEW.rate_per_day IS DISTINCT FROM OLD.rate_per_day THEN
      v_action := 'edit_room';
      v_details := jsonb_build_object('apartment', v_apt,
        'from', jsonb_build_object('check_in', OLD.check_in_date, 'check_out', OLD.check_out_date, 'rate', OLD.rate_per_day, 'status', OLD.status),
        'to',   jsonb_build_object('check_in', NEW.check_in_date, 'check_out', NEW.check_out_date, 'rate', NEW.rate_per_day, 'status', NEW.status));
    ELSE
      RETURN NEW;  -- nothing an operator would care about
    END IF;
  END IF;

  INSERT INTO audit_log (actor_id, actor_name, entity_type, entity_id, action, details)
  VALUES (auth.uid(), audit_actor_name(), 'booking', NEW.booking_id, v_action, v_details);
  RETURN NEW;
END;
$$;
-- Trigger object itself is unchanged (still fires AFTER INSERT OR UPDATE on
-- booking_apartments calling this function by name) — no DROP/CREATE needed.

-- ============================================================
-- 2. switch_room()
-- ============================================================
CREATE OR REPLACE FUNCTION switch_room(
  p_booking_apartment_id uuid,
  p_new_apartment_id     uuid,
  p_switch_date          date,
  p_rate_per_day         numeric
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role       text;
  v_location   uuid;
  v_room       record;
  v_new_apt    record;
  v_today      date := (now() AT TIME ZONE 'Africa/Lusaka')::date;  -- matches auto_checkout_due_bookings
  v_whole_move boolean;
  v_new_status text;
  v_old_status text;
  v_new_id     uuid;
BEGIN
  SELECT role, location_id INTO v_role, v_location FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL THEN RAISE EXCEPTION 'Caller profile not found — access denied'; END IF;

  SELECT ba.booking_id, ba.apartment_id, ba.check_in_date, ba.check_out_date,
         ba.rate_per_day, ba.status, a.location_id AS apt_location,
         a.apartment_number AS apt_number
    INTO v_room
  FROM booking_apartments ba JOIN apartments a ON a.id = ba.apartment_id
  WHERE ba.id = p_booking_apartment_id
  FOR UPDATE OF ba;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room % not found', p_booking_apartment_id; END IF;

  IF v_role <> 'admin' AND v_room.apt_location IS DISTINCT FROM v_location THEN
    RAISE EXCEPTION 'Not authorized to change this room';
  END IF;

  IF v_room.status IN ('checked_out', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot switch a % room', v_room.status;
  END IF;

  SELECT id, location_id, apartment_number, status INTO v_new_apt
  FROM apartments WHERE id = p_new_apartment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Apartment % not found', p_new_apartment_id; END IF;
  IF v_new_apt.id = v_room.apartment_id THEN
    RAISE EXCEPTION 'The new apartment is the same as the current one';
  END IF;
  IF v_new_apt.status = 'maintenance' THEN
    RAISE EXCEPTION 'That apartment is under maintenance';
  END IF;
  IF v_new_apt.location_id IS DISTINCT FROM v_room.apt_location THEN
    RAISE EXCEPTION 'The new apartment must be at the same location';
  END IF;

  IF p_switch_date < v_room.check_in_date OR p_switch_date >= v_room.check_out_date THEN
    RAISE EXCEPTION 'Switch date must be within the stay (% to the night before %)',
      v_room.check_in_date, v_room.check_out_date;
  END IF;
  IF p_rate_per_day <= 0 THEN
    RAISE EXCEPTION 'Rate per day must be greater than 0';
  END IF;

  -- Status rule:
  --   confirmed source  -> both segments stay 'confirmed'
  --   checked_in source, switch today-or-earlier -> guest has moved: old part
  --     'checked_out', new segment 'checked_in' (sync below frees the old
  --     room and holds the new one immediately, no second Check In needed)
  --   checked_in source, future switch -> guest stays put for now: old part
  --     stays 'checked_in' (10:00 cron checks it out on switch morning), new
  --     segment 'confirmed' (staff check it in on the day)
  v_whole_move := (p_switch_date = v_room.check_in_date);
  IF v_room.status = 'checked_in' AND NOT v_whole_move THEN
    IF p_switch_date <= v_today THEN
      v_old_status := 'checked_out';  v_new_status := 'checked_in';
    ELSE
      v_old_status := 'checked_in';   v_new_status := 'confirmed';
    END IF;
  ELSE
    v_old_status := v_room.status;    v_new_status := v_room.status;
  END IF;

  -- Suppress the per-statement audit rows; one explicit row is written below.
  PERFORM set_config('vk.suppress_room_audit', 'on', true);  -- transaction-local

  IF v_whole_move THEN
    -- Truncating to [in, in) would be zero nights — move the row instead.
    -- This re-bills ALL nights (including already-stayed ones) at the new
    -- rate; the UI preview must make that unmissable.
    UPDATE booking_apartments
    SET apartment_id = p_new_apartment_id, rate_per_day = p_rate_per_day, updated_at = now()
    WHERE id = p_booking_apartment_id;
  ELSE
    UPDATE booking_apartments
    SET check_out_date = p_switch_date, status = v_old_status, updated_at = now()
    WHERE id = p_booking_apartment_id;

    INSERT INTO booking_apartments (booking_id, apartment_id, check_in_date, check_out_date, rate_per_day, status)
    VALUES (v_room.booking_id, p_new_apartment_id, p_switch_date, v_room.check_out_date, p_rate_per_day, v_new_status)
    RETURNING id INTO v_new_id;
  END IF;

  -- Free/hold both apartments now (deliberately closes the gap shorten_room
  -- leaves — the vacated room shouldn't sit 'occupied' until the 10:00 cron).
  PERFORM sync_apartment_status(v_room.apartment_id);
  PERFORM sync_apartment_status(p_new_apartment_id);
  PERFORM refresh_booking_rollup(v_room.booking_id);

  INSERT INTO audit_log (actor_id, actor_name, entity_type, entity_id, action, details)
  VALUES (auth.uid(), audit_actor_name(), 'booking', v_room.booking_id, 'switch_room',
    jsonb_build_object(
      'from_apartment', v_room.apt_number,
      'to_apartment',   v_new_apt.apartment_number,
      'switch_date',    p_switch_date,
      'mode',           CASE WHEN v_whole_move THEN 'whole_move' ELSE 'split' END,
      'old_rate',       v_room.rate_per_day,
      'new_rate',       p_rate_per_day,
      'check_out',      v_room.check_out_date));

  RETURN json_build_object(
    'mode', CASE WHEN v_whole_move THEN 'whole_move' ELSE 'split' END,
    'new_booking_apartment_id', v_new_id);   -- null on whole_move
EXCEPTION
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'That apartment is already booked for those dates'
      USING ERRCODE = 'exclusion_violation';
END;
$$;

REVOKE EXECUTE ON FUNCTION switch_room(uuid, uuid, date, numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION switch_room(uuid, uuid, date, numeric) TO authenticated;
