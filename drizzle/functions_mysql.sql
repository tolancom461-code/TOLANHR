-- ============================================
-- MySQL Functions for Payroll System
-- ============================================
-- Converted from PostgreSQL to MySQL syntax

-- ============================================
-- 1. Function: Calculate Daily Payroll for an Employee
-- ============================================

DELIMITER //

DROP FUNCTION IF EXISTS calculate_daily_payroll//

CREATE FUNCTION calculate_daily_payroll(
  p_worker_id INT,
  p_work_date DATE
)
RETURNS VARCHAR(1000)
DETERMINISTIC
READS SQL DATA
BEGIN
  DECLARE v_group_id INT;
  DECLARE v_day_of_week INT;
  DECLARE v_scheduled_start TIME;
  DECLARE v_scheduled_end TIME;
  DECLARE v_required_hours DECIMAL(4, 2);
  DECLARE v_daily_rate DECIMAL(10, 2);
  DECLARE v_check_in_time TIMESTAMP;
  DECLARE v_check_out_time TIMESTAMP;
  DECLARE v_actual_hours DECIMAL(10, 2);
  DECLARE v_late_minutes INT;
  DECLARE v_early_departure_minutes INT;
  DECLARE v_calculated_pay DECIMAL(10, 2);
  DECLARE v_is_auto_completed BOOLEAN;
  DECLARE v_status VARCHAR(50);
  DECLARE v_result VARCHAR(1000);

  -- Get worker's group
  SELECT group_id INTO v_group_id FROM workers WHERE id = p_worker_id;
  
  IF v_group_id IS NULL THEN
    RETURN JSON_OBJECT('error', 'Worker not found');
  END IF;
  
  -- Get daily rate
  SELECT daily_rate INTO v_daily_rate FROM groups WHERE id = v_group_id;
  
  -- Calculate day of week (1=Sunday, 2=Monday, ..., 7=Saturday)
  -- MySQL DAYOFWEEK returns 1-7, we need 0-6
  SET v_day_of_week = DAYOFWEEK(p_work_date) - 1;
  
  -- Get schedule for this day
  SELECT start_time, end_time, required_hours 
  INTO v_scheduled_start, v_scheduled_end, v_required_hours
  FROM group_schedules 
  WHERE group_id = v_group_id 
    AND day_of_week = v_day_of_week 
    AND is_active = TRUE
  LIMIT 1;
  
  -- If no schedule found for this day, return error
  IF v_scheduled_start IS NULL THEN
    RETURN JSON_OBJECT('error', 'No schedule found for this day');
  END IF;
  
  -- Get check-in time
  SELECT event_time INTO v_check_in_time
  FROM attendance_events
  WHERE worker_id = p_worker_id 
    AND DATE(event_time) = p_work_date
    AND event_type = 'check_in'
  ORDER BY event_time ASC
  LIMIT 1;
  
  -- Get check-out time
  SELECT event_time INTO v_check_out_time
  FROM attendance_events
  WHERE worker_id = p_worker_id 
    AND DATE(event_time) = p_work_date
    AND event_type = 'check_out'
  ORDER BY event_time DESC
  LIMIT 1;
  
  -- Handle missing check-in or check-out
  SET v_is_auto_completed = FALSE;
  
  IF v_check_in_time IS NULL THEN
    SET v_check_in_time = TIMESTAMP(p_work_date, v_scheduled_start);
    SET v_is_auto_completed = TRUE;
  END IF;
  
  IF v_check_out_time IS NULL THEN
    SET v_check_out_time = TIMESTAMP(p_work_date, v_scheduled_end);
    SET v_is_auto_completed = TRUE;
  END IF;
  
  -- Calculate actual hours worked
  SET v_actual_hours = ROUND(
    TIMESTAMPDIFF(SECOND, v_check_in_time, v_check_out_time) / 3600.0,
    2
  );
  
  -- Calculate late arrival (in minutes)
  SET v_late_minutes = GREATEST(0, ROUND(
    TIMESTAMPDIFF(SECOND, TIMESTAMP(p_work_date, v_scheduled_start), v_check_in_time) / 60
  ));
  
  -- Calculate early departure (in minutes)
  SET v_early_departure_minutes = GREATEST(0, ROUND(
    TIMESTAMPDIFF(SECOND, v_check_out_time, TIMESTAMP(p_work_date, v_scheduled_end)) / 60
  ));
  
  -- Calculate daily pay
  SET v_calculated_pay = ROUND(
    (v_actual_hours / v_required_hours) * v_daily_rate,
    2
  );
  
  -- Determine status
  IF v_is_auto_completed THEN
    SET v_status = 'PENDING_REVIEW';
  ELSE
    SET v_status = 'COMPLETED';
  END IF;
  
  -- Return results as JSON
  SET v_result = JSON_OBJECT(
    'worker_id', p_worker_id,
    'work_date', p_work_date,
    'scheduled_hours', v_required_hours,
    'actual_hours', v_actual_hours,
    'late_minutes', v_late_minutes,
    'early_departure_minutes', v_early_departure_minutes,
    'daily_rate', v_daily_rate,
    'calculated_pay', v_calculated_pay,
    'is_auto_completed', v_is_auto_completed,
    'status', v_status
  );
  
  RETURN v_result;
END //

