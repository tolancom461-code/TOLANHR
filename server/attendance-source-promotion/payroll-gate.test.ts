import { describe, expect, it, vi } from 'vitest';
import type { Pool, PoolConnection } from 'mysql2/promise';
import { currentSourceAttendanceDatabase, runWithSourceAttendanceDatabase, type SourceAttendanceDatabase } from '../db/source-execution-context';
import type { SourcePromotionConfig } from './config';
import { createSourcePayrollGate } from './payroll-gate';

const config: SourcePromotionConfig = {
  database: 'owned_fixture', streamId: '78d31b88-7cc4-4a9d-b8ae-12b621ca7b5f', intervalMs: 2000, batchSize: 20,
};
const active = { streamId: config.streamId, startedAtUtc: '2026-11-25T10:00:00.000000Z' };

function fixture() {
  const events: string[] = [];
  const connection = {
    query: vi.fn(async (sql: string) => { events.push(sql); }),
    beginTransaction: vi.fn(async () => { events.push('begin'); }),
    commit: vi.fn(async () => { events.push('commit'); }),
    rollback: vi.fn(async () => { events.push('rollback'); }),
    release: vi.fn(() => { events.push('release'); }),
    destroy: vi.fn(() => { events.push('destroy'); }),
  };
  const pool = { getConnection: vi.fn(async () => { events.push('acquire'); return connection; }) };
  const database = { select: vi.fn(), insert: vi.fn(), update: vi.fn() } as unknown as SourceAttendanceDatabase;
  const read = vi.fn(async (_connection?: PoolConnection, _lock?: boolean) => {
    events.push('activation-lock');
    return active as typeof active | null;
  });
  const readConfig = vi.fn(() => config as SourcePromotionConfig | null);
  const getPool = vi.fn(async () => pool as unknown as Pool);
  const createActivation = vi.fn(() => ({ read }));
  const createDatabase = vi.fn((_connection: PoolConnection) => database);
  const gate = createSourcePayrollGate({ readConfig, getPool, createActivation, createDatabase });
  return { events, connection, pool, database, read, readConfig, getPool, createActivation, createDatabase, gate };
}

