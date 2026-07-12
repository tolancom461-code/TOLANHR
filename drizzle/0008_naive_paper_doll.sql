ALTER TABLE `user_permissions` ADD `permission` varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE `user_permissions` ADD `scope_type` varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE `user_permissions` ADD `scope_id` varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE `user_permissions` ADD `granted_by` int;--> statement-breakpoint
ALTER TABLE `user_permissions` ADD `granted_at` timestamp DEFAULT (now()) NOT NULL;--> statement-breakpoint
ALTER TABLE `user_permissions` ADD `expires_at` timestamp;--> statement-breakpoint
ALTER TABLE `user_permissions` DROP COLUMN `permission_id`;--> statement-breakpoint
ALTER TABLE `user_permissions` DROP COLUMN `granted`;--> statement-breakpoint
ALTER TABLE `user_permissions` DROP COLUMN `created_at`;