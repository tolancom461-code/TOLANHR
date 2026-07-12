-- ============================================
-- Prototype: Technicians Group (مجموعة الفنيين)
-- ============================================
-- This is a sample implementation showing how the system works

-- ============================================
-- 1. Create Technicians Group
-- ============================================

INSERT INTO groups (
  code, name, cost_center_id, daily_rate, work_hours, 
  daily_wage, work_minutes, minute_cost, late_penalty_rate, 
  early_leave_penalty_rate, shift_start_time, shift_end_time, is_active
) VALUES (
  'TECH-001',
  'مجموعة الفنيين',
  1,
  500.00,
  8.00,
  500.00,
  480,
  1.04,
  5.00,
  5.00,
  '06:00',
  '14:00',
  TRUE
) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id);

-- Get the group ID for use in subsequent queries
SET @technicians_group_id = LAST_INSERT_ID();

-- ============================================
-- 2. Create Weekly Schedule for Technicians Group
-- ============================================
-- Schedule varies by day of week:
-- Friday & Thursday: 6:00 AM - 2:00 PM (8 hours)
-- Saturday to Wednesday: 1:00 PM - 8:00 PM (7 hours)

-- Thursday (4)
INSERT INTO group_schedules (
  group_id, day_of_week, start_time, end_time, required_hours, is_active
) VALUES (
  @technicians_group_id, 4, '06:00', '14:00', 8.00, TRUE
);

-- Friday (5)
INSERT INTO group_schedules (
  group_id, day_of_week, start_time, end_time, required_hours, is_active
) VALUES (
  @technicians_group_id, 5, '06:00', '14:00', 8.00, TRUE
);

-- Saturday (6)
INSERT INTO group_schedules (
  group_id, day_of_week, start_time, end_time, required_hours, is_active
) VALUES (
  @technicians_group_id, 6, '13:00', '20:00', 7.00, TRUE
);

-- Sunday (0)
INSERT INTO group_schedules (
  group_id, day_of_week, start_time, end_time, required_hours, is_active
) VALUES (
  @technicians_group_id, 0, '13:00', '20:00', 7.00, TRUE
);

-- Monday (1)
INSERT INTO group_schedules (
  group_id, day_of_week, start_time, end_time, required_hours, is_active
) VALUES (
  @technicians_group_id, 1, '13:00', '20:00', 7.00, TRUE
);

-- Tuesday (2)
INSERT INTO group_schedules (
  group_id, day_of_week, start_time, end_time, required_hours, is_active
) VALUES (
  @technicians_group_id, 2, '13:00', '20:00', 7.00, TRUE
);

-- Wednesday (3)
INSERT INTO group_schedules (
  group_id, day_of_week, start_time, end_time, required_hours, is_active
) VALUES (
  @technicians_group_id, 3, '13:00', '20:00', 7.00, TRUE
);

-- ============================================
-- 3. Create Sample Technician Workers
-- ============================================

INSERT INTO workers (
  code, full_name, national_id, phone, group_id, job_id,
  daily_rate, status, hire_date
) VALUES
  ('TECH-001-001', 'أحمد محمد علي', '123456789', '0501234567', @technicians_group_id, NULL, 500.00, 'active', '2024-01-01'),
  ('TECH-001-002', 'محمود سالم خليل', '123456790', '0501234568', @technicians_group_id, NULL, 500.00, 'active', '2024-01-01'),
  ('TECH-001-003', 'علي حسن محمود', '123456791', '0501234569', @technicians_group_id, NULL, 500.00, 'active', '2024-01-01'),
  ('TECH-001-004', 'سارة عبدالله محمد', '123456792', '0501234570', @technicians_group_id, NULL, 500.00, 'active', '2024-01-01'),
  ('TECH-001-005', 'فاطمة علي حسن', '123456793', '0501234571', @technicians_group_id, NULL, 500.00, 'active', '2024-01-01');

-- ============================================
-- 4. Sample Attendance Records (Test Data)
-- ============================================
-- These records demonstrate various scenarios:
-- - Complete attendance (check-in and check-out)
-- - Missing check-out
-- - Missing check-in
-- - Late arrival
-- - Early departure

