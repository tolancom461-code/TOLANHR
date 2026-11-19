import { describe, expect, it, vi } from 'vitest';
import { createAttendanceSourceInbox } from '../attendance-source-inbox/service';
import { SourceInboxError, type CaptureSourceEvent, type PreparedSourceEvent,
  type SourceEventRecord, type SourceInboxStore } from '../attendance-source-inbox/types';
import { normalizeMovement, normalizeUtc, prepareSourceEvent } from '../attendance-source-inbox/validation';

const identity = '123e4567-e89b-42d3-a456-426614174000';
const movementTypes = ['check_in', 'check_out', 'break_out', 'break_in', 'overtime_in', 'overtime_out'];
const event: CaptureSourceEvent = { source: 'biometric', sourceEventId: 'SYNTHETIC-SOURCE-1', workerId: 1,
  eventType: 'check_in', rawState: '0', eventTimeUtc: '2026-11-19T01:40:00.123456Z',
  sourcePersonCode: 'SYNTHETIC-PERSON', sourceDeviceUserId: '00017', sourceIdentityId: 'SYNTHETIC-ROW-1' };

function record(prepared: PreparedSourceEvent): SourceEventRecord {
  return { ...prepared, receivedAtUtc: '2026-11-19T02:00:00.000000Z', attendanceEventId: null,
    decisionCode: null, decisionNote: null, processedAtUtc: null };
}

function fixture() {
  const store = {
    assertReady: vi.fn(async () => {}),
    insert: vi.fn(async (prepared: PreparedSourceEvent) => ({ event: record(prepared), replayed: false })),
    get: vi.fn(async () => record(prepareSourceEvent(event, () => identity))),
    list: vi.fn(async () => []),
    recordExistingWorkflowOutcome: vi.fn(async () => record(prepareSourceEvent(event, () => identity))),
  } satisfies SourceInboxStore;
  return { store, inbox: createAttendanceSourceInbox(store) };
}

