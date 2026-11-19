import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptureSourceEvent, SourceEventRecord } from '../attendance-source-inbox/types';
import { readBiometricSourceImportConfig } from '../biometric-source-importer/config';
import { createSourcePunchHttpClient } from '../biometric-source-importer/http-source';
import { createBiometricSourceImporter, sourcePunchInboxKey } from '../biometric-source-importer/runner';
import type { ImportProgress, SourcePunch, SourcePunchPage } from '../biometric-source-importer/types';
import { startBiometricSourceImporter } from '../biometric-source-importer/runtime';
import { createMysqlSourceImportProgressStore } from '../biometric-source-importer/mysql-progress';
import type { Pool } from 'mysql2/promise';

const streamId = '123e4567-e89b-42d3-a456-426614174000';
const otherStream = '123e4567-e89b-42d3-a456-426614174001';
const token = 'synthetic_'.repeat(6);
const states: SourcePunch['eventType'][] = ['check_in', 'check_out', 'break_out', 'break_in', 'overtime_in', 'overtime_out'];
const event = (id = '1', code = 0): SourcePunch => ({ sourceEventId: id, sourceDeviceId: 'SYNTHETIC-DEVICE',
  sourceDeviceUserId: '00017', sourceIdentityId: 'SYNTHETIC-IDENTITY', eventType: states[code],
  rawState: String(code), eventTimeUtc: '2026-11-19T10:00:00.123456Z' });
const page = (items: SourcePunch[] = [], nextCursor = '0', hasMore = false): SourcePunchPage =>
  ({ schemaVersion: 1, streamId, items, nextCursor, hasMore });
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json' },
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

function runnerFixture() {
  let state: ImportProgress | null = null;
  const progress = { load: vi.fn(async () => state), save: vi.fn(async (value: ImportProgress) => { state = value; }) };
  const seen = new Set<string>();
  const capture = vi.fn(async (value: CaptureSourceEvent) => {
    const replayed = seen.has(value.sourceEventId);
    seen.add(value.sourceEventId);
    return { event: {} as SourceEventRecord, replayed };
  });
  const inbox = { assertReady: vi.fn(async () => {}), capture };
  const source = { fetchPage: vi.fn(async ({ afterId }: { afterId: string; limit: number }) => page([], afterId)) };
  return { progress, inbox, source, state: () => state,
    create: (maxPages = 5, pageSize = 100) => createBiometricSourceImporter({ progress, inbox, source, streamId, maxPages, pageSize }) };
}

