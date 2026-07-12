CREATE TABLE `assignment_settlements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assignment_id` int NOT NULL,
	`worker_id` int NOT NULL,
	`from_batch_id` int,
	`to_batch_id` int,
	`from_cost_center_id` int,
	`to_cost_center_id` int,
	`amount` decimal(10,2) NOT NULL,
	`days` int NOT NULL DEFAULT 1,
	`settlement_date` date NOT NULL,
	`status` enum('applied','reversed') DEFAULT 'applied',
	`applied_by` int,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`name` varchar(255) NOT NULL,
	`location` varchar(255),
	`is_active` tinyint DEFAULT 1,
	`last_seen` timestamp,
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`is_active` tinyint DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `login_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`username` varchar(100) NOT NULL,
	`login_method` varchar(50) NOT NULL,
	`status` enum('success','failed','blocked') NOT NULL,
	`ip_address` varchar(45) NOT NULL,
	`user_agent` text NOT NULL,
	`device_info` text,
	`failure_reason` text,
	`session_token` varchar(255),
	`expires_at` timestamp,
	`logout_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`type` enum('success','warning','info','error') NOT NULL DEFAULT 'info',
	`link` varchar(255),
	`is_read` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `payment_vouchers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`voucher_number` int NOT NULL,
	`cost_center_id` int,
	`voucher_date` date NOT NULL,
	`recipient_name` varchar(255) NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`description` text NOT NULL,
	`created_by` int,
	`created_at` timestamp DEFAULT 'CURRENT_TIMESTAMP',
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(100) NOT NULL,
	`name` varchar(255) NOT NULL,
	`category` varchar(100),
	`description` text,
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` varchar(255) NOT NULL,
	`auth` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`role_id` int NOT NULL,
	`permission_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`level` int DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(100) NOT NULL,
	`value` text,
	`description` text,
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `temporary_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`worker_id` int NOT NULL,
	`from_cost_center_id` int,
	`from_group_id` int,
	`to_cost_center_id` int NOT NULL,
	`to_group_id` int,
	`start_date` date NOT NULL,
	`end_date` date NOT NULL,
	`notes` text,
	`status` enum('active','cancelled') DEFAULT 'active',
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `user_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`permission_id` int NOT NULL,
	`granted` tinyint DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `user_roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`role_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
ALTER TABLE `cost_centers` DROP INDEX `cost_centers_code_unique`;--> statement-breakpoint
ALTER TABLE `deduction_rules` DROP INDEX `deduction_rules_code_unique`;--> statement-breakpoint
ALTER TABLE `groups` DROP INDEX `groups_code_unique`;--> statement-breakpoint
ALTER TABLE `payroll_batches` DROP INDEX `payroll_batches_batch_code_unique`;--> statement-breakpoint
ALTER TABLE `users` DROP INDEX `users_openId_unique`;--> statement-breakpoint
ALTER TABLE `users` DROP INDEX `users_username_unique`;--> statement-breakpoint
ALTER TABLE `workers` DROP INDEX `workers_code_unique`;--> statement-breakpoint
ALTER TABLE `operational_flags` DROP FOREIGN KEY `operational_flags_worker_id_workers_id_fk`;
--> statement-breakpoint
ALTER TABLE `operational_flags` DROP FOREIGN KEY `operational_flags_group_id_groups_id_fk`;
--> statement-breakpoint
ALTER TABLE `operational_flags` DROP FOREIGN KEY `operational_flags_cost_center_id_cost_centers_id_fk`;
--> statement-breakpoint
ALTER TABLE `operational_flags` DROP FOREIGN KEY `operational_flags_approved_by_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `operational_flags` DROP FOREIGN KEY `operational_flags_created_by_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `payroll_batch_corrections` DROP FOREIGN KEY `payroll_batch_corrections_corrector_id_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `payroll_batch_notes` DROP FOREIGN KEY `payroll_batch_notes_reviewer_id_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `payroll_batches` DROP FOREIGN KEY `payroll_batches_accountant_approved_by_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `payroll_batches` DROP FOREIGN KEY `payroll_batches_auditor_approved_by_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `payroll_batches` DROP FOREIGN KEY `payroll_batches_finance_approved_by_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `payroll_batches` DROP FOREIGN KEY `payroll_batches_rejected_by_users_id_fk`;
--> statement-breakpoint
DROP INDEX `idx_attendance_worker_id` ON `attendance_events`;--> statement-breakpoint
DROP INDEX `idx_attendance_event_time` ON `attendance_events`;--> statement-breakpoint
DROP INDEX `idx_attendance_worker_event` ON `attendance_events`;--> statement-breakpoint
DROP INDEX `idx_pay_overrides_worker_id` ON `pay_overrides`;--> statement-breakpoint
DROP INDEX `idx_pay_overrides_override_date` ON `pay_overrides`;--> statement-breakpoint
DROP INDEX `idx_pay_overrides_status` ON `pay_overrides`;--> statement-breakpoint
DROP INDEX `idx_payroll_batches_status` ON `payroll_batches`;--> statement-breakpoint
DROP INDEX `idx_payroll_batches_period_start` ON `payroll_batches`;--> statement-breakpoint
DROP INDEX `idx_payroll_batches_period_end` ON `payroll_batches`;--> statement-breakpoint
DROP INDEX `idx_payroll_batches_group_id` ON `payroll_batches`;--> statement-breakpoint
DROP INDEX `idx_workers_group_id` ON `workers`;--> statement-breakpoint
DROP INDEX `idx_workers_status` ON `workers`;--> statement-breakpoint
DROP INDEX `idx_workers_code` ON `workers`;--> statement-breakpoint
ALTER TABLE `attendance_events` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `audit_log` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `cost_centers` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `deduction_rules` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `group_schedules` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `groups` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `operational_flags` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `pay_overrides` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `payroll_batch_corrections` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `payroll_batch_items` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `payroll_batch_notes` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `payroll_batches` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `user_cost_centers` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `users` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `work_days` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `worker_archive` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `worker_daily_finance` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `workers` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `attendance_events` MODIFY COLUMN `is_automatic` tinyint;--> statement-breakpoint
ALTER TABLE `attendance_events` MODIFY COLUMN `is_automatic` tinyint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `attendance_events` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `audit_log` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `cost_centers` MODIFY COLUMN `is_active` tinyint DEFAULT 1;--> statement-breakpoint
ALTER TABLE `cost_centers` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `deduction_rules` MODIFY COLUMN `is_active` tinyint DEFAULT 1;--> statement-breakpoint
ALTER TABLE `deduction_rules` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `group_schedules` MODIFY COLUMN `is_active` tinyint DEFAULT 1;--> statement-breakpoint
ALTER TABLE `group_schedules` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `groups` MODIFY COLUMN `is_active` tinyint DEFAULT 1;--> statement-breakpoint
ALTER TABLE `groups` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `operational_flags` MODIFY COLUMN `flag_type` enum('confirm_attendance','confirm_absence','transfer','other') NOT NULL DEFAULT 'other';--> statement-breakpoint
ALTER TABLE `operational_flags` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `pay_overrides` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `payroll_batch_corrections` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `payroll_batch_items` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `payroll_batch_notes` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `payroll_batches` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `payroll_batches` MODIFY COLUMN `is_unlocked` tinyint;--> statement-breakpoint
ALTER TABLE `payroll_batches` MODIFY COLUMN `is_unlocked` tinyint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `user_cost_centers` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `is_active` tinyint DEFAULT 1;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('guard','supervisor','supervisor_tolan','supervisor_malqa','admin_affairs','accountant','auditor','finance_manager','executive','super_admin') NOT NULL DEFAULT 'guard';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `lastSignedIn` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `work_days` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `worker_archive` MODIFY COLUMN `archived_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `worker_daily_finance` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `workers` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `attendance_events` ADD `work_date` date;--> statement-breakpoint
ALTER TABLE `attendance_events` ADD `ip_address` varchar(45);--> statement-breakpoint
ALTER TABLE `attendance_events` ADD `device_info` text;--> statement-breakpoint
ALTER TABLE `group_schedules` ADD `daily_rate` decimal(10,2);--> statement-breakpoint
ALTER TABLE `groups` ADD `is_flexible_schedule` tinyint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `groups` ADD `required_hours` decimal(4,2) DEFAULT '8.00';--> statement-breakpoint
ALTER TABLE `payroll_batch_items` ADD `group_id` int;--> statement-breakpoint
ALTER TABLE `users` ADD `role_id` int;--> statement-breakpoint
ALTER TABLE `worker_daily_finance` ADD `effective_group_id` int;--> statement-breakpoint
ALTER TABLE `assignment_settlements` ADD CONSTRAINT `assignment_settlements_assignment_id_temporary_assignments_id_fk` FOREIGN KEY (`assignment_id`) REFERENCES `temporary_assignments`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `assignment_settlements` ADD CONSTRAINT `assignment_settlements_worker_id_workers_id_fk` FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `assignment_settlements` ADD CONSTRAINT `assignment_settlements_from_batch_id_payroll_batches_id_fk` FOREIGN KEY (`from_batch_id`) REFERENCES `payroll_batches`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `assignment_settlements` ADD CONSTRAINT `assignment_settlements_to_batch_id_payroll_batches_id_fk` FOREIGN KEY (`to_batch_id`) REFERENCES `payroll_batches`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `assignment_settlements` ADD CONSTRAINT `assignment_settlements_from_cost_center_id_cost_centers_id_fk` FOREIGN KEY (`from_cost_center_id`) REFERENCES `cost_centers`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `assignment_settlements` ADD CONSTRAINT `assignment_settlements_to_cost_center_id_cost_centers_id_fk` FOREIGN KEY (`to_cost_center_id`) REFERENCES `cost_centers`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `assignment_settlements` ADD CONSTRAINT `assignment_settlements_applied_by_users_id_fk` FOREIGN KEY (`applied_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `login_sessions` ADD CONSTRAINT `login_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `payment_vouchers` ADD CONSTRAINT `payment_vouchers_cost_center_id_cost_centers_id_fk` FOREIGN KEY (`cost_center_id`) REFERENCES `cost_centers`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD CONSTRAINT `push_subscriptions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `temporary_assignments` ADD CONSTRAINT `temporary_assignments_from_group_id_groups_id_fk` FOREIGN KEY (`from_group_id`) REFERENCES `groups`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `temporary_assignments` ADD CONSTRAINT `temporary_assignments_to_group_id_groups_id_fk` FOREIGN KEY (`to_group_id`) REFERENCES `groups`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_settlements_assignment_id` ON `assignment_settlements` (`assignment_id`);--> statement-breakpoint
CREATE INDEX `idx_settlements_worker_id` ON `assignment_settlements` (`worker_id`);--> statement-breakpoint
CREATE INDEX `idx_settlements_from_batch` ON `assignment_settlements` (`from_batch_id`);--> statement-breakpoint
CREATE INDEX `idx_settlements_to_batch` ON `assignment_settlements` (`to_batch_id`);--> statement-breakpoint
CREATE INDEX `devices_code_unique` ON `devices` (`code`);--> statement-breakpoint
CREATE INDEX `jobs_code_unique` ON `jobs` (`code`);--> statement-breakpoint
CREATE INDEX `idx_login_user_id` ON `login_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_login_status` ON `login_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_login_ip_address` ON `login_sessions` (`ip_address`);--> statement-breakpoint
CREATE INDEX `idx_login_created_at` ON `login_sessions` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_notifications_user_id` ON `notifications` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_notifications_is_read` ON `notifications` (`is_read`);--> statement-breakpoint
CREATE INDEX `voucher_number` ON `payment_vouchers` (`voucher_number`);--> statement-breakpoint
CREATE INDEX `permissions_code_unique` ON `permissions` (`code`);--> statement-breakpoint
CREATE INDEX `idx_push_subs_user_id` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE INDEX `roles_code_unique` ON `roles` (`code`);--> statement-breakpoint
CREATE INDEX `settings_key_unique` ON `settings` (`key`);--> statement-breakpoint
CREATE INDEX `idx_temp_assign_worker_id` ON `temporary_assignments` (`worker_id`);--> statement-breakpoint
CREATE INDEX `idx_temp_assign_to_cost_center` ON `temporary_assignments` (`to_cost_center_id`);--> statement-breakpoint
CREATE INDEX `idx_temp_assign_dates` ON `temporary_assignments` (`start_date`,`end_date`);--> statement-breakpoint
ALTER TABLE `payroll_batch_items` ADD CONSTRAINT `payroll_batch_items_group_id_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `user_cost_centers` ADD CONSTRAINT `user_cost_centers_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `user_cost_centers` ADD CONSTRAINT `user_cost_centers_cost_center_id_cost_centers_id_fk` FOREIGN KEY (`cost_center_id`) REFERENCES `cost_centers`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX `idx_attendance_work_date` ON `attendance_events` (`work_date`);--> statement-breakpoint
CREATE INDEX `idx_attendance_worker_work_date` ON `attendance_events` (`worker_id`,`work_date`);--> statement-breakpoint
CREATE INDEX `idx_audit_user_id` ON `audit_log` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_action` ON `audit_log` (`action`);--> statement-breakpoint
CREATE INDEX `idx_audit_created_at` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `cost_centers_code_unique` ON `cost_centers` (`code`);--> statement-breakpoint
CREATE INDEX `deduction_rules_code_unique` ON `deduction_rules` (`code`);--> statement-breakpoint
CREATE INDEX `idx_group_day` ON `group_schedules` (`group_id`,`day_of_week`);--> statement-breakpoint
CREATE INDEX `groups_code_unique` ON `groups` (`code`);--> statement-breakpoint
CREATE INDEX `idx_batch_corrections_batch_id` ON `payroll_batch_corrections` (`batch_id`);--> statement-breakpoint
CREATE INDEX `idx_batch_notes_batch_id` ON `payroll_batch_notes` (`batch_id`);--> statement-breakpoint
CREATE INDEX `payroll_batches_batch_code_unique` ON `payroll_batches` (`batch_code`);--> statement-breakpoint
CREATE INDEX `idx_user_cc_user_id` ON `user_cost_centers` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_user_cc_cost_center_id` ON `user_cost_centers` (`cost_center_id`);--> statement-breakpoint
CREATE INDEX `idx_user_cc_unique` ON `user_cost_centers` (`user_id`,`cost_center_id`);--> statement-breakpoint
CREATE INDEX `users_openId_unique` ON `users` (`openId`);--> statement-breakpoint
CREATE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `idx_daily_finance_effective_group` ON `worker_daily_finance` (`effective_group_id`);--> statement-breakpoint
CREATE INDEX `workers_code_unique` ON `workers` (`code`);