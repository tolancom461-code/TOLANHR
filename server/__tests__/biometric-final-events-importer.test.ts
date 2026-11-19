import { MySqlDialect } from 'drizzle-orm/mysql-core';
import type { SQL } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Express, RequestHandler } from 'express';
import { attendanceEvents, biometricFinalEventImports, settings, workerDailyFinance, workers } from '../../drizzle/schema';
import type { BiometricFinalEvent } from '../biometric-integration';
import { importOneBiometricFinalEvent, runBiometricFinalEventsImportOnce } from '../biometric-final-events-importer';
import { registerBiometricWebBridgeRoutes } from '../biometric-web-bridge';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  fetchPage: vi.fn(),
  workDate: vi.fn(),
  effectiveGroup: vi.fn(),
  payrollBatch: vi.fn(),
  recalculate: vi.fn(),
}));

vi.mock('../db/connection', () => ({ getDb: mocks.getDb }));
vi.mock('../attendance-logic', () => ({ getAdministrativeWorkDate: mocks.workDate }));
vi.mock('../db/recalculation', () => ({ getEffectiveGroupForWorkerOnDate: mocks.effectiveGroup }));
vi.mock('../db/payroll-locks', () => ({ checkPayrollBatchForDate: mocks.payrollBatch }));
vi.mock('../db/daily-finance', () => ({ processAttendanceToFinance: mocks.recalculate }));
vi.mock('../biometric-integration', () => ({ fetchBiometricFinalEventsPage: mocks.fetchPage }));

const cutoff = '2026-11-11T01:59:00.123456Z';
const administrativeDate = '2026-11-10';
const worker = { id: 21, status: 'active', groupId: 4, lastAttendanceAt: null };
const event: BiometricFinalEvent = {
  eventId: '123e4567-e89b-42d3-a456-426614174000',
  personCode: 'fixture-person',
  eventType: 'check_out',
  eventTimeUtc: cutoff,
  eventTimeLocal: '2026-11-11T04:59:00.123456',
  eventTimezone: 'Asia/Riyadh',
  verificationMethod: 'fingerprint',
  finalizationVersion: 'v1',
};

