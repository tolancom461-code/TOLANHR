import { setImmediate as nextTurn } from 'node:timers/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  currentSourceAttendanceDatabase,
  runWithSourceAttendanceDatabase,
  type SourceAttendanceDatabase,
} from '../db/source-execution-context';

function database() {
  return { select: vi.fn(), insert: vi.fn(), update: vi.fn() } as unknown as SourceAttendanceDatabase;
}

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe('source attendance transaction execution context', () => {
  it('has no ambient database outside an explicitly scoped operation, including after an async boundary', async () => {
    expect(currentSourceAttendanceDatabase()).toBeUndefined();
    await Promise.resolve();
    await nextTurn();
    expect(currentSourceAttendanceDatabase()).toBeUndefined();
  });

  it('keeps the exact supplied database across promises and event-loop turns and preserves the operation result', async () => {
    const db = database();
    const result = { receiptId: 'synthetic-receipt', committed: true };
    const actual = await runWithSourceAttendanceDatabase(db, async () => {
      expect(currentSourceAttendanceDatabase()).toBe(db);
      await Promise.resolve();
      expect(currentSourceAttendanceDatabase()).toBe(db);
      await nextTurn();
      expect(currentSourceAttendanceDatabase()).toBe(db);
      return result;
    });
    expect(actual).toBe(result);
    expect(currentSourceAttendanceDatabase()).toBeUndefined();
    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('isolates two overlapping operations when one completes while the other is still pending', async () => {
    const firstDb = database();
    const secondDb = database();
    const firstReady = signal();
    const secondReady = signal();
    const releaseFirst = signal();
    const releaseSecond = signal();
    const firstObservations: Array<SourceAttendanceDatabase | undefined> = [];
    const secondObservations: Array<SourceAttendanceDatabase | undefined> = [];
    const first = runWithSourceAttendanceDatabase(firstDb, async () => {
      firstObservations.push(currentSourceAttendanceDatabase());
      firstReady.resolve();
      await releaseFirst.promise;
      firstObservations.push(currentSourceAttendanceDatabase());
      await nextTurn();
      firstObservations.push(currentSourceAttendanceDatabase());
      return 'first';
    });
    const second = runWithSourceAttendanceDatabase(secondDb, async () => {
      secondObservations.push(currentSourceAttendanceDatabase());
      secondReady.resolve();
      await releaseSecond.promise;
      secondObservations.push(currentSourceAttendanceDatabase());
      await nextTurn();
      secondObservations.push(currentSourceAttendanceDatabase());
      return 'second';
    });
    await Promise.all([firstReady.promise, secondReady.promise]);
    const outsideWhileBothPending = currentSourceAttendanceDatabase();
    releaseFirst.resolve();
    const firstResult = await first;
    const outsideWhileSecondPending = currentSourceAttendanceDatabase();
    releaseSecond.resolve();
    const secondResult = await second;
    expect(firstResult).toBe('first');
    expect(secondResult).toBe('second');
    expect(firstObservations).toEqual([firstDb, firstDb, firstDb]);
    expect(secondObservations).toEqual([secondDb, secondDb, secondDb]);
    expect(outsideWhileBothPending).toBeUndefined();
    expect(outsideWhileSecondPending).toBeUndefined();
    expect(currentSourceAttendanceDatabase()).toBeUndefined();
  });

  it('restores the parent context immediately after starting a nested operation and after awaiting it', async () => {
    const outerDb = database();
    const innerDb = database();
    await runWithSourceAttendanceDatabase(outerDb, async () => {
      const inner = runWithSourceAttendanceDatabase(innerDb, async () => {
        expect(currentSourceAttendanceDatabase()).toBe(innerDb);
        await nextTurn();
        expect(currentSourceAttendanceDatabase()).toBe(innerDb);
        return 'inner-result';
      });
      expect(currentSourceAttendanceDatabase()).toBe(outerDb);
      expect(await inner).toBe('inner-result');
      expect(currentSourceAttendanceDatabase()).toBe(outerDb);
      await nextTurn();
      expect(currentSourceAttendanceDatabase()).toBe(outerDb);
    });
    expect(currentSourceAttendanceDatabase()).toBeUndefined();
  });

  it('removes the context after a synchronously thrown callback error without replacing that error', () => {
    const db = database();
    const failure = new Error('SYNTHETIC_SYNC_FAILURE');
    let actual: unknown;
    try {
      runWithSourceAttendanceDatabase(db, () => {
        expect(currentSourceAttendanceDatabase()).toBe(db);
        throw failure;
      });
    } catch (error) { actual = error; }
    expect(actual).toBe(failure);
    expect(currentSourceAttendanceDatabase()).toBeUndefined();
  });

  it('cleans up an asynchronous rejection and allows a later independent operation to use another database', async () => {
    const failedDb = database();
    const laterDb = database();
    const failure = new Error('SYNTHETIC_ASYNC_FAILURE');
    await expect(runWithSourceAttendanceDatabase(failedDb, async () => {
      await nextTurn();
      expect(currentSourceAttendanceDatabase()).toBe(failedDb);
      throw failure;
    })).rejects.toBe(failure);
    expect(currentSourceAttendanceDatabase()).toBeUndefined();
    expect(await runWithSourceAttendanceDatabase(laterDb, async () => {
      await nextTurn();
      return currentSourceAttendanceDatabase();
    })).toBe(laterDb);
    expect(currentSourceAttendanceDatabase()).toBeUndefined();
  });

  it('restores the outer database after a nested rejection caught by the parent', async () => {
    const outerDb = database();
    const innerDb = database();
    const failure = new Error('SYNTHETIC_NESTED_FAILURE');
    await runWithSourceAttendanceDatabase(outerDb, async () => {
      await expect(runWithSourceAttendanceDatabase(innerDb, async () => {
        await nextTurn();
        expect(currentSourceAttendanceDatabase()).toBe(innerDb);
        throw failure;
      })).rejects.toBe(failure);
      expect(currentSourceAttendanceDatabase()).toBe(outerDb);
      await nextTurn();
      expect(currentSourceAttendanceDatabase()).toBe(outerDb);
    });
    expect(currentSourceAttendanceDatabase()).toBeUndefined();
  });
});
