import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { validateStreamId } from '../biometric-source-importer/config';
import type { SourcePromotionConfig } from './config';

export const SOURCE_PROMOTION_STATE_TABLE = 'attendance_source_promotion_state';
const TABLE = '`attendance_source_promotion_state`';
const PROGRESS = '`attendance_biometric_import_progress`';
const COLUMNS: Record<string, [string, number | null, boolean, string | null]> = {
  id: ['varchar', 16, false, 'ascii_bin'], stream_id: ['char', 36, false, 'ascii_bin'],
  started_at_utc: ['datetime', 6, false, null], activated_by: ['int', null, true, null],
};

export interface SourcePromotionActivation {
  streamId: string;
  startedAtUtc: string;
}

export class SourcePromotionActivationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'SourcePromotionActivationError';
  }
}

function failure(code: string) { return new SourcePromotionActivationError(`SOURCE_PROMOTION_${code}`); }

/** Read-only supplied pool. Activation is a separately reviewed, manual operator action. */
export function createSourcePromotionActivation(pool: Pool, config: SourcePromotionConfig) {
  let streamId: string;
  try {
    if (!config || typeof config.database !== 'string' || !/^[A-Za-z0-9_]+$/.test(config.database)) throw failure('CONFIG_INVALID');
    streamId = validateStreamId(config.streamId);
  } catch { throw failure('CONFIG_INVALID'); }
  const database = config.database;
  let readiness: Promise<void> | null = null;

  async function verifySchema(connection: PoolConnection) {
    const [tables] = await connection.execute<RowDataPacket[]>(
      'SELECT ENGINE, TABLE_TYPE, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
      [database, SOURCE_PROMOTION_STATE_TABLE]);
    if (tables.length !== 1 || String(tables[0].ENGINE).toUpperCase() !== 'INNODB' ||
        tables[0].TABLE_TYPE !== 'BASE TABLE' || tables[0].TABLE_COLLATION !== 'utf8mb4_bin') throw failure('SCHEMA_NOT_READY');
    const [columns] = await connection.execute<RowDataPacket[]>(
      'SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, CHARACTER_MAXIMUM_LENGTH, DATETIME_PRECISION, IS_NULLABLE, COLLATION_NAME, COLUMN_DEFAULT, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
      [database, SOURCE_PROMOTION_STATE_TABLE]);
    if (columns.length !== Object.keys(COLUMNS).length) throw failure('SCHEMA_NOT_READY');
    for (const [name, [type, size, nullable, collation]] of Object.entries(COLUMNS)) {
      const column = columns.find(item => item.COLUMN_NAME === name);
      const actualSize = type === 'datetime' ? column?.DATETIME_PRECISION : column?.CHARACTER_MAXIMUM_LENGTH;
      if (!column || column.DATA_TYPE !== type || column.IS_NULLABLE !== (nullable ? 'YES' : 'NO') ||
          column.COLLATION_NAME !== collation || column.COLUMN_DEFAULT !== null || column.EXTRA !== '' ||
          (size !== null && Number(actualSize) !== size) ||
          (name === 'activated_by' && /\bunsigned\b/i.test(column.COLUMN_TYPE))) throw failure('SCHEMA_NOT_READY');
    }
    const [indexes] = await connection.execute<RowDataPacket[]>(
      'SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY INDEX_NAME, SEQ_IN_INDEX',
      [database, SOURCE_PROMOTION_STATE_TABLE]);
    if (indexes.length !== 1 || indexes[0].INDEX_NAME !== 'PRIMARY' || indexes[0].COLUMN_NAME !== 'id' ||
        Number(indexes[0].NON_UNIQUE) !== 0 || Number(indexes[0].SEQ_IN_INDEX) !== 1 ||
        !(indexes[0].SUB_PART === null || Number(indexes[0].SUB_PART) === 0)) throw failure('SCHEMA_NOT_READY');
  }

  async function verifyProgress(connection: PoolConnection) {
    let rows: RowDataPacket[];
    try {
      [rows] = await connection.execute<RowDataPacket[]>(`SELECT id, stream_id FROM ${PROGRESS} LIMIT 2`);
    } catch { throw failure('PROGRESS_NOT_READY'); }
    if (rows.length !== 1 || rows[0].id !== 'primary') throw failure('PROGRESS_NOT_READY');
    let savedStream: string;
    try { savedStream = validateStreamId(rows[0].stream_id); }
    catch { throw failure('PROGRESS_NOT_READY'); }
    if (savedStream !== streamId) throw failure('PROGRESS_STREAM_MISMATCH');
  }

  return Object.freeze({
    async read(suppliedConnection?: PoolConnection, lock = false): Promise<SourcePromotionActivation | null> {
      if (typeof lock !== 'boolean' || (lock && !suppliedConnection)) throw failure('LOCK_CONTEXT_REQUIRED');
      let connection: PoolConnection | undefined;
      try {
        connection = suppliedConnection ?? await pool.getConnection();
        const [[selected]] = await connection.query<RowDataPacket[]>('SELECT DATABASE() AS database_name');
        if (!selected || selected.database_name !== database) throw failure('DATABASE_MISMATCH');
        if (!readiness) readiness = verifySchema(connection).catch(error => { readiness = null; throw error; });
        await readiness;
        await verifyProgress(connection);
        const [rows] = await connection.execute<RowDataPacket[]>(
          `SELECT id, stream_id, activated_by,
            DATE_FORMAT(started_at_utc, '%Y-%m-%dT%H:%i:%s.%fZ') AS started_at_utc_iso
           FROM ${TABLE} ORDER BY id LIMIT 2${lock ? ' FOR UPDATE' : ''}`);
        if (rows.length > 1 || (rows.length === 1 && rows[0].id !== 'primary')) throw failure('STATE_INVALID');
        if (!rows.length) return null;
        const row = rows[0];
        let savedStream: string;
        try { savedStream = validateStreamId(row.stream_id); }
        catch { throw failure('STATE_INVALID'); }
        if (savedStream !== streamId) throw failure('STATE_STREAM_MISMATCH');
        if (row.activated_by !== null && (typeof row.activated_by !== 'number' ||
            !Number.isSafeInteger(row.activated_by) || row.activated_by < 1 || row.activated_by > 2147483647)) throw failure('STATE_INVALID');
        const startedAtUtc = checkedTimestamp(row.started_at_utc_iso);
        return Object.freeze({ streamId, startedAtUtc });
      } catch (error) {
        if (error instanceof SourcePromotionActivationError) throw error;
        throw failure('STORAGE_UNAVAILABLE');
      } finally { if (!suppliedConnection) connection?.release(); }
    },
  });
}

function checkedTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value)) throw failure('STATE_INVALID');
  const date = new Date(`${value.slice(0, 23)}Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) !== value.slice(0, 19)) throw failure('STATE_INVALID');
  return value;
}