-- Complete attendance - Thursday
INSERT INTO attendance_events (
  worker_id, event_type, event_time, method, note
) VALUES
  ((SELECT id FROM workers WHERE code = 'TECH-001-001'), 'check_in', 
   TIMESTAMP(CURDATE() - INTERVAL 1 DAY, '06:00'), 'qr_code', 'Normal check-in'),
  ((SELECT id FROM workers WHERE code = 'TECH-001-001'), 'check_out', 
   TIMESTAMP(CURDATE() - INTERVAL 1 DAY, '14:00'), 'qr_code', 'Normal check-out');

-- Missing check-out - Friday
INSERT INTO attendance_events (
  worker_id, event_type, event_time, method, note
) VALUES
  ((SELECT id FROM workers WHERE code = 'TECH-001-002'), 'check_in', 
   TIMESTAMP(CURDATE(), '06:00'), 'qr_code', 'Normal check-in');

-- Missing check-in - Saturday
INSERT INTO attendance_events (
  worker_id, event_type, event_time, method, note
) VALUES
  ((SELECT id FROM workers WHERE code = 'TECH-001-003'), 'check_out', 
   TIMESTAMP(CURDATE() + INTERVAL 1 DAY, '20:00'), 'qr_code', 'Normal check-out');

-- Late arrival - Sunday
INSERT INTO attendance_events (
  worker_id, event_type, event_time, method, note
) VALUES
  ((SELECT id FROM workers WHERE code = 'TECH-001-004'), 'check_in', 
   TIMESTAMP(CURDATE() + INTERVAL 2 DAY, '13:30'), 'qr_code', 'Late by 30 minutes'),
  ((SELECT id FROM workers WHERE code = 'TECH-001-004'), 'check_out', 
   TIMESTAMP(CURDATE() + INTERVAL 2 DAY, '20:00'), 'qr_code', 'Normal check-out');

-- Early departure - Monday
INSERT INTO attendance_events (
  worker_id, event_type, event_time, method, note
) VALUES
  ((SELECT id FROM workers WHERE code = 'TECH-001-005'), 'check_in', 
   TIMESTAMP(CURDATE() + INTERVAL 3 DAY, '13:00'), 'qr_code', 'Normal check-in'),
  ((SELECT id FROM workers WHERE code = 'TECH-001-005'), 'check_out', 
   TIMESTAMP(CURDATE() + INTERVAL 3 DAY, '19:00'), 'qr_code', 'Early departure by 1 hour');

-- ============================================
-- 5. Verification Queries
-- ============================================
-- Run these queries to verify the prototype is working

-- Check group schedules
SELECT 
  'Group Schedules' as test_name,
  day_of_week,
  start_time,
  end_time,
  required_hours
FROM group_schedules
WHERE group_id = @technicians_group_id
ORDER BY day_of_week;

-- Check workers
SELECT 
  'Workers' as test_name,
  code,
  full_name,
  daily_rate,
  status
FROM workers
WHERE group_id = @technicians_group_id;

-- Check attendance records
SELECT 
  'Attendance Records' as test_name,
  w.full_name,
  ae.event_type,
  ae.event_time,
  ae.note
FROM attendance_events ae
JOIN workers w ON ae.worker_id = w.id
WHERE w.group_id = @technicians_group_id
ORDER BY ae.event_time DESC;

-- Test daily payroll calculation
SELECT 
  'Daily Payroll' as test_name,
  worker_id,
  work_date,
  scheduled_hours,
  actual_hours,
  late_minutes,
  early_departure_minutes,
  daily_rate,
  calculated_pay,
  is_auto_completed,
  status
FROM calculate_daily_payroll(
  (SELECT id FROM workers WHERE code = 'TECH-001-001' LIMIT 1),
  CURDATE() - INTERVAL 1 DAY
);

-- Test group payroll summary
SELECT 
  'Group Payroll Summary' as test_name,
  group_id,
  work_date,
  total_employees,
  employees_with_issues,
  total_hours_worked,
  total_scheduled_hours,
  total_payroll,
  average_daily_pay
FROM calculate_group_payroll(@technicians_group_id, CURDATE());

-- Test missing punches detection
SELECT 
  'Missing Punches' as test_name,
  worker_id,
  work_date,
  has_check_in,
  has_check_out,
  issue_type,
  needs_review
FROM detect_missing_punches(
  (SELECT id FROM workers WHERE code = 'TECH-001-002' LIMIT 1),
  CURDATE()
);
