-- MANUAL CREATE ONLY. Review 01-preflight.sql results before running this file.
-- The qualified target is deliberately fixed to test. No IF NOT EXISTS: an
-- existing table must stop this operation instead of hiding a contract mismatch.
CREATE TABLE `test`.`attendance_source_events` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `source` VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `source_event_id` VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `content_sha256` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `worker_id` INT NULL,
  `source_person_code` VARCHAR(100) NULL,
  `source_device_id` VARCHAR(128) NULL,
  `source_device_user_id` VARCHAR(128) NULL,
  `source_identity_id` VARCHAR(128) NULL,
  `source_user_name` VARCHAR(255) NULL,
  `event_type` VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `raw_state` VARCHAR(32) NULL,
  `event_time_utc` DATETIME(6) NOT NULL,
  `received_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `status` VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `attendance_event_id` INT NULL,
  `decision_code` VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `decision_note` VARCHAR(500) NULL,
  `processed_at` DATETIME(6) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_attendance_source_key` (`source`, `source_event_id`),
  KEY `idx_attendance_source_worker_time` (`worker_id`, `event_time_utc`),
  KEY `idx_attendance_source_status_received` (`status`, `received_at`, `id`),
  KEY `idx_attendance_source_received` (`received_at`, `id`),
  KEY `idx_attendance_source_attendance` (`attendance_event_id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
