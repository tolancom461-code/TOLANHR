-- ============================================
-- MySQL Triggers for Payroll System
-- ============================================

-- ============================================
-- 1. Trigger: Auto-complete Missing Check-out
-- ============================================

DELIMITER //

DROP TRIGGER IF EXISTS trg_auto_complete_checkout//

CREATE TRIGGER trg_auto_complete_checkout
AFTER INSERT ON attendance_events
FOR EACH ROW
BEGIN
  DECLARE v_group_id INT;
  DECLARE v_day_of_week INT;
  DECLARE v_scheduled_end TIME;
  DECLARE v_check_in_exists BOOLEAN;
  DECLARE v_check_out_exists BOOLEAN;

  -- Get worker's group
  SELECT group_id INTO v_group_id FROM workers WHERE id = NEW.worker_id;
  
  IF v_group_id IS NOT NULL THEN
    -- Calculate day of week (MySQL: 1=Sunday, 2=Monday, ..., 7=Saturday)
    -- Convert to 0-6 format (0=Sunday, 1=Monday, etc.)
    SET v_day_of_week = DAYOFWEEK(NEW.event_time) - 1;
    
    -- Get scheduled end time for this day
    SELECT end_time INTO v_scheduled_end
    FROM group_schedules
    WHERE group_id = v_group_id 
      AND day_of_week = v_day_of_week 
      AND is_active = TRUE
    LIMIT 1;
    
    IF v_scheduled_end IS NOT NULL THEN
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
      
      -- If check-in exists but no check-out, insert auto-completed check-out
      IF v_check_in_exists AND NOT v_check_out_exists THEN
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
    END IF;
  END IF;
END //

DELIMITER ;

-- ============================================
-- 2. Trigger: Update Worker Last Attendance
-- ============================================

DELIMITER //

DROP TRIGGER IF EXISTS trg_update_last_attendance//

CREATE TRIGGER trg_update_last_attendance
AFTER INSERT ON attendance_events
FOR EACH ROW
BEGIN
  UPDATE workers
  SET last_attendance_at = NEW.event_time
  WHERE id = NEW.worker_id;
END //

DELIMITER ;

-- ============================================
-- 3. Trigger: Audit Log for Attendance Changes
-- ============================================

DELIMITER //

DROP TRIGGER IF EXISTS trg_audit_attendance_insert//

CREATE TRIGGER trg_audit_attendance_insert
AFTER INSERT ON attendance_events
FOR EACH ROW
BEGIN
  INSERT INTO audit_log (
    table_name, record_id, action, old_values, new_values, created_at
  ) VALUES (
    'attendance_events',
    NEW.id,
    'INSERT',
    NULL,
    JSON_OBJECT(
      'worker_id', NEW.worker_id,
      'event_type', NEW.event_type,
      'event_time', NEW.event_time,
      'method', NEW.method,
      'note', NEW.note
    ),
    NOW()
  );
END //

DELIMITER ;

DELIMITER //

DROP TRIGGER IF EXISTS trg_audit_attendance_update//

CREATE TRIGGER trg_audit_attendance_update
AFTER UPDATE ON attendance_events
FOR EACH ROW
BEGIN
  INSERT INTO audit_log (
    table_name, record_id, action, old_values, new_values, created_at
  ) VALUES (
    'attendance_events',
    NEW.id,
    'UPDATE',
    JSON_OBJECT(
      'worker_id', OLD.worker_id,
      'event_type', OLD.event_type,
      'event_time', OLD.event_time,
      'method', OLD.method,
      'note', OLD.note
    ),
    JSON_OBJECT(
      'worker_id', NEW.worker_id,
      'event_type', NEW.event_type,
      'event_time', NEW.event_time,
      'method', NEW.method,
      'note', NEW.note
    ),
    NOW()
  );
END //

DELIMITER ;

DELIMITER //

DROP TRIGGER IF EXISTS trg_audit_attendance_delete//

CREATE TRIGGER trg_audit_attendance_delete
AFTER DELETE ON attendance_events
FOR EACH ROW
BEGIN
  INSERT INTO audit_log (
    table_name, record_id, action, old_values, new_values, created_at
  ) VALUES (
    'attendance_events',
    OLD.id,
    'DELETE',
    JSON_OBJECT(
      'worker_id', OLD.worker_id,
      'event_type', OLD.event_type,
      'event_time', OLD.event_time,
      'method', OLD.method,
      'note', OLD.note
    ),
    NULL,
    NOW()
  );
END //

DELIMITER ;

-- ============================================
-- 4. Trigger: Validate Schedule Consistency
-- ============================================

DELIMITER //

