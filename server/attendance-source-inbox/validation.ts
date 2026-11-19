import { createHash, randomUUID } from 'node:crypto';
import {
  INBOX_STATUSES, MOVEMENT_TYPES, SourceInboxError,
  type CaptureSourceEvent, type ExistingWorkflowOutcome, type InboxListFilter,
  type MovementType, type PreparedSourceEvent,
} from './types';

const captureKeys = new Set([
  'source', 'sourceEventId', 'eventType', 'eventTimeUtc', 'workerId', 'sourcePersonCode',
  'sourceDeviceId', 'sourceDeviceUserId', 'sourceIdentityId', 'sourceUserName', 'rawState',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?Z$/;

function snapshot(value: unknown, allowed: ReadonlySet<string>): Record<string, unknown> {
  check(value && typeof value === 'object' && !Array.isArray(value));
  const prototype = Object.getPrototypeOf(value);
  check(prototype === Object.prototype || prototype === null);
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    check(typeof key === 'string' && allowed.has(key), 'INBOX_UNEXPECTED_FIELD');
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    check('value' in descriptor, 'INBOX_INVALID_INPUT');
    result[key] = descriptor.value;
  }
  return result;
}

function check(condition: unknown, code = 'INBOX_INVALID_INPUT'): asserts condition {
  if (!condition) throw new SourceInboxError(code);
}

export function validateId(value: unknown): string {
  check(typeof value === 'string' && UUID.test(value));
  return value.toLowerCase();
}

export function positiveId(value: unknown): number {
  check(typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647);
  return value;
}

function text(value: unknown, maximum: number, identifier = false): string | null {
  if (value === undefined || value === null) return null;
  check(typeof value === 'string' && [...value].length > 0 && [...value].length <= maximum);
  check(!/[\u0000-\u001f\u007f]/.test(value));
  check(!/\p{Surrogate}/u.test(value));
  if (identifier) check(value.trim() === value);
  return value;
}

export function normalizeUtc(value: unknown): string {
  check(typeof value === 'string');
  const match = UTC_TIME.exec(value);
  check(match && Number(match[1].slice(0, 4)) >= 1000 && Number(match[1].slice(0, 4)) <= 9999,
    'INBOX_INVALID_TIMESTAMP');
  const seconds = `${match[1]}T${match[2]}`;
  const fraction = (match[3] ?? '').padEnd(6, '0');
  const parsed = new Date(`${seconds}.${fraction.slice(0, 3)}Z`);
  check(Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 19) === seconds,
    'INBOX_INVALID_TIMESTAMP');
  return `${seconds}.${fraction}Z`;
}

export function normalizeMovement(value: unknown): MovementType {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 5) return MOVEMENT_TYPES[value];
  if (typeof value === 'string' && /^[0-5]$/.test(value)) return MOVEMENT_TYPES[Number(value)];
  check(typeof value === 'string' && (MOVEMENT_TYPES as readonly string[]).includes(value), 'INBOX_INVALID_MOVEMENT');
  return value as MovementType;
}

export function isAttendanceMovement(type: string): type is 'check_in' | 'check_out' {
  return type === 'check_in' || type === 'check_out';
}

export function validateSourceIdentity(source: unknown, sourceEventId: unknown) {
  check(source === 'qr' || source === 'biometric');
  const key = text(sourceEventId, 128, true);
  check(key);
  return { source, sourceEventId: key };
}

export function prepareSourceEvent(value: CaptureSourceEvent, idFactory: () => string = randomUUID): PreparedSourceEvent {
  const input = snapshot(value, captureKeys) as unknown as CaptureSourceEvent;
  check(input.source === 'qr' || input.source === 'biometric');
  const eventType = normalizeMovement(input.eventType);
  check(input.source !== 'qr' || isAttendanceMovement(eventType), 'INBOX_INVALID_QR_MOVEMENT');
  const sourceEventId = text(input.sourceEventId, 128, true);
  check(sourceEventId);
  const workerId = input.workerId == null ? null : positiveId(input.workerId);
  const eventTimeUtc = normalizeUtc(input.eventTimeUtc);
  const rawState = text(input.rawState, 32)
    ?? (typeof input.eventType === 'number' || /^[0-5]$/.test(input.eventType) ? String(input.eventType) : null);
  if (rawState !== null) check(/^[0-5]$/.test(rawState) && normalizeMovement(rawState) === eventType, 'INBOX_INVALID_RAW_STATE');
  const fields = {
    source: input.source, sourceEventId, workerId,
    sourcePersonCode: text(input.sourcePersonCode, 100, true),
    sourceDeviceId: text(input.sourceDeviceId, 128, true),
    sourceDeviceUserId: text(input.sourceDeviceUserId, 128, true),
    sourceIdentityId: text(input.sourceIdentityId, 128, true),
    sourceUserName: text(input.sourceUserName, 255),
    eventType, rawState, eventTimeUtc,
  };
  // Technical replay detection only. No worker/day/cycle or time-window policy is added.
  const contentSha256 = createHash('sha256').update(JSON.stringify(fields)).digest('hex');
  const status = !isAttendanceMovement(eventType) ? 'review_only' : workerId === null ? 'unmapped' : 'pending';
  return { id: validateId(idFactory()), ...fields, contentSha256, status };
}

export function validateListFilter(value: InboxListFilter = {}): InboxListFilter {
  const input = snapshot(value, new Set(['source', 'workerId', 'status', 'limit'])) as unknown as InboxListFilter;
  if (input.source !== undefined) check(input.source === 'qr' || input.source === 'biometric');
  if (input.workerId !== undefined) positiveId(input.workerId);
  if (input.status !== undefined) check(INBOX_STATUSES.includes(input.status));
  if (input.limit !== undefined) check(Number.isInteger(input.limit) && input.limit >= 1 && input.limit <= 200);
  return { ...input, limit: input.limit ?? 50 };
}

export function validateOutcome(value: ExistingWorkflowOutcome): ExistingWorkflowOutcome {
  const input = snapshot(value, new Set(['id', 'status', 'attendanceEventId', 'decisionCode', 'decisionNote'])) as unknown as ExistingWorkflowOutcome;
  const id = validateId(input.id);
  check(['accepted', 'rejected', 'manual_review'].includes(input.status));
  const attendanceEventId = input.attendanceEventId == null ? null : positiveId(input.attendanceEventId);
  const decisionCode = text(input.decisionCode, 64, true);
  if (decisionCode) check(/^[A-Z][A-Z0-9_]*$/.test(decisionCode));
  if (input.status === 'accepted') check(attendanceEventId !== null);
  else check(attendanceEventId === null && decisionCode !== null);
  return { id, status: input.status, attendanceEventId, decisionCode, decisionNote: text(input.decisionNote, 500) };
}
