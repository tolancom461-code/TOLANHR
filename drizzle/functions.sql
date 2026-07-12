-- ============================================
-- PostgreSQL Functions for Payroll System
-- ============================================
-- These functions handle complex calculations for attendance and payroll

-- ============================================
-- 1. Function: Calculate Daily Payroll for an Employee
-- ============================================
-- This function calculates the daily payroll for a specific employee on a specific date
-- It handles missing check-ins/check-outs and split shifts

CREATE OR REPLACE FUNCTION calculate_daily_payroll(
  p_worker_id INT,
  p_work_date DATE
)
RETURNS TABLE (
  worker_id INT,
  work_date DATE,
  scheduled_hours NUMERIC,
  actual_hours NUMERIC,
  late_minutes INT,
  early_departure_minutes INT,
  daily_rate NUMERIC,
  calculated_pay NUMERIC,
  is_auto_completed BOOLEAN,
  status VARCHAR
) AS $$
DECLARE
  v_group_id INT;
  v_day_of_week INT;
  v_scheduled_start TIME;
  v_scheduled_end TIME;
  v_required_hours NUMERIC;
  v_daily_rate NUMERIC;
  v_check_in_time TIMESTAMP;
  v_check_out_time TIMESTAMP;
  v_actual_hours NUMERIC;
  v_late_minutes INT;
  v_early_departure_minutes INT;
  v_calculated_pay NUMERIC;
  v_is_auto_completed BOOLEAN;
BEGIN
  -- Get worker's group
  SELECT group_id INTO v_group_id FROM workers WHERE id = p_worker_id;
  
  IF v_group_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Get daily rate
  SELECT daily_rate INTO v_daily_rate FROM groups WHERE id = v_group_id;
  
  -- Calculate day of week (0 = Sunday, 1 = Monday, etc.)
  v_day_of_week := EXTRACT(DOW FROM p_work_date);
  
  -- Get schedule for this day
  SELECT start_time, end_time, required_hours 
  INTO v_scheduled_start, v_scheduled_end, v_required_hours
  FROM group_schedules 
  WHERE group_id = v_group_id AND day_of_week = v_day_of_week AND is_active = TRUE
  LIMIT 1;
  
  -- If no schedule found for this day, skip
  IF v_scheduled_start IS NULL THEN
    RETURN;
  END IF;
  
  -- Get check-in and check-out times
  SELECT event_time INTO v_check_in_time
  FROM attendance_events
  WHERE worker_id = p_worker_id 
    AND DATE(event_time) = p_work_date
    AND event_type = 'check_in'
  ORDER BY event_time ASC
  LIMIT 1;
  
  SELECT event_time INTO v_check_out_time
  FROM attendance_events
  WHERE worker_id = p_worker_id 
    AND DATE(event_time) = p_work_date
    AND event_type = 'check_out'
  ORDER BY event_time DESC
  LIMIT 1;
  
  -- Handle missing check-in or check-out
  v_is_auto_completed := FALSE;
  
  IF v_check_in_time IS NULL THEN
    -- If no check-in, assume check-in at scheduled start time
    v_check_in_time := TIMESTAMP(p_work_date, v_scheduled_start);
    v_is_auto_completed := TRUE;
  END IF;
  
  IF v_check_out_time IS NULL THEN
    -- If no check-out, assume check-out at scheduled end time
    v_check_out_time := TIMESTAMP(p_work_date, v_scheduled_end);
    v_is_auto_completed := TRUE;
  END IF;
  
  -- Calculate actual hours worked
  v_actual_hours := ROUND(
    EXTRACT(EPOCH FROM (v_check_out_time - v_check_in_time)) / 3600.0,
    2
  );
  
  -- Calculate late arrival (in minutes)
  v_late_minutes := GREATEST(0, EXTRACT(EPOCH FROM (
    TIMESTAMP(p_work_date, v_scheduled_start) - v_check_in_time
  )) / 60)::INT;
  
  -- Calculate early departure (in minutes)
  v_early_departure_minutes := GREATEST(0, EXTRACT(EPOCH FROM (
    v_check_out_time - TIMESTAMP(p_work_date, v_scheduled_end)
  )) / 60)::INT;
  
  -- Calculate daily pay
  v_calculated_pay := ROUND(
    (v_actual_hours / v_required_hours) * v_daily_rate,
    2
  );
  
  -- Return results
  RETURN QUERY SELECT
    p_worker_id,
    p_work_date,
    v_required_hours,
    v_actual_hours,
    v_late_minutes,
    v_early_departure_minutes,
    v_daily_rate,
    v_calculated_pay,
    v_is_auto_completed,
    CASE 
      WHEN v_is_auto_completed THEN 'PENDING_REVIEW'
      ELSE 'COMPLETED'
    END;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 2. Function: Calculate Group Payroll Summary
