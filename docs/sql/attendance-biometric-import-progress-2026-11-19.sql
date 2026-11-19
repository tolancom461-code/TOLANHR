-- MANUAL CREATE ONLY. Review the selected server/database and inspect existing table names first.
-- The qualified target is fixed to test. Existing attendance, payroll and settings tables are not altered.
-- No IF NOT EXISTS: an existing table must stop creation for operator review.
CREATE TABLE `test`.`attendance_biometric_import_progress` (
  `id` VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `stream_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `schema_version` TINYINT UNSIGNED NOT NULL,
  `tail_cursor` VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `reconcile_cursor` VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `updated_at` DATETIME(6) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
