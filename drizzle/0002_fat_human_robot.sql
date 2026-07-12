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
CREATE TABLE `devices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`name` varchar(255) NOT NULL,
	`location` varchar(255),
	`is_active` boolean DEFAULT true,
	`last_seen` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `devices_id` PRIMARY KEY(`id`),
	CONSTRAINT `devices_code_unique` UNIQUE(`code`)
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
	`is_active` boolean DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `groups_id` PRIMARY KEY(`id`),
	CONSTRAINT `groups_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`is_active` boolean DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `jobs_code_unique` UNIQUE(`code`)
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
CREATE TABLE `payroll_batch_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batch_id` int NOT NULL,
	`worker_id` int NOT NULL,
	`days_worked` int DEFAULT 0,
	`base_amount` decimal(10,2) DEFAULT '0.00',
	`total_deductions` decimal(10,2) DEFAULT '0.00',
	`total_bonuses` decimal(10,2) DEFAULT '0.00',
	`net_amount` decimal(10,2) DEFAULT '0.00',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payroll_batch_items_id` PRIMARY KEY(`id`)
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
	`status` enum('draft','pending','approved','paid') DEFAULT 'draft',
	`approved_by` int,
	`approved_at` timestamp,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payroll_batches_id` PRIMARY KEY(`id`),
	CONSTRAINT `payroll_batches_batch_code_unique` UNIQUE(`batch_code`)
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(100) NOT NULL,
	`name` varchar(255) NOT NULL,
	`category` varchar(100),
	`description` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `permissions_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`role_id` int NOT NULL,
	`permission_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `role_permissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`level` int DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `roles_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(100) NOT NULL,
	`value` text,
	`description` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `user_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`permission_id` int NOT NULL,
	`granted` boolean DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_permissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`role_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_roles_id` PRIMARY KEY(`id`)
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
	`role_id` int,
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
	`notes` text,
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
