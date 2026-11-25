import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareSourceEvent } from '../attendance-source-inbox/validation';
import type { SourceEventRecord } from '../attendance-source-inbox/types';

const mocks = vi.hoisted(() => ({ get: vi.fn(), read: vi.fn(), execute: vi.fn() }));
vi.mock('../attendance-source-inbox/mysql-store', () => ({
  createMysqlAttendanceSourceInboxStore: () => ({ get: mocks.get, assertReady: vi.fn() }),
}));
vi.mock('../biometric-directory/mysql-store', () => ({
  createMysqlBiometricDirectoryStore: () => ({ assertReady: vi.fn() }),
}));
vi.mock('../attendance-source-promotion/activation', () => ({
  createSourcePromotionActivation: () => ({ read: mocks.read }),
}));

import { createSourceAttendancePromotion } from '../attendance-source-promotion/coordinator';

const streamId = '123e4567-e89b-42d3-a456-426614174098';
const activation = { streamId, startedAtUtc: '2026-11-25T00:00:00.000000Z' };
const linkId = '32acfa16-49ef-4ff5-8000-906ca583d348';
const qrId = '9facb5ab-5ab5-4edc-8a0e-9fa3cdd999a1';
const winnerId = '6ad3de5d-a9d6-4f18-9fd2-1fa7d29aa082';

afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); });

function fixture(eventType: 'check_in' | 'check_out' = 'check_in') {
  const note = (link: string | null) => JSON.stringify({ v: 1, s: streamId, a: activation.startedAtUtc, w: 17, l: link, p: 101 });
  const qr: SourceEventRecord = { ...prepareSourceEvent({ source: 'qr', sourceEventId: '7:8c5f71ab-d8fc-4057-98dd-dc35911e6600',
    workerId: 17, eventType, eventTimeUtc: '2026-11-25T08:10:00.000000Z' }, () => qrId),
    status: 'rejected', receivedAtUtc: '2026-11-25T08:10:00.000001Z', attendanceEventId: null,
    decisionCode: 'SOURCE_FIRST_ARRIVAL', decisionNote: note(null), processedAtUtc: '2026-11-25T08:10:00.000002Z' };
  const winner: SourceEventRecord = { ...prepareSourceEvent({ source: 'biometric', sourceEventId: `bio:${'a'.repeat(64)}`,
    workerId: null, sourcePersonCode: null, sourceUserName: null, sourceDeviceId: '9001', sourceDeviceUserId: '00017',
    sourceIdentityId: '701', eventType, rawState: eventType === 'check_in' ? '0' : '1',
    eventTimeUtc: '2026-11-25T08:00:00.000000Z' }, () => winnerId),
    status: 'accepted', receivedAtUtc: '2026-11-25T08:00:00.000001Z', attendanceEventId: 101,
    decisionCode: 'SOURCE_ACCEPTED', decisionNote: note(linkId), processedAtUtc: '2026-11-25T08:00:00.000002Z' };
  const row = toRow(winner);
  const getConnection = vi.fn(async () => { throw new Error('UNEXPECTED_TRANSACTION'); });
  const execute = vi.fn(async () => { throw new Error('UNEXPECTED_WORKFLOW'); });
  mocks.read.mockResolvedValue(activation);
  mocks.get.mockImplementation(async () => qr);
  mocks.execute.mockImplementation(async () => [[row]]);
  const promotion = createSourceAttendancePromotion({ pool: { execute: mocks.execute, getConnection } as any,
    config: { database: 'synthetic', streamId, intervalMs: 2000, batchSize: 20 } });
  return { qr, winner, row, getConnection, execute, promotion,
    resume: () => promotion.resumeQr(17, qr.id, execute) };
}

