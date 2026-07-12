CREATE TABLE `payroll_batch_corrections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batch_id` int NOT NULL,
	`corrector_id` int NOT NULL,
	`correction_note` text,
	`previous_status` varchar(50),
	`new_status` varchar(50),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payroll_batch_corrections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payroll_batch_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batch_id` int NOT NULL,
	`reviewer_id` int NOT NULL,
	`reviewer_role` varchar(50) NOT NULL,
	`note_type` enum('critical','warning','info') DEFAULT 'info',
	`error_location` varchar(255),
	`worker_id` int,
	`field_name` varchar(100),
	`note` text NOT NULL,
	`attachment_url` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payroll_batch_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `payroll_batches` MODIFY COLUMN `status` enum('draft','under_accountant_review','returned_from_accountant','under_financial_review','returned_from_financial_review','under_accounts_manager_review','approved','rejected_final','paid') DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `payroll_batch_items` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `payroll_batch_items` ADD `updated_at` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `payroll_batches` ADD `total_workers` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `payroll_batches` ADD `total_deductions` decimal(12,2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE `payroll_batches` ADD `total_bonuses` decimal(12,2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE `payroll_batches` ADD `rejection_count` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `payroll_batches` ADD `notes` text;