ALTER TABLE `groups` ADD `daily_wage` decimal(10,2);--> statement-breakpoint
ALTER TABLE `groups` ADD `work_minutes` int;--> statement-breakpoint
ALTER TABLE `groups` ADD `minute_cost` decimal(10,4);--> statement-breakpoint
ALTER TABLE `groups` ADD `late_penalty_rate` decimal(5,2);--> statement-breakpoint
ALTER TABLE `groups` ADD `early_leave_penalty_rate` decimal(5,2);