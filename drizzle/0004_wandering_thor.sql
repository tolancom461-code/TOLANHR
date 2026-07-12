ALTER TABLE `operational_flags` ADD `cost_center_id` int;--> statement-breakpoint
ALTER TABLE `operational_flags` ADD `flag_type` enum('confirm_attendance','confirm_absence','other') DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE `operational_flags` ADD CONSTRAINT `operational_flags_cost_center_id_cost_centers_id_fk` FOREIGN KEY (`cost_center_id`) REFERENCES `cost_centers`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX `idx_op_flags_worker_id` ON `operational_flags` (`worker_id`);--> statement-breakpoint
CREATE INDEX `idx_op_flags_flag_date` ON `operational_flags` (`flag_date`);--> statement-breakpoint
CREATE INDEX `idx_op_flags_status` ON `operational_flags` (`status`);--> statement-breakpoint
CREATE INDEX `idx_op_flags_flag_type` ON `operational_flags` (`flag_type`);