ALTER TABLE `worker_daily_finance` ADD `full_day_override` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `worker_daily_finance` ADD `override_reason` text;--> statement-breakpoint
ALTER TABLE `worker_daily_finance` ADD `override_by` int;--> statement-breakpoint
ALTER TABLE `worker_daily_finance` ADD `override_at` timestamp;