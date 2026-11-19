import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'mysql2';
import { attendanceEvents, workerDailyFinance, workers } from '../../drizzle/schema';
import { configureAttendanceTimeSession } from '../db/attendance-time-session';
import { attendanceTimeFromDatabase, attendanceTimeInput, attendanceTimeToDatabase,
  formatRiyadhAttendanceTime, parseAttendanceTime, riyadhDateTime } from '../../shared/attendance-time';

const originalTimezone = process.env.TZ;
afterEach(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

describe('SQL attendance timezone initialization gates connection acquisition', () => {
  it('hands off connections only after successful initialization and initializes each connection once', async () => {
    function fakeConnection() {
      let initialize: ((failure: Error | null) => void) | undefined;
      const query = vi.fn((options: { sql: string; timeout: number }, callback: (failure: Error | null) => void) => {
        expect(options).toEqual({ sql: "SET SESSION time_zone = '+00:00'", timeout: 5000 });
        initialize = callback;
      });
      return { query, destroy: vi.fn(), finish: () => initialize!(null) };
    }
    const first = fakeConnection();
    const second = fakeConnection();
    const connections = [first, second, first];
    const pool = { getConnection: vi.fn(callback => callback(null, connections.shift())) } as unknown as Pool;
    const firstReady = vi.fn();
    const secondReady = vi.fn();
    const reusedReady = vi.fn();
    configureAttendanceTimeSession(pool);
    configureAttendanceTimeSession(pool);
    pool.getConnection(firstReady);
    pool.getConnection(secondReady);
    expect(firstReady).not.toHaveBeenCalled();
    expect(secondReady).not.toHaveBeenCalled();
    first.finish();
    await Promise.resolve();
    expect(firstReady).toHaveBeenCalledWith(null, first);
    expect(secondReady).not.toHaveBeenCalled();
    pool.getConnection(reusedReady);
    await Promise.resolve();
    expect(reusedReady).toHaveBeenCalledWith(null, first);
    expect(first.query).toHaveBeenCalledTimes(1);
    second.finish();
    await Promise.resolve();
    expect(secondReady).toHaveBeenCalledWith(null, second);
    expect(second.query).toHaveBeenCalledTimes(1);
    expect(first.destroy).not.toHaveBeenCalled();
    expect(second.destroy).not.toHaveBeenCalled();
  });

  it('destroys an initialization failure and returns a fixed error before handing a connection to application SQL', async () => {
    let failInitialization: ((failure: Error | null) => void) | undefined;
    const connection = { query: vi.fn((_options, callback) => { failInitialization = callback; }), destroy: vi.fn() };
    const pool = { getConnection: vi.fn(callback => callback(null, connection)) } as unknown as Pool;
    const applicationSql = vi.fn();
    const acquired = vi.fn((error, ready) => { if (!error) applicationSql(ready); });
    configureAttendanceTimeSession(pool);
    pool.getConnection(acquired);
    expect(acquired).not.toHaveBeenCalled();
    expect(applicationSql).not.toHaveBeenCalled();
    failInitialization!(new Error('Synthetic driver initialization details'));
    await Promise.resolve();
    expect(connection.destroy).toHaveBeenCalledTimes(1);
    expect(acquired).toHaveBeenCalledWith(expect.objectContaining({
      code: 'ATTENDANCE_SQL_TIMEZONE_INIT_FAILED', message: 'ATTENDANCE_SQL_TIMEZONE_INIT_FAILED',
    }), undefined);
    expect(applicationSql).not.toHaveBeenCalled();
  });
});

describe('legacy Riyadh attendance timestamp compatibility', () => {
  it.each(['UTC', 'Asia/Riyadh', 'America/New_York'])('keeps the same instant and Riyadh wall clock under host zone %s', zone => {
    process.env.TZ = zone;
    const instant = '2026-11-19T10:00:00.123Z';
    expect(parseAttendanceTime('2026-11-19 13:00:00.123').toISOString()).toBe(instant);
    expect(attendanceTimeToDatabase(new Date(instant))).toBe('2026-11-19 13:00:00.123');
    expect(attendanceTimeToDatabase(instant)).toBe('2026-11-19 13:00:00.123');
    expect(attendanceTimeFromDatabase('2026-11-19 13:00:00.123')).toBe('2026-11-19T13:00:00.123+03:00');
    expect(attendanceTimeInput(instant)).toBe('13:00');
    expect(riyadhDateTime('2026-11-19', '13:00').toISOString()).toBe('2026-11-19T10:00:00.000Z');
    expect(formatRiyadhAttendanceTime(instant, { hour12: false, timeZone: 'America/New_York' }))
      .toBe(new Date(instant).toLocaleTimeString('ar-SA', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Riyadh',
      }));
  });

  it('retains the physical TIMESTAMP type and uses the same value codec for all four attendance-related columns', () => {
    const columns = [attendanceEvents.eventTime, workers.lastAttendanceAt,
      workerDailyFinance.checkInTime, workerDailyFinance.checkOutTime];
    for (const column of columns) {
      expect(column.getSQLType()).toBe('timestamp');
      expect(column.mapToDriverValue('2026-11-19T10:00:00.000Z')).toBe('2026-11-19 13:00:00.000');
      expect(column.mapFromDriverValue('2026-11-19 13:00:00')).toBe('2026-11-19T13:00:00+03:00');
    }
  });

  it('combines an unchanged legacy check-in and a new UTC input into the same 120-minute session', () => {
    const old = attendanceTimeFromDatabase('2026-11-19 13:00:00');
    const futureStored = attendanceTimeToDatabase('2026-11-19T12:00:00Z');
    expect(futureStored).toBe('2026-11-19 15:00:00.000');
    const future = attendanceTimeFromDatabase(futureStored);
    expect((parseAttendanceTime(future).getTime() - parseAttendanceTime(old).getTime()) / 60_000).toBe(120);
    expect(attendanceTimeInput(old)).toBe('13:00');
    expect(attendanceTimeInput(future)).toBe('15:00');
  });

  it('roundtrips offsets and editing values across midnight without shifting the local calendar date', () => {
    expect(attendanceTimeToDatabase('2026-11-18T22:00:00Z')).toBe('2026-11-19 01:00:00.000');
    expect(attendanceTimeFromDatabase('2026-11-19 01:00')).toBe('2026-11-19T01:00:00+03:00');
    expect(riyadhDateTime('2026-11-19', '04:40').toISOString()).toBe('2026-11-19T01:40:00.000Z');
    const original = new Date('2026-11-19T10:00:00Z');
    const parsed = parseAttendanceTime(original);
    parsed.setUTCFullYear(2030);
    expect(original.toISOString()).toBe('2026-11-19T10:00:00.000Z');
  });

  it('rejects invalid wall-clock input for writes and renders invalid historical values as unavailable', () => {
    for (const value of ['', 'not-a-date', '2026-02-30 13:00:00', '2026-11-19 24:00:00']) {
      expect(() => attendanceTimeToDatabase(value)).toThrow('ATTENDANCE_TIME_INVALID');
      expect(formatRiyadhAttendanceTime(value)).toBe('-');
      expect(attendanceTimeInput(value)).toBe('');
    }
    expect(attendanceTimeFromDatabase('invalid historical value')).toBe('invalid historical value');
    expect(formatRiyadhAttendanceTime(null)).toBe('-');
    expect(Number.isNaN(riyadhDateTime('2026-11-19', '25:00').getTime())).toBe(true);
  });
});
