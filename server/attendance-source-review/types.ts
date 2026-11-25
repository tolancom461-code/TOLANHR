import type { MovementType, InboxStatus, SourceSystem } from '../attendance-source-inbox/types';

export type ReviewStatus = InboxStatus | 'already_recorded' | 'before_activation' | 'needs_review';
export type SourceReviewStatus = ReviewStatus;
export interface SourceReviewFilter {
  search?: string;
  source?: 'all' | SourceSystem;
  movement?: 'all' | MovementType;
  status?: 'all' | ReviewStatus;
  dateFrom?: string;
  dateTo?: string;
  timeBasis?: 'event_time' | 'received_at';
  groupId?: number;
  sort?: 'asc' | 'desc';
  page?: number;
  limit?: 20 | 50 | 100;
}
export interface SourceReviewItem {
  id: string;
  source: SourceSystem;
  eventType: MovementType;
  rawStatus: InboxStatus;
  displayStatus: Exclude<ReviewStatus, 'needs_review'>;
  statusLabel: string;
  reason: string;
  worker: { id: number; code: string; name: string; currentGroupId: number | null; currentGroupName: string | null } | null;
  sourceUserName: string | null;
  deviceUserId: string | null;
  deviceName: string | null;
  eventTimeUtc: string;
  receivedAtUtc: string;
  processedAtUtc: string | null;
  approvedMovement: { id: number; workerId: number; eventType: MovementType; method: string;
    eventTimeUtc: string; workDate: string; kind: 'accepted' | 'already_recorded' } | null;
  referenceIssue: boolean;
  beforeActivation: boolean | null;
  original: { sourceEventId: string; sourcePersonCode: string | null; sourceDeviceId: string | null;
    sourceDeviceUserId: string | null; sourceIdentityId: string | null; sourceUserName: string | null; rawState: string | null };
}
export interface SourceReviewList {
  items: SourceReviewItem[];
  page: { number: number; limit: number; total: number; totalPages: number };
  summary: { all: number; accepted: number; alreadyRecorded: number; needsReview: number; pending: number };
  groups: Array<{ id: number; name: string }>;
  activation: { startedAtUtc: string } | null;
}
export interface SourceReviewStore {
  list(input?: SourceReviewFilter): Promise<SourceReviewList>;
  detail(id: string): Promise<{ item: SourceReviewItem }>;
}
export class SourceReviewError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'SourceReviewError'; }
}
