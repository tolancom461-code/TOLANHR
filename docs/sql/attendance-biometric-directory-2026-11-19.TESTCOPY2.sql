-- MANUAL REVIEW ONLY. No application startup or migration runner applies this file.
-- New directory cache and versioned manual links only. Existing tables/rows are not altered.
-- Verify the intended server and schema, take a backup, and run statements separately.
-- Stop on any error or preexisting table; no IF NOT EXISTS hides a contract mismatch.
SELECT DATABASE() AS selected_schema, VERSION() AS server_version;
SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'TESTCOPY2'
  AND TABLE_NAME IN ('attendance_biometric_users', 'attendance_biometric_worker_links');

CREATE TABLE `TESTCOPY2`.`attendance_biometric_users` (
  `stream_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `source_identity_id` VARCHAR(128) NOT NULL,
  `device_id` VARCHAR(128) NOT NULL,
  `device_user_id` VARCHAR(128) NOT NULL,
  `display_name` VARCHAR(255) NULL DEFAULT NULL,
  `device_name` VARCHAR(255) NULL DEFAULT NULL,
  `serial_number` VARCHAR(128) NULL DEFAULT NULL,
  `status` VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `first_seen_at_utc` DATETIME(6) NULL DEFAULT NULL,
  `last_seen_at_utc` DATETIME(6) NULL DEFAULT NULL,
  `identity_started_at_utc` DATETIME(6) NULL DEFAULT NULL,
  `identity_ended_at_utc` DATETIME(6) NULL DEFAULT NULL,
  `last_synced_at_utc` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`stream_id`, `source_identity_id`),
  KEY `idx_biometric_users_roster` (`stream_id`, `status`, `source_identity_id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE `TESTCOPY2`.`attendance_biometric_worker_links` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `stream_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `source_identity_id` VARCHAR(128) NOT NULL,
  `current_source_identity_id` VARCHAR(128)
    GENERATED ALWAYS AS (CASE WHEN `status` = 'active' THEN `source_identity_id` ELSE NULL END) VIRTUAL,
  `worker_id` INT NOT NULL,
  `status` VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `device_id_snapshot` VARCHAR(128) NOT NULL,
  `device_user_id_snapshot` VARCHAR(128) NOT NULL,
  `display_name_snapshot` VARCHAR(255) NULL DEFAULT NULL,
  `device_name_snapshot` VARCHAR(255) NULL DEFAULT NULL,
  `serial_number_snapshot` VARCHAR(128) NULL DEFAULT NULL,
  `worker_name_snapshot` VARCHAR(255) NOT NULL,
  `created_by` INT NOT NULL,
  `created_at_utc` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `revoked_by` INT NULL DEFAULT NULL,
  `revoked_at_utc` DATETIME(6) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_biometric_worker_identity_active` (`stream_id`, `current_source_identity_id`),
  KEY `idx_biometric_worker_links_worker` (`worker_id`, `status`, `created_at_utc`),
  KEY `idx_biometric_worker_links_identity` (`stream_id`, `source_identity_id`, `created_at_utc`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- Source UTC fields and creation/revocation times are supplied explicitly by the application.
-- UTC_TIMESTAMP(6) is used on writes; DATETIME itself performs no timezone conversion.
-- The generated key permits one active worker per source identity, across all devices/PIN history.
-- Worker IDs may have multiple distinct identities. No automatic PIN/name/person-code matching occurs.
-- Old link rows and their creator/revoker/name snapshots remain after explicit revocation.
-- No foreign keys, cascades, triggers, attendance processing, finance work, or historical backfill.

SHOW CREATE TABLE `TESTCOPY2`.`attendance_biometric_users`;
SHOW CREATE TABLE `TESTCOPY2`.`attendance_biometric_worker_links`;

