import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'mysql2/promise';
import { attachWorkerSourceBiometricLinks } from '../biometric-directory/worker-list-links';

const streamId = '123e4567-e89b-42d3-a456-426614174097';
const env = {
  BIOMETRIC_SOURCE_DIRECTORY_ENABLED: 'true',
  ATTENDANCE_SOURCE_DB_CONFIRMED_NAME: 'SYNTHETIC_WORKERS',
  BIOMETRIC_SOURCE_STREAM_ID: streamId,
};
const workers = [
  { id: 17, code: 'W288', biometricPersonCode: '900002', fullName: 'Synthetic worker' },
  { id: 18, code: 'W1', biometricPersonCode: null, fullName: 'Other synthetic worker' },
];
function row(number = 1, workerId = 17) {
  return { link_id: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`, worker_id: workerId,
    source_identity_id: `identity-${number}`, current_source_identity_id: `identity-${number}`,
    device_id_snapshot: '9001', device_user_id_snapshot: String(number), display_name: `Current user ${number}` };
}
function fixture(rows = [] as Array<ReturnType<typeof row>>) {
  const query = vi.fn(async (_options: unknown) => [[{ database_name: 'SYNTHETIC_WORKERS' }]]);
  const execute = vi.fn(async (_options: unknown, _parameters: unknown[]) => [rows]);
  const release = vi.fn();
  const getConnection = vi.fn(async () => ({ query, execute, release }));
  const getPool = vi.fn(async () => ({ getConnection }) as unknown as Pool);
  return { query, execute, release, getConnection, getPool,
    run: (source = workers, inputEnv = env) => attachWorkerSourceBiometricLinks(source, { env: inputEnv, getPool }) };
}

describe('paginated worker source binding display', () => {
  it('keeps legacy-only mode unchanged, without opening a connection', async () => {
    const f = fixture();
    for (const flag of [undefined, 'false', 'TRUE']) {
      const result = await f.run(workers, { ...env, BIOMETRIC_SOURCE_DIRECTORY_ENABLED: flag } as any);
      expect(result).toBe(workers);
      expect(result[0].biometricPersonCode).toBe('900002');
      expect(result[0]).not.toHaveProperty('sourceBiometricLink');
    }
    expect(f.getPool).not.toHaveBeenCalled();
  });

  it('shows unlinked after the active link is revoked even when the legacy code remains stored', async () => {
    const f = fixture();
    const before = JSON.stringify(workers);
    const result = await f.run();
    expect(result.map(worker => worker.sourceBiometricLink)).toEqual([
      { state: 'unlinked', links: [] }, { state: 'unlinked', links: [] },
    ]);
    expect(result[0].biometricPersonCode).toBe('900002');
    expect(JSON.stringify(workers)).toBe(before);
    expect(f.execute.mock.calls[0][0]).toMatchObject({ sql: expect.stringContaining("l.status='active'") });
  });

  it('reads current active links for the whole visible page in one bound query and preserves multiple enrollments', async () => {
    const f = fixture([row(1), row(2), row(3, 18)]);
    const result = await f.run();
    expect(result[0].sourceBiometricLink).toEqual({ state: 'linked', links: [
      { deviceUserId: '1', displayName: 'Current user 1' }, { deviceUserId: '2', displayName: 'Current user 2' },
    ] });
    expect(result[1].sourceBiometricLink).toEqual({ state: 'linked', links: [{ deviceUserId: '3', displayName: 'Current user 3' }] });
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.execute.mock.calls[0][1]).toEqual([streamId, 17, 18]);
    const sql = (f.execute.mock.calls[0][0] as any).sql;
    expect(sql).toContain('u.source_identity_id=l.source_identity_id');
    expect(sql).toContain('u.device_id=l.device_id_snapshot');
    expect(sql).toContain('u.device_user_id=l.device_user_id_snapshot');
    expect(sql).toContain('l.stream_id=?');
    expect(sql).not.toContain(streamId);
    expect(f.release).toHaveBeenCalledTimes(1);
  });

  it('treats empty pages as complete without a pool and deduplicates repeated page IDs', async () => {
    const f = fixture();
    const empty = [] as typeof workers;
    expect(await f.run(empty)).toBe(empty);
    expect(f.getPool).not.toHaveBeenCalled();
    await f.run([workers[0], workers[0]]);
    expect(f.execute.mock.calls[0][1]).toEqual([streamId, 17]);
  });

  it('retains nullable and Unicode display names as data rather than mistaking blank metadata for no link', async () => {
    const f = fixture([{ ...row(1), display_name: null }, { ...row(2), display_name: 'محمد "Synthetic" 😀' }] as any);
    const result = await f.run();
    expect(result[0].sourceBiometricLink?.state).toBe('linked');
    expect(result[0].sourceBiometricLink?.links).toEqual([
      { deviceUserId: '1', displayName: null }, { deviceUserId: '2', displayName: 'محمد "Synthetic" 😀' },
    ]);
  });

  it('marks missing or mismatched configuration unavailable rather than falling back to the old badge', async () => {
    const f = fixture([row()]);
    for (const patch of [{ ATTENDANCE_SOURCE_DB_CONFIRMED_NAME: '' }, { ATTENDANCE_SOURCE_DB_CONFIRMED_NAME: 'unsafe;sql' },
      { BIOMETRIC_SOURCE_STREAM_ID: '' }, { BIOMETRIC_SOURCE_STREAM_ID: 'not-a-stream' }]) {
      const result = await f.run(workers, { ...env, ...patch });
      expect(result.every(worker => worker.sourceBiometricLink?.state === 'unavailable')).toBe(true);
      expect(result[0].biometricPersonCode).toBe('900002');
    }
    expect(f.getPool).not.toHaveBeenCalled();
  });

  it('checks the selected database before reading links and releases on mismatch', async () => {
    const f = fixture([row()]);
    f.query.mockResolvedValueOnce([[{ database_name: 'OTHER_DATABASE' }]]);
    const result = await f.run();
    expect(result[0].sourceBiometricLink).toEqual({ state: 'unavailable', links: [] });
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.release).toHaveBeenCalledTimes(1);
  });

  it('keeps the workers page usable on pool/read failures and exposes no internal error or credentials', async () => {
    const f = fixture();
    f.execute.mockRejectedValueOnce(new Error('PRIVATE_DATABASE_CONFIGURATION'));
    const result = await f.run();
    expect(result.every(worker => worker.sourceBiometricLink?.state === 'unavailable')).toBe(true);
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
    expect(f.release).toHaveBeenCalledTimes(1);
    f.getPool.mockRejectedValueOnce(new Error('PRIVATE_POOL'));
    expect((await f.run())[0].sourceBiometricLink?.state).toBe('unavailable');
  });

  it.each([
    ['unexpected worker', () => [{ ...row(), worker_id: 99 }]],
    ['duplicate enrollment', () => [row(), { ...row(2), source_identity_id: 'identity-1', current_source_identity_id: 'identity-1' }]],
    ['invalid active identity', () => [{ ...row(), current_source_identity_id: null }]],
    ['malformed PIN', () => [{ ...row(), device_user_id_snapshot: '' }]],
  ])('does not manufacture trusted badges for %s', async (_label, rows) => {
    const f = fixture(rows() as any);
    expect((await f.run()).every(worker => worker.sourceBiometricLink?.state === 'unavailable')).toBe(true);
  });

  it('bounds requested page IDs before any SQL and cannot turn invalid IDs into an unlinked result', async () => {
    const f = fixture();
    for (const input of [[{ ...workers[0], id: 0 }], Array.from({ length: 501 }, (_, index) => ({ ...workers[0], id: index + 1 }))]) {
      const result = await f.run(input);
      expect(result.every(worker => worker.sourceBiometricLink?.state === 'unavailable')).toBe(true);
    }
    expect(f.getPool).not.toHaveBeenCalled();
  });
});