describe('archive-only biometric source import configuration and HTTP boundary', () => {
  it('defaults to disabled and requires separate, complete opt-in configuration', () => {
    expect(readBiometricSourceImportConfig({})).toBeNull();
    expect(readBiometricSourceImportConfig({ BIOMETRIC_SOURCE_IMPORT_ENABLED: 'TRUE' })).toBeNull();
    const env = { BIOMETRIC_SOURCE_IMPORT_ENABLED: 'true', BIOMETRIC_SOURCE_API_URL: 'https://synthetic.example',
      BIOMETRIC_SOURCE_API_TOKEN: token, BIOMETRIC_SOURCE_STREAM_ID: streamId,
      ATTENDANCE_SOURCE_DB_CONFIRMED_NAME: 'SYNTHETIC_DATABASE' };
    expect(readBiometricSourceImportConfig(env)).toEqual({ apiUrl: 'https://synthetic.example', token, streamId,
      expectedDatabase: 'SYNTHETIC_DATABASE', intervalMs: 30000, pageSize: 100, maxPages: 5 });
    for (const change of [{ BIOMETRIC_SOURCE_API_TOKEN: 'short' }, { BIOMETRIC_SOURCE_STREAM_ID: 'invalid' },
      { BIOMETRIC_SOURCE_API_URL: 'http://external.example' }, { BIOMETRIC_SOURCE_API_URL: 'https://user:pass@synthetic.example' },
      { BIOMETRIC_SOURCE_API_URL: 'https://synthetic.example/api/v1' }, { ATTENDANCE_SOURCE_DB_CONFIRMED_NAME: 'bad-name' }]) {
      expect(() => readBiometricSourceImportConfig({ ...env, ...change })).toThrow();
    }
  });

  it('sends a read-only authenticated request and preserves six states, leading zero PINs and UTC microseconds', async () => {
    const fetchFn = vi.fn(async () => response(page(states.map((_value, code) => event(String(code + 1), code)), '6')));
    const source = createSourcePunchHttpClient({ apiUrl: 'https://synthetic.example', token, streamId }, { fetchFn });
    const result = await source.fetchPage({ afterId: '0', limit: 100 });
    const [url, options] = fetchFn.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe('/api/v1/source-punches');
    expect(url.searchParams.get('after_id')).toBe('0');
    expect(url.searchParams.get('limit')).toBe('100');
    expect(options).toMatchObject({ method: 'GET', redirect: 'error', cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    expect(result.items.map(item => item.eventType)).toEqual(states);
    expect(result.items[0]).toMatchObject({ sourceDeviceUserId: '00017', eventTimeUtc: '2026-11-19T10:00:00.123456Z' });
  });

  it.each([401, 403])('rejects revoked or unauthorized program keys with a safe error (%s)', async status => {
    const source = createSourcePunchHttpClient({ apiUrl: 'https://synthetic.example', token, streamId }, {
      fetchFn: vi.fn(async () => response({ secret: 'SYNTHETIC-NOT-EXPOSED' }, status)),
    });
    await expect(source.fetchPage({ afterId: '0', limit: 100 })).rejects.toMatchObject({
      code: 'BIOMETRIC_SOURCE_AUTH_FAILED', message: 'BIOMETRIC_SOURCE_AUTH_FAILED',
    });
  });

  it('treats an uppercase spelling of the same UUID as the same configured stream', async () => {
    const source = createSourcePunchHttpClient({ apiUrl: 'https://synthetic.example', token, streamId: streamId.toUpperCase() }, {
      fetchFn: vi.fn(async () => response({ ...page([event()], '1'), streamId: streamId.toUpperCase() })),
    });
    expect((await source.fetchPage({ afterId: '0', limit: 100 })).streamId).toBe(streamId);
  });

  it('preserves valid Unicode identifiers while rejecting unpaired surrogate input', async () => {
    const valid = { ...event(), sourceDeviceId: 'SYNTHETIC-😀' };
    const source = createSourcePunchHttpClient({ apiUrl: 'https://synthetic.example', token, streamId }, {
      fetchFn: vi.fn(async () => response(page([valid], '1'))),
    });
    expect((await source.fetchPage({ afterId: '0', limit: 100 })).items[0].sourceDeviceId).toBe('SYNTHETIC-😀');
    const invalidSource = createSourcePunchHttpClient({ apiUrl: 'https://synthetic.example', token, streamId }, {
      fetchFn: vi.fn(async () => response(page([{ ...valid, sourceDeviceId: '\ud800' }], '1'))),
    });
    await expect(invalidSource.fetchPage({ afterId: '0', limit: 100 })).rejects.toMatchObject({ code: 'BIOMETRIC_SOURCE_RESPONSE_INVALID' });
  });

  it('rejects changed streams, invalid state/time, unknown fields and stalled or malformed cursors', async () => {
    const invalid = [
      { ...page([event()], '1'), streamId: otherStream },
      page([{ ...event(), eventType: 'check_out' }], '1'),
      page([{ ...event(), eventTimeUtc: '2026-02-30T10:00:00Z' }], '1'),
      page([{ ...event(), rawPayload: 'SYNTHETIC-RAW' } as SourcePunch], '1'),
      page([event()], '0', true), page([event()], '1.5', true), page([event()], '18446744073709551616', true),
    ];
    for (const value of invalid) {
      const source = createSourcePunchHttpClient({ apiUrl: 'https://synthetic.example', token, streamId }, {
        fetchFn: vi.fn(async () => response(value)),
      });
      await expect(source.fetchPage({ afterId: '0', limit: 100 })).rejects.toMatchObject({ code: 'BIOMETRIC_SOURCE_RESPONSE_INVALID' });
    }
  });

  it('bounds the response body even when the server omits Content-Length', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(1024 * 1024 + 1)); }, cancel });
    const source = createSourcePunchHttpClient({ apiUrl: 'https://synthetic.example', token, streamId }, {
      fetchFn: vi.fn(async () => new Response(body, { headers: { 'content-type': 'application/json' } })),
    });
    await expect(source.fetchPage({ afterId: '0', limit: 100 })).rejects.toMatchObject({ code: 'BIOMETRIC_SOURCE_RESPONSE_INVALID' });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe('bounded durable archive sweeps', () => {
  it('archives all six states with null worker/person/name and no attendance workflow dependency', async () => {
    const f = runnerFixture();
    f.source.fetchPage.mockResolvedValue(page(states.map((_value, code) => event(String(code + 1), code)), '6'));
    const result = await f.create().runOnce();
    expect(result).toMatchObject({ pages: 2, received: 12, inserted: 6, replayed: 6,
      tailCursor: '6', reconcileCursor: '0', nextCursor: '6', sweepCompleted: true });
    for (const [index, [captured]] of f.inbox.capture.mock.calls.slice(0, 6).entries()) {
      expect(captured).toEqual({ source: 'biometric', sourceEventId: sourcePunchInboxKey(streamId, String(index + 1)),
        workerId: null, sourcePersonCode: null, sourceUserName: null, sourceDeviceId: 'SYNTHETIC-DEVICE',
        sourceDeviceUserId: '00017', sourceIdentityId: 'SYNTHETIC-IDENTITY', eventType: states[index],
        rawState: String(index), eventTimeUtc: '2026-11-19T10:00:00.123456Z' });
    }
    expect(f.progress.save).toHaveBeenLastCalledWith({ schemaVersion: 1, streamId, tailCursor: '6', reconcileCursor: '0' });
  });

  it('resumes bounded progress and resets after the tail so a lower ID can appear on the next sweep', async () => {
    const f = runnerFixture();
    const importer = f.create(2, 1);
    const available = [event('2'), event('4')];
    f.source.fetchPage.mockImplementation(async ({ afterId }) => {
      const rows = available.filter(row => BigInt(row.sourceEventId) > BigInt(afterId))
        .sort((first, second) => Number(first.sourceEventId) - Number(second.sourceEventId));
      return page(rows.slice(0, 1), rows[0]?.sourceEventId ?? afterId, rows.length > 1);
    });
    expect(await importer.runOnce()).toMatchObject({ pages: 2, tailCursor: '2', reconcileCursor: '2', sweepCompleted: false });
    expect(await importer.runOnce()).toMatchObject({ pages: 2, tailCursor: '4', reconcileCursor: '0', sweepCompleted: true });
    available.push(event('1'));
    await importer.runOnce();
    expect(f.source.fetchPage.mock.calls.map(([input]) => input.afterId)).toEqual(['0', '0', '2', '2', '4', '0']);
    expect(f.inbox.capture.mock.calls.at(-1)![0].sourceEventId).toBe(sourcePunchInboxKey(streamId, '1'));
  });

  it('keeps the prior progress after partial capture failure so retry can replay already stored items', async () => {
    const f = runnerFixture();
    f.source.fetchPage.mockResolvedValue(page([event('1'), event('2')], '2'));
    const stored = new Set<string>();
    let failSecond = true;
    f.inbox.capture.mockImplementation(async input => {
      if (input.sourceEventId === sourcePunchInboxKey(streamId, '2') && failSecond) {
        failSecond = false;
        throw new Error('Synthetic capture failure');
      }
      const replayed = stored.has(input.sourceEventId);
      stored.add(input.sourceEventId);
      return { event: {} as SourceEventRecord, replayed };
    });
    const importer = f.create();
    await expect(importer.runOnce()).rejects.toMatchObject({ code: 'BIOMETRIC_SOURCE_IMPORT_FAILED' });
    expect(f.progress.save).not.toHaveBeenCalled();
    expect(f.state()).toBeNull();
    expect(await importer.runOnce()).toMatchObject({ pages: 2, replayed: 3, inserted: 1 });
    expect(f.source.fetchPage.mock.calls.map(([input]) => input.afterId)).toEqual(['0', '0', '0']);
  });

  it('rejects incompatible durable progress before any HTTP request or capture', async () => {
    const f = runnerFixture();
    f.progress.load.mockResolvedValueOnce({ schemaVersion: 1, streamId: otherStream, tailCursor: '4', reconcileCursor: '0' });
    await expect(f.create().runOnce()).rejects.toMatchObject({ code: 'BIOMETRIC_SOURCE_PROGRESS_INVALID' });
    expect(f.source.fetchPage).not.toHaveBeenCalled();
    expect(f.inbox.capture).not.toHaveBeenCalled();
  });

  it('prevents overlapping batches and permits the next batch after completion', async () => {
    const f = runnerFixture();
    let release: (value: SourcePunchPage) => void = () => {};
    f.source.fetchPage.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const importer = f.create();
    const first = importer.runOnce();
    await vi.waitFor(() => expect(f.source.fetchPage).toHaveBeenCalledTimes(1));
    expect(await importer.runOnce()).toMatchObject({ state: 'busy', pages: 0 });
    release(page());
    expect(await first).toMatchObject({ state: 'completed', sweepCompleted: true });
    expect(await importer.runOnce()).toMatchObject({ state: 'completed' });
    expect(f.source.fetchPage).toHaveBeenCalledTimes(4);
  });

  it('uses stream-scoped bounded keys independent of API token rotation', () => {
    expect(sourcePunchInboxKey(streamId, '1')).toMatch(/^bio:[a-f0-9]{64}$/);
    expect(sourcePunchInboxKey(streamId, '1')).toBe(sourcePunchInboxKey(streamId.toUpperCase(), '1'));
    expect(sourcePunchInboxKey(otherStream, '1')).not.toBe(sourcePunchInboxKey(streamId, '1'));
  });

  it('reserves reconciliation budget even while new tail pages keep arriving', async () => {
    const f = runnerFixture();
    f.source.fetchPage.mockImplementation(async ({ afterId }) => {
      const next = String(BigInt(afterId) + 1n);
      return page([event(next)], next, true);
    });
    expect(await f.create(5, 1).runOnce()).toMatchObject({ pages: 5, tailCursor: '4', reconcileCursor: '1' });
    expect(f.source.fetchPage.mock.calls.map(([input]) => input.afterId)).toEqual(['0', '1', '2', '3', '0']);
  });
});

describe('opt-in source import runtime scheduling', () => {
  const env = { BIOMETRIC_SOURCE_IMPORT_ENABLED: 'true', BIOMETRIC_SOURCE_API_URL: 'https://synthetic.example',
    BIOMETRIC_SOURCE_API_TOKEN: token, BIOMETRIC_SOURCE_STREAM_ID: streamId,
    ATTENDANCE_SOURCE_DB_CONFIRMED_NAME: 'SYNTHETIC_DATABASE' };

  it('opens no database or timer when disabled, invalid, or conflicting with an old enabled importer', () => {
    vi.useFakeTimers();
    const getPool = vi.fn();
    const diagnostic = vi.fn();
    startBiometricSourceImporter({ env: {}, getPool, diagnostic })();
    startBiometricSourceImporter({ env: { ...env, BIOMETRIC_SOURCE_API_TOKEN: 'invalid' }, getPool, diagnostic })();
    startBiometricSourceImporter({ env: { ...env, BIOMETRIC_FINAL_EVENTS_IMPORT_ENABLED: '1' }, getPool, diagnostic })();
    expect(getPool).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(diagnostic).toHaveBeenCalledWith('BIOMETRIC_SOURCE_CONFIG_INVALID');
    expect(diagnostic).toHaveBeenCalledWith('BIOMETRIC_SOURCE_IMPORT_MODE_CONFLICT');
  });

  it('logs only a fixed failure, retries after thirty seconds, and cancels retries on stop', async () => {
    vi.useFakeTimers();
    const getPool = vi.fn(async () => { throw new Error('Synthetic confidential driver details'); });
    const diagnostic = vi.fn();
    const stop = startBiometricSourceImporter({ env, getPool, diagnostic });
    await vi.advanceTimersByTimeAsync(0);
    expect(getPool).toHaveBeenCalledTimes(1);
    expect(diagnostic).toHaveBeenCalledWith('BIOMETRIC_SOURCE_IMPORT_FAILED');
    expect(diagnostic.mock.calls.some(([message]) => message.includes('confidential'))).toBe(false);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(30000);
    expect(getPool).toHaveBeenCalledTimes(2);
    stop();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60000);
    expect(getPool).toHaveBeenCalledTimes(2);
  });
});

