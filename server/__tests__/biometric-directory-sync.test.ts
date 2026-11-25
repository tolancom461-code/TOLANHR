import { describe, expect, it, vi } from 'vitest';
import { BiometricDirectorySyncError, createBiometricDirectoryHttpClient } from '../biometric-directory/http-source';
import { createBiometricDirectorySync } from '../biometric-directory/sync';
import type { DirectoryCacheStore, DirectoryIdentity, DirectoryPage } from '../biometric-directory/types';

const streamId = '123e4567-e89b-42d3-a456-426614174000';
const token = 'synthetic_'.repeat(6);
const identity = (identityId = '1', values: Partial<DirectoryIdentity> = {}): DirectoryIdentity => ({
  identityId, deviceId: 'SYNTHETIC-DEVICE', deviceUserId: '00017', displayName: 'Synthetic 😀',
  deviceName: 'Synthetic terminal', serialNumber: 'SYNTHETIC-SERIAL', status: 'current',
  firstSeenAtUtc: '2026-11-19T10:00:00.123456Z', lastSeenAtUtc: null,
  identityStartedAtUtc: null, identityEndedAtUtc: null, ...values,
});
const page = (items: DirectoryIdentity[] = [], nextCursor = '0', hasMore = false): DirectoryPage =>
  ({ schemaVersion: 1, streamId, items, nextCursor, hasMore });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});

describe('protected biometric directory HTTP boundary', () => {
  it('preserves display metadata and UTC precision through the independent read-only endpoint', async () => {
    const fetchFn = vi.fn(async () => response(page([identity()], '1')));
    const client = createBiometricDirectoryHttpClient({ apiUrl: 'https://synthetic.example', token, streamId }, { fetchFn });
    const result = await client.fetchPage({ afterId: '0', limit: 100 });
    const [url, options] = fetchFn.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe('/api/v1/device-identities');
    expect(url.searchParams.get('after_id')).toBe('0');
    expect(options).toMatchObject({ method: 'GET', redirect: 'error', cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    expect(result.items[0]).toEqual(identity());
  });

  it.each([401, 403, 404, 503])('returns a fixed safe directory failure for status %s', async status => {
    const client = createBiometricDirectoryHttpClient({ apiUrl: 'https://synthetic.example', token, streamId }, {
      fetchFn: vi.fn(async () => response({ details: 'SYNTHETIC-SECRET' }, status)),
    });
    const code = status === 401 || status === 403 ? 'BIOMETRIC_DIRECTORY_AUTH_FAILED' : 'BIOMETRIC_DIRECTORY_UNAVAILABLE';
    await expect(client.fetchPage({ afterId: '0', limit: 100 })).rejects.toMatchObject({ code, message: code });
  });

  it('rejects extra secret fields, invalid Unicode/time/status and unbounded responses', async () => {
    const invalid = [
      page([{ ...identity(), password: 'SYNTHETIC-CREDENTIAL' } as DirectoryIdentity], '1'),
      page([{ ...identity(), faceTemplate: 'SYNTHETIC-TEMPLATE' } as DirectoryIdentity], '1'),
      page([identity('1', { displayName: '\ud800' })], '1'),
      page([identity('1', { displayName: 'x'.repeat(256) })], '1'),
      page([identity('1', { firstSeenAtUtc: '2026-02-30T00:00:00Z' })], '1'),
      page([identity('1', { status: 'absent' as DirectoryIdentity['status'] })], '1'),
      page([identity('1', { status: ['current'] as unknown as DirectoryIdentity['status'] })], '1'),
      page([identity()], '0', true),
    ];
    for (const value of invalid) {
      const client = createBiometricDirectoryHttpClient({ apiUrl: 'https://synthetic.example', token, streamId }, {
        fetchFn: vi.fn(async () => response(value)),
      });
      await expect(client.fetchPage({ afterId: '0', limit: 100 })).rejects.toMatchObject({ code: 'BIOMETRIC_DIRECTORY_RESPONSE_INVALID' });
    }
    const oversized = createBiometricDirectoryHttpClient({ apiUrl: 'https://synthetic.example', token, streamId }, {
      fetchFn: vi.fn(async () => new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '1048577' } })),
    });
    await expect(oversized.fetchPage({ afterId: '0', limit: 100 })).rejects.toMatchObject({ code: 'BIOMETRIC_DIRECTORY_RESPONSE_INVALID' });
  });
});

