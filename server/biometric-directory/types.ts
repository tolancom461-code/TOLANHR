export interface DirectoryIdentity {
  identityId: string;
  deviceId: string;
  deviceUserId: string;
  displayName: string | null;
  deviceName: string;
  serialNumber: string;
  status: 'current' | 'historical';
  firstSeenAtUtc: string | null;
  lastSeenAtUtc: string | null;
  identityStartedAtUtc: string | null;
  identityEndedAtUtc: string | null;
}

export interface DirectoryPage {
  schemaVersion: 1;
  streamId: string;
  items: DirectoryIdentity[];
  nextCursor: string;
  hasMore: boolean;
}

export interface DirectoryCacheStore {
  assertReady(): Promise<void>;
  upsertDirectoryPage(input: { streamId: string; items: DirectoryIdentity[] }): Promise<{ upserted: number }>;
}

export interface ListDirectoryUsersInput {
  streamId: string;
  search?: string;
  roster?: 'current' | 'historical' | 'all';
  currentWorkerId?: number;
  page?: number;
  limit?: number;
}

export interface DirectoryUser extends DirectoryIdentity {
  streamId: string;
  lastSyncedAtUtc: string;
  linkedWorker: { id: number; code: string; fullName: string } | null;
  linkedWorkerExists: boolean | null;
  linkId: string | null;
  linkState: 'available' | 'linked_current' | 'linked_other';
}

export interface DirectoryUsersResult {
  items: DirectoryUser[];
  page: { number: number; limit: number; total: number; totalPages: number };
}

export interface WorkerLinkItem extends DirectoryIdentity {
  linkId: string;
  streamId: string;
  workerId: number;
  linkedAtUtc: string;
}

export interface SetDirectoryLinkInput {
  workerId: number;
  identityId: string;
  streamId: string;
  actor: number;
  expectedLinkId: string | null;
  confirmHistorical?: boolean;
}

export interface RevokeDirectoryLinkInput {
  workerId: number;
  identityId: string;
  streamId: string;
  actor: number;
  expectedLinkId: string;
}

export interface BiometricDirectoryStore extends DirectoryCacheStore {
  listUsers(input: ListDirectoryUsersInput): Promise<DirectoryUsersResult>;
  listWorkerLinks(input: { workerId: number; streamId?: string }): Promise<{ items: WorkerLinkItem[] }>;
  setLink(input: SetDirectoryLinkInput): Promise<{ link: WorkerLinkItem; unchanged: boolean }>;
  revokeLink(input: RevokeDirectoryLinkInput): Promise<{ revoked: true; linkId: string; unchanged: boolean }>;
}

export class BiometricDirectoryError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = 'BiometricDirectoryError';
  }
}
