CREATE TABLE `attendance_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`worker_id` int NOT NULL,
	`event_type` enum('check_in','check_out') NOT NULL,
	`event_time` timestamp NOT NULL,
	`device_id` int,
	`verified_by` int,
	`method` varchar(50),
	`note` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attendance_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`action` varchar(100) NOT NULL,
	`table_name` varchar(100),
	`record_id` int,
	`old_values` text,
	`new_values` text,
	`ip_address` varchar(45),
	`user_agent` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cost_centers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`is_active` boolean DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cost_centers_id` PRIMARY KEY(`id`),
	CONSTRAINT `cost_centers_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `deduction_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`name` varchar(255) NOT NULL,
	`rule_type` enum('late','early_leave','absence','other') NOT NULL,
	`min_minutes` int DEFAULT 0,
	`max_minutes` int,
	`deduction_type` enum('fixed','percentage','hourly') NOT NULL,
	`deduction_value` decimal(10,2) NOT NULL,
	`is_active` boolean DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `deduction_rules_id` PRIMARY KEY(`id`),
	CONSTRAINT `deduction_rules_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `group_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`group_id` int NOT NULL,
	`day_of_week` int NOT NULL,
	`start_time` varchar(10) NOT NULL,
	`end_time` varchar(10) NOT NULL,
	`required_hours` decimal(4,2) NOT NULL,
	`is_active` boolean DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `group_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `group_shifts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`group_id` int NOT NULL,
	`shift_name` varchar(100) NOT NULL,
	`start_time` varchar(10) NOT NULL,
	`end_time` varchar(10) NOT NULL,
	`is_active` boolean DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `group_shifts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`name` varchar(255) NOT NULL,
	`cost_center_id` int,
	`supervisor_id` int,
	`daily_rate` decimal(10,2),
	`work_hours` decimal(4,2) DEFAULT '8.00',
	`daily_wage` decimal(10,2),
	`work_minutes` int,
	`minute_cost` decimal(10,4),
	`late_penalty_rate` decimal(5,2),
	`early_leave_penalty_rate` decimal(5,2),
	`shift_start_time` varchar(10),
	`shift_end_time` varchar(10),
	`is_active` boolean DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `groups_id` PRIMARY KEY(`id`),
	CONSTRAINT `groups_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `operational_flags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`worker_id` int NOT NULL,
	`group_id` int,
	`flag_date` date NOT NULL,
	`description` text NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`approved_by` int,
	`approved_at` timestamp,
	`approval_notes` text,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `operational_flags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pay_overrides` (
	`id` int AUTO_INCREMENT NOT NULL,
	`worker_id` int NOT NULL,
	`override_date` date NOT NULL,
	`override_type` enum('bonus','deduction','advance','emergency_call') NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`reason` text,
	`status` enum('pending','approved','rejected') DEFAULT 'pending',
	`approved_by` int,
	`approved_at` timestamp,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pay_overrides_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payroll_batch_corrections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batch_id` int NOT NULL,
	`corrector_id` int NOT NULL,
	`correction_note` text,
	`previous_status` varchar(50),
	`new_status` varchar(50),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payroll_batch_corrections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payroll_batch_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batch_id` int NOT NULL,
	`worker_id` int NOT NULL,
	`days_worked` int DEFAULT 0,
	`base_amount` decimal(10,2) DEFAULT '0.00',
	`total_deductions` decimal(10,2) DEFAULT '0.00',
	`total_bonuses` decimal(10,2) DEFAULT '0.00',
	`net_amount` decimal(10,2) DEFAULT '0.00',
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payroll_batch_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payroll_batch_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batch_id` int NOT NULL,
	`reviewer_id` int NOT NULL,
	`reviewer_role` varchar(50) NOT NULL,
	`note_type` enum('critical','warning','info') DEFAULT 'info',
	`error_location` varchar(255),
	`worker_id` int,
	`field_name` varchar(100),
	`note` text NOT NULL,
	`attachment_url` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payroll_batch_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payroll_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batch_code` varchar(50) NOT NULL,
	`period_start` date NOT NULL,
	`period_end` date NOT NULL,
	`group_id` int,
	`cost_center_id` int,
	`total_amount` decimal(12,2) DEFAULT '0.00',
	`total_workers` int DEFAULT 0,
	`total_deductions` decimal(12,2) DEFAULT '0.00',
	`total_bonuses` decimal(12,2) DEFAULT '0.00',
	`status` enum('draft','under_accountant_review','returned_from_accountant','under_financial_review','returned_from_financial_review','under_accounts_manager_review','approved','rejected_final','paid') DEFAULT 'draft',
	`rejection_count` int DEFAULT 0,
	`notes` text,
	`approved_by` int,
	`approved_at` timestamp,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`is_unlocked` boolean DEFAULT false,
	`unlock_reason` text,
	`unlocked_by` int,
	`unlocked_at` timestamp,
	CONSTRAINT `payroll_batches_id` PRIMARY KEY(`id`),
	CONSTRAINT `payroll_batches_batch_code_unique` UNIQUE(`batch_code`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64),
	`username` varchar(100) NOT NULL,
	`password_hash` varchar(255),
	`full_name` varchar(255) NOT NULL,
	`email` varchar(320),
	`phone` varchar(20),
	`is_active` boolean DEFAULT true,
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `work_days` (
	`id` int AUTO_INCREMENT NOT NULL,
	`work_date` date NOT NULL,
	`day_type` enum('normal','holiday','weekend') DEFAULT 'normal',
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `work_days_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `worker_archive` (
	`id` int AUTO_INCREMENT NOT NULL,
	`worker_id` int NOT NULL,
	`archived_at` timestamp NOT NULL DEFAULT (now()),
	`reason` text,
	`archived_by` int,
	CONSTRAINT `worker_archive_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `worker_daily_finance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`worker_id` int NOT NULL,
	`work_date` date NOT NULL,
	`base_amount` decimal(10,2) DEFAULT '0.00',
	`deductions` decimal(10,2) DEFAULT '0.00',
	`bonuses` decimal(10,2) DEFAULT '0.00',
	`net_amount` decimal(10,2) DEFAULT '0.00',
	`late_minutes` int DEFAULT 0,
	`early_leave_minutes` int DEFAULT 0,
	`full_day_override` boolean DEFAULT false,
	`override_reason` text,
	`override_by` int,
	`override_at` timestamp,
	`notes` text,
	`locked_batch_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `worker_daily_finance_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`full_name` varchar(255) NOT NULL,
	`national_id` varchar(20),
	`phone` varchar(20),
	`group_id` int,
	`job_id` int,
	`daily_rate` decimal(10,2),
	`photo_url` text,
	`qr_token` varchar(100),
	`manual_code` varchar(20),
	`status` enum('active','inactive','archived') DEFAULT 'active',
	`last_attendance_at` timestamp,
	`hire_date` date,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workers_id` PRIMARY KEY(`id`),
	CONSTRAINT `workers_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE INDEX `idx_attendance_worker_id` ON `attendance_events` (`worker_id`);--> statement-breakpoint
CREATE INDEX `idx_attendance_event_time` ON `attendance_events` (`event_time`);--> statement-breakpoint
CREATE INDEX `idx_attendance_worker_event` ON `attendance_events` (`worker_id`,`event_time`);--> statement-breakpoint
CREATE INDEX `idx_pay_overrides_worker_id` ON `pay_overrides` (`worker_id`);--> statement-breakpoint
CREATE INDEX `idx_pay_overrides_override_date` ON `pay_overrides` (`override_date`);--> statement-breakpoint
CREATE INDEX `idx_pay_overrides_status` ON `pay_overrides` (`status`);--> statement-breakpoint
CREATE INDEX `idx_payroll_items_batch_id` ON `payroll_batch_items` (`batch_id`);--> statement-breakpoint
CREATE INDEX `idx_payroll_items_worker_id` ON `payroll_batch_items` (`worker_id`);--> statement-breakpoint
CREATE INDEX `idx_payroll_items_batch_worker` ON `payroll_batch_items` (`batch_id`,`worker_id`);--> statement-breakpoint
CREATE INDEX `idx_payroll_batches_status` ON `payroll_batches` (`status`);--> statement-breakpoint
CREATE INDEX `idx_payroll_batches_period_start` ON `payroll_batches` (`period_start`);--> statement-breakpoint
CREATE INDEX `idx_payroll_batches_period_end` ON `payroll_batches` (`period_end`);--> statement-breakpoint
CREATE INDEX `idx_payroll_batches_group_id` ON `payroll_batches` (`group_id`);--> statement-breakpoint
CREATE INDEX `idx_daily_finance_worker_id` ON `worker_daily_finance` (`worker_id`);--> statement-breakpoint
CREATE INDEX `idx_daily_finance_work_date` ON `worker_daily_finance` (`work_date`);--> statement-breakpoint
CREATE INDEX `idx_daily_finance_locked_batch` ON `worker_daily_finance` (`locked_batch_id`);--> statement-breakpoint
CREATE INDEX `idx_daily_finance_worker_date` ON `worker_daily_finance` (`worker_id`,`work_date`);--> statement-breakpoint
CREATE INDEX `idx_workers_group_id` ON `workers` (`group_id`);--> statement-breakpoint
CREATE INDEX `idx_workers_status` ON `workers` (`status`);--> statement-breakpoint
CREATE INDEX `idx_workers_code` ON `workers` (`code`);