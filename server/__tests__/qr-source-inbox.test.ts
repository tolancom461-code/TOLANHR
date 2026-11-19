import { TRPCError } from '@trpc/server';
import type { Pool } from 'mysql2/promise';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordQrWithSourceInbox, type QrAttendanceObservation } from '../attendance-source-inbox/qr-observer';
import { SourceInboxError, type ExistingWorkflowOutcome, type PreparedSourceEvent,
  type SourceEventRecord, type SourceInboxLookupStore } from '../attendance-source-inbox/types';
import { createQrAttemptId } from '../../client/src/lib/qr-attempt-id';

const attemptId = '123e4567-e89b-42d3-a456-426614174000';
const request = { workerId: 1, eventType: 'check_in' as const, actorId: 1, attemptId };
const time = new Date('2026-11-19T08:00:00.123Z');
const result = { success: true, workerId: 1, eventType: 'check_in' as const,
  eventId: 17, timestamp: time, workDate: '2026-11-19' };

function fixture() {
  let saved: SourceEventRecord | null = null;
  const store = {
    assertReady: vi.fn(async () => {}),
    getBySourceEventId: vi.fn(async () => saved),
    insert: vi.fn(async (event: PreparedSourceEvent) => {
      saved = { ...event, receivedAtUtc: '2026-11-19T08:00:01.000000Z', attendanceEventId: null,
        decisionCode: null, decisionNote: null, processedAtUtc: null };
      return { event: saved, replayed: false };
    }),
    get: vi.fn(async () => saved),
    list: vi.fn(async () => saved ? [saved] : []),
    recordExistingWorkflowOutcome: vi.fn(async (outcome: ExistingWorkflowOutcome) => {
      if (!saved) throw new Error('Unexpected missing synthetic receipt');
      saved = { ...saved, ...outcome, attendanceEventId: outcome.attendanceEventId ?? null,
        decisionCode: outcome.decisionCode ?? null, decisionNote: outcome.decisionNote ?? null,
        processedAtUtc: '2026-11-19T08:00:02.000000Z' };
      return saved;
    }),
  } satisfies SourceInboxLookupStore;
  const executePool = vi.fn(async () => [[{ id: 17, worker_id: 1, event_type: 'check_in', work_date: '2026-11-19' }], []]);
  const pool = { execute: executePool } as unknown as Pool;
  const execute = vi.fn(async (observation?: QrAttendanceObservation) => {
    await observation?.beforeValidation({ eventTime: time, workerName: 'Synthetic QR worker', personCode: 'SYNTHETIC-W1' });
    observation?.attendanceSaved(result.eventId);
    return result;
  });
  const dependencies = { getPool: vi.fn(async () => pool), createStore: vi.fn(() => store),
    execute, diagnostic: vi.fn() };
  return { store, dependencies, executePool, saved: () => saved };
}

