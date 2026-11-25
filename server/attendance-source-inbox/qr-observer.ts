import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { createMysqlAttendanceSourceInboxStore } from './mysql-store';
import { createAttendanceSourceInbox } from './service';
import { SourceInboxError, type SourceEventRecord, type SourceInboxLookupStore } from './types';
import { positiveId, validateId } from './validation';
import type { AttendanceSourceExecution } from '../attendance-logic';

export interface QrAttendanceResult {
  success: boolean;
  eventType: 'check_in' | 'check_out';
  workerId: number;
  eventId: number;
  timestamp: Date;
  workDate: string;
  alreadyRecorded?: boolean;
  source?: 'qr' | 'biometric';
}

/** Observes the existing workflow; never replaces its admission or finance rules. */
export interface QrAttendanceObservation {
  beforeValidation(context: { eventTime: Date; workerName: string | null; personCode: string | null }): Promise<void>;
  attendanceSaved(eventId: number): void;
}

interface QrRequest {
  workerId: number;
  eventType?: 'check_in' | 'check_out';
  actorId?: number;
  attemptId?: string;
}

interface QrDependencies {
  getPool(): Promise<Pool>;
  execute(observation?: QrAttendanceObservation, sourceExecution?: AttendanceSourceExecution): Promise<QrAttendanceResult>;
  /** Injection for isolated tests. Production uses the supplied existing application pool. */
  createStore?: (pool: Pool, database: string) => SourceInboxLookupStore;
  diagnostic?: (code: string) => void;
}

class ExistingAttempt extends Error {
  constructor(readonly receipt: SourceEventRecord) { super('QR_EXISTING_ATTEMPT'); }
}
class CoordinatedQrResult extends Error {
  constructor(readonly result: QrAttendanceResult) { super('QR_SOURCE_COORDINATED'); }
}

/** No environment file loading, pool creation, DDL, timers, or biometric connector. */
export async function recordQrWithSourceInbox(request: QrRequest, dependencies: QrDependencies): Promise<QrAttendanceResult> {
  // Legacy auto-type callers keep their existing path until they have an explicit intent envelope.
  if (process.env.ATTENDANCE_SOURCE_QR_ENABLED !== 'true' || !request.eventType) return dependencies.execute();

  const database = process.env.ATTENDANCE_SOURCE_DB_CONFIRMED_NAME;
  if (!database || !/^[A-Za-z0-9_]+$/.test(database)) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'إعداد سجل حركات QR غير مكتمل.' });
  }
  const workerId = positiveId(request.workerId);
  const actorId = request.actorId == null ? 'legacy' : String(positiveId(request.actorId));
  const attemptId = request.attemptId ? validateId(request.attemptId) : randomUUID();
  const key = `${actorId}:${attemptId}`;
  const eventType = request.eventType;
  const diagnostic = dependencies.diagnostic ?? (code => console.warn(`[QR source inbox] ${code}`));
  const warn = (code: string) => { try { diagnostic(code); } catch { /* Diagnostics cannot alter attendance. */ } };

  let pool: Pool;
  let store: SourceInboxLookupStore;
  try {
    pool = await dependencies.getPool();
    store = (dependencies.createStore ?? createMysqlAttendanceSourceInboxStore)(pool, database);
    await store.assertReady();
  } catch {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'تعذر فتح سجل حركات QR. لم يبدأ تسجيل الحضور.' });
  }
  const inbox = createAttendanceSourceInbox(store);

  function checkIntent(receipt: SourceEventRecord) {
    if (receipt.source !== 'qr' || receipt.workerId !== workerId || receipt.eventType !== eventType) {
      throw new TRPCError({ code: 'CONFLICT', message: 'معرّف محاولة QR مستخدم لتسجيل مختلف.' });
    }
  }

  async function replay(receipt: SourceEventRecord): Promise<QrAttendanceResult> {
    checkIntent(receipt);
    if (receipt.status === 'accepted' && receipt.attendanceEventId !== null) {
      // Reuse the result of the existing workflow, not a fresh attendance INSERT.
      let rows: RowDataPacket[];
      try {
        [rows] = await pool.execute<RowDataPacket[]>(
          `SELECT id, worker_id, event_type, DATE_FORMAT(work_date, '%Y-%m-%d') AS work_date
           FROM attendance_events WHERE id = ?`, [receipt.attendanceEventId],
        );
      } catch {
        warn('QR_ACCEPTED_REPLAY_NOT_VERIFIED');
        throw new TRPCError({ code: 'CONFLICT', message: 'تعذر التحقق من الحركة السابقة. لم يُكرر التسجيل وتحتاج المحاولة مراجعة.' });
      }
      if (!rows[0] || Number(rows[0].worker_id) !== workerId || rows[0].event_type !== eventType || !rows[0].work_date) {
        throw new TRPCError({ code: 'CONFLICT', message: 'الحركة السابقة تحتاج مراجعة. لم يُنشأ تسجيل إضافي.' });
      }
      return { success: true, eventId: Number(rows[0].id), workerId, eventType,
        timestamp: new Date(receipt.eventTimeUtc), workDate: rows[0].work_date };
    }
    if (receipt.status === 'rejected' && receipt.decisionCode === 'QR_COOLDOWN') {
      throw new TRPCError({ code: 'BAD_REQUEST',
        message: 'عذراً، لا يمكن تسجيل حركتين متتاليتين خلال أقل من 3 دقائق، يرجى الانتظار.' });
    }
    // A pending attempt could have committed attendance before its acknowledgement.
    throw new TRPCError({ code: 'CONFLICT', message: 'سبق استلام هذه المحاولة وتحتاج مراجعة. لم يُكرر التسجيل.' });
  }

  let previous: SourceEventRecord | null;
  try { previous = await store.getBySourceEventId('qr', key); }
  catch { throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'تعذر التحقق من محاولة QR. لم يبدأ التسجيل.' }); }
  if (previous?.status === 'accepted') return replay(previous);
  const promotion = process.env.BIOMETRIC_SOURCE_PROMOTION_ENABLED === 'true'
    ? (await import('../attendance-source-promotion/application')).getSourceAttendancePromotion(pool) : null;
  if (previous) {
    checkIntent(previous);
    if (promotion) {
      const coordinated = await promotion.resumeQr(workerId,previous.id,execution => dependencies.execute(undefined,execution));
      if (coordinated) return coordinated;
    }
    return replay(previous);
  }

  let receipt: SourceEventRecord | undefined;
  let attendanceId: number | undefined;
  const observation: QrAttendanceObservation = {
    async beforeValidation(context) {
      if (promotion) {
        const coordinated = await promotion.recordQr({ source: 'qr',sourceEventId: key,workerId,eventType,
          eventTimeUtc: context.eventTime.toISOString(),sourceUserName: context.workerName,sourcePersonCode: context.personCode },
        execution => dependencies.execute(undefined,execution));
        if (coordinated) throw new CoordinatedQrResult(coordinated);
      }
      try {
        const captured = await inbox.capture({ source: 'qr', sourceEventId: key, workerId, eventType,
          eventTimeUtc: context.eventTime.toISOString(), sourceUserName: context.workerName,
          sourcePersonCode: context.personCode });
        if (captured.replayed) throw new ExistingAttempt(captured.event);
        receipt = captured.event;
      } catch (error) {
        if (error instanceof ExistingAttempt) throw error;
        if (error instanceof SourceInboxError && error.code === 'INBOX_SOURCE_EVENT_CONFLICT') {
          const concurrent = await store.getBySourceEventId('qr', key);
          if (concurrent) throw new ExistingAttempt(concurrent);
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'تعذر حفظ محاولة QR. لم يبدأ تسجيل الحضور.' });
      }
    },
    attendanceSaved(eventId) { attendanceId = eventId; },
  };

  let result: QrAttendanceResult;
  try {
    result = await dependencies.execute(observation);
  } catch (error) {
    if (error instanceof CoordinatedQrResult) return error.result;
    if (error instanceof ExistingAttempt) return replay(error.receipt);
    if (receipt) {
      const cooldown = attendanceId === undefined && error instanceof TRPCError && error.code === 'BAD_REQUEST'
        && error.message.includes('حركتين متتاليتين');
      try {
        await inbox.recordExistingWorkflowOutcome({ id: receipt.id,
          status: cooldown ? 'rejected' : 'manual_review',
          decisionCode: cooldown ? 'QR_COOLDOWN' : attendanceId === undefined ? 'QR_WORKFLOW_FAILED' : 'QR_POST_INSERT_FAILURE',
          decisionNote: attendanceId === undefined ? null : `attendance_event_id=${attendanceId}` });
      } catch { warn('QR_FAILURE_OUTCOME_NOT_RECORDED'); }
    }
    throw error; // Preserve the current workflow's original message and status.
  }

  if (receipt) {
    try {
      await inbox.recordExistingWorkflowOutcome({ id: receipt.id, status: 'accepted', attendanceEventId: result.eventId });
    } catch {
      // Attendance and the current checkout finance path already ran. Never invite a fresh INSERT.
      warn('QR_ACCEPTED_OUTCOME_NOT_RECORDED');
    }
  }
  return result;
}