describe('dedicated source progress storage', () => {
  function progressFixture() {
    let row: Record<string, unknown> | null = null;
    const columns = [
      ['id', 'varchar', 16, 'ascii_bin'], ['stream_id', 'char', 36, 'ascii_bin'],
      ['schema_version', 'tinyint', null, null], ['tail_cursor', 'varchar', 20, 'ascii_bin'],
      ['reconcile_cursor', 'varchar', 20, 'ascii_bin'], ['updated_at', 'datetime', 6, null],
    ].map(([COLUMN_NAME, DATA_TYPE, size, COLLATION_NAME]) => ({ COLUMN_NAME, DATA_TYPE,
      COLUMN_TYPE: DATA_TYPE === 'tinyint' ? 'tinyint unsigned' : DATA_TYPE,
      CHARACTER_MAXIMUM_LENGTH: DATA_TYPE === 'datetime' ? null : size,
      DATETIME_PRECISION: DATA_TYPE === 'datetime' ? size : null,
      IS_NULLABLE: 'NO', EXTRA: '', COLLATION_NAME }));
    const execute = vi.fn(async (sql: string, values: unknown[] = []) => {
      if (sql.includes('information_schema.TABLES')) return [[{ ENGINE: 'InnoDB', TABLE_TYPE: 'BASE TABLE', TABLE_COLLATION: 'utf8mb4_bin' }]];
      if (sql.includes('information_schema.COLUMNS')) return [columns];
      if (sql.includes('information_schema.STATISTICS')) return [[{ INDEX_NAME: 'PRIMARY', NON_UNIQUE: 0,
        SEQ_IN_INDEX: 1, COLUMN_NAME: 'id', SUB_PART: 0 }]];
      if (sql.startsWith('SELECT id,')) return [row ? [row] : []];
      if (sql.startsWith('INSERT INTO')) {
        row = { id: 'primary', stream_id: values[0], schema_version: values[1], tail_cursor: values[2], reconcile_cursor: values[3] };
        return [{ affectedRows: 1 }];
      }
      throw new Error('Unexpected progress SQL');
    });
    const connection = { query: vi.fn(async () => [[{ database_name: 'SYNTHETIC_DATABASE' }]]), execute,
      beginTransaction: vi.fn(async () => {}), commit: vi.fn(async () => {}), rollback: vi.fn(async () => {}), release: vi.fn() };
    const pool = { getConnection: vi.fn(async () => connection) } as unknown as Pool;
    return { execute, connection, store: createMysqlSourceImportProgressStore(pool, 'SYNTHETIC_DATABASE', streamId),
      setRow: (value: Record<string, unknown>) => { row = value; } };
  }

  it('persists only a singleton in the new table and never queries or changes application settings', async () => {
    const f = progressFixture();
    expect(await f.store.load()).toBeNull();
    const position: ImportProgress = { schemaVersion: 1, streamId, tailCursor: '10', reconcileCursor: '4' };
    await f.store.save(position);
    expect(await f.store.load()).toEqual(position);
    const inserts = f.execute.mock.calls.filter(([sql]) => sql.startsWith('INSERT'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0][0]).toMatch(/INSERT INTO `attendance_biometric_import_progress`/);
    expect(inserts[0][0]).toContain('UTC_TIMESTAMP(6)');
    expect(f.execute.mock.calls.every(([sql, values = []]) => !/\bsettings\b|\battendance_events\b|\bworker_daily_finance\b/.test(sql)
      && !values.includes('settings'))).toBe(true);
    expect(f.connection.commit).toHaveBeenCalledTimes(1);
  });

  it('rejects a changed stream and impossible cursor ordering without modifying its saved row', async () => {
    const f = progressFixture();
    f.setRow({ id: 'primary', stream_id: otherStream, schema_version: 1, tail_cursor: '10', reconcile_cursor: '4' });
    await expect(f.store.load()).rejects.toMatchObject({ code: 'BIOMETRIC_SOURCE_PROGRESS_INVALID' });
    await expect(f.store.save({ schemaVersion: 1, streamId, tailCursor: '10', reconcileCursor: '4' }))
      .rejects.toMatchObject({ code: 'BIOMETRIC_SOURCE_PROGRESS_INVALID' });
    expect(f.connection.rollback).toHaveBeenCalledTimes(1);
    expect(f.execute.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
    f.setRow({ id: 'primary', stream_id: streamId, schema_version: 1, tail_cursor: '4', reconcile_cursor: '10' });
    await expect(f.store.load()).rejects.toMatchObject({ code: 'BIOMETRIC_SOURCE_PROGRESS_INVALID' });
  });
});
