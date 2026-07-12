DROP TABLE `attendance_events`;--> statement-breakpoint
DROP TABLE `audit_log`;--> statement-breakpoint
DROP TABLE `cost_centers`;--> statement-breakpoint
DROP TABLE `deduction_rules`;--> statement-breakpoint
DROP TABLE `group_schedules`;--> statement-breakpoint
DROP TABLE `group_shifts`;--> statement-breakpoint
DROP TABLE `groups`;--> statement-breakpoint
DROP TABLE `operational_flags`;--> statement-breakpoint
DROP TABLE `pay_overrides`;--> statement-breakpoint
DROP TABLE `payroll_batch_corrections`;--> statement-breakpoint
DROP TABLE `payroll_batch_items`;--> statement-breakpoint
DROP TABLE `payroll_batch_notes`;--> statement-breakpoint
DROP TABLE `payroll_batches`;--> statement-breakpoint
DROP TABLE `work_days`;--> statement-breakpoint
DROP TABLE `worker_archive`;--> statement-breakpoint
DROP TABLE `worker_daily_finance`;--> statement-breakpoint
DROP TABLE `workers`;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `username` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` text;--> statement-breakpoint
ALTER TABLE `users` ADD `name` text;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `password_hash`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `full_name`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `phone`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `is_active`;