function toRow(event: SourceEventRecord): Record<string, any> {
  return { id: event.id, source: event.source, source_event_id: event.sourceEventId, content_sha256: event.contentSha256,
    worker_id: event.workerId, source_person_code: event.sourcePersonCode, source_device_id: event.sourceDeviceId,
    source_device_user_id: event.sourceDeviceUserId, source_identity_id: event.sourceIdentityId, source_user_name: event.sourceUserName,
    event_type: event.eventType, raw_state: event.rawState, status: event.status, attendance_event_id: event.attendanceEventId,
    decision_code: event.decisionCode, decision_note: event.decisionNote, event_iso: event.eventTimeUtc,
    received_iso: event.receivedAtUtc, processed_iso: event.processedAtUtc, winner_id: 101, winner_worker_id: 17,
    winner_event_type: event.eventType, winner_method: 'biometric', winner_link_id: linkId,
    winner_time_riyadh: '2026-11-25 11:00:00', winner_work_date: '2026-11-25' };
}

function qrTime(lab: ReturnType<typeof fixture>, eventTimeUtc: string) {
  const prepared = prepareSourceEvent({ source: lab.qr.source, sourceEventId: lab.qr.sourceEventId,
    workerId: lab.qr.workerId, eventType: lab.qr.eventType, eventTimeUtc }, () => lab.qr.id);
  lab.qr.eventTimeUtc = prepared.eventTimeUtc;
  lab.qr.contentSha256 = prepared.contentSha256;
  lab.qr.receivedAtUtc = prepared.eventTimeUtc;
}