describe('dormant source inbox validation and eligibility', () => {
  it('constructs without I/O and only checks readiness when explicitly called', async () => {
    const { inbox, store } = fixture();
    for (const operation of Object.values(store)) expect(operation).not.toHaveBeenCalled();
    await inbox.assertReady();
    expect(store.assertReady).toHaveBeenCalledTimes(1);
    expect(store.insert).not.toHaveBeenCalled();
  });

  it('normalizes all six numeric and canonical states while preserving the source identity and raw state', async () => {
    const { inbox, store } = fixture();
    for (const [code, canonical] of movementTypes.entries()) {
      expect(normalizeMovement(code)).toBe(canonical);
      expect(normalizeMovement(String(code))).toBe(canonical);
      expect(normalizeMovement(canonical)).toBe(canonical);
      const result = await inbox.capture({ ...event, eventType: code, rawState: String(code) });
      expect(result.event).toMatchObject({ eventType: canonical, rawState: String(code),
        sourceDeviceUserId: '00017', sourceIdentityId: 'SYNTHETIC-ROW-1',
        status: code <= 1 ? 'pending' : 'review_only' });
    }
    expect(store.insert).toHaveBeenCalledTimes(6);
  });

  it('uses UTC timestamps exactly, including microseconds and the administrative-day boundary', () => {
    expect(normalizeUtc('2026-11-19T01:40:00.123456Z')).toBe('2026-11-19T01:40:00.123456Z');
    expect(normalizeUtc('2024-02-29T23:59:59Z')).toBe('2024-02-29T23:59:59.000000Z');
    expect(normalizeUtc('2026-11-19T01:40:00.1Z')).toBe('2026-11-19T01:40:00.100000Z');
    for (const value of ['2026-02-30T00:00:00Z', '2026-11-19T24:00:00Z',
      '2026-11-19T04:40:00+03:00', '2026-11-19 01:40:00', '2026-11-19T01:40:00.1234567Z']) {
      expect(() => normalizeUtc(value)).toThrowError(new SourceInboxError('INBOX_INVALID_TIMESTAMP'));
    }
  });

  it('hashes immutable content consistently and keeps technical identities distinct from movement policy', async () => {
    const first = prepareSourceEvent(event, () => identity);
    const replay = prepareSourceEvent({ ...event, eventType: 0 }, () => '123e4567-e89b-42d3-a456-426614174001');
    expect(replay.contentSha256).toBe(first.contentSha256);
    expect(replay.id).not.toBe(first.id);
    expect(prepareSourceEvent({ ...event, source: 'qr' }).contentSha256).not.toBe(first.contentSha256);
    expect(prepareSourceEvent({ ...event, eventTimeUtc: '2026-11-19T01:40:01.123456Z' }).contentSha256)
      .not.toBe(first.contentSha256);
    const { inbox, store } = fixture();
    for (let second = 0; second < 10; second++) {
      await inbox.capture({ ...event, sourceEventId: `SYNTHETIC-DISTINCT-${second}`,
        eventTimeUtc: `2026-11-19T01:40:${String(second).padStart(2, '0')}Z` });
    }
    expect(store.insert).toHaveBeenCalledTimes(10);
    expect(store.insert.mock.calls.every(([prepared]) => prepared.status === 'pending')).toBe(true);
  });

  it('keeps unmapped and auxiliary events available for review without eligibility', async () => {
    const { inbox, store } = fixture();
    const unmapped = await inbox.capture({ ...event, workerId: null });
    expect(unmapped.event.status).toBe('unmapped');
    for (const code of [2, 3, 4, 5]) {
      const result = await inbox.capture({ ...event, eventType: code, rawState: String(code), workerId: null });
      expect(result.event.status).toBe('review_only');
      store.get.mockResolvedValueOnce(result.event);
      expect(await inbox.getEligibleForExistingWorkflow(result.event.id)).toBeNull();
    }
    store.get.mockResolvedValueOnce(unmapped.event);
    expect(await inbox.getEligibleForExistingWorkflow(unmapped.event.id)).toBeNull();
    expect(await inbox.getEligibleForExistingWorkflow(identity)).toMatchObject({ eventType: 'check_in', status: 'pending' });
    expect(store.recordExistingWorkflowOutcome).not.toHaveBeenCalled();
  });

  it('rejects unknown states, sensitive extra fields, oversize fields and invalid identifiers before storage', () => {
    const { inbox, store } = fixture();
    const invalid = [
      { ...event, eventType: 6 }, { ...event, eventType: -1 }, { ...event, eventType: 1.5 },
      { ...event, eventType: 'checkin' }, { ...event, source: 'arbitrary' },
      { ...event, rawState: '5' }, { ...event, rawState: '255' },
      { ...event, source: 'qr', eventType: 'break_out' },
      { ...event, sourceEventId: 'x'.repeat(129) }, { ...event, sourceEventId: ' padded ' },
      { ...event, sourceUserName: 'x'.repeat(256) }, { ...event, sourceUserName: 'bad\u0000name' },
      { ...event, workerId: 0 }, { ...event, workerId: 2_147_483_648 },
      { ...event, rawPayload: 'SYNTHETIC-RAW' }, { ...event, password: 'SYNTHETIC-CREDENTIAL' },
      { ...event, fingerprintTemplate: 'SYNTHETIC-TEMPLATE' }, { ...event, accessToken: 'SYNTHETIC-TOKEN' },
    ];
    for (const value of invalid) expect(() => inbox.capture(value as CaptureSourceEvent)).toThrow(SourceInboxError);
    expect(store.insert).not.toHaveBeenCalled();
  });

  it('rejects accessor and nonplain input without evaluating a getter or letting it alter a validated field', () => {
    const { inbox, store } = fixture();
    const getter = vi.fn(() => 'biometric');
    const changingSource = { ...event };
    Object.defineProperty(changingSource, 'source', { enumerable: true, get: getter });
    const prototypeSource = Object.assign(Object.create({ source: 'biometric' }), event);
    const hiddenCredential = { ...event };
    Object.defineProperty(hiddenCredential, 'password', { value: 'SYNTHETIC-SECRET', enumerable: false });
    for (const value of [changingSource, prototypeSource, hiddenCredential]) {
      expect(() => inbox.capture(value as CaptureSourceEvent)).toThrow(SourceInboxError);
    }
    expect(getter).not.toHaveBeenCalled();
    expect(store.insert).not.toHaveBeenCalled();
  });

  it('validates read filters and outcome acknowledgments without deciding attendance', async () => {
    const { inbox, store } = fixture();
    await inbox.list();
    expect(store.list).toHaveBeenLastCalledWith({ limit: 50 });
    await inbox.list({ source: 'biometric', workerId: 1, status: 'review_only', limit: 200 });
    expect(store.list).toHaveBeenLastCalledWith({ source: 'biometric', workerId: 1, status: 'review_only', limit: 200 });
    for (const value of [{ limit: 201 }, { workerId: -1 }, { status: 'automatic' }, { rawPayload: true }]) {
      expect(() => inbox.list(value as never)).toThrow(SourceInboxError);
    }
    await inbox.recordExistingWorkflowOutcome({ id: identity, status: 'accepted', attendanceEventId: 17 });
    expect(store.recordExistingWorkflowOutcome).toHaveBeenCalledWith({ id: identity, status: 'accepted',
      attendanceEventId: 17, decisionCode: null, decisionNote: null });
    for (const value of [
      { id: identity, status: 'accepted' },
      { id: identity, status: 'rejected', attendanceEventId: 17, decisionCode: 'EXISTING_RULE' },
      { id: identity, status: 'manual_review' },
      { id: identity, status: 'rejected', decisionCode: 'unsafe decision' },
    ]) expect(() => inbox.recordExistingWorkflowOutcome(value as never)).toThrow(SourceInboxError);
  });
});
