-- Synthetic TolanHR acceptance fixture derived from 13 application table definitions.
-- Standalone subset: omit foreign keys outside test behavior and preserve UUID and settings uniqueness.
-- For the runner-owned MySQL schema only.

CREATE TABLE `attendance_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`worker_id` int NOT NULL,
	`event_type` enum('check_in','check_out') NOT NULL,
	`event_time` timestamp NOT NULL,
	`device_id` int,
	`verified_by` int,
	`method` varchar(50),
	`note` text,
	`is_automatic` tinyint DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`work_date` date,
	`ip_address` varchar(45),
	`device_info` text,
	PRIMARY KEY (`id`)
);


CREATE TABLE `biometric_final_event_imports` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`event_uuid` char(36) NOT NULL,
	`person_code` varchar(100) NOT NULL,
	`worker_id` int,
	`event_type` varchar(50) NOT NULL,
	`event_time_utc` datetime(6) NOT NULL,
	`status` varchar(50) NOT NULL,
	`attendance_event_id` int,
	`message` varchar(500),
	`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `uq_biometric_final_event_uuid` UNIQUE(`event_uuid`),
	PRIMARY KEY (`id`)
);


CREATE TABLE `daily_work_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`worker_id` int NOT NULL,
	`restaurant_id` int NOT NULL,
	`source_group_id` int,
	`operational_group_id` int,
	`work_date` date NOT NULL,
	`assigned_by` int,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `uq_worker_workdate` UNIQUE(`worker_id`,`work_date`),
	PRIMARY KEY (`id`)
);


CREATE TABLE `groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`name` varchar(255) NOT NULL,
	`cost_center_id` int,
	`supervisor_id` int,
	`daily_rate` decimal(10,2),
	`is_active` tinyint DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`daily_wage` decimal(10,2),
	`work_minutes` int,
	`minute_cost` decimal(10,4),
	`late_penalty_rate` decimal(5,2),
	`early_leave_penalty_rate` decimal(5,2),
	`is_flexible_schedule` tinyint DEFAULT 0,
	`is_operational_assignment_exempt` tinyint NOT NULL DEFAULT 0,
	`required_hours` decimal(4,2) DEFAULT '8.00',
	PRIMARY KEY (`id`)
);


CREATE TABLE `group_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`group_id` int NOT NULL,
	`day_of_week` int NOT NULL,
	`start_time` varchar(10) NOT NULL,
	`end_time` varchar(10) NOT NULL,
	`required_hours` decimal(4,2) NOT NULL,
	`daily_rate` decimal(10,2),
	`effective_date` date,
	`is_active` tinyint DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (`id`)
);


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
	`total_other_deductions` decimal(12,2) DEFAULT '0.00',
	`total_bonuses` decimal(12,2) DEFAULT '0.00',
	`status` enum('draft','under_accountant_review','returned_from_accountant','under_financial_review','returned_from_financial_review','under_accounts_manager_review','approved','rejected_final','paid') DEFAULT 'draft',
	`rejection_count` int DEFAULT 0,
	`notes` text,
	`approved_by` int,
	`approved_at` timestamp,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`is_unlocked` tinyint DEFAULT 0,
	`unlock_reason` text,
	`unlocked_by` int,
	`unlocked_at` timestamp,
	`accountant_approved_by` int,
	`accountant_approved_at` timestamp,
	`auditor_approved_by` int,
	`auditor_approved_at` timestamp,
	`finance_approved_by` int,
	`finance_approved_at` timestamp,
	`rejected_by` int,
	`rejected_at` timestamp,
	`rejection_reason` text,
	`rejection_stage` varchar(50),
	PRIMARY KEY (`id`)
);


CREATE TABLE `payroll_batch_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batch_id` int NOT NULL,
	`worker_id` int NOT NULL,
	`group_id` int,
	`days_worked` int DEFAULT 0,
	`base_amount` decimal(10,2) DEFAULT '0.00',
	`total_deductions` decimal(10,2) DEFAULT '0.00',
	`other_deductions` decimal(10,2) DEFAULT '0.00',
	`total_bonuses` decimal(10,2) DEFAULT '0.00',
	`net_amount` decimal(10,2) DEFAULT '0.00',
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (`id`)
);


CREATE TABLE `settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(100) NOT NULL,
	`value` text,
	`description` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (`id`)
);


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
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (`id`)
);


CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64),
	`username` varchar(100) NOT NULL,
	`password_hash` varchar(255),
	`full_name` varchar(255) NOT NULL,
	`email` varchar(320),
	`phone` varchar(20),
	`role_id` int,
	`is_active` tinyint DEFAULT 1,
	`loginMethod` varchar(64),
	`role` enum('guard','supervisor','supervisor_tolan','supervisor_malqa','admin_affairs','accountant','operations_cost_accountant','auditor','finance_manager','executive','super_admin','restaurant_operations','data_entry') NOT NULL DEFAULT 'guard',
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (`id`)
);


