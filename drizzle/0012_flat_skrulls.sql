DROP TABLE `permissions`;--> statement-breakpoint
DROP TABLE `role_permissions`;--> statement-breakpoint
DROP TABLE `roles`;--> statement-breakpoint
DROP TABLE `user_permissions`;--> statement-breakpoint
DROP TABLE `user_roles`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `phone_number`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `role_id`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `role`;