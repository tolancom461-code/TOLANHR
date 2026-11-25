import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'mysql2/promise';
import { createBiometricDirectoryService } from '../biometric-directory/service';
import { createMysqlBiometricDirectoryStore } from '../biometric-directory/mysql-store';
import { BiometricDirectoryError, type BiometricDirectoryStore, type DirectoryIdentity } from '../biometric-directory/types';
import { identity } from '../biometric-directory/validation';

const streamId = '123e4567-e89b-42d3-a456-426614174099';
const linkId = '123e4567-e89b-42d3-a456-426614174001';
const user: DirectoryIdentity = { identityId: '73', deviceId: '9007199254740999', deviceUserId: '00017',
  displayName: 'Source enrollment', deviceName: 'Device', serialNumber: 'SYNTHETIC-DEVICE', status: 'current',
  firstSeenAtUtc: '2026-11-19T07:08:09.123456Z', lastSeenAtUtc: null, identityStartedAtUtc: null, identityEndedAtUtc: null };
function fixture() {
  const store = { assertReady: vi.fn(async () => {}), upsertDirectoryPage: vi.fn(async () => ({ upserted: 0 })),
    listUsers: vi.fn(async () => ({ items: [], page: { number: 1, limit: 25, total: 0, totalPages: 0 } })),
    listWorkerLinks: vi.fn(async () => ({ items: [] })),
    setLink: vi.fn(async () => ({ link: { ...user, streamId, linkId, workerId: 1, linkedAtUtc: '2026-11-19T10:00:00.000000Z' }, unchanged: false })),
    revokeLink: vi.fn(async () => ({ revoked: true as const, linkId, unchanged: false })),
  } satisfies BiometricDirectoryStore;
  return { store, service: createBiometricDirectoryService(store) };
}

