import { describe, it, expect, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { router } from '../_core/trpc';
import { createBiometricDirectoryWorkerProcedures } from '../biometric-directory/router';

const streamId = '78d31b88-7cc4-4a9d-b8ae-12b621ca7b5f';
const linkId = '26fd61f5-1c4a-493b-bfe0-c427fdbdb9db';
function fixture(role: string | null = 'super_admin') {
  const store = { listUsers: vi.fn(async () => ({ items: [], page: { number: 1, limit: 20, total: 0, totalPages: 1 } })),
    listWorkerLinks: vi.fn(async () => ({ items: [] })),
    setLink: vi.fn(async () => ({ link: { linkId }, unchanged: false })),
    revokeLink: vi.fn(async () => ({ revoked: true, linkId, unchanged: false })) };
  const load = vi.fn(async () => ({ store, streamId }));
  const api = router(createBiometricDirectoryWorkerProcedures(load as any, () => true));
  const caller = api.createCaller({ user: role === null ? null : { id: 7, role } } as any);
  return { store, load, caller };
}
describe('worker identity link authorization and API boundary', () => {
  it('requires sign-in and worker-management permission before acquiring a database', async () => {
    const anonymous = fixture(null);
    await expect(anonymous.caller.sourceBiometricWorkerLinks({ workerId: 3210001 })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(anonymous.load).not.toHaveBeenCalled();
    const forbidden = fixture('unrecognized_role');
    await expect(forbidden.caller.setSourceBiometricLink({ workerId: 3210001, identityId: '73', expectedLinkId: null })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(forbidden.load).not.toHaveBeenCalled();
  });
  it('binds source stream and actor on the server rather than trusting client-supplied fields', async () => {
    const lab = fixture();
    await lab.caller.setSourceBiometricLink({ workerId: 3210001, identityId: '73', expectedLinkId: null, confirmHistorical: true });
    expect(lab.store.setLink).toHaveBeenCalledWith({ workerId: 3210001, identityId: '73', expectedLinkId: null,
      confirmHistorical: true, streamId, actor: 7 });
    await expect(lab.caller.setSourceBiometricLink({ workerId: 3210001, identityId: '74', expectedLinkId: null, actor: 999 } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(lab.store.setLink).toHaveBeenCalledTimes(1);
  });
  it('requires the observed binding identity when revoking and preserves the authenticated worker target', async () => {
    const lab = fixture();
    await lab.caller.revokeSourceBiometricLink({ workerId: 3210001, identityId: '73', expectedLinkId: linkId });
    expect(lab.store.revokeLink).toHaveBeenCalledWith({ workerId: 3210001, identityId: '73', expectedLinkId: linkId, streamId, actor: 7 });
    await expect(lab.caller.revokeSourceBiometricLink({ workerId: 3210001, identityId: '73' } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
  it('returns only a safe conflict and never exposes SQL, secrets or a raw database error', async () => {
    const lab = fixture();
    lab.store.setLink.mockRejectedValueOnce(Object.assign(new Error('PRIVATE SQL SECRET'), { code: 'BIOMETRIC_DIRECTORY_LINK_CONFLICT' }));
    const error = await lab.caller.setSourceBiometricLink({ workerId: 3210001, identityId: '73', expectedLinkId: null }).catch(value => value);
    expect(error).toMatchObject({ code: 'CONFLICT' });
    expect(error.message).not.toContain('PRIVATE');
  });
  it('keeps the old picker mode when directory synchronization is not explicitly enabled', async () => {
    const load = vi.fn(async () => { throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'disabled' }); });
    const api = router(createBiometricDirectoryWorkerProcedures(load as any, () => false));
    const caller = api.createCaller({ user: { id: 7, role: 'super_admin' } } as any);
    expect(await caller.sourceBiometricMode()).toEqual({ enabled: false });
    expect(load).not.toHaveBeenCalled();
    await expect(caller.sourceBiometricUsers({})).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
  it('reads local directory pages using the configured source identity and supplied worker context', async () => {
    const lab = fixture();
    await lab.caller.sourceBiometricUsers({ search: 'nnbb', roster: 'historical', currentWorkerId: 3210001, page: 2, limit: 20 });
    expect(lab.store.listUsers).toHaveBeenCalledWith({ streamId, search: 'nnbb', roster: 'historical', sortBy: 'device_user_id', currentWorkerId: 3210001, page: 2, limit: 20 });
    expect(lab.store.setLink).not.toHaveBeenCalled();
  });
  it('forwards only the allowlisted global sort and rejects invalid modes before loading the store', async () => {
    const lab = fixture();
    await lab.caller.sourceBiometricUsers({ search: 'RAD', sortBy: 'name', page: 2, limit: 20 });
    expect(lab.store.listUsers).toHaveBeenCalledWith({ streamId, search: 'RAD', sortBy: 'name', roster: 'current', page: 2, limit: 20 });
    for (const sortBy of ['NAME', '', 'name DESC', null, ['name']]) {
      await expect(lab.caller.sourceBiometricUsers({ sortBy } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    }
    await expect(lab.caller.sourceBiometricUsers({ sortBy: 'name', orderBy: 'device_user_id' } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(lab.load).toHaveBeenCalledTimes(1);
    expect(lab.store.listUsers).toHaveBeenCalledTimes(1);
  });
});
