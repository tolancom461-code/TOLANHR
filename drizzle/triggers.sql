-- ============================================
-- PostgreSQL Triggers for Payroll System
-- ============================================
-- These triggers handle automatic processing of attendance records

-- ============================================
-- 1. Trigger: Auto-complete Missing Punches
-- ============================================
-- This trigger fires after inserting an attendance record
-- It checks if the day is complete and marks it if needed

CREATE OR REPLACE FUNCTION trigger_auto_complete_punches()
RETURNS TRIGGER AS $$
DECLARE
  v_group_id INT;
  v_day_of_week INT;
  v_scheduled_end TIME;
  v_check_in_exists BOOLEAN;
  v_check_out_exists BOOLEAN;
BEGIN
  -- Get worker's group
  SELECT group_id INTO v_group_id FROM workers WHERE id = NEW.worker_id;
  
  IF v_group_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Calculate day of week
  v_day_of_week := EXTRACT(DOW FROM NEW.event_time);
  
  -- Get scheduled end time for this day
  SELECT end_time INTO v_scheduled_end
  FROM group_schedules
  WHERE group_id = v_group_id AND day_of_week = v_day_of_week AND is_active = TRUE
  LIMIT 1;
  
  IF v_scheduled_end IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Check if check-in exists for this day
  SELECT EXISTS(
    SELECT 1 FROM attendance_events
    WHERE worker_id = NEW.worker_id
      AND DATE(event_time) = DATE(NEW.event_time)
      AND event_type = 'check_in'
  ) INTO v_check_in_exists;
  
  -- Check if check-out exists for this day
  SELECT EXISTS(
    SELECT 1 FROM attendance_events
    WHERE worker_id = NEW.worker_id
      AND DATE(event_time) = DATE(NEW.event_time)
      AND event_type = 'check_out'
  ) INTO v_check_out_exists;
  
  -- If check-in exists but no check-out, and it's past scheduled end time
  IF v_check_in_exists AND NOT v_check_out_exists AND 
     CURRENT_TIME > v_scheduled_end THEN
    -- Insert auto-completed check-out
    INSERT INTO attendance_events (
      worker_id, event_type, event_time, method, note, created_at
    ) VALUES (
      NEW.worker_id,
      'check_out',
      TIMESTAMP(DATE(NEW.event_time), v_scheduled_end),
      'auto_complete',
      'Auto-completed at scheduled end time',
      NOW()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on attendance_events table
DROP TRIGGER IF EXISTS trg_auto_complete_punches ON attendance_events;
CREATE TRIGGER trg_auto_complete_punches
AFTER INSERT ON attendance_events
FOR EACH ROW
EXECUTE FUNCTION trigger_auto_complete_punches();

-- ============================================
-- 2. Trigger: Update Worker Last Attendance
-- ============================================
-- This trigger updates the last_attendance_at field when a new record is inserted

CREATE OR REPLACE FUNCTION trigger_update_last_attendance()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE workers
  SET last_attendance_at = NEW.event_time
  WHERE id = NEW.worker_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trg_update_last_attendance ON attendance_events;
CREATE TRIGGER trg_update_last_attendance
AFTER INSERT ON attendance_events
FOR EACH ROW
EXECUTE FUNCTION trigger_update_last_attendance();

-- ============================================
-- 3. Trigger: Audit Log for Payroll Changes
-- ============================================
-- This trigger logs all changes to payroll-related tables

CREATE OR REPLACE FUNCTION trigger_audit_payroll_changes()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (
    table_name, record_id, action, old_values, new_values, changed_by, created_at
  ) VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE NULL END,
    CASE WHEN TG_OP != 'DELETE' THEN row_to_json(NEW) ELSE NULL END,
    CURRENT_USER,
    NOW()
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers for audit logging
DROP TRIGGER IF EXISTS trg_audit_attendance ON attendance_events;
CREATE TRIGGER trg_audit_attendance
AFTER INSERT OR UPDATE OR DELETE ON attendance_events
FOR EACH ROW
EXECUTE FUNCTION trigger_audit_payroll_changes();

DROP TRIGGER IF EXISTS trg_audit_group_schedules ON group_schedules;
CREATE TRIGGER trg_audit_group_schedules
AFTER INSERT OR UPDATE OR DELETE ON group_schedules
FOR EACH ROW
EXECUTE FUNCTION trigger_audit_payroll_changes();

-- ============================================
-- 4. Trigger: Validate Schedule Consistency
-- ============================================
-- This trigger ensures that group schedules are valid

CREATE OR REPLACE FUNCTION trigger_validate_schedule()
RETURNS TRIGGER AS $$
BEGIN
  -- Check that start_time < end_time
  IF NEW.start_time >= NEW.end_time THEN
    RAISE EXCEPTION 'Start time must be before end time';
  END IF;
  
  -- Check that required_hours is positive
  IF NEW.required_hours <= 0 THEN
    RAISE EXCEPTION 'Required hours must be greater than 0';
  END IF;
  
  -- Check that day_of_week is valid (0-6)
  IF NEW.day_of_week < 0 OR NEW.day_of_week > 6 THEN
    RAISE EXCEPTION 'Day of week must be between 0 and 6';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trg_validate_schedule ON group_schedules;
CREATE TRIGGER trg_validate_schedule
BEFORE INSERT OR UPDATE ON group_schedules
FOR EACH ROW
EXECUTE FUNCTION trigger_validate_schedule();