describe('manual biometric directory boundary', () => {
  it('constructs without I/O and exposes bounded directory reads with safe defaults', async () => {
    const { service, store } = fixture();
    expect(Object.values(store).every(operation => operation.mock.calls.length === 0)).toBe(true);
    await service.listUsers({ streamId: streamId.toUpperCase() });
    expect(store.listUsers).toHaveBeenCalledWith({ streamId, search: '', roster: 'current', sortBy: 'device_user_id', page: 1, limit: 25 });
    await service.listUsers({ streamId, roster: 'all', sortBy: 'name', currentWorkerId: 1, search: '00017', page: 2, limit: 100 });
    expect(store.listUsers).toHaveBeenLastCalledWith({ streamId, roster: 'all', sortBy: 'name', currentWorkerId: 1, search: '00017', page: 2, limit: 100 });
    for (const value of [{ streamId, limit: 101 }, { streamId, page: 0 }, { streamId, roster: 'missing' }, { streamId, currentWorkerId: 0 }]) {
      expect(() => service.listUsers(value as never)).toThrow(BiometricDirectoryError);
    }
    expect(store.listUsers).toHaveBeenCalledTimes(2);
  });

  it('accepts only the two list sort modes and preserves exact text searches without numeric coercion', async () => {
    const { service, store } = fixture();
    for (const search of ['RAD', 'rad', 'literal!%_', '9'.repeat(128)]) {
      await service.listUsers({ streamId, search, sortBy: 'device_user_id', page: 2, limit: 20 });
      expect(store.listUsers).toHaveBeenLastCalledWith({ streamId, search, roster: 'current', sortBy: 'device_user_id', page: 2, limit: 20 });
    }
    for (const sortBy of ['NAME', '', 'name DESC; DROP TABLE workers', null, {}, ['name']]) {
      expect(() => service.listUsers({ streamId, sortBy } as never)).toThrowError(new BiometricDirectoryError('BIOMETRIC_DIRECTORY_INVALID_INPUT'));
    }
    expect(store.listUsers).toHaveBeenCalledTimes(4);
  });

  it('rejects an untrusted sort at the SQL store boundary before acquiring any connection', () => {
    const pool = { getConnection: vi.fn() };
    const store = createMysqlBiometricDirectoryStore(pool as unknown as Pool, 'expected_database');
    const getter = vi.fn(() => 'name');
    const accessor = { streamId };
    Object.defineProperty(accessor, 'sortBy', { enumerable: true, get: getter });
    for (const input of [{ streamId, sortBy: 'device_user_id DESC' }, accessor]) {
      expect(() => store.listUsers(input as never)).toThrowError(new BiometricDirectoryError('BIOMETRIC_DIRECTORY_INVALID_INPUT'));
    }
    expect(pool.getConnection).not.toHaveBeenCalled();
    expect(getter).not.toHaveBeenCalled();
  });

  it('requires explicit identity version, worker, authenticated actor and optimistic link expectation', async () => {
    const { service, store } = fixture();
    await service.setLink({ streamId, workerId: 1, identityId: '00073', actor: 2, expectedLinkId: null });
    expect(store.setLink).toHaveBeenCalledWith({ streamId, workerId: 1, identityId: '00073', actor: 2, expectedLinkId: null, confirmHistorical: false });
    await service.setLink({ streamId, workerId: 1, identityId: '73', actor: 2, expectedLinkId: linkId.toUpperCase(), confirmHistorical: true });
    expect(store.setLink).toHaveBeenLastCalledWith({ streamId, workerId: 1, identityId: '73', actor: 2, expectedLinkId: linkId, confirmHistorical: true });
    for (const value of [
      { streamId, workerId: 1, identityId: '73', actor: 2 },
      { streamId, workerId: 1, identityId: '73', actor: 0, expectedLinkId: null },
      { streamId, workerId: 1, identityId: '73', actor: 2, expectedLinkId: null, confirmHistorical: 'true' },
      { streamId, workerId: 1, identityId: '73', actor: 2, expectedLinkId: null, biometricPersonCode: 'LEGACY' },
    ]) expect(() => service.setLink(value as never)).toThrow(BiometricDirectoryError);
    expect(store.setLink).toHaveBeenCalledTimes(2);
  });

  it('revocation is tied to worker, stream, identity and exact link version, never just a PIN or name', async () => {
    const { service, store } = fixture();
    await service.revokeLink({ streamId, workerId: 1, identityId: '73', expectedLinkId: linkId, actor: 2 });
    expect(store.revokeLink).toHaveBeenCalledWith({ streamId, workerId: 1, identityId: '73', expectedLinkId: linkId, actor: 2 });
    for (const value of [{ streamId, identityId: '73', expectedLinkId: linkId, actor: 2 },
      { streamId, workerId: 1, identityId: '73', expectedLinkId: null, actor: 2 },
      { streamId, workerId: 1, deviceUserId: '00017', expectedLinkId: linkId, actor: 2 }]) {
      expect(() => service.revokeLink(value as never)).toThrow(BiometricDirectoryError);
    }
    expect(store.revokeLink).toHaveBeenCalledTimes(1);
  });

  it('preserves allowed mutable directory names, leading-zero PINs and exact source UTC without copying extra fields', () => {
    expect(identity({ ...user, displayName: '  source name  ', deviceName: ' device name ' })).toMatchObject({
      displayName: '  source name  ', deviceName: ' device name ', deviceUserId: '00017', firstSeenAtUtc: '2026-11-19T07:08:09.123456Z' });
    expect(identity({ ...user, displayName: '' }).displayName).toBe('');
    expect(identity({ ...user, displayName: null }).displayName).toBeNull();
    for (const value of [{ ...user, firstSeenAtUtc: '2026-02-30T00:00:00Z' },
      { ...user, firstSeenAtUtc: '2026-11-19T10:08:09+03:00' }, { ...user, password: 'SYNTHETIC-SECRET' },
      { ...user, displayName: 'control\u0000name' }, { ...user, deviceUserId: ' 17' }]) {
      expect(() => identity(value as DirectoryIdentity)).toThrow(BiometricDirectoryError);
    }
  });

  it('rejects accessors without executing them or echoing arbitrary data', () => {
    const getter = vi.fn(() => { throw new Error('SYNTHETIC-SECRET'); });
    const value = { ...user };
    Object.defineProperty(value, 'displayName', { enumerable: true, get: getter });
    expect(() => identity(value)).toThrowError(new BiometricDirectoryError('BIOMETRIC_DIRECTORY_INVALID_INPUT'));
    expect(getter).not.toHaveBeenCalled();
  });

  it('checks selected database before metadata/data SQL and sanitizes acquisition failures', async () => {
    const execute = vi.fn();
    const release = vi.fn();
    const pool = { getConnection: vi.fn(async () => ({ query: async () => [[{ database_name: 'other_database' }]], execute, release })) };
    const store = createMysqlBiometricDirectoryStore(pool as unknown as Pool, 'expected_database');
    await expect(store.assertReady()).rejects.toMatchObject({ code: 'BIOMETRIC_DIRECTORY_DATABASE_MISMATCH' });
    expect(execute).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
    pool.getConnection.mockRejectedValueOnce(new Error('SYNTHETIC-SQL-AND-SECRET'));
    await expect(store.assertReady()).rejects.toMatchObject({ code: 'BIOMETRIC_DIRECTORY_STORAGE_UNAVAILABLE', message: 'BIOMETRIC_DIRECTORY_STORAGE_UNAVAILABLE' });
  });

  it('rejects malformed cache pages and duplicate identity versions before acquiring a connection', async () => {
    const pool = { getConnection: vi.fn() };
    const store = createMysqlBiometricDirectoryStore(pool as unknown as Pool, 'expected_database');
    for (const value of [{ streamId, items: [user, user] }, { streamId: 'invalid', items: [user] },
      { streamId, items: [{ ...user, identityId: '' }] }]) {
      await expect(store.upsertDirectoryPage(value as never)).rejects.toMatchObject({ code: 'BIOMETRIC_DIRECTORY_INVALID_INPUT' });
    }
    expect(pool.getConnection).not.toHaveBeenCalled();
  });
});
