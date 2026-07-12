-- ============================================
-- Row Level Security (RLS) Policies
-- ============================================
-- These policies ensure data security and access control in Supabase

-- ============================================
-- 1. Enable RLS on Sensitive Tables
-- ============================================

ALTER TABLE attendance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_daily_finance ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_schedules ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. Attendance Events - RLS Policies
-- ============================================
-- Only admins and payroll managers can view attendance records

DROP POLICY IF EXISTS "attendance_select_admin" ON attendance_events;
CREATE POLICY "attendance_select_admin" ON attendance_events
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'admin' OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "attendance_insert_admin" ON attendance_events;
CREATE POLICY "attendance_insert_admin" ON attendance_events
  FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'role' = 'admin' OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "attendance_update_admin" ON attendance_events;
CREATE POLICY "attendance_update_admin" ON attendance_events
  FOR UPDATE
  USING (
    auth.jwt() ->> 'role' = 'admin' OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- ============================================
-- 3. Worker Daily Finance - RLS Policies
-- ============================================
-- Only admins and payroll managers can view payroll data

DROP POLICY IF EXISTS "daily_finance_select_admin" ON worker_daily_finance;
CREATE POLICY "daily_finance_select_admin" ON worker_daily_finance
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'admin' OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "daily_finance_insert_admin" ON worker_daily_finance;
CREATE POLICY "daily_finance_insert_admin" ON worker_daily_finance
  FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'role' = 'admin' OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- ============================================
-- 4. Payroll Batches - RLS Policies
-- ============================================
-- Only admins can view and modify payroll batches

DROP POLICY IF EXISTS "payroll_batches_select_admin" ON payroll_batches;
CREATE POLICY "payroll_batches_select_admin" ON payroll_batches
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'admin' OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "payroll_batches_insert_admin" ON payroll_batches;
CREATE POLICY "payroll_batches_insert_admin" ON payroll_batches
  FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'role' = 'admin' OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "payroll_batches_update_admin" ON payroll_batches;
CREATE POLICY "payroll_batches_update_admin" ON payroll_batches
  FOR UPDATE
  USING (
    auth.jwt() ->> 'role' = 'admin' OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- ============================================
-- 5. Group Schedules - RLS Policies
-- ============================================
-- Only admins can modify schedules

DROP POLICY IF EXISTS "group_schedules_select_all" ON group_schedules;
CREATE POLICY "group_schedules_select_all" ON group_schedules
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "group_schedules_insert_admin" ON group_schedules;
CREATE POLICY "group_schedules_insert_admin" ON group_schedules
  FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'role' = 'admin' OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "group_schedules_update_admin" ON group_schedules;
CREATE POLICY "group_schedules_update_admin" ON group_schedules
  FOR UPDATE
  USING (
    auth.jwt() ->> 'role' = 'admin' OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- ============================================
-- 6. Create Views with RLS
-- ============================================

-- View: Daily Payroll Summary (Admin Only)
DROP VIEW IF EXISTS vw_daily_payroll_summary;
CREATE VIEW vw_daily_payroll_summary AS
SELECT 
  w.id as worker_id,
  w.full_name,
  w.code,
  g.id as group_id,
  g.name as group_name,
  DATE(ae.event_time) as work_date,
  COUNT(CASE WHEN ae.event_type = 'check_in' THEN 1 END) as check_in_count,
  COUNT(CASE WHEN ae.event_type = 'check_out' THEN 1 END) as check_out_count,
  MIN(CASE WHEN ae.event_type = 'check_in' THEN ae.event_time END) as first_check_in,
  MAX(CASE WHEN ae.event_type = 'check_out' THEN ae.event_time END) as last_check_out,
  CASE 
    WHEN COUNT(CASE WHEN ae.event_type = 'check_in' THEN 1 END) = 0 THEN 'MISSING_CHECK_IN'
    WHEN COUNT(CASE WHEN ae.event_type = 'check_out' THEN 1 END) = 0 THEN 'MISSING_CHECK_OUT'
    ELSE 'COMPLETE'
  END as status
FROM workers w
JOIN groups g ON w.group_id = g.id
LEFT JOIN attendance_events ae ON w.id = ae.worker_id
WHERE w.status = 'active'
GROUP BY w.id, w.full_name, w.code, g.id, g.name, DATE(ae.event_time);

-- View: Group Payroll Summary (Admin Only)
DROP VIEW IF EXISTS vw_group_payroll_summary;
CREATE VIEW vw_group_payroll_summary AS
SELECT 
  g.id as group_id,
  g.code as group_code,
  g.name as group_name,
  DATE(ae.event_time) as work_date,
  COUNT(DISTINCT w.id) as total_employees,
  COUNT(DISTINCT CASE WHEN ae.event_type = 'check_in' THEN w.id END) as employees_checked_in,
  COUNT(DISTINCT CASE WHEN ae.event_type = 'check_out' THEN w.id END) as employees_checked_out,
  SUM(CASE WHEN ae.event_type = 'check_in' THEN 1 ELSE 0 END) as total_check_ins,
  SUM(CASE WHEN ae.event_type = 'check_out' THEN 1 ELSE 0 END) as total_check_outs
FROM groups g
JOIN workers w ON g.id = w.group_id
LEFT JOIN attendance_events ae ON w.id = ae.worker_id
WHERE g.is_active = TRUE AND w.status = 'active'
GROUP BY g.id, g.code, g.name, DATE(ae.event_time);

-- ============================================
-- 7. Grant Permissions
-- ============================================

-- Grant SELECT on views to authenticated users with admin role
GRANT SELECT ON vw_daily_payroll_summary TO authenticated;
GRANT SELECT ON vw_group_payroll_summary TO authenticated;

-- Grant EXECUTE on functions to authenticated users
GRANT EXECUTE ON FUNCTION calculate_daily_payroll(INT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_group_payroll(INT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION detect_missing_punches(INT, DATE) TO authenticated;
