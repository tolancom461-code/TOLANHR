-- MANUAL REVIEW ONLY. Run this file separately before reviewing 02-create.sql.
-- Do not continue unless the selected schema is exactly test, the server is the
-- intended server, and existing_table_count is 0. This SELECT does not execute DDL.
USE `test`;

SELECT DATABASE() AS selected_schema,
       VERSION() AS server_version,
       @@version_comment AS server_version_comment,
       @@session.time_zone AS session_time_zone,
       CASE WHEN DATABASE() = 'test' THEN 'EXPECTED_SCHEMA' ELSE 'STOP_WRONG_SCHEMA' END AS schema_review;

SELECT SCHEMA_NAME, DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME
FROM information_schema.SCHEMATA
WHERE SCHEMA_NAME = 'test';

SELECT COUNT(*) AS existing_table_count,
       CASE WHEN COUNT(*) = 0 THEN 'ABSENT_READY_FOR_MANUAL_REVIEW' ELSE 'STOP_TABLE_ALREADY_EXISTS' END AS table_review
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'test'
  AND TABLE_NAME = 'attendance_source_events';
