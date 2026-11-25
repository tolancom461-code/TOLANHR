import { describe, expect, it, vi } from 'vitest';
import type { Pool, PoolConnection } from 'mysql2/promise';
import { createSourcePromotionActivation } from '../attendance-source-promotion/activation';
import type { SourcePromotionConfig } from '../attendance-source-promotion/config';

const streamId = '78d31b88-7cc4-4a9d-b8ae-12b621ca7b5f';
const otherStream = '123e4567-e89b-42d3-a456-426614174099';
const config: SourcePromotionConfig = { database: 'SYNTHETIC_DATABASE', streamId, intervalMs: 2000, batchSize: 20 };
const activationRow = () => ({ id: 'primary', stream_id: streamId, activated_by: null,
  started_at_utc_iso: '2026-11-25T12:34:56.123456Z' });

function fixture() {
  const state = {
    database: config.database,
    tables: [{ ENGINE: 'InnoDB', TABLE_TYPE: 'BASE TABLE', TABLE_COLLATION: 'utf8mb4_bin' }],
    columns: [
      ['id', 'varchar', 16, false, 'ascii_bin'], ['stream_id', 'char', 36, false, 'ascii_bin'],
      ['started_at_utc', 'datetime', 6, false, null], ['activated_by', 'int', null, true, null],
    ].map(([COLUMN_NAME, DATA_TYPE, size, nullable, COLLATION_NAME]) => ({ COLUMN_NAME, DATA_TYPE,
      COLUMN_TYPE: DATA_TYPE === 'int' ? 'int' : DATA_TYPE,
      CHARACTER_MAXIMUM_LENGTH: DATA_TYPE === 'datetime' ? null : size,
      DATETIME_PRECISION: DATA_TYPE === 'datetime' ? size : null,
      IS_NULLABLE: nullable ? 'YES' : 'NO', COLLATION_NAME, COLUMN_DEFAULT: null as unknown, EXTRA: '' })),
    indexes: [{ INDEX_NAME: 'PRIMARY', NON_UNIQUE: 0, SEQ_IN_INDEX: 1, COLUMN_NAME: 'id', SUB_PART: null as number | null }],
    progress: [{ id: 'primary', stream_id: streamId }],
    activation: [] as Record<string, unknown>[],
  };
  const execute = vi.fn(async (sql: string) => {
    if (sql.includes('information_schema.TABLES')) return [state.tables];
    if (sql.includes('information_schema.COLUMNS')) return [state.columns];
    if (sql.includes('information_schema.STATISTICS')) return [state.indexes];
    if (sql.includes('FROM `attendance_biometric_import_progress`')) return [state.progress];
    if (sql.includes('FROM `attendance_source_promotion_state`')) return [state.activation];
    throw new Error('SYNTHETIC_PRIVATE_SQL');
  });
  const connection = { query: vi.fn(async () => [[{ database_name: state.database }]]), execute,
    beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
  const pool = { getConnection: vi.fn(async () => connection) };
  return { state, pool, connection, execute, activation: createSourcePromotionActivation(pool as unknown as Pool, config) };
}

describe('manual source promotion activation boundary', () => {
  it('constructs without I/O and treats an empty reviewed table as armed but inactive without creating any state', async () => {
    const f = fixture();
    expect(f.pool.getConnection).not.toHaveBeenCalled();
    expect(await f.activation.read()).toBeNull();
    expect(f.execute.mock.calls.every(([sql]) => /^SELECT\b/.test(sql))).toBe(true);
    expect(f.connection.beginTransaction).not.toHaveBeenCalled();
    expect(f.connection.commit).not.toHaveBeenCalled();
    expect(f.connection.release).toHaveBeenCalledTimes(1);
  });

  it('preserves the database UTC cutover down to six fractional digits and returns only public state fields', async () => {
    const f = fixture();
    f.state.activation = [activationRow()];
    const value = await f.activation.read();
    expect(value).toEqual({ streamId, startedAtUtc: '2026-11-25T12:34:56.123456Z' });
    expect(Object.isFrozen(value)).toBe(true);
    expect(f.execute.mock.calls.find(([sql]) => sql.includes('DATE_FORMAT'))?.[0]).toContain('%Y-%m-%dT%H:%i:%s.%fZ');
    f.state.activation = [{ ...activationRow(), activated_by: 7 }];
    expect(await f.activation.read()).toEqual(value);
  });

  it('uses a caller-owned transaction connection for the shared row lock without acquiring or closing another connection', async () => {
    const f = fixture();
    f.state.activation = [activationRow()];
    await f.activation.read(f.connection as unknown as PoolConnection, true);
    expect(f.pool.getConnection).not.toHaveBeenCalled();
    expect(f.execute.mock.calls.at(-1)?.[0]).toMatch(/FROM `attendance_source_promotion_state` ORDER BY id LIMIT 2 FOR UPDATE$/);
    expect(f.connection.release).not.toHaveBeenCalled();
    expect(f.connection.beginTransaction).not.toHaveBeenCalled();
    expect(f.connection.commit).not.toHaveBeenCalled();
    expect(f.connection.rollback).not.toHaveBeenCalled();
  });

  it('refuses a row lock without a caller-owned connection before making any query', async () => {
    const f = fixture();
    await expect(f.activation.read(undefined, true)).rejects.toMatchObject({ code: 'SOURCE_PROMOTION_LOCK_CONTEXT_REQUIRED' });
    await expect(f.activation.read(undefined, 'true' as never)).rejects.toMatchObject({ code: 'SOURCE_PROMOTION_LOCK_CONTEXT_REQUIRED' });
    expect(f.pool.getConnection).not.toHaveBeenCalled();
  });

  it('checks the selected database before metadata reads and sanitizes acquisition failures', async () => {
    const f = fixture();
    f.state.database = 'OTHER_DATABASE';
    await expect(f.activation.read()).rejects.toMatchObject({ code: 'SOURCE_PROMOTION_DATABASE_MISMATCH' });
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.connection.release).toHaveBeenCalledTimes(1);
    f.pool.getConnection.mockRejectedValueOnce(new Error('SYNTHETIC_PRIVATE_SQL_AND_CREDENTIAL'));
    await expect(f.activation.read()).rejects.toMatchObject({ code: 'SOURCE_PROMOTION_STORAGE_UNAVAILABLE', message: 'SOURCE_PROMOTION_STORAGE_UNAVAILABLE' });
  });

  it('refuses missing/view/incorrect state schema, generated/default timestamps and non-full or additional indexes', async () => {
    const corruptions: Array<(state: ReturnType<typeof fixture>['state']) => void> = [
      state => { state.tables = []; }, state => { state.tables[0].TABLE_TYPE = 'VIEW'; },
      state => { state.tables[0].ENGINE = 'MyISAM'; }, state => { state.tables[0].TABLE_COLLATION = 'utf8mb4_general_ci'; },
      state => { state.columns.pop(); }, state => { state.columns[0].COLLATION_NAME = 'ascii_general_ci'; },
      state => { state.columns[2].DATETIME_PRECISION = 3; },
      state => { state.columns[2].COLUMN_DEFAULT = 'CURRENT_TIMESTAMP(6)'; },
      state => { state.columns[2].EXTRA = 'DEFAULT_GENERATED'; }, state => { state.columns[3].IS_NULLABLE = 'NO'; },
      state => { state.indexes[0].SUB_PART = 8; }, state => { state.indexes.push({ ...state.indexes[0], INDEX_NAME: 'unexpected_index' }); },
    ];
    for (const corrupt of corruptions) {
      const f = fixture();
      corrupt(f.state);
      await expect(f.activation.read()).rejects.toMatchObject({ code: 'SOURCE_PROMOTION_SCHEMA_NOT_READY' });
      expect(f.execute.mock.calls.some(([sql]) => sql.includes('FROM `attendance_source_promotion_state`'))).toBe(false);
    }
  });

  it('fails closed when import progress is absent, malformed, non-singleton or belongs to another stream', async () => {
    for (const [progress, code] of [
      [[], 'SOURCE_PROMOTION_PROGRESS_NOT_READY'],
      [[{ id: 'other', stream_id: streamId }], 'SOURCE_PROMOTION_PROGRESS_NOT_READY'],
      [[{ id: 'primary', stream_id: 'invalid' }], 'SOURCE_PROMOTION_PROGRESS_NOT_READY'],
      [[{ id: 'primary', stream_id: otherStream }], 'SOURCE_PROMOTION_PROGRESS_STREAM_MISMATCH'],
      [[{ id: 'primary', stream_id: streamId }, { id: 'extra', stream_id: streamId }], 'SOURCE_PROMOTION_PROGRESS_NOT_READY'],
    ] as Array<[Array<{ id: string; stream_id: string }>, string]>) {
      const f = fixture();
      f.state.progress = progress;
      await expect(f.activation.read()).rejects.toMatchObject({ code });
      expect(f.execute.mock.calls.some(([sql]) => sql.includes('FROM `attendance_source_promotion_state`'))).toBe(false);
    }
  });

  it('rejects activation stream mismatches, extra rows, invalid cutovers and invalid actor identifiers', async () => {
    const rows: Array<[Record<string, unknown>[], string]> = [
      [[{ ...activationRow(), stream_id: otherStream }], 'SOURCE_PROMOTION_STATE_STREAM_MISMATCH'],
      [[{ ...activationRow(), stream_id: 'invalid' }], 'SOURCE_PROMOTION_STATE_INVALID'],
      [[{ ...activationRow(), id: 'other' }], 'SOURCE_PROMOTION_STATE_INVALID'],
      [[activationRow(), activationRow()], 'SOURCE_PROMOTION_STATE_INVALID'],
      [[{ ...activationRow(), started_at_utc_iso: '2026-02-30T12:34:56.123456Z' }], 'SOURCE_PROMOTION_STATE_INVALID'],
      [[{ ...activationRow(), started_at_utc_iso: '2026-11-25T12:34:56.123Z' }], 'SOURCE_PROMOTION_STATE_INVALID'],
      [[{ ...activationRow(), activated_by: 0 }], 'SOURCE_PROMOTION_STATE_INVALID'],
      [[{ ...activationRow(), activated_by: '7' }], 'SOURCE_PROMOTION_STATE_INVALID'],
    ];
    for (const [activation, code] of rows) {
      const f = fixture();
      f.state.activation = activation;
      await expect(f.activation.read()).rejects.toMatchObject({ code });
    }
  });

  it('rechecks database and progress even after caching schema readiness and retries failed schema readiness', async () => {
    const f = fixture();
    await f.activation.read();
    f.state.activation = [activationRow()];
    expect(await f.activation.read()).toMatchObject({ streamId });
    expect(f.execute.mock.calls.filter(([sql]) => sql.includes('information_schema.TABLES'))).toHaveLength(1);
    expect(f.connection.query).toHaveBeenCalledTimes(2);
    f.state.progress[0].stream_id = otherStream;
    await expect(f.activation.read()).rejects.toMatchObject({ code: 'SOURCE_PROMOTION_PROGRESS_STREAM_MISMATCH' });
    const failed = fixture();
    failed.state.columns[2].DATETIME_PRECISION = 3;
    await expect(failed.activation.read()).rejects.toMatchObject({ code: 'SOURCE_PROMOTION_SCHEMA_NOT_READY' });
    failed.state.columns[2].DATETIME_PRECISION = 6;
    expect(await failed.activation.read()).toBeNull();
  });
});
