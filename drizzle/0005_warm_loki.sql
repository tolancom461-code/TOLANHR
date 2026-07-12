CREATE TABLE `user_cost_centers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`cost_center_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_cost_centers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('guard','supervisor','admin_affairs','accountant','auditor','finance_manager','executive','super_admin') NOT NULL DEFAULT 'guard';--> statement-breakpoint
ALTER TABLE `payroll_batches` ADD `accountant_approved_by` int;--> statement-breakpoint
ALTER TABLE `payroll_batches` ADD `accountant_approved_at` timestamp;--> statement-breakpoint
ALTER TABLE `payroll_batches` ADD `auditor_approved_by` int;--> statement-breakpoint
ALTER TABLE `payroll_batches` ADD `auditor_approved_at` timestamp;--> statement-breakpoint
ALTER TABLE `payroll_batches` ADD `finance_approved_by` int;--> statement-breakpoint
ALTER TABLE `payroll_batches` ADD `finance_approved_at` timestamp;--> statement-breakpoint
ALTER TABLE `payroll_batches` ADD `rejected_by` int;--> statement-breakpoint
ALTER TABLE `payroll_batches` ADD `rejected_at` timestamp;--> statement-breakpoint
ALTER TABLE `payroll_batches` ADD `rejection_reason` text;--> statement-breakpoint
ALTER TABLE `payroll_batches` ADD `rejection_stage` varchar(50);--> statement-breakpoint
ALTER TABLE `payroll_batches` ADD CONSTRAINT `payroll_batches_accountant_approved_by_users_id_fk` FOREIGN KEY (`accountant_approved_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `payroll_batches` ADD CONSTRAINT `payroll_batches_auditor_approved_by_users_id_fk` FOREIGN KEY (`auditor_approved_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `payroll_batches` ADD CONSTRAINT `payroll_batches_finance_approved_by_users_id_fk` FOREIGN KEY (`finance_approved_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `payroll_batches` ADD CONSTRAINT `payroll_batches_rejected_by_users_id_fk` FOREIGN KEY (`rejected_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE cascade;