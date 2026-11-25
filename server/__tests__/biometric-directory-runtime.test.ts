import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'mysql2/promise';
import { BiometricDirectorySyncError } from '../biometric-directory/http-source';
import { startBiometricSourceImporter } from '../biometric-source-importer/runtime';

const mocks = vi.hoisted(() => ({ archive: vi.fn(), directory: vi.fn(), stopDirectory: vi.fn() }));
vi.mock('../biometric-source-importer/runner', async importOriginal => ({
  ...await importOriginal<typeof import('../biometric-source-importer/runner')>(),
  createBiometricSourceImporter: () => ({ runOnce: mocks.archive }),
}));
vi.mock('../biometric-directory/sync', async importOriginal => ({
  ...await importOriginal<typeof import('../biometric-directory/sync')>(),
  createBiometricDirectorySync: () => ({ runOnce: mocks.directory, stop: mocks.stopDirectory }),
}));

const env = { BIOMETRIC_SOURCE_IMPORT_ENABLED: 'true', BIOMETRIC_SOURCE_API_URL: 'https://synthetic.example',
  BIOMETRIC_SOURCE_API_TOKEN: 'synthetic_'.repeat(6), BIOMETRIC_SOURCE_STREAM_ID: '123e4567-e89b-42d3-a456-426614174000',
  ATTENDANCE_SOURCE_DB_CONFIRMED_NAME: 'SYNTHETIC_DATABASE' };
const pool = {} as Pool;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.archive.mockResolvedValue({ pages: 1, inserted: 0, replayed: 0, sweepCompleted: true });
  mocks.directory.mockResolvedValue({ state: 'completed', pages: 1, upserted: 0, sweepCompleted: true });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('directory scheduling remains independent of punch archive and QR', () => {
  it('keeps directory mirroring off unless its separate flag is explicitly enabled', async () => {
    const stop = startBiometricSourceImporter({ env, getPool: async () => pool, diagnostic: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.archive).toHaveBeenCalledTimes(1);
    expect(mocks.directory).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retries an unavailable directory each minute while source archive keeps its thirty-second cadence', async () => {
    mocks.directory.mockRejectedValue(new BiometricDirectorySyncError('BIOMETRIC_DIRECTORY_UNAVAILABLE'));
    const diagnostic = vi.fn();
    const stop = startBiometricSourceImporter({ env: { ...env, BIOMETRIC_SOURCE_DIRECTORY_ENABLED: 'true' },
      getPool: async () => pool, diagnostic });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.archive).toHaveBeenCalledTimes(1);
    expect(mocks.directory).toHaveBeenCalledTimes(1);
    expect(diagnostic).toHaveBeenCalledWith('BIOMETRIC_DIRECTORY_UNAVAILABLE');
    expect(vi.getTimerCount()).toBe(2);
    await vi.advanceTimersByTimeAsync(30000);
    expect(mocks.archive).toHaveBeenCalledTimes(2);
    expect(mocks.directory).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30000);
    expect(mocks.archive).toHaveBeenCalledTimes(3);
    expect(mocks.directory).toHaveBeenCalledTimes(2);
    stop();
    expect(mocks.stopDirectory).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(120000);
    expect(mocks.archive).toHaveBeenCalledTimes(3);
    expect(mocks.directory).toHaveBeenCalledTimes(2);
  });

  it('shares one pending pool initialization between the initial archive and directory jobs', async () => {
    let release: (value: Pool) => void = () => {};
    const getPool = vi.fn(() => new Promise<Pool>(resolve => { release = resolve; }));
    const stop = startBiometricSourceImporter({ env: { ...env, BIOMETRIC_SOURCE_DIRECTORY_ENABLED: 'true' },
      getPool, diagnostic: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    expect(getPool).toHaveBeenCalledTimes(1);
    expect(mocks.archive).not.toHaveBeenCalled();
    expect(mocks.directory).not.toHaveBeenCalled();
    release(pool);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.archive).toHaveBeenCalledTimes(1);
    expect(mocks.directory).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(2);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resets a failed shared pool initialization so a later job can retry and share its successful result', async () => {
    const getPool = vi.fn<() => Promise<Pool>>().mockRejectedValueOnce(new Error('Synthetic initial pool failure'))
      .mockResolvedValue(pool);
    const stop = startBiometricSourceImporter({ env: { ...env, BIOMETRIC_SOURCE_DIRECTORY_ENABLED: 'true' },
      getPool, diagnostic: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    expect(getPool).toHaveBeenCalledTimes(1);
    expect(mocks.archive).not.toHaveBeenCalled();
    expect(mocks.directory).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30000);
    expect(getPool).toHaveBeenCalledTimes(2);
    expect(mocks.archive).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30000);
    expect(getPool).toHaveBeenCalledTimes(2);
    expect(mocks.directory).toHaveBeenCalledTimes(1);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
