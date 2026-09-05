-- ============================================================
-- Biometric integration foundation (ZKTeco ADMS / PUSH)
-- Date: 2026-08-09
--
-- No fingerprint or face templates are stored in these tables.
-- Only device metadata, worker-to-device identifiers and raw punch
-- transactions are retained.
-- ============================================================

CREATE TABLE IF NOT EXISTS `biometric_devices` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(120) NOT NULL,
  `provider` VARCHAR(50) NOT NULL DEFAULT 'zkteco_adms',
  `model` VARCHAR(80) NULL,
  `serial_number` VARCHAR(100) NOT NULL,
  `protocol_mode` ENUM('ta_push','ac_push','unknown') NOT NULL DEFAULT 'ta_push',
  `location_name` VARCHAR(160) NULL,
  `cost_center_id` INT NULL,
  `timezone` VARCHAR(64) NOT NULL DEFAULT 'Asia/Riyadh',
  `is_active` TINYINT NOT NULL DEFAULT 1,
  `firmware_version` VARCHAR(120) NULL,
  `platform` VARCHAR(120) NULL,
  `last_seen_at` DATETIME NULL,
  `last_ip_address` VARCHAR(45) NULL,
  `accept_events_after` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` INT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `biometric_devices_id` PRIMARY KEY (`id`),
  UNIQUE KEY `uq_biometric_devices_serial` (`serial_number`),
  KEY `idx_biometric_devices_active` (`is_active`),
  KEY `idx_biometric_devices_cost_center` (`cost_center_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `biometric_worker_mappings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `device_id` INT NOT NULL,
  `worker_id` INT NOT NULL,
  `device_user_id` VARCHAR(50) NOT NULL,
  `is_active` TINYINT NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `biometric_worker_mappings_id` PRIMARY KEY (`id`),
  UNIQUE KEY `uq_biometric_mapping_device_user` (`device_id`, `device_user_id`),
  KEY `idx_biometric_mapping_worker` (`worker_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `biometric_raw_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `device_id` INT NULL,
  `device_serial` VARCHAR(100) NOT NULL,
  `device_user_id` VARCHAR(50) NOT NULL,
  `event_time_local` VARCHAR(32) NOT NULL,
  `raw_status` VARCHAR(20) NULL,
  `normalized_event_type` ENUM('check_in','check_out','unknown') NOT NULL DEFAULT 'unknown',
  `verify_mode` VARCHAR(30) NULL,
  `work_code` VARCHAR(50) NULL,
  `raw_payload` TEXT NOT NULL,
  `payload_hash` CHAR(64) NOT NULL,
  `processing_status` ENUM('pending','processed','duplicate','unmapped','review','error') NOT NULL DEFAULT 'pending',
  `attendance_event_id` INT NULL,
  `error_message` VARCHAR(500) NULL,
  `source_ip` VARCHAR(45) NULL,
  `received_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `processed_at` DATETIME NULL,
  CONSTRAINT `biometric_raw_events_id` PRIMARY KEY (`id`),
  UNIQUE KEY `uq_biometric_raw_payload_hash` (`payload_hash`),
  KEY `idx_biometric_raw_device_time` (`device_id`, `event_time_local`),
  KEY `idx_biometric_raw_user_time` (`device_user_id`, `event_time_local`),
  KEY `idx_biometric_raw_status` (`processing_status`),
  KEY `idx_biometric_raw_attendance` (`attendance_event_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
