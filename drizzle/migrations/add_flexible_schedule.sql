-- Add flexible schedule fields to groups table
ALTER TABLE `groups` ADD COLUMN `is_flexible_schedule` BOOLEAN DEFAULT false;
ALTER TABLE `groups` ADD COLUMN `required_hours` DECIMAL(4, 2) DEFAULT 8.00;
