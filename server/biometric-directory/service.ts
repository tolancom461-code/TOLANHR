import type { BiometricDirectoryStore, ListDirectoryUsersInput, RevokeDirectoryLinkInput, SetDirectoryLinkInput } from './types';
import { listInput, positiveId, revokeInput, setInput, snapshot, uuid } from './validation';

/** Manual identity links only. Authorization belongs to the existing worker-management router. */
export function createBiometricDirectoryService(store: BiometricDirectoryStore) {
  return {
    assertReady: () => store.assertReady(),
    listUsers: (input: ListDirectoryUsersInput) => store.listUsers(listInput(input)),
    listWorkerLinks(input: { workerId: number; streamId?: string }) {
      const fields = snapshot(input, ['workerId', 'streamId']);
      return store.listWorkerLinks({ workerId: positiveId(fields.workerId),
        ...(fields.streamId === undefined ? {} : { streamId: uuid(fields.streamId) }) });
    },
    setLink: (input: SetDirectoryLinkInput) => store.setLink(setInput(input)),
    revokeLink: (input: RevokeDirectoryLinkInput) => store.revokeLink(revokeInput(input)),
  };
}
