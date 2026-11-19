/** Dormant receipt module. No routes, timers, environment loading, or attendance writes. */
export const MOVEMENT_TYPES = [
  'check_in', 'check_out', 'break_out', 'break_in', 'overtime_in', 'overtime_out',
] as const;

export type MovementType = typeof MOVEMENT_TYPES[number];
export type SourceSystem = 'qr' | 'biometric';
export type InboxStatus = 'pending' | 'review_only' | 'unmapped' | 'accepted' | 'rejected' | 'manual_review';

export interface CaptureSourceEvent {
  source: SourceSystem;
  sourceEventId: string;
  eventType: MovementType | number | string;
  eventTimeUtc: string;
  workerId?: number | null;
  sourcePersonCode?: string | null;
  sourceDeviceId?: string | null;
  sourceDeviceUserId?: string | null;
  sourceIdentityId?: string | null;
  sourceUserName?: string | null;
  rawState?: string | null;
}

export interface PreparedSourceEvent {
  id: string;
  source: SourceSystem;
  sourceEventId: string;
  contentSha256: string;
  workerId: number | null;
  sourcePersonCode: string | null;
  sourceDeviceId: string | null;
  sourceDeviceUserId: string | null;
  sourceIdentityId: string | null;
  sourceUserName: string | null;
  eventType: MovementType;
  rawState: string | null;
  /** UTC ISO with six fractional digits; SQL stores this as UTC DATETIME(6). */
  eventTimeUtc: string;
  status: InboxStatus;
}

export interface SourceEventRecord extends PreparedSourceEvent {
  receivedAtUtc: string;
  attendanceEventId: number | null;
  decisionCode: string | null;
  decisionNote: string | null;
  processedAtUtc: string | null;
}

export interface InboxListFilter {
  source?: SourceSystem;
  workerId?: number;
  status?: InboxStatus;
  limit?: number;
}

/** Records an outcome ALREADY produced by the existing workflow. Does not run it. */
export interface ExistingWorkflowOutcome {
  id: string;
  status: 'accepted' | 'rejected' | 'manual_review';
  attendanceEventId?: number | null;
  decisionCode?: string | null;
  decisionNote?: string | null;
}

export interface SourceInboxStore {
  assertReady(): Promise<void>;
  insert(event: PreparedSourceEvent): Promise<{ event: SourceEventRecord; replayed: boolean }>;
  get(id: string): Promise<SourceEventRecord | null>;
  list(filter: InboxListFilter): Promise<SourceEventRecord[]>;
  recordExistingWorkflowOutcome(outcome: ExistingWorkflowOutcome): Promise<SourceEventRecord>;
}

export interface SourceInboxLookupStore extends SourceInboxStore {
  getBySourceEventId(source: SourceSystem, sourceEventId: string): Promise<SourceEventRecord | null>;
}

export class SourceInboxError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'SourceInboxError';
  }
}

export const INBOX_STATUSES: readonly InboxStatus[] = [
  'pending', 'review_only', 'unmapped', 'accepted', 'rejected', 'manual_review',
];
