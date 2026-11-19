import type { CaptureSourceEvent, SourceEventRecord } from '../attendance-source-inbox/types';

export interface SourcePunch {
  sourceEventId: string;
  sourceDeviceId: string;
  sourceDeviceUserId: string;
  sourceIdentityId: string | null;
  eventType: 'check_in' | 'check_out' | 'break_out' | 'break_in' | 'overtime_in' | 'overtime_out';
  rawState: string;
  eventTimeUtc: string;
}

export interface SourcePunchPage {
  schemaVersion: 1;
  streamId: string;
  items: SourcePunch[];
  nextCursor: string;
  hasMore: boolean;
}

export interface SourcePunchApi {
  fetchPage(input: { afterId: string; limit: number }): Promise<SourcePunchPage>;
}

export interface ImportProgress {
  schemaVersion: 1;
  streamId: string;
  tailCursor: string;
  reconcileCursor: string;
}

export interface SourceImportProgressStore {
  load(): Promise<ImportProgress | null>;
  save(progress: ImportProgress): Promise<void>;
}

export interface SourceImportInbox {
  assertReady(): Promise<void>;
  capture(event: CaptureSourceEvent): Promise<{ event: SourceEventRecord; replayed: boolean }>;
}

export interface SourceImportConfig {
  apiUrl: string;
  token: string;
  streamId: string;
  expectedDatabase: string;
  intervalMs: number;
  pageSize: number;
  maxPages: number;
}

export interface SourceImportRunResult {
  state: 'completed' | 'busy';
  pages: number;
  received: number;
  inserted: number;
  replayed: number;
  nextCursor: string | null;
  tailCursor: string | null;
  reconcileCursor: string | null;
  sweepCompleted: boolean;
}

export class BiometricSourceImportError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'BiometricSourceImportError';
  }
}
