ALTER TABLE `payroll_batches` ADD `is_unlocked` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `payroll_batches` ADD `unlock_reason` text;--> statement-breakpoint
ALTER TABLE `payroll_batches` ADD `unlocked_by` int;--> statement-breakpoint
ALTER TABLE `payroll_batches` ADD `unlocked_at` timestamp;