beforeEach(() => {
  vi.stubEnv('ATTENDANCE_SOURCE_QR_ENABLED', 'true');
  vi.stubEnv('ATTENDANCE_SOURCE_DB_CONFIRMED_NAME', 'synthetic_qr_database');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('QR source inbox observes the current attendance workflow', () => {
  it.each(['false', ''])('uses the old path without opening an inbox when enabled is %s', async enabled => {
    vi.stubEnv('ATTENDANCE_SOURCE_QR_ENABLED', enabled);
    const f = fixture();
    expect(await recordQrWithSourceInbox(request, f.dependencies)).toBe(result);
    expect(f.dependencies.execute).toHaveBeenCalledWith();
    expect(f.dependencies.getPool).not.toHaveBeenCalled();
    expect(f.store.insert).not.toHaveBeenCalled();
  });

  it('leaves legacy automatic-type requests on their existing path', async () => {
    const f = fixture();
    expect(await recordQrWithSourceInbox({ ...request, eventType: undefined }, f.dependencies)).toBe(result);
    expect(f.dependencies.execute).toHaveBeenCalledWith();
    expect(f.dependencies.getPool).not.toHaveBeenCalled();
  });

  it('saves a pending receipt before the existing workflow and acknowledges the actual saved event', async () => {
    const f = fixture();
    f.dependencies.execute.mockImplementationOnce(async observation => {
      expect(f.store.insert).not.toHaveBeenCalled();
      await observation!.beforeValidation({ eventTime: time, workerName: 'Synthetic QR worker', personCode: null });
      expect(f.saved()).toMatchObject({ status: 'pending', source: 'qr', sourceEventId: `1:${attemptId}`,
        eventTimeUtc: '2026-11-19T08:00:00.123000Z', sourceUserName: 'Synthetic QR worker' });
      expect(f.store.recordExistingWorkflowOutcome).not.toHaveBeenCalled();
      observation!.attendanceSaved(17);
      return result;
    });
    expect(await recordQrWithSourceInbox(request, f.dependencies)).toBe(result);
    expect(f.store.recordExistingWorkflowOutcome).toHaveBeenCalledWith(expect.objectContaining({
      status: 'accepted', attendanceEventId: 17,
    }));
  });

  it('stops before attendance when readiness or initial capture fails', async () => {
    const f = fixture();
    f.store.assertReady.mockRejectedValueOnce(new SourceInboxError('INBOX_SCHEMA_NOT_READY'));
    await expect(recordQrWithSourceInbox(request, f.dependencies)).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(f.dependencies.execute).not.toHaveBeenCalled();
    f.store.insert.mockRejectedValueOnce(new SourceInboxError('INBOX_STORAGE_ERROR'));
    let reachedInsert = false;
    f.dependencies.execute.mockImplementationOnce(async observation => {
      await observation!.beforeValidation({ eventTime: time, workerName: null, personCode: null });
      reachedInsert = true;
      return result;
    });
    await expect(recordQrWithSourceInbox(request, f.dependencies)).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(reachedInsert).toBe(false);
    expect(f.store.recordExistingWorkflowOutcome).not.toHaveBeenCalled();
  });

  it('preserves the original cooldown rejection and replays the same error without processing again', async () => {
    const f = fixture();
    const failure = new TRPCError({ code: 'BAD_REQUEST',
      message: 'عذراً، لا يمكن تسجيل حركتين متتاليتين خلال أقل من 3 دقائق، يرجى الانتظار.' });
    f.dependencies.execute.mockImplementationOnce(async observation => {
      await observation!.beforeValidation({ eventTime: time, workerName: null, personCode: null });
      throw failure;
    });
    await expect(recordQrWithSourceInbox(request, f.dependencies)).rejects.toBe(failure);
    expect(f.saved()).toMatchObject({ status: 'rejected', decisionCode: 'QR_COOLDOWN', attendanceEventId: null });
    await expect(recordQrWithSourceInbox(request, f.dependencies)).rejects.toMatchObject({ code: 'BAD_REQUEST', message: failure.message });
    expect(f.dependencies.execute).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('marks an existing-workflow failure for review with post-insert=%s and never reruns it', async postInsert => {
    const f = fixture();
    const failure = new Error('Synthetic existing workflow failure');
    f.dependencies.execute.mockImplementationOnce(async observation => {
      await observation!.beforeValidation({ eventTime: time, workerName: null, personCode: null });
      if (postInsert) observation!.attendanceSaved(17);
      throw failure;
    });
    await expect(recordQrWithSourceInbox(request, f.dependencies)).rejects.toBe(failure);
    expect(f.saved()).toMatchObject({ status: 'manual_review', attendanceEventId: null,
      decisionCode: postInsert ? 'QR_POST_INSERT_FAILURE' : 'QR_WORKFLOW_FAILED',
      decisionNote: postInsert ? 'attendance_event_id=17' : null });
    await expect(recordQrWithSourceInbox(request, f.dependencies)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(f.dependencies.execute).toHaveBeenCalledTimes(1);
  });

  it('preserves successful attendance after acknowledgement failure and blocks an ambiguous automatic retry', async () => {
    const f = fixture();
    f.store.recordExistingWorkflowOutcome.mockRejectedValueOnce(new SourceInboxError('INBOX_STORAGE_ERROR'));
    expect(await recordQrWithSourceInbox(request, f.dependencies)).toBe(result);
    expect(f.saved()?.status).toBe('pending');
    expect(f.dependencies.diagnostic).toHaveBeenCalledWith('QR_ACCEPTED_OUTCOME_NOT_RECORDED');
    await expect(recordQrWithSourceInbox(request, f.dependencies)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(f.dependencies.execute).toHaveBeenCalledTimes(1);
  });

  it('replays a successful attempt from its immutable receipt and rejects a changed worker or movement', async () => {
    const f = fixture();
    await recordQrWithSourceInbox(request, f.dependencies);
    expect(await recordQrWithSourceInbox(request, f.dependencies)).toEqual(result);
    expect(f.dependencies.execute).toHaveBeenCalledTimes(1);
    expect(f.store.insert).toHaveBeenCalledTimes(1);
    expect(f.executePool).toHaveBeenCalledTimes(1);
    await expect(recordQrWithSourceInbox({ ...request, workerId: 2 }, f.dependencies)).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(recordQrWithSourceInbox({ ...request, eventType: 'check_out' }, f.dependencies)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(f.dependencies.execute).toHaveBeenCalledTimes(1);
  });

  it('keeps an accepted attempt from executing again when its stored attendance cannot be read', async () => {
    const f = fixture();
    await recordQrWithSourceInbox(request, f.dependencies);
    f.executePool.mockRejectedValueOnce(new Error('Synthetic attendance read failure'));
    await expect(recordQrWithSourceInbox(request, f.dependencies)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(f.dependencies.diagnostic).toHaveBeenCalledWith('QR_ACCEPTED_REPLAY_NOT_VERIFIED');
    expect(f.dependencies.execute).toHaveBeenCalledTimes(1);
    expect(f.store.insert).toHaveBeenCalledTimes(1);
  });

  it('creates a valid random confirmation identity on LAN HTTP browsers that provide getRandomValues only', () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.fill(255);
      return bytes;
    });
    vi.stubGlobal('crypto', { getRandomValues });
    expect(createQrAttemptId()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(getRandomValues).toHaveBeenCalledTimes(1);
  });
});