describe('source payroll gate', () => {
  it('leaves disabled payroll operations outside any connection or transaction', async () => {
    const f = fixture();
    f.readConfig.mockReturnValue(null);
    expect(f.gate.shouldUseSourcePayrollGate()).toBe(false);
    const operation = vi.fn(async () => 'legacy');
    expect(await f.gate.runWithSourcePayrollGate(operation)).toBe('legacy');
    expect(operation).toHaveBeenCalledTimes(1);
    expect(f.getPool).not.toHaveBeenCalled();
    expect(currentSourceAttendanceDatabase()).toBeUndefined();
  });

  it('locks activation before business work and commits it on the same physical transaction', async () => {
    const f = fixture();
    expect(f.gate.shouldUseSourcePayrollGate()).toBe(true);
    const result = await f.gate.runWithSourcePayrollGate(async () => {
      f.events.push('business');
      expect(currentSourceAttendanceDatabase()).toBe(f.database);
      expect(f.gate.shouldUseSourcePayrollGate()).toBe(false);
      return { batchId: 42 };
    });
    expect(result).toEqual({ batchId: 42 });
    expect(f.events).toEqual(['acquire', 'SET TRANSACTION ISOLATION LEVEL READ COMMITTED', 'begin', 'activation-lock', 'business', 'commit', 'release']);
    expect(f.read).toHaveBeenCalledWith(f.connection, true);
    expect(f.createDatabase).toHaveBeenCalledWith(f.connection);
    expect(currentSourceAttendanceDatabase()).toBeUndefined();
  });

  it('reuses an existing coordinator transaction without checking config or acquiring another connection', async () => {
    const f = fixture();
    await runWithSourceAttendanceDatabase(f.database, async () => {
      expect(f.gate.shouldUseSourcePayrollGate()).toBe(false);
      expect(await f.gate.runWithSourcePayrollGate(async () => currentSourceAttendanceDatabase())).toBe(f.database);
    });
    expect(f.readConfig).not.toHaveBeenCalled();
    expect(f.getPool).not.toHaveBeenCalled();
  });

  it('does not execute closure while a promotion transaction owns the activation row', async () => {
    const f = fixture();
    let releaseLock!: () => void;
    let observedRead!: () => void;
    const entered = new Promise<void>(resolve => { observedRead = resolve; });
    const lock = new Promise<void>(resolve => { releaseLock = resolve; });
    f.read.mockImplementationOnce(async () => { observedRead(); await lock; return active; });
    const operation = vi.fn(async () => 'closed');
    const pending = f.gate.runWithSourcePayrollGate(operation);
    await entered;
    expect(operation).not.toHaveBeenCalled();
    expect(f.connection.commit).not.toHaveBeenCalled();
    releaseLock();
    expect(await pending).toBe('closed');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('releases an absent activation transaction before one legacy recursive-hook invocation', async () => {
    const f = fixture();
    f.read.mockImplementation(async () => { f.events.push('activation-lock'); return null; });
    let calls = 0;
    async function payroll(): Promise<number> {
      if (f.gate.shouldUseSourcePayrollGate()) return f.gate.runWithSourcePayrollGate(payroll);
      calls++;
      expect(currentSourceAttendanceDatabase()).toBeUndefined();
      f.events.push('legacy-business');
      return 7;
    }
    expect(await payroll()).toBe(7);
    expect(calls).toBe(1);
    expect(f.events).toEqual(['acquire', 'SET TRANSACTION ISOLATION LEVEL READ COMMITTED', 'begin', 'activation-lock', 'rollback', 'release', 'legacy-business']);
    expect(f.getPool).toHaveBeenCalledTimes(1);
    expect(f.createDatabase).not.toHaveBeenCalled();
    expect(f.gate.shouldUseSourcePayrollGate()).toBe(true);
  });

  it('rereads activation on every operation instead of caching an inactive state', async () => {
    const f = fixture();
    f.read.mockResolvedValueOnce(null).mockResolvedValueOnce(active);
    const contexts: Array<SourceAttendanceDatabase | undefined> = [];
    const operation = async () => { contexts.push(currentSourceAttendanceDatabase()); };
    await f.gate.runWithSourcePayrollGate(operation);
    await f.gate.runWithSourcePayrollGate(operation);
    expect(contexts).toEqual([undefined, f.database]);
    expect(f.read).toHaveBeenCalledTimes(2);
    expect(f.createActivation).toHaveBeenCalledTimes(2);
  });

  it('fails closed on invalid enabled configuration', async () => {
    const f = fixture();
    const failure = new Error('SOURCE_PROMOTION_CONFIG_INVALID');
    f.readConfig.mockImplementation(() => { throw failure; });
    const operation = vi.fn(async () => undefined);
    expect(() => f.gate.shouldUseSourcePayrollGate()).toThrow(failure);
    await expect(f.gate.runWithSourcePayrollGate(operation)).rejects.toBe(failure);
    expect(operation).not.toHaveBeenCalled();
    expect(f.getPool).not.toHaveBeenCalled();
  });

  it('fails closed on activation schema/storage errors without running legacy work', async () => {
    const f = fixture();
    const failure = new Error('SOURCE_PROMOTION_SCHEMA_NOT_READY');
    f.read.mockRejectedValue(failure);
    const operation = vi.fn(async () => undefined);
    await expect(f.gate.runWithSourcePayrollGate(operation)).rejects.toBe(failure);
    expect(operation).not.toHaveBeenCalled();
    expect(f.connection.rollback).toHaveBeenCalledTimes(1);
    expect(f.connection.commit).not.toHaveBeenCalled();
    expect(f.connection.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back payroll failures and removes the transaction context before returning', async () => {
    const f = fixture();
    const failure = new Error('business failed');
    await expect(f.gate.runWithSourcePayrollGate(async () => { throw failure; })).rejects.toBe(failure);
    expect(f.events.slice(-2)).toEqual(['rollback', 'release']);
    expect(f.connection.commit).not.toHaveBeenCalled();
    expect(currentSourceAttendanceDatabase()).toBeUndefined();
  });

  it('does not return success if commit fails', async () => {
    const f = fixture();
    const failure = new Error('commit failed');
    f.connection.commit.mockRejectedValue(failure);
    await expect(f.gate.runWithSourcePayrollGate(async () => 'not committed')).rejects.toBe(failure);
    expect(f.connection.rollback).toHaveBeenCalledTimes(1);
    expect(f.connection.release).toHaveBeenCalledTimes(1);
  });

  it('discards a connection when rollback fails rather than returning a possibly open transaction', async () => {
    const f = fixture();
    const failure = new Error('business failed');
    f.connection.rollback.mockRejectedValue(new Error('rollback failed'));
    await expect(f.gate.runWithSourcePayrollGate(async () => { throw failure; })).rejects.toBe(failure);
    expect(f.connection.destroy).toHaveBeenCalledTimes(1);
    expect(f.connection.release).not.toHaveBeenCalled();
    expect(currentSourceAttendanceDatabase()).toBeUndefined();
  });

  it('releases the connection if isolation setup fails before a transaction begins', async () => {
    const f = fixture();
    const failure = new Error('isolation failed');
    f.connection.query.mockRejectedValue(failure);
    const operation = vi.fn(async () => undefined);
    await expect(f.gate.runWithSourcePayrollGate(operation)).rejects.toBe(failure);
    expect(operation).not.toHaveBeenCalled();
    expect(f.connection.beginTransaction).not.toHaveBeenCalled();
    expect(f.connection.rollback).not.toHaveBeenCalled();
    expect(f.connection.release).toHaveBeenCalledTimes(1);
  });
});