describe('bounded explicit-status directory mirroring', () => {
  function fixture() {
    const saved = new Map<string, DirectoryIdentity>();
    const cache: DirectoryCacheStore = {
      assertReady: vi.fn(async () => {}),
      upsertDirectoryPage: vi.fn(async ({ items }) => {
        for (const item of items) saved.set(item.identityId, { ...item });
        return { upserted: items.length };
      }),
    };
    let available = [identity()];
    const source = { fetchPage: vi.fn(async ({ afterId, limit }: { afterId: string; limit: number }) => {
      const rows = available.filter(item => BigInt(item.identityId) > BigInt(afterId))
        .sort((first, second) => Number(first.identityId) - Number(second.identityId));
      const selected = rows.slice(0, limit);
      return page(selected, selected.at(-1)?.identityId ?? afterId, rows.length > limit);
    }) };
    return { saved, source, cache, setAvailable: (items: DirectoryIdentity[]) => { available = items; },
      create: () => createBiometricDirectorySync({ source, cache, streamId, pageSize: 1, maxPages: 1 }) };
  }

  it('resweeps from zero to refresh names and explicit historical status while a reused PIN gets a distinct identity', async () => {
    const f = fixture();
    const oldUnobserved = identity('99', { deviceUserId: 'KEEP-UNOBSERVED' });
    f.saved.set('99', oldUnobserved);
    const sync = f.create();
    expect(await sync.runOnce()).toMatchObject({ pages: 1, nextCursor: '0', sweepCompleted: true });
    f.setAvailable([identity('1', { displayName: 'Renamed 😀', status: 'historical', identityEndedAtUtc: '2026-11-20T10:00:00Z' }),
      identity('2', { displayName: 'Replacement', identityStartedAtUtc: '2026-11-20T10:00:00Z' })]);
    expect(await sync.runOnce()).toMatchObject({ pages: 1, nextCursor: '1', sweepCompleted: false });
    expect(await sync.runOnce()).toMatchObject({ pages: 1, nextCursor: '0', sweepCompleted: true });
    expect(f.saved.get('1')).toMatchObject({ displayName: 'Renamed 😀', status: 'historical', deviceUserId: '00017' });
    expect(f.saved.get('2')).toMatchObject({ displayName: 'Replacement', status: 'current', deviceUserId: '00017' });
    expect(f.saved.get('99')).toEqual(oldUnobserved);
    expect(f.source.fetchPage.mock.calls.map(([request]) => request.afterId)).toEqual(['0', '0', '1']);
  });

  it('retains the cache and resets its cursor after failure so lower identities can be refreshed', async () => {
    const f = fixture();
    f.setAvailable([identity(), identity('2')]);
    const sync = f.create();
    await sync.runOnce();
    f.source.fetchPage.mockRejectedValueOnce(new BiometricDirectorySyncError('BIOMETRIC_DIRECTORY_AUTH_FAILED'));
    await expect(sync.runOnce()).rejects.toMatchObject({ code: 'BIOMETRIC_DIRECTORY_AUTH_FAILED' });
    expect(f.saved.size).toBe(1);
    await sync.runOnce();
    expect(f.source.fetchPage.mock.calls.map(([request]) => request.afterId)).toEqual(['0', '1', '0']);
  });

  it('prevents overlap and cancels a stopped in-flight read before any cache write', async () => {
    const f = fixture();
    let release: (value: DirectoryPage) => void = () => {};
    let signal: AbortSignal | undefined;
    f.source.fetchPage.mockImplementationOnce((_request, suppliedSignal?: AbortSignal) => {
      signal = suppliedSignal;
      return new Promise(resolve => { release = resolve; });
    });
    const sync = f.create();
    const running = sync.runOnce();
    await vi.waitFor(() => expect(f.source.fetchPage).toHaveBeenCalledTimes(1));
    expect(await sync.runOnce()).toMatchObject({ state: 'busy' });
    sync.stop();
    expect(signal?.aborted).toBe(true);
    release(page([identity()], '1'));
    expect(await running).toMatchObject({ state: 'stopped', pages: 0 });
    expect(f.saved.size).toBe(0);
    expect(await sync.runOnce()).toMatchObject({ state: 'stopped' });
    expect(f.source.fetchPage).toHaveBeenCalledTimes(1);
  });
});