DROP TRIGGER IF EXISTS trg_validate_schedule_insert//

CREATE TRIGGER trg_validate_schedule_insert
BEFORE INSERT ON group_schedules
FOR EACH ROW
BEGIN
  -- Check that start_time < end_time
  IF NEW.start_time >= NEW.end_time THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Start time must be before end time';
  END IF;
  
  -- Check that required_hours is positive
  IF NEW.required_hours <= 0 THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Required hours must be greater than 0';
  END IF;
  
  -- Check that day_of_week is valid (0-6)
  IF NEW.day_of_week < 0 OR NEW.day_of_week > 6 THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Day of week must be between 0 and 6';
  END IF;
END //

DELIMITER ;

DELIMITER //

DROP TRIGGER IF EXISTS trg_validate_schedule_update//

CREATE TRIGGER trg_validate_schedule_update
BEFORE UPDATE ON group_schedules
FOR EACH ROW
BEGIN
  -- Check that start_time < end_time
  IF NEW.start_time >= NEW.end_time THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Start time must be before end time';
  END IF;
  
  -- Check that required_hours is positive
  IF NEW.required_hours <= 0 THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Required hours must be greater than 0';
  END IF;
  
  -- Check that day_of_week is valid (0-6)
  IF NEW.day_of_week < 0 OR NEW.day_of_week > 6 THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Day of week must be between 0 and 6';
  END IF;
END //

DELIMITER ;

-- ============================================
-- 5. Trigger: Prevent Double Payment
-- ============================================

DELIMITER //

DROP TRIGGER IF EXISTS trg_prevent_double_payment//

CREATE TRIGGER trg_prevent_double_payment
BEFORE INSERT ON payroll_batch_items
FOR EACH ROW
BEGIN
  DECLARE v_locked_batch_id INT;
  
  -- Check if this worker-date combination is already locked in a batch
  SELECT locked_batch_id INTO v_locked_batch_id
  FROM worker_daily_finance
  WHERE worker_id = NEW.worker_id
    AND work_date = (
      SELECT period_start FROM payroll_batches 
      WHERE id = NEW.batch_id
    )
    AND locked_batch_id IS NOT NULL
  LIMIT 1;
  
  IF v_locked_batch_id IS NOT NULL AND v_locked_batch_id != NEW.batch_id THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Worker-date combination is already locked in another batch';
  END IF;
END //

DELIMITER ;

-- ============================================
-- 6. Trigger: Update Payroll Batch Totals
-- ============================================

DELIMITER //

DROP TRIGGER IF EXISTS trg_update_batch_totals_insert//

CREATE TRIGGER trg_update_batch_totals_insert
AFTER INSERT ON payroll_batch_items
FOR EACH ROW
BEGIN
  UPDATE payroll_batches
  SET 
    total_amount = total_amount + NEW.net_amount,
    total_deductions = total_deductions + NEW.total_deductions,
    total_bonuses = total_bonuses + NEW.total_bonuses,
    total_workers = (
      SELECT COUNT(DISTINCT worker_id) FROM payroll_batch_items 
      WHERE batch_id = NEW.batch_id
    ),
    updated_at = NOW()
  WHERE id = NEW.batch_id;
END //

DELIMITER ;

DELIMITER //

DROP TRIGGER IF EXISTS trg_update_batch_totals_update//

CREATE TRIGGER trg_update_batch_totals_update
AFTER UPDATE ON payroll_batch_items
FOR EACH ROW
BEGIN
  UPDATE payroll_batches
  SET 
    total_amount = total_amount - OLD.net_amount + NEW.net_amount,
    total_deductions = total_deductions - OLD.total_deductions + NEW.total_deductions,
    total_bonuses = total_bonuses - OLD.total_bonuses + NEW.total_bonuses,
    updated_at = NOW()
  WHERE id = NEW.batch_id;
END //

DELIMITER ;

DELIMITER //

DROP TRIGGER IF EXISTS trg_update_batch_totals_delete//

CREATE TRIGGER trg_update_batch_totals_delete
AFTER DELETE ON payroll_batch_items
FOR EACH ROW
BEGIN
  UPDATE payroll_batches
  SET 
    total_amount = total_amount - OLD.net_amount,
    total_deductions = total_deductions - OLD.total_deductions,
    total_bonuses = total_bonuses - OLD.total_bonuses,
    total_workers = (
      SELECT COUNT(DISTINCT worker_id) FROM payroll_batch_items 
      WHERE batch_id = OLD.batch_id
    ),
    updated_at = NOW()
  WHERE id = OLD.batch_id;
END //

DELIMITER ;
