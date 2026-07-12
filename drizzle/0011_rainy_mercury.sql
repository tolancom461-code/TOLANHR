ALTER TABLE `roles` ADD `is_active` boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE `users` ADD `phone_number` varchar(20);