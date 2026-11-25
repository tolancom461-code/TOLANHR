-- MANUAL CREATE ONLY. Confirm the selected server and TESTCOPY2 database before execution.
-- An existing table must stop this CREATE for operator review; no IF NOT EXISTS.
-- Creating an empty state table does not activate attendance promotion.
CREATE TABLE `TESTCOPY2`.`attendance_source_promotion_state` (
  `id` VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `stream_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `started_at_utc` DATETIME(6) NOT NULL,
  `activated_by` INT NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- STOP AFTER CREATE. The following separate activation is intentionally commented out.
-- Run only after deployment/readiness review and confirmation of this exact configured stream.
-- The UTC cutover comes from the database clock and is not backdated.
-- Do not UPDATE historical source events, attendance or finance records for activation.
-- INSERT INTO `TESTCOPY2`.`attendance_source_promotion_state`
--   (`id`, `stream_id`, `started_at_utc`, `activated_by`)
-- VALUES ('primary', '78d31b88-7cc4-4a9d-b8ae-12b621ca7b5f', UTC_TIMESTAMP(6), NULL);
