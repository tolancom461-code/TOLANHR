import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'mysql2/promise';
import { startBiometricSourceImporter } from '../biometric-source-importer/runtime';

const mocks = vi.hoisted(() => ({ archive: vi.fn(), directory: vi.fn(), stopDirectory: vi.fn(),
  promote: vi.fn(), capture: vi.fn(), factory: vi.fn(), inbox: undefined as any }));
vi.mock('../biometric-source-importer/runner', async importOriginal => ({
  ...await importOriginal<typeof import('../biometric-source-importer/runner')>(),
  createBiometricSourceImporter: ({ inbox }: any) => { mocks.inbox = inbox; return { runOnce: mocks.archive }; },
}));
vi.mock('../biometric-directory/sync', () => ({
  createBiometricDirectorySync: () => ({ runOnce: mocks.directory, stop: mocks.stopDirectory }),
}));
vi.mock('../attendance-source-promotion/application', () => ({ getSourceAttendancePromotion: mocks.factory }));

const env = { BIOMETRIC_SOURCE_IMPORT_ENABLED: 'true', BIOMETRIC_SOURCE_DIRECTORY_ENABLED: 'true',
  ATTENDANCE_SOURCE_QR_ENABLED: 'true', BIOMETRIC_SOURCE_PROMOTION_ENABLED: 'true',
  BIOMETRIC_SOURCE_API_URL: 'https://synthetic.example', BIOMETRIC_SOURCE_API_TOKEN: 'synthetic_'.repeat(6),
  BIOMETRIC_SOURCE_STREAM_ID: '78d31b88-7cc4-4a9d-b8ae-12b621ca7b5f',
  ATTENDANCE_SOURCE_DB_CONFIRMED_NAME: 'SYNTHETIC_DATABASE' };
const pool = {} as Pool;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.inbox = undefined;
  mocks.archive.mockResolvedValue({ pages: 1, inserted: 0, replayed: 0, sweepCompleted: true });
  mocks.directory.mockResolvedValue({ pages: 1, upserted: 0, sweepCompleted: true });
  mocks.promote.mockResolvedValue({ active: true, processed: 0 });
  mocks.capture.mockResolvedValue({ event: { id: 'synthetic-receipt' }, replayed: false });
  mocks.factory.mockImplementation((_pool, settings) => settings.BIOMETRIC_SOURCE_PROMOTION_ENABLED === 'true'
    ? { captureBiometric: mocks.capture, runOnce: mocks.promote } : null);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('source promotion runtime scheduling', () => {
  it('shares one pending pool initialization and routes raw capture through promotion without direct storage I/O', async () => {
    let resolve!: (value: Pool) => void;
    const getPool = vi.fn(() => new Promise<Pool>(done => { resolve = done; }));
    const stop = startBiometricSourceImporter({ env, getPool, diagnostic: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    expect(getPool).toHaveBeenCalledTimes(1);
    expect(mocks.archive).not.toHaveBeenCalled();
    expect(mocks.directory).not.toHaveBeenCalled();
    expect(mocks.promote).not.toHaveBeenCalled();
    resolve(pool);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.archive).toHaveBeenCalledTimes(1);
    expect(mocks.directory).toHaveBeenCalledTimes(1);
    expect(mocks.promote).toHaveBeenCalledTimes(1);
    const event = { source: 'biometric', sourceEventId: 'synthetic-event' };
    expect(await mocks.inbox.capture(event)).toEqual({ event: { id: 'synthetic-receipt' }, replayed: false });
    expect(mocks.capture).toHaveBeenCalledWith(event);
    expect(mocks.factory.mock.calls.every(([client]) => client === pool)).toBe(true);
    expect(getPool).toHaveBeenCalledTimes(1);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('runs promotion every two seconds while archive keeps thirty seconds and stop cancels all three schedules', async () => {
    const getPool = vi.fn(async () => pool);
    const stop = startBiometricSourceImporter({ env, getPool, diagnostic: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(3);
    await vi.advanceTimersByTimeAsync(2000);
    expect(mocks.promote).toHaveBeenCalledTimes(2);
    expect(mocks.archive).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(28000);
    expect(mocks.promote).toHaveBeenCalledTimes(16);
    expect(mocks.archive).toHaveBeenCalledTimes(2);
    expect(mocks.directory).toHaveBeenCalledTimes(1);
    expect(getPool).toHaveBeenCalledTimes(1);
    stop();
    expect(mocks.stopDirectory).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(120000);
    expect(mocks.promote).toHaveBeenCalledTimes(16);
    expect(mocks.archive).toHaveBeenCalledTimes(2);
    expect(mocks.directory).toHaveBeenCalledTimes(1);
  });

  it('retries promotion failures with a fixed diagnostic while the archive continues independently', async () => {
    mocks.promote.mockRejectedValue(new Error('SYNTHETIC_PRIVATE_SQL_AND_CREDENTIAL'));
    const diagnostic = vi.fn();
    const stop = startBiometricSourceImporter({ env, getPool: async () => pool, diagnostic });
    await vi.advanceTimersByTimeAsync(30000);
    expect(mocks.promote).toHaveBeenCalledTimes(16);
    expect(mocks.archive).toHaveBeenCalledTimes(2);
    expect(diagnostic).toHaveBeenCalledWith('SOURCE_PROMOTION_RETRY_PENDING');
    expect(diagnostic.mock.calls.every(([message]) => !message.includes('PRIVATE') && !message.includes('CREDENTIAL'))).toBe(true);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the legacy archive path and creates no promotion timer when the flag is off', async () => {
    const stop = startBiometricSourceImporter({ env: { ...env, BIOMETRIC_SOURCE_PROMOTION_ENABLED: 'false' },
      getPool: async () => pool, diagnostic: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.factory).toHaveBeenCalledTimes(1);
    expect(mocks.factory.mock.results[0].value).toBeNull();
    expect(mocks.inbox).toHaveProperty('getEligibleForExistingWorkflow');
    expect(mocks.promote).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(2);
    await vi.advanceTimersByTimeAsync(30000);
    expect(mocks.archive).toHaveBeenCalledTimes(2);
    expect(mocks.promote).not.toHaveBeenCalled();
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
