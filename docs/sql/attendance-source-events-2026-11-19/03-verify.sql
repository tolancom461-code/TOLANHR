-- MANUAL METADATA VERIFICATION ONLY. No attendance or source-event rows are read.
SELECT DATABASE() AS selected_schema, VERSION() AS server_version;

SHOW CREATE TABLE `test`.`attendance_source_events`;
SHOW FULL COLUMNS FROM `test`.`attendance_source_events`;
SHOW INDEX FROM `test`.`attendance_source_events`;

SELECT TABLE_SCHEMA, TABLE_NAME, ENGINE, TABLE_COLLATION
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'test'
  AND TABLE_NAME = 'attendance_source_events';

SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, INDEX_TYPE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'test'
  AND TABLE_NAME = 'attendance_source_events'
ORDER BY INDEX_NAME, SEQ_IN_INDEX;
