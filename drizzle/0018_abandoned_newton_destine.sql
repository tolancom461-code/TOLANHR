CREATE TABLE `group_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`group_id` int NOT NULL,
	`day_of_week` int NOT NULL,
	`start_time` varchar(10) NOT NULL,
	`end_time` varchar(10) NOT NULL,
	`required_hours` decimal(4,2) NOT NULL,
	`is_active` boolean DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `group_schedules_id` PRIMARY KEY(`id`)
);