describe('confirming a prior biometric winner through QR', () => {
  it.each(['check_in', 'check_out'] as const)('confirms %s using the winning stored timestamp without writes', async eventType => {
    const lab = fixture(eventType);
    const before = JSON.stringify(lab.qr);
    await expect(lab.resume()).resolves.toEqual({ success: true, workerId: 17, eventType, eventId: 101,
      timestamp: new Date('2026-11-25T08:00:00Z'), workDate: '2026-11-25', alreadyRecorded: true, source: 'biometric' });
    expect(JSON.stringify(lab.qr)).toBe(before);
    expect(lab.execute).not.toHaveBeenCalled();
    expect(lab.getConnection).not.toHaveBeenCalled();
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.execute.mock.calls[0][0]).toContain("s.source='biometric' AND s.status='accepted'");
    expect(mocks.execute.mock.calls[0][1]).toEqual([streamId, 101]);
    expect(mocks.execute.mock.calls[0][0]).toContain('h.device_user_id_snapshot=s.source_device_user_id');
    expect(mocks.execute.mock.calls[0][0]).toContain('h.source_identity_id=s.source_identity_id');
  });

  it('replays the same frozen winner after time and current mapping could have changed', async () => {
    const lab = fixture();
    const first = await lab.resume();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-03-01T00:00:00Z'));
    await expect(lab.resume()).resolves.toEqual(first);
    expect(lab.execute).not.toHaveBeenCalled();
    expect(lab.getConnection).not.toHaveBeenCalled();
    expect(mocks.execute.mock.calls.every(([statement]) => !/current_source_identity_id|FROM workers/.test(String(statement)))).toBe(true);
  });

  it('permits the exact inclusive fifteen-hour phase bound against the stored original time', async () => {
    const lab = fixture();
    qrTime(lab, '2026-11-25T23:00:00.000000Z');
    await expect(lab.resume()).resolves.toMatchObject({ alreadyRecorded: true, eventId: 101,
      timestamp: new Date('2026-11-25T08:00:00Z') });
  });

  it.each([
    ['missing winner', (lab: ReturnType<typeof fixture>) => mocks.execute.mockResolvedValueOnce([[]])],
    ['ambiguous accepted evidence', (lab: ReturnType<typeof fixture>) => mocks.execute.mockResolvedValueOnce([[lab.row, lab.row]])],
    ['different worker', (lab: ReturnType<typeof fixture>) => { lab.row.winner_worker_id = 18; }],
    ['different movement', (lab: ReturnType<typeof fixture>) => { lab.row.winner_event_type = 'check_out'; }],
    ['same source method', (lab: ReturnType<typeof fixture>) => { lab.row.winner_method = 'qr'; }],
    ['different attendance ID', (lab: ReturnType<typeof fixture>) => { lab.row.winner_id = 102; }],
    ['invalid original timestamp', (lab: ReturnType<typeof fixture>) => { lab.row.winner_time_riyadh = '2026-02-30 11:00:00'; }],
    ['changed original timestamp', (lab: ReturnType<typeof fixture>) => { lab.row.winner_time_riyadh = '2026-11-25 11:01:00'; }],
    ['changed work date', (lab: ReturnType<typeof fixture>) => { lab.row.winner_work_date = '2026-11-24'; }],
    ['invalid biometric namespace', (lab: ReturnType<typeof fixture>) => { lab.row.source_event_id = 'other-source'; }],
    ['rewritten raw worker', (lab: ReturnType<typeof fixture>) => { lab.row.worker_id = 17; }],
    ['changed raw hash', (lab: ReturnType<typeof fixture>) => { lab.row.content_sha256 = 'b'.repeat(64); }],
    ['wrong source binding worker', (lab: ReturnType<typeof fixture>) => { lab.row.decision_note = JSON.stringify({ ...JSON.parse(lab.row.decision_note), w: 18 }); }],
    ['wrong source stream', (lab: ReturnType<typeof fixture>) => { lab.row.decision_note = JSON.stringify({ ...JSON.parse(lab.row.decision_note), s: 'other-stream' }); }],
    ['wrong source activation', (lab: ReturnType<typeof fixture>) => { lab.row.decision_note = JSON.stringify({ ...JSON.parse(lab.row.decision_note), a: '2026-11-24T00:00:00.000000Z' }); }],
    ['missing historic link evidence', (lab: ReturnType<typeof fixture>) => { lab.row.decision_note = JSON.stringify({ ...JSON.parse(lab.row.decision_note), l: null }); }],
    ['different valid historical link', (lab: ReturnType<typeof fixture>) => { lab.row.winner_link_id = 'e58bdcd0-cd13-4d01-95cc-e88e7ca4b846'; }],
    ['invalid source evidence version', (lab: ReturnType<typeof fixture>) => { lab.row.decision_note = JSON.stringify({ ...JSON.parse(lab.row.decision_note), v: 2 }); }],
    ['wrong QR resolved worker', (lab: ReturnType<typeof fixture>) => { lab.qr.decisionNote = JSON.stringify({ ...JSON.parse(lab.qr.decisionNote!), w: 18 }); }],
    ['wrong QR winner pointer type', (lab: ReturnType<typeof fixture>) => { lab.qr.decisionNote = JSON.stringify({ ...JSON.parse(lab.qr.decisionNote!), p: '101' }); }],
    ['wrong QR link format', (lab: ReturnType<typeof fixture>) => { lab.qr.decisionNote = JSON.stringify({ ...JSON.parse(lab.qr.decisionNote!), l: linkId }); }],
    ['non-rejected QR receipt', (lab: ReturnType<typeof fixture>) => { lab.qr.status = 'manual_review'; }],
    ['QR time before original winner', (lab: ReturnType<typeof fixture>) => { qrTime(lab, '2026-11-25T07:59:59.999000Z'); }],
    ['QR time outside original phase', (lab: ReturnType<typeof fixture>) => { qrTime(lab, '2026-11-25T23:00:00.001000Z'); }],
  ])('fails safely for %s', async (_name, corrupt) => {
    const lab = fixture();
    corrupt(lab);
    await expect(lab.resume()).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(lab.execute).not.toHaveBeenCalled();
    expect(lab.getConnection).not.toHaveBeenCalled();
  });

  it('turns a winning attendance read failure into safe conflict without database details', async () => {
    const lab = fixture();
    mocks.execute.mockRejectedValueOnce(new Error('SYNTHETIC_PRIVATE_DRIVER_FAILURE'));
    await expect(lab.resume()).rejects.toMatchObject({ code: 'CONFLICT', message: 'الحركة السابقة تحتاج مراجعة. لم يُنشأ تسجيل إضافي.' });
    expect(lab.execute).not.toHaveBeenCalled();
  });

  it.each(['QR_COOLDOWN', 'SOURCE_PERIOD_LOCKED'])('keeps genuine %s rejection unchanged', async decisionCode => {
    const lab = fixture();
    lab.qr.decisionCode = decisionCode;
    await expect(lab.resume()).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(lab.execute).not.toHaveBeenCalled();
  });
});