// Scripted rows exercise the importer's real query construction and control flow.
// The connection and finance modules are mocked before any imports are evaluated.
function fakeDatabase({ cursor, lockedDay = false, lockAfterCommit = false, duplicateId }: {
  cursor?: string;
  lockedDay?: boolean;
  lockAfterCommit?: boolean;
  duplicateId?: number;
} = {}) {
  const dialect = new MySqlDialect();
  const inserts: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const updates: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const financeReads: Array<{ transactional: boolean; query: ReturnType<MySqlDialect['sqlToQuery']> }> = [];
  let committed = false;

  const executor = (transactional: boolean) => ({
    select: () => ({
      from: (table: unknown) => ({
        where: (predicate: SQL) => {
          const limit = async () => {
            if (table === settings) return cursor === undefined ? [] : [{ value: cursor }];
            if (table === workers) return [worker];
            if (table === attendanceEvents) return duplicateId === undefined ? [] : [{ id: duplicateId }];
            if (table === biometricFinalEventImports) {
              const { params } = dialect.sqlToQuery(predicate);
              return inserts.filter(row => row.table === table && row.values.eventUuid === params[0]).map(row => row.values);
            }
            if (table === workerDailyFinance) {
              financeReads.push({ transactional, query: dialect.sqlToQuery(predicate) });
              return lockedDay || (committed && lockAfterCommit) ? [{ lockedBatchId: 52 }] : [];
            }
            throw new Error('Unexpected table read in importer test');
          };
          return { limit, orderBy: () => ({ limit }) };
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        if (table === settings) return {
          onDuplicateKeyUpdate: async () => { inserts.push({ table, values }); },
        };
        inserts.push({ table, values });
        return Promise.resolve(table === attendanceEvents ? [{ insertId: 81 }] : []);
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => { updates.push({ table, values }); },
      }),
    }),
  });
  const tx = executor(true);
  const db = {
    ...executor(false),
    transaction: async <T>(run: (database: typeof tx) => Promise<T>) => {
      const outcome = await run(tx);
      committed = true;
      return outcome;
    },
  };
  mocks.getDb.mockResolvedValue(db);
  return { db, tx, inserts, updates, financeReads };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('BIOMETRIC_FINAL_EVENTS_IMPORT_ENABLED', 'true');
  vi.stubEnv('BIOMETRIC_FINAL_EVENTS_IMPORT_FROM_UTC', cutoff);
  mocks.workDate.mockReturnValue(administrativeDate);
  mocks.effectiveGroup.mockResolvedValue(19);
  mocks.payrollBatch.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('biometric import write protection', () => {
  it.each([undefined, 'invalid', '2026-02-30T08:00:00Z', '2026-11-11T04:59:00+03:00'])(
    'requires a valid UTC cutover before database or upstream access (%s)', async (value) => {
      vi.stubEnv('BIOMETRIC_FINAL_EVENTS_IMPORT_FROM_UTC', value);
      const expected = { code: 'BIOMETRIC_IMPORT_CUTOFF_INVALID' };
      await expect(importOneBiometricFinalEvent(event)).rejects.toMatchObject(expected);
      await expect(runBiometricFinalEventsImportOnce()).rejects.toMatchObject(expected);
      expect(mocks.getDb).not.toHaveBeenCalled();
      expect(mocks.fetchPage).not.toHaveBeenCalled();
    },
  );

  it('refuses a Web Bridge write without a cutover', async () => {
    vi.stubEnv('BIOMETRIC_FINAL_EVENTS_IMPORT_FROM_UTC', undefined);
    const bridgeToken = 'synthetic-bridge-credential-000001';
    vi.stubEnv('BIOMETRIC_WEB_BRIDGE_INGEST_TOKEN', bridgeToken);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const app = { get: vi.fn(), post: vi.fn() };
    registerBiometricWebBridgeRoutes(app as unknown as Express);
    const handler = app.post.mock.calls[0][1] as RequestHandler;
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await handler({ headers: { authorization: `Bearer ${bridgeToken}` }, body: { apiVersion: 'v1', events: [event] } } as any, response as any, vi.fn());
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith({ error: 'BIOMETRIC_IMPORT_CUTOFF_INVALID' });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('audits an old movement even when its source cursor is new, with microsecond precision', async () => {
    const fixture = fakeDatabase({ cursor: '41' });
    const old = { ...event, eventTimeUtc: '2026-11-11T01:59:00.123455Z' };
    mocks.fetchPage.mockResolvedValue({ items: [old], page: { nextAfterId: '42', hasMore: false } });
    await expect(runBiometricFinalEventsImportOnce()).resolves.toMatchObject({ cursor: '42', counts: { before_cutoff: 1 } });
    expect(fixture.inserts).toEqual([
      { table: biometricFinalEventImports, values: expect.objectContaining({ status: 'before_cutoff', attendanceEventId: null }) },
      { table: settings, values: expect.objectContaining({ value: '42' }) },
    ]);
    await expect(importOneBiometricFinalEvent(old)).resolves.toMatchObject({ status: 'already_processed' });
    expect(mocks.recalculate).not.toHaveBeenCalled();
  });

  it('preserves first-start tail initialization without importing a preexisting event', async () => {
    const fixture = fakeDatabase();
    mocks.fetchPage.mockResolvedValue({ items: [event], page: { nextAfterId: '15', hasMore: false } });
    await expect(runBiometricFinalEventsImportOnce()).resolves.toMatchObject({ state: 'initialized', cursor: '15', skippedHistorical: 1 });
    expect(fixture.inserts).toEqual([{ table: settings, values: expect.objectContaining({ value: '15' }) }]);
  });

  it('audits a locked daily finance row before writing attendance', async () => {
    const fixture = fakeDatabase({ lockedDay: true });
    await expect(importOneBiometricFinalEvent(event)).resolves.toMatchObject({ status: 'period_locked', attendanceEventId: null });
    expect(fixture.financeReads).toEqual([{ transactional: true, query: expect.objectContaining({
      sql: expect.stringContaining('`worker_daily_finance`.`locked_batch_id` is not null'),
      params: [worker.id, administrativeDate],
    }) }]);
    expect(fixture.inserts).toEqual([{ table: biometricFinalEventImports, values: expect.objectContaining({ status: 'period_locked' }) }]);
    expect(mocks.recalculate).not.toHaveBeenCalled();
  });

  it('checks the payroll batch of the effective group on the administrative day', async () => {
    const fixture = fakeDatabase();
    mocks.payrollBatch.mockResolvedValue({ id: 52 });
    await expect(importOneBiometricFinalEvent(event)).resolves.toMatchObject({ status: 'period_locked' });
    expect(mocks.workDate).toHaveBeenCalledWith(new Date('2026-11-11T01:59:00.123Z'));
    expect(mocks.effectiveGroup).toHaveBeenCalledWith(worker.id, administrativeDate, fixture.tx);
    expect(mocks.payrollBatch).toHaveBeenCalledWith(administrativeDate, 19, fixture.tx);
    expect(fixture.inserts.map(row => row.table)).toEqual([biometricFinalEventImports]);
  });

  it('keeps the saved attendance and skips finance when a lock appears after commit', async () => {
    const fixture = fakeDatabase({ lockAfterCommit: true });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(importOneBiometricFinalEvent(event)).resolves.toMatchObject({ status: 'processed', attendanceEventId: 81 });
    expect(fixture.financeReads.map(read => read.transactional)).toEqual([true, false]);
    expect(fixture.inserts.map(row => row.table)).toEqual([attendanceEvents, biometricFinalEventImports]);
    expect(fixture.updates).toContainEqual({ table: biometricFinalEventImports, values: { message: expect.stringContaining('period became locked') } });
    expect(mocks.recalculate).not.toHaveBeenCalled();
  });

  it('imports at the inclusive cutoff and recalculates an unlocked day only once on UUID replay', async () => {
    const fixture = fakeDatabase();
    await expect(importOneBiometricFinalEvent(event)).resolves.toMatchObject({ status: 'processed', attendanceEventId: 81 });
    await expect(importOneBiometricFinalEvent(event)).resolves.toMatchObject({ status: 'already_processed', attendanceEventId: 81 });
    expect(fixture.inserts).toEqual([
      { table: attendanceEvents, values: expect.objectContaining({ method: 'biometric', workDate: administrativeDate }) },
      { table: biometricFinalEventImports, values: expect.objectContaining({ status: 'processed', attendanceEventId: 81 }) },
    ]);
    expect(mocks.payrollBatch).toHaveBeenNthCalledWith(2, administrativeDate, 19, fixture.db);
    expect(mocks.recalculate).toHaveBeenCalledTimes(1);
    expect(mocks.recalculate).toHaveBeenCalledWith(worker.id, administrativeDate);
  });

  it('preserves an existing matching attendance row', async () => {
    const fixture = fakeDatabase({ duplicateId: 72 });
    await expect(importOneBiometricFinalEvent(event)).resolves.toMatchObject({ status: 'duplicate', attendanceEventId: 72 });
    expect(fixture.inserts.map(row => row.table)).toEqual([biometricFinalEventImports]);
    expect(fixture.updates).toEqual([]);
    expect(mocks.recalculate).not.toHaveBeenCalled();
  });
});
