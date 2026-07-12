ALTER TABLE `operational_flags` MODIFY COLUMN `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `operational_flags` ADD `approved_by` int;--> statement-breakpoint
ALTER TABLE `operational_flags` ADD `approved_at` timestamp;--> statement-breakpoint
ALTER TABLE `operational_flags` ADD `approval_notes` text;--> statement-breakpoint
ALTER TABLE `operational_flags` DROP COLUMN `flag_type`;--> statement-breakpoint
ALTER TABLE `operational_flags` DROP COLUMN `end_date`;--> statement-breakpoint
ALTER TABLE `operational_flags` DROP COLUMN `attachments`;--> statement-breakpoint
ALTER TABLE `operational_flags` DROP COLUMN `amount`;--> statement-breakpoint
ALTER TABLE `operational_flags` DROP COLUMN `resolved_by`;--> statement-breakpoint
ALTER TABLE `operational_flags` DROP COLUMN `resolved_at`;--> statement-breakpoint
ALTER TABLE `operational_flags` DROP COLUMN `resolution_action`;--> statement-breakpoint
ALTER TABLE `operational_flags` DROP COLUMN `resolution_notes`;