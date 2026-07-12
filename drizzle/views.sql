-- ============================================
-- SQL Views for Payroll System
-- ============================================
-- These views provide read-only access to calculated payroll data
-- All calculations are done at the database level for consistency

-- ============================================
-- 1. Daily Attendance View with Schedule Matching
-- ============================================
-- This view matches each attendance record with the appropriate schedule
-- based on the employee's group and the day of the week

CREATE OR REPLACE VIEW vw_daily_attendance AS
SELECT 
  ae.id as attendance_id,
  ae.worker_id,
  w.full_name as worker_name,
  w.group_id,
  g.name as group_name,
  DATE(ae.event_time) as work_date,
  DAYOFWEEK(ae.event_time) - 1 as day_of_week, -- 0=Sunday, 1=Monday, etc.
  gs.start_time as scheduled_start,
  gs.end_time as scheduled_end,
  gs.required_hours as scheduled_hours,
  ae.event_type,
  TIME(ae.event_time) as event_time,
  ae.method,
  ae.note
FROM attendance_events ae
JOIN workers w ON ae.worker_id = w.id
JOIN groups g ON w.group_id = g.id
LEFT JOIN group_schedules gs ON g.id = gs.group_id 
  AND (DAYOFWEEK(ae.event_time) - 1) = gs.day_of_week
WHERE ae.event_time >= DATE_SUB(NOW(), INTERVAL 90 DAY)
ORDER BY ae.event_time DESC;

-- ============================================
-- 2. Employee Daily Payroll Calculation View
-- ============================================
-- This view calculates daily payroll for each employee
-- Handles missing punches and split shifts

CREATE OR REPLACE VIEW vw_employee_daily_payroll AS
SELECT 
  w.id as worker_id,
  w.full_name as worker_name,
  w.group_id,
  g.name as group_name,
  DATE(ae_in.event_time) as work_date,
  DAYOFWEEK(ae_in.event_time) - 1 as day_of_week,
  gs.start_time as scheduled_start,
  gs.end_time as scheduled_end,
  gs.required_hours as scheduled_hours,
  -- Actual times
  TIME(ae_in.event_time) as actual_check_in,
  COALESCE(TIME(ae_out.event_time), gs.end_time) as actual_check_out,
  -- Calculate actual hours worked
  ROUND(
    TIMESTAMPDIFF(MINUTE, ae_in.event_time, 
      COALESCE(ae_out.event_time, CONCAT(DATE(ae_in.event_time), ' ', gs.end_time))) / 60.0,
    2
  ) as actual_hours,
  -- Calculate late arrival (in minutes)
  GREATEST(0, TIMESTAMPDIFF(MINUTE, 
    CONCAT(DATE(ae_in.event_time), ' ', gs.start_time),
    ae_in.event_time
  )) as late_minutes,
  -- Calculate early departure (in minutes)
  GREATEST(0, TIMESTAMPDIFF(MINUTE,
    COALESCE(ae_out.event_time, CONCAT(DATE(ae_in.event_time), ' ', gs.end_time)),
    CONCAT(DATE(ae_in.event_time), ' ', gs.end_time)
  )) as early_departure_minutes,
  -- Daily rate calculation
  COALESCE(g.daily_rate, 0) as daily_rate,
  -- Payroll calculation
  ROUND(
    (ROUND(
      TIMESTAMPDIFF(MINUTE, ae_in.event_time, 
        COALESCE(ae_out.event_time, CONCAT(DATE(ae_in.event_time), ' ', gs.end_time))) / 60.0,
      2
    ) / gs.required_hours) * COALESCE(g.daily_rate, 0),
    2
  ) as calculated_daily_pay,
  -- Flags
  CASE WHEN ae_out.id IS NULL THEN 1 ELSE 0 END as is_auto_completed_checkout,
  CASE WHEN ae_in.id IS NULL THEN 1 ELSE 0 END as is_auto_completed_checkin,
  ae_in.created_at as check_in_recorded_at,
  ae_out.created_at as check_out_recorded_at
FROM workers w
JOIN groups g ON w.group_id = g.id
JOIN attendance_events ae_in ON w.id = ae_in.worker_id AND ae_in.event_type = 'check_in'
LEFT JOIN attendance_events ae_out ON w.id = ae_out.worker_id 
  AND ae_out.event_type = 'check_out'
  AND DATE(ae_out.event_time) = DATE(ae_in.event_time)
  AND ae_out.event_time > ae_in.event_time
LEFT JOIN group_schedules gs ON g.id = gs.group_id 
  AND (DAYOFWEEK(ae_in.event_time) - 1) = gs.day_of_week
WHERE ae_in.event_time >= DATE_SUB(NOW(), INTERVAL 90 DAY)
  AND w.status = 'active'
ORDER BY ae_in.event_time DESC;

-- ============================================
-- 3. Group Payroll Summary View
-- ============================================
-- This view provides a summary of payroll by group
-- Used for batch payroll processing

CREATE OR REPLACE VIEW vw_group_payroll_summary AS
SELECT 
  g.id as group_id,
  g.code as group_code,
  g.name as group_name,
  DATE(edp.work_date) as work_date,
  COUNT(DISTINCT edp.worker_id) as total_employees,
  COUNT(DISTINCT CASE WHEN edp.is_auto_completed_checkout = 1 THEN edp.worker_id END) as employees_with_auto_checkout,
  COUNT(DISTINCT CASE WHEN edp.is_auto_completed_checkin = 1 THEN edp.worker_id END) as employees_with_auto_checkin,
  SUM(edp.actual_hours) as total_hours_worked,
  SUM(edp.scheduled_hours) as total_scheduled_hours,
  SUM(edp.calculated_daily_pay) as total_payroll,
  ROUND(AVG(edp.calculated_daily_pay), 2) as average_daily_pay,
  MIN(edp.calculated_daily_pay) as min_daily_pay,
  MAX(edp.calculated_daily_pay) as max_daily_pay
FROM vw_employee_daily_payroll edp
JOIN groups g ON edp.group_id = g.id
WHERE g.is_active = TRUE
GROUP BY g.id, g.code, g.name, DATE(edp.work_date)
ORDER BY edp.work_date DESC, g.name ASC;

-- ============================================
-- 4. Missing Punches Report View
-- ============================================
-- This view identifies records that need manual review
-- (Missing check-in or check-out)

CREATE OR REPLACE VIEW vw_missing_punches_report AS
SELECT 
  w.id as worker_id,
  w.full_name as worker_name,
  w.group_id,
  g.name as group_name,
  DATE(edp.work_date) as work_date,
  edp.actual_check_in,
  edp.actual_check_out,
  edp.is_auto_completed_checkin,
  edp.is_auto_completed_checkout,
  CASE 
    WHEN edp.is_auto_completed_checkin = 1 THEN 'Missing Check-In'
    WHEN edp.is_auto_completed_checkout = 1 THEN 'Missing Check-Out'
    ELSE 'Complete'
  END as issue_type,
  edp.calculated_daily_pay,
  'PENDING_REVIEW' as status
FROM vw_employee_daily_payroll edp
JOIN workers w ON edp.worker_id = w.id
JOIN groups g ON w.group_id = g.id
WHERE (edp.is_auto_completed_checkin = 1 OR edp.is_auto_completed_checkout = 1)
  AND edp.work_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
ORDER BY edp.work_date DESC, w.full_name ASC;
