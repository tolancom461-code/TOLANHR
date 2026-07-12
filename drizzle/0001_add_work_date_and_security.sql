-- ============================================
-- Migration: Administrative Day + Security Enhancements
-- ============================================
-- Date: 2026-02-22
-- Description: 
--   1. إضافة نظام اليوم الإداري (5 AM boundary)
--   2. تعزيز الأمن بتتبع IP والأجهزة
--   3. إنشاء جدول login_sessions لتسجيل محاولات الدخول

-- ============================================
-- Part 1: Administrative Day System
-- ============================================

-- Step 1.1: Add work_date column to attendance_events (nullable initially)
ALTER TABLE `attendance_events` 
ADD COLUMN `work_date` DATE NULL COMMENT 'تاريخ اليوم الإداري (5 AM boundary)';

-- Step 1.2: Add indexes for work_date (performance optimization)
CREATE INDEX `idx_attendance_work_date` ON `attendance_events` (`work_date`);
CREATE INDEX `idx_attendance_worker_work_date` ON `attendance_events` (`worker_id`, `work_date`);

-- ============================================
-- Part 2: Security Enhancements
-- ============================================

-- Step 2.1: Add security fields to attendance_events
ALTER TABLE `attendance_events` 
ADD COLUMN `ip_address` VARCHAR(45) NULL COMMENT 'IP address of the device (IPv4 or IPv6)',
ADD COLUMN `device_info` TEXT NULL COMMENT 'User Agent / Device Name';

-- Step 2.2: Add indexes to audit_log for better performance
CREATE INDEX `idx_audit_user_id` ON `audit_log` (`user_id`);
CREATE INDEX `idx_audit_action` ON `audit_log` (`action`);
CREATE INDEX `idx_audit_created_at` ON `audit_log` (`created_at`);

-- Step 2.3: Create login_sessions table
CREATE TABLE `login_sessions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NULL,
  `username` VARCHAR(100) NOT NULL,
  `login_method` VARCHAR(50) NOT NULL COMMENT 'password, oauth, etc.',
  `status` ENUM('success', 'failed', 'blocked') NOT NULL,
  `ip_address` VARCHAR(45) NOT NULL COMMENT 'إلزامي - IP address',
  `user_agent` TEXT NOT NULL COMMENT 'إلزامي - User Agent string',
  `device_info` TEXT NULL COMMENT 'معلومات إضافية عن الجهاز',
  `failure_reason` TEXT NULL COMMENT 'سبب فشل الدخول',
  `session_token` VARCHAR(255) NULL COMMENT 'JWT token or session ID',
  `expires_at` TIMESTAMP NULL,
  `logout_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Foreign key
  CONSTRAINT `fk_login_sessions_user` 
    FOREIGN KEY (`user_id`) 
    REFERENCES `users` (`id`) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
  
  -- Indexes
  INDEX `idx_login_user_id` (`user_id`),
  INDEX `idx_login_status` (`status`),
  INDEX `idx_login_ip_address` (`ip_address`),
  INDEX `idx_login_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='تسجيل جميع محاولات الدخول للنظام';

-- ============================================
-- Part 3: Data Backfill
-- ============================================

-- Note: Backfill for work_date will be done via TypeScript script
-- Run: npx tsx scripts/backfill-work-dates.ts

-- ============================================
-- Part 4: Make work_date NOT NULL (After Backfill)
-- ============================================

-- ⚠️ Run this ONLY after successful backfill and verification
-- ALTER TABLE `attendance_events` 
-- MODIFY COLUMN `work_date` DATE NOT NULL;

-- ============================================
-- Verification Queries
-- ============================================

-- Check if work_date was added successfully
-- SELECT COUNT(*) as total, 
--        COUNT(work_date) as with_work_date, 
--        COUNT(*) - COUNT(work_date) as null_work_date 
-- FROM attendance_events;

-- Check if security fields were added
-- SHOW COLUMNS FROM attendance_events LIKE '%ip%';
-- SHOW COLUMNS FROM attendance_events LIKE '%device%';

-- Check if login_sessions table was created
-- SHOW TABLES LIKE 'login_sessions';
-- DESCRIBE login_sessions;

-- Check indexes
-- SHOW INDEX FROM attendance_events WHERE Key_name LIKE '%work_date%';
-- SHOW INDEX FROM audit_log;
-- SHOW INDEX FROM login_sessions;

-- ============================================
-- Rollback Instructions (if needed)
-- ============================================

-- To rollback this migration:
-- DROP INDEX idx_attendance_work_date ON attendance_events;
-- DROP INDEX idx_attendance_worker_work_date ON attendance_events;
-- ALTER TABLE attendance_events DROP COLUMN work_date;
-- ALTER TABLE attendance_events DROP COLUMN ip_address;
-- ALTER TABLE attendance_events DROP COLUMN device_info;
-- DROP INDEX idx_audit_user_id ON audit_log;
-- DROP INDEX idx_audit_action ON audit_log;
-- DROP INDEX idx_audit_created_at ON audit_log;
-- DROP TABLE login_sessions;