CREATE TABLE `work_days` (
	`id` int AUTO_INCREMENT NOT NULL,
	`work_date` date NOT NULL,
	`day_type` enum('normal','holiday','weekend') DEFAULT 'normal',
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (`id`)
);


CREATE TABLE `worker_daily_finance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`worker_id` int NOT NULL,
	`work_date` date NOT NULL,
	`check_in_time` timestamp,
	`check_out_time` timestamp,
	`worked_minutes` int DEFAULT 0,
	`financial_minutes` int DEFAULT 0,
	`base_salary` decimal(10,2) DEFAULT '0.00',
	`late_penalty` decimal(10,2) DEFAULT '0.00',
	`early_leave_penalty` decimal(10,2) DEFAULT '0.00',
	`net_salary` decimal(10,2) DEFAULT '0.00',
	`base_amount` decimal(10,2) DEFAULT '0.00',
	`deductions` decimal(10,2) DEFAULT '0.00',
	`bonuses` decimal(10,2) DEFAULT '0.00',
	`net_amount` decimal(10,2) DEFAULT '0.00',
	`late_minutes` int DEFAULT 0,
	`early_leave_minutes` int DEFAULT 0,
	`notes` text,
	`locked_batch_id` int,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`effective_group_id` int,
	PRIMARY KEY (`id`)
);


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
	`biometric_person_code` varchar(100),
	`qr_token` varchar(100),
	`manual_code` varchar(20),
	`status` enum('active','inactive','archived') DEFAULT 'active',
	`last_attendance_at` timestamp,
	`hire_date` date,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `uq_workers_biometric_person_code` UNIQUE(`biometric_person_code`),
	PRIMARY KEY (`id`)
);


CREATE INDEX `idx_attendance_work_date` ON `attendance_events` (`work_date`);

CREATE INDEX `idx_attendance_worker_work_date` ON `attendance_events` (`worker_id`,`work_date`);

CREATE INDEX `idx_biometric_import_worker` ON `biometric_final_event_imports` (`worker_id`);

CREATE INDEX `idx_biometric_import_status` ON `biometric_final_event_imports` (`status`);

CREATE INDEX `idx_dwa_restaurant_date` ON `daily_work_assignments` (`restaurant_id`,`work_date`);

CREATE INDEX `idx_dwa_date` ON `daily_work_assignments` (`work_date`);

CREATE INDEX `idx_dwa_source_group_date` ON `daily_work_assignments` (`source_group_id`,`work_date`);

CREATE INDEX `idx_dwa_operational_group_date` ON `daily_work_assignments` (`operational_group_id`,`work_date`);

CREATE INDEX `groups_code_unique` ON `groups` (`code`);

CREATE INDEX `idx_group_day` ON `group_schedules` (`group_id`,`day_of_week`);

CREATE INDEX `payroll_batches_batch_code_unique` ON `payroll_batches` (`batch_code`);

CREATE INDEX `idx_payroll_items_batch_id` ON `payroll_batch_items` (`batch_id`);

CREATE INDEX `idx_payroll_items_worker_id` ON `payroll_batch_items` (`worker_id`);

CREATE INDEX `idx_payroll_items_batch_worker` ON `payroll_batch_items` (`batch_id`,`worker_id`);

CREATE UNIQUE INDEX `settings_key_unique` ON `settings` (`key`);

CREATE INDEX `idx_temp_assign_worker_id` ON `temporary_assignments` (`worker_id`);

CREATE INDEX `idx_temp_assign_to_cost_center` ON `temporary_assignments` (`to_cost_center_id`);

CREATE INDEX `idx_temp_assign_dates` ON `temporary_assignments` (`start_date`,`end_date`);

CREATE INDEX `users_openId_unique` ON `users` (`openId`);

CREATE INDEX `users_username_unique` ON `users` (`username`);

CREATE INDEX `idx_daily_finance_worker_id` ON `worker_daily_finance` (`worker_id`);

CREATE INDEX `idx_daily_finance_work_date` ON `worker_daily_finance` (`work_date`);

CREATE INDEX `idx_daily_finance_locked_batch` ON `worker_daily_finance` (`locked_batch_id`);

CREATE INDEX `idx_daily_finance_worker_date` ON `worker_daily_finance` (`worker_id`,`work_date`);

CREATE INDEX `idx_daily_finance_effective_group` ON `worker_daily_finance` (`effective_group_id`);

CREATE INDEX `workers_code_unique` ON `workers` (`code`);