-- ============================================
-- This function calculates total payroll for a group on a specific date

CREATE OR REPLACE FUNCTION calculate_group_payroll(
  p_group_id INT,
  p_work_date DATE
)
RETURNS TABLE (
  group_id INT,
  work_date DATE,
  total_employees INT,
  employees_with_issues INT,
  total_hours_worked NUMERIC,
  total_scheduled_hours NUMERIC,
  total_payroll NUMERIC,
  average_daily_pay NUMERIC
) AS $$
DECLARE
  v_total_employees INT;
  v_employees_with_issues INT;
  v_total_hours NUMERIC;
  v_total_scheduled NUMERIC;
  v_total_pay NUMERIC;
  v_average_pay NUMERIC;
BEGIN
  -- Count total active employees in group
  SELECT COUNT(*) INTO v_total_employees
  FROM workers
  WHERE group_id = p_group_id AND status = 'active';
  
  -- Calculate payroll for all employees
  SELECT 
    COUNT(*) FILTER (WHERE is_auto_completed),
    COALESCE(SUM(actual_hours), 0),
    COALESCE(SUM(scheduled_hours), 0),
    COALESCE(SUM(calculated_pay), 0),
    COALESCE(AVG(calculated_pay), 0)
  INTO 
    v_employees_with_issues,
    v_total_hours,
    v_total_scheduled,
    v_total_pay,
    v_average_pay
  FROM (
    SELECT * FROM calculate_daily_payroll(w.id, p_work_date)
    FROM workers w
    WHERE w.group_id = p_group_id AND w.status = 'active'
  ) AS payroll_data;
  
  RETURN QUERY SELECT
    p_group_id,
    p_work_date,
    v_total_employees,
    v_employees_with_issues,
    v_total_hours,
    v_total_scheduled,
    v_total_pay,
    ROUND(v_average_pay, 2);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. Function: Detect and Flag Missing Punches
-- ============================================
-- This function checks if a day has missing check-in or check-out

CREATE OR REPLACE FUNCTION detect_missing_punches(
  p_worker_id INT,
  p_work_date DATE
)
RETURNS TABLE (
  worker_id INT,
  work_date DATE,
  has_check_in BOOLEAN,
  has_check_out BOOLEAN,
  issue_type VARCHAR,
  needs_review BOOLEAN
) AS $$
DECLARE
  v_has_check_in BOOLEAN;
  v_has_check_out BOOLEAN;
  v_issue_type VARCHAR;
BEGIN
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
  v_issue_type := CASE
    WHEN NOT v_has_check_in AND NOT v_has_check_out THEN 'NO_PUNCH'
    WHEN NOT v_has_check_in THEN 'MISSING_CHECK_IN'
    WHEN NOT v_has_check_out THEN 'MISSING_CHECK_OUT'
    ELSE 'COMPLETE'
  END;
  
  RETURN QUERY SELECT
    p_worker_id,
    p_work_date,
    v_has_check_in,
    v_has_check_out,
    v_issue_type,
    (NOT v_has_check_in OR NOT v_has_check_out);
END;
$$ LANGUAGE plpgsql;