DELIMITER ;

-- ============================================
-- 2. Function: Detect Missing Punches
-- ============================================

DELIMITER //

DROP FUNCTION IF EXISTS detect_missing_punches//

CREATE FUNCTION detect_missing_punches(
  p_worker_id INT,
  p_work_date DATE
)
RETURNS VARCHAR(500)
DETERMINISTIC
READS SQL DATA
BEGIN
  DECLARE v_has_check_in BOOLEAN;
  DECLARE v_has_check_out BOOLEAN;
  DECLARE v_issue_type VARCHAR(50);
  DECLARE v_result VARCHAR(500);

  -- Check for check-in
  SELECT EXISTS(
    SELECT 1 FROM attendance_events
    WHERE worker_id = p_worker_id 
      AND DATE(event_time) = p_work_date
      AND event_type = 'check_in'
  ) INTO v_has_check_in;
  
  -- Check for check-out
  SELECT EXISTS(
    SELECT 1 FROM attendance_events
    WHERE worker_id = p_worker_id 
      AND DATE(event_time) = p_work_date
      AND event_type = 'check_out'
  ) INTO v_has_check_out;
  
  -- Determine issue type
  IF NOT v_has_check_in AND NOT v_has_check_out THEN
    SET v_issue_type = 'NO_PUNCH';
  ELSEIF NOT v_has_check_in THEN
    SET v_issue_type = 'MISSING_CHECK_IN';
  ELSEIF NOT v_has_check_out THEN
    SET v_issue_type = 'MISSING_CHECK_OUT';
  ELSE
    SET v_issue_type = 'COMPLETE';
  END IF;
  
  -- Return results as JSON
  SET v_result = JSON_OBJECT(
    'worker_id', p_worker_id,
    'work_date', p_work_date,
    'has_check_in', v_has_check_in,
    'has_check_out', v_has_check_out,
    'issue_type', v_issue_type,
    'needs_review', (NOT v_has_check_in OR NOT v_has_check_out)
  );
  
  RETURN v_result;
END //

DELIMITER ;

-- ============================================
-- 3. Function: Get Group Daily Summary
-- ============================================

DELIMITER //

DROP FUNCTION IF EXISTS get_group_daily_summary//

CREATE FUNCTION get_group_daily_summary(
  p_group_id INT,
  p_work_date DATE
)
RETURNS VARCHAR(1000)
DETERMINISTIC
READS SQL DATA
BEGIN
  DECLARE v_total_employees INT;
  DECLARE v_employees_checked_in INT;
  DECLARE v_employees_checked_out INT;
  DECLARE v_total_check_ins INT;
  DECLARE v_total_check_outs INT;
  DECLARE v_result VARCHAR(1000);

  -- Count total active employees in group
  SELECT COUNT(*) INTO v_total_employees
  FROM workers
  WHERE group_id = p_group_id AND status = 'active';
  
  -- Count employees with check-in
  SELECT COUNT(DISTINCT w.id) INTO v_employees_checked_in
  FROM workers w
  LEFT JOIN attendance_events ae ON w.id = ae.worker_id 
    AND DATE(ae.event_time) = p_work_date 
    AND ae.event_type = 'check_in'
  WHERE w.group_id = p_group_id AND w.status = 'active'
    AND ae.id IS NOT NULL;
  
  -- Count employees with check-out
  SELECT COUNT(DISTINCT w.id) INTO v_employees_checked_out
  FROM workers w
  LEFT JOIN attendance_events ae ON w.id = ae.worker_id 
    AND DATE(ae.event_time) = p_work_date 
    AND ae.event_type = 'check_out'
  WHERE w.group_id = p_group_id AND w.status = 'active'
    AND ae.id IS NOT NULL;
  
  -- Count total check-ins
  SELECT COUNT(*) INTO v_total_check_ins
  FROM attendance_events ae
  JOIN workers w ON ae.worker_id = w.id
  WHERE w.group_id = p_group_id 
    AND DATE(ae.event_time) = p_work_date
    AND ae.event_type = 'check_in';
  
  -- Count total check-outs
  SELECT COUNT(*) INTO v_total_check_outs
  FROM attendance_events ae
  JOIN workers w ON ae.worker_id = w.id
  WHERE w.group_id = p_group_id 
    AND DATE(ae.event_time) = p_work_date
    AND ae.event_type = 'check_out';
  
  -- Return results as JSON
  SET v_result = JSON_OBJECT(
    'group_id', p_group_id,
    'work_date', p_work_date,
    'total_employees', v_total_employees,
    'employees_checked_in', v_employees_checked_in,
    'employees_checked_out', v_employees_checked_out,
    'total_check_ins', v_total_check_ins,
    'total_check_outs', v_total_check_outs,
    'missing_check_ins', v_total_employees - v_employees_checked_in,
    'missing_check_outs', v_total_employees - v_employees_checked_out
  );
  
  RETURN v_result;
END //

DELIMITER ;

-- ============================================
-- Test Queries
-- ============================================

-- Test 1: Calculate daily payroll
-- SELECT calculate_daily_payroll(1, CURDATE());

-- Test 2: Detect missing punches
-- SELECT detect_missing_punches(1, CURDATE());

-- Test 3: Get group daily summary
-- SELECT get_group_daily_summary(1, CURDATE());
