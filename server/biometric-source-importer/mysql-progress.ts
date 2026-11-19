import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { validateStreamId } from './config';
import { validateImportProgress } from './runner';
import { BiometricSourceImportError, type ImportProgress, type SourceImportProgressStore } from './types';

export const BIOMETRIC_SOURCE_PROGRESS_TABLE = 'attendance_biometric_import_progress';
const TABLE = '`attendance_biometric_import_progress`';
const COLUMNS: Record<string, [string, number | null, string | null]> = {
  id: ['varchar', 16, 'ascii_bin'], stream_id: ['char', 36, 'ascii_bin'],
  schema_version: ['tinyint', null, null], tail_cursor: ['varchar', 20, 'ascii_bin'],
  reconcile_cursor: ['varchar', 20, 'ascii_bin'], updated_at: ['datetime', 6, null],
};

/** Uses only the supplied pool and new progress table; existing application settings are never read or written. */
export function createMysqlSourceImportProgressStore(pool: Pool, expectedDatabase: string, configuredStream: string): SourceImportProgressStore {
  const streamId = validateStreamId(configuredStream);
  if (typeof expectedDatabase !== 'string' || !/^[A-Za-z0-9_]+$/.test(expectedDatabase)) {
    throw new BiometricSourceImportError('BIOMETRIC_SOURCE_CONFIG_INVALID');
  }
  async function use<T>(operation: (connection: PoolConnection) => Promise<T>): Promise<T> {
    let connection: PoolConnection | undefined;
    try {
      connection = await pool.getConnection();
      const [[row]] = await connection.query<RowDataPacket[]>('SELECT DATABASE() AS database_name');
      if (row.database_name !== expectedDatabase) throw new BiometricSourceImportError('BIOMETRIC_SOURCE_DATABASE_MISMATCH');
      const [tables] = await connection.execute<RowDataPacket[]>(
        'SELECT ENGINE, TABLE_TYPE, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
        [expectedDatabase, BIOMETRIC_SOURCE_PROGRESS_TABLE]);
      if (tables.length !== 1 || tables[0].ENGINE?.toUpperCase() !== 'INNODB'
        || tables[0].TABLE_TYPE !== 'BASE TABLE' || tables[0].TABLE_COLLATION !== 'utf8mb4_bin') throw schemaError();
      const [columns] = await connection.execute<RowDataPacket[]>(
        'SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, CHARACTER_MAXIMUM_LENGTH, DATETIME_PRECISION, IS_NULLABLE, COLLATION_NAME, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
        [expectedDatabase, BIOMETRIC_SOURCE_PROGRESS_TABLE]);
      if (columns.length !== Object.keys(COLUMNS).length) throw schemaError();
      for (const [name, [type, size, collation]] of Object.entries(COLUMNS)) {
        const column = columns.find(value => value.COLUMN_NAME === name);
        const actualSize = type === 'datetime' ? column?.DATETIME_PRECISION : column?.CHARACTER_MAXIMUM_LENGTH;
        if (!column || column.DATA_TYPE !== type || column.IS_NULLABLE !== 'NO' || column.EXTRA !== ''
          || (size !== null && Number(actualSize) !== size) || column.COLLATION_NAME !== collation
          || (name === 'schema_version' && !/\bunsigned\b/i.test(column.COLUMN_TYPE))) throw schemaError();
      }
      const [indexes] = await connection.execute<RowDataPacket[]>(
        'SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY INDEX_NAME, SEQ_IN_INDEX',
        [expectedDatabase, BIOMETRIC_SOURCE_PROGRESS_TABLE]);
      if (indexes.length !== 1 || indexes[0].INDEX_NAME !== 'PRIMARY' || indexes[0].COLUMN_NAME !== 'id'
        || Number(indexes[0].NON_UNIQUE) !== 0 || Number(indexes[0].SEQ_IN_INDEX) !== 1
        || !(indexes[0].SUB_PART === null || Number(indexes[0].SUB_PART) === 0)) throw schemaError();
      return await operation(connection);
    } catch (error) {
      if (error instanceof BiometricSourceImportError) throw error;
      throw new BiometricSourceImportError('BIOMETRIC_SOURCE_PROGRESS_STORAGE_FAILED');
    } finally { connection?.release(); }
  }

  async function load(connection: PoolConnection, lock = false): Promise<ImportProgress | null> {
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT id, stream_id, schema_version, tail_cursor, reconcile_cursor FROM ${TABLE} LIMIT 2${lock ? ' FOR UPDATE' : ''}`);
    if (rows.length > 1 || (rows.length === 1 && rows[0].id !== 'primary')) throw schemaError();
    if (!rows.length) return null;
    return validateImportProgress({ schemaVersion: Number(rows[0].schema_version), streamId: rows[0].stream_id,
      tailCursor: rows[0].tail_cursor, reconcileCursor: rows[0].reconcile_cursor }, streamId);
  }

  return {
    load: () => use(connection => load(connection)),
    save(value) {
      const progress = validateImportProgress(value, streamId);
      return use(async connection => {
        await connection.beginTransaction();
        try {
          await load(connection, true);
          await connection.execute(
            `INSERT INTO ${TABLE} (id, stream_id, schema_version, tail_cursor, reconcile_cursor, updated_at)
             VALUES ('primary', ?, ?, ?, ?, UTC_TIMESTAMP(6))
             ON DUPLICATE KEY UPDATE stream_id = VALUES(stream_id), schema_version = VALUES(schema_version),
             tail_cursor = VALUES(tail_cursor), reconcile_cursor = VALUES(reconcile_cursor), updated_at = UTC_TIMESTAMP(6)`,
            [progress.streamId, progress.schemaVersion, progress.tailCursor, progress.reconcileCursor]);
          await connection.commit();
        } catch (error) {
          try { await connection.rollback(); } catch { /* Preserve the sanitized failure. */ }
          throw error;
        }
      });
    },
  };
}

function schemaError() { return new BiometricSourceImportError('BIOMETRIC_SOURCE_PROGRESS_SCHEMA_NOT_READY'); }
