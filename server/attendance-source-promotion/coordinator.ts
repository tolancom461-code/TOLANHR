import { TRPCError } from '@trpc/server';
import { drizzle } from 'drizzle-orm/mysql2';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { createMysqlAttendanceSourceInboxStore } from '../attendance-source-inbox/mysql-store';
import { createMysqlBiometricDirectoryStore } from '../biometric-directory/mysql-store';
import type { CaptureSourceEvent, PreparedSourceEvent, SourceEventRecord } from '../attendance-source-inbox/types';
import { isAttendanceMovement, prepareSourceEvent } from '../attendance-source-inbox/validation';
import type { QrAttendanceResult } from '../attendance-source-inbox/qr-observer';
import { getAdministrativeWorkDate, recordAttendanceWithAdministrativeDay, type AttendanceSourceExecution } from '../attendance-logic';
import { runWithSourceAttendanceDatabase, type SourceAttendanceDatabase } from '../db/source-execution-context';
import { createSourcePromotionActivation, type SourcePromotionActivation } from './activation';
import type { SourcePromotionConfig } from './config';

const EVENTS = '`attendance_source_events`';
const LINKS = '`attendance_biometric_worker_links`';
const USERS = '`attendance_biometric_users`';
const FIELDS = `s.id,s.source,s.source_event_id,s.content_sha256,s.worker_id,s.source_person_code,
 s.source_device_id,s.source_device_user_id,s.source_identity_id,s.source_user_name,s.event_type,s.raw_state,
 s.status,s.attendance_event_id,s.decision_code,s.decision_note,
 DATE_FORMAT(s.event_time_utc,'%Y-%m-%dT%H:%i:%s.%fZ') AS event_iso,
 DATE_FORMAT(s.received_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS received_iso,
 DATE_FORMAT(s.processed_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS processed_iso`;
const provenance = (key: string) => `CASE WHEN JSON_VALID(s.decision_note) THEN JSON_UNQUOTE(JSON_EXTRACT(s.decision_note,'$.${key}')) ELSE NULL END`;
const COHORT = `s.status IN ('pending','unmapped') AND s.attendance_event_id IS NULL
 AND s.event_type IN ('check_in','check_out') AND s.event_time_utc >= ? AND s.received_at >= ?
 AND ${provenance('v')} = '1' AND ${provenance('s')} = ? AND ${provenance('a')} = ?`;
const MATCH_LINK = `LEFT JOIN ${LINKS} l ON s.source='biometric' AND l.stream_id=?
 AND l.current_source_identity_id=s.source_identity_id
 LEFT JOIN ${USERS} u ON u.stream_id=l.stream_id AND u.source_identity_id=l.source_identity_id
 AND u.device_id=s.source_device_id AND u.device_user_id=s.source_device_user_id`;

type ApplyAttendance = (event: SourceEventRecord, workerId: number, execution: AttendanceSourceExecution) => Promise<QrAttendanceResult>;
type ExecuteQr = (execution: AttendanceSourceExecution) => Promise<QrAttendanceResult>;
interface Dependencies {
  pool: Pool;
  config: SourcePromotionConfig;
  applyAttendance?: ApplyAttendance;
  processFinance?: (workerId: number, workDate: string) => Promise<unknown>;
  isPeriodLocked?: (connection: PoolConnection, database: SourceAttendanceDatabase, workerId: number, workDate: string) => Promise<boolean>;
}

/** One durable receipt order, one physical transaction for each admission and its evidence. */
export function createSourceAttendancePromotion({ pool, config, applyAttendance = defaultAttendance,
  processFinance = defaultFinance, isPeriodLocked = defaultPeriodLocked }: Dependencies) {
  const activation = createSourcePromotionActivation(pool, config);
  const archive = createMysqlAttendanceSourceInboxStore(pool, config.database);
  const directory = createMysqlBiometricDirectoryStore(pool, config.database);
  let readiness: Promise<void> | undefined;
  const ready = () => readiness ??= Promise.all([archive.assertReady(),directory.assertReady()])
    .then(() => undefined).catch(error => { readiness = undefined; throw error; });
  let running = false;

  async function transaction<T>(operation: (connection: PoolConnection, database: SourceAttendanceDatabase,
    state: SourcePromotionActivation) => Promise<T>): Promise<T | null> {
    await ready();
    const connection = await pool.getConnection();
    let reusable = true;
    try {
      await connection.query("SET SESSION time_zone = '+00:00'");
      await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await connection.beginTransaction();
      // The same gate also protects ingress registration and payroll closure.
      const state = await activation.read(connection, true);
      if (!state) { await connection.rollback(); return null; }
      const database = drizzle(connection);
      const result = await runWithSourceAttendanceDatabase(database, () => operation(connection, database, state));
      await connection.commit();
      return result;
    } catch (error) { try { await connection.rollback(); } catch { reusable = false; connection.destroy(); } throw error; }
    finally { if (reusable) connection.release(); }
  }

  async function find(connection: PoolConnection, id: string, lock = false) {
    const [rows] = await connection.execute<RowDataPacket[]>(`SELECT ${FIELDS} FROM ${EVENTS} s WHERE s.id=?${lock ? ' FOR UPDATE' : ''}`, [id]);
    return rows[0] ? decode(rows[0]) : null;
  }

  async function insert(connection: PoolConnection, event: PreparedSourceEvent, state: SourcePromotionActivation) {
    const [prior] = await connection.execute<RowDataPacket[]>(
      `SELECT ${FIELDS} FROM ${EVENTS} s WHERE s.source=? AND s.source_event_id=? FOR UPDATE`, [event.source, event.sourceEventId]);
    if (prior[0]) {
      const previous = decode(prior[0]);
      if (event.source === 'qr') {
        if (previous.workerId !== event.workerId || previous.eventType !== event.eventType) throw conflict();
      } else if (previous.contentSha256 !== event.contentSha256) throw new Error('SOURCE_PROMOTION_CONTENT_CONFLICT');
      return { event: previous, replayed: true };
    }
    await connection.execute(`INSERT INTO ${EVENTS}
      (id,source,source_event_id,content_sha256,worker_id,source_person_code,source_device_id,source_device_user_id,
       source_identity_id,source_user_name,event_type,raw_state,event_time_utc,received_at,status,decision_note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(6),?,?)`,
    [event.id,event.source,event.sourceEventId,event.contentSha256,event.workerId,event.sourcePersonCode,event.sourceDeviceId,
      event.sourceDeviceUserId,event.sourceIdentityId,event.sourceUserName,event.eventType,event.rawState,sqlTime(event.eventTimeUtc),
      event.status,JSON.stringify({ v: 1, s: state.streamId, a: state.startedAtUtc })]);
    const saved = await find(connection, event.id);
    if (!saved) throw new Error('SOURCE_PROMOTION_CAPTURE_FAILED');
    return { event: saved, replayed: false };
  }

  async function captureBiometric(input: CaptureSourceEvent) {
    const event = prepareSourceEvent(input);
    if (event.source !== 'biometric' || event.workerId !== null) throw new Error('SOURCE_PROMOTION_INVALID_SOURCE');
    await ready();
    // A replay cannot change arrival order or its recorded decision, so it needs no admission lock.
    const [prior] = await pool.execute<RowDataPacket[]>(
      `SELECT ${FIELDS} FROM ${EVENTS} s WHERE s.source='biometric' AND s.source_event_id=?`, [event.sourceEventId]);
    if (prior[0]) {
      const previous = decode(prior[0]);
      if (previous.contentSha256 !== event.contentSha256) throw new Error('SOURCE_PROMOTION_CONTENT_CONFLICT');
      return { event: previous,replayed: true };
    }
    // Receipt registration shares the gate with QR: overlapping commits cannot overtake each other.
    const saved = await transaction((connection, _database, state) => insert(connection, event, state));
    return saved ?? archive.insert(event);
  }

  async function outcome(connection: PoolConnection, event: SourceEventRecord, state: SourcePromotionActivation,
    workerId: number, linkId: string | null, status: 'accepted' | 'rejected' | 'manual_review',
    code: string, attendanceId: number | null = null, winnerId: number | null = null) {
    const note = JSON.stringify({ v: 1, s: state.streamId, a: state.startedAtUtc, w: workerId, l: linkId, p: winnerId });
    const [result] = await connection.execute<any>(`UPDATE ${EVENTS} SET status=?,attendance_event_id=?,decision_code=?,
      decision_note=?,processed_at=UTC_TIMESTAMP(6) WHERE id=? AND content_sha256=?
      AND status IN ('pending','unmapped') AND attendance_event_id IS NULL`,
    [status,attendanceId,code,note,event.id,event.contentSha256]);
    if (Number(result.affectedRows) !== 1) throw new Error('SOURCE_PROMOTION_OUTCOME_CONFLICT');
  }

  async function processWorker(workerId: number, qrTarget?: { id: string; execute: ExecuteQr }) {
    return transaction(async (connection, database, state) => {
      const [workers] = await connection.execute<RowDataPacket[]>('SELECT id,status FROM workers WHERE id=? FOR UPDATE', [workerId]);
      if (!workers[0]) return { processed: 0 };
      const [[clock]] = await connection.query<RowDataPacket[]>(
        "SELECT DATE_FORMAT(DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 60 SECOND),'%Y-%m-%dT%H:%i:%s.%fZ') AS latest_allowed_utc");
      const cut = sqlTime(state.startedAtUtc);
      // A current locking read after the worker/gate lock, never a stale scanned snapshot.
      const [rows] = await connection.execute<RowDataPacket[]>(`SELECT ${FIELDS},l.id AS resolved_link_id
        FROM ${EVENTS} s ${MATCH_LINK} WHERE ${COHORT}
        AND ((s.source='qr' AND s.worker_id=?) OR (s.source='biometric' AND l.worker_id=? AND u.source_identity_id IS NOT NULL))
        ORDER BY s.received_at ASC,s.id ASC LIMIT ${config.batchSize} FOR UPDATE`,
      [state.streamId,cut,cut,state.streamId,state.startedAtUtc,workerId,workerId]);
      let processed = 0;
      for (const row of rows) {
        const event = decode(row);
        verifyContent(event);
        const linkId = row.resolved_link_id ?? null;
        if (event.eventTimeUtc > clock.latest_allowed_utc) {
          await outcome(connection,event,state,workerId,linkId,'manual_review','SOURCE_TIME_FUTURE'); processed++; continue;
        }
        if (event.source === 'biometric' && workers[0].status !== 'active') {
          await outcome(connection,event,state,workerId,linkId,'manual_review','SOURCE_WORKER_INACTIVE'); processed++; continue;
        }
        const eventTime = new Date(event.eventTimeUtc);
        const workDate = getAdministrativeWorkDate(eventTime);
        const [previous] = await connection.execute<RowDataPacket[]>(
          'SELECT id,event_type,method,DATE_FORMAT(event_time,\'%Y-%m-%d %H:%i:%s\') AS event_time_riyadh FROM attendance_events WHERE worker_id=? ORDER BY event_time DESC,id DESC LIMIT 1 FOR UPDATE', [workerId]);
        const last = previous[0];
        const lastInstant = last ? new Date(`${last.event_time_riyadh.replace(' ', 'T')}+03:00`).getTime() : NaN;
        const samePhase = last && last.event_type === event.eventType && eventTime.getTime() >= lastInstant
          && eventTime.getTime() - lastInstant <= 15 * 60 * 60 * 1000;
        if (samePhase && ['qr','biometric'].includes(last.method) && last.method !== event.source) {
          await outcome(connection,event,state,workerId,linkId,'rejected','SOURCE_FIRST_ARRIVAL',null,Number(last.id)); processed++; continue;
        }
        if (await isPeriodLocked(connection, database, workerId, workDate)) {
          await outcome(connection,event,state,workerId,linkId,'manual_review','SOURCE_PERIOD_LOCKED'); processed++; continue;
        }
        await connection.query('SAVEPOINT source_attendance');
        try {
          const execution: AttendanceSourceExecution = { database, eventTime, deferFinance: true };
          const saved = event.id === qrTarget?.id
            ? await qrTarget.execute(execution)
            : await applyAttendance(event, workerId, execution);
          if (!saved.success || saved.workerId !== workerId || saved.eventType !== event.eventType ||
              !Number.isSafeInteger(saved.eventId) || saved.eventId < 1 || saved.timestamp.getTime() !== eventTime.getTime()) {
            throw new Error('SOURCE_PROMOTION_WORKFLOW_RESULT_INVALID');
          }
          // Context binds every existing finance helper to this same physical transaction.
          if (saved.eventType === 'check_out') await processFinance(workerId, saved.workDate);
          await outcome(connection,event,state,workerId,linkId,'accepted','SOURCE_ACCEPTED',saved.eventId,Number(last?.id ?? saved.eventId));
          await connection.query('RELEASE SAVEPOINT source_attendance');
        } catch (error) {
          if (error instanceof TRPCError && ['BAD_REQUEST','NOT_FOUND'].includes(error.code)) {
            await connection.query('ROLLBACK TO SAVEPOINT source_attendance');
            const cooldown = error.code === 'BAD_REQUEST' && error.message.includes('حركتين متتاليتين');
            await outcome(connection,event,state,workerId,linkId,cooldown ? 'rejected' : 'manual_review',
              cooldown ? 'QR_COOLDOWN' : 'SOURCE_WORKFLOW_REVIEW');
          } else throw error;
        }
        processed++;
      }
      return { processed };
    });
  }

  async function qrResult(workerId: number, id: string): Promise<QrAttendanceResult> {
    try { return await readQrResult(workerId,id); }
    catch (error) { if (error instanceof TRPCError) throw error; throw conflict(); }
  }

  async function readQrResult(workerId: number, id: string): Promise<QrAttendanceResult> {
    const event = await archive.get(id);
    if (!event || event.source !== 'qr' || event.workerId !== workerId) throw conflict();
    if (event.status === 'accepted' && event.attendanceEventId !== null) {
      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT worker_id,event_type,DATE_FORMAT(work_date,'%Y-%m-%d') AS work_date FROM attendance_events WHERE id=?", [event.attendanceEventId]);
      if (!rows[0] || Number(rows[0].worker_id) !== workerId || rows[0].event_type !== event.eventType) throw conflict();
      return { success: true, workerId, eventType: event.eventType as 'check_in' | 'check_out', eventId: event.attendanceEventId,
        timestamp: new Date(event.eventTimeUtc), workDate: rows[0].work_date };
    }
    if (event.decisionCode === 'SOURCE_FIRST_ARRIVAL') throw new TRPCError({ code: 'BAD_REQUEST', message: 'سبق اعتماد هذه الحركة من المصدر الآخر. حُفظت محاولة QR للمراجعة دون تكرار الحضور.' });
    if (event.decisionCode === 'QR_COOLDOWN') throw new TRPCError({ code: 'BAD_REQUEST', message: 'عذراً، لا يمكن تسجيل حركتين متتاليتين خلال أقل من 3 دقائق، يرجى الانتظار.' });
    if (event.decisionCode === 'SOURCE_PERIOD_LOCKED') throw new TRPCError({ code: 'BAD_REQUEST', message: 'الفترة مقفلة للرواتب. حُفظت المحاولة للمراجعة.' });
    throw new TRPCError({ code: 'CONFLICT', message: 'حُفظت المحاولة وتنتظر المعالجة أو المراجعة. لم يُنشأ حضور مكرر.' });
  }

  async function recordQr(input: CaptureSourceEvent, execute: ExecuteQr) {
    const event = prepareSourceEvent(input);
    if (event.source !== 'qr' || event.workerId === null) throw new Error('SOURCE_PROMOTION_INVALID_QR');
    const captured = await transaction(async (connection, _database, state) => {
      if (event.eventTimeUtc < state.startedAtUtc) return null;
      return insert(connection, event, state);
    });
    if (!captured) return null;
    await processWorker(event.workerId, { id: captured.event.id, execute });
    return qrResult(event.workerId, captured.event.id);
  }

  async function resumeQr(workerId: number, id: string, execute: ExecuteQr) {
    try { return await readOrResumeQr(workerId,id,execute); }
    catch (error) { if (error instanceof TRPCError) throw error; throw conflict(); }
  }

  async function readOrResumeQr(workerId: number, id: string, execute: ExecuteQr) {
    const state = await activation.read();
    if (!state) return null;
    const event = await archive.get(id);
    if (!event || event.workerId !== workerId || event.source !== 'qr' || !belongs(event, state)) return null;
    if (['pending','unmapped'].includes(event.status)) await processWorker(workerId, { id, execute });
    return qrResult(workerId, id);
  }

  async function runOnce() {
    if (running) return { active: true, processed: 0 };
    running = true;
    try {
      await ready();
      const state = await activation.read();
      if (!state) return { active: false, processed: 0 };
      const cut = sqlTime(state.startedAtUtc);
      const [targets] = await pool.execute<RowDataPacket[]>(`SELECT COALESCE(s.worker_id,l.worker_id) AS resolved_worker_id,
        MIN(s.received_at) AS first_received FROM ${EVENTS} s ${MATCH_LINK} WHERE ${COHORT}
        AND ((s.source='qr' AND s.worker_id IS NOT NULL) OR (s.source='biometric' AND l.worker_id IS NOT NULL AND u.source_identity_id IS NOT NULL))
        GROUP BY COALESCE(s.worker_id,l.worker_id) ORDER BY first_received,resolved_worker_id LIMIT ${config.batchSize}`,
      [state.streamId,cut,cut,state.streamId,state.startedAtUtc]);
      let processed = 0;
      for (const target of targets) processed += (await processWorker(Number(target.resolved_worker_id)))?.processed ?? 0;
      return { active: true, processed };
    } finally { running = false; }
  }

  return { captureBiometric, recordQr, resumeQr, runOnce, readActivation: () => activation.read() };
}

function sqlTime(value: string) { return value.slice(0, -1).replace('T', ' '); }
function conflict() { return new TRPCError({ code: 'CONFLICT', message: 'الحركة السابقة تحتاج مراجعة. لم يُنشأ تسجيل إضافي.' }); }
function belongs(event: SourceEventRecord, state: SourcePromotionActivation) {
  try { const note = JSON.parse(event.decisionNote ?? 'null'); return note?.v === 1 && note.s === state.streamId && note.a === state.startedAtUtc
    && event.eventTimeUtc >= state.startedAtUtc && event.receivedAtUtc >= state.startedAtUtc; } catch { return false; }
}
function decode(row: RowDataPacket): SourceEventRecord {
  return { id: row.id,source: row.source,sourceEventId: row.source_event_id,contentSha256: row.content_sha256,
    workerId: row.worker_id == null ? null : Number(row.worker_id),sourcePersonCode: row.source_person_code,
    sourceDeviceId: row.source_device_id,sourceDeviceUserId: row.source_device_user_id,sourceIdentityId: row.source_identity_id,
    sourceUserName: row.source_user_name,eventType: row.event_type,rawState: row.raw_state,eventTimeUtc: row.event_iso,
    receivedAtUtc: row.received_iso,status: row.status,attendanceEventId: row.attendance_event_id == null ? null : Number(row.attendance_event_id),
    decisionCode: row.decision_code,decisionNote: row.decision_note,processedAtUtc: row.processed_iso };
}
function verifyContent(event: SourceEventRecord) {
  const verified = prepareSourceEvent({ source: event.source,sourceEventId: event.sourceEventId,workerId: event.workerId,
    sourcePersonCode: event.sourcePersonCode,sourceDeviceId: event.sourceDeviceId,sourceDeviceUserId: event.sourceDeviceUserId,
    sourceIdentityId: event.sourceIdentityId,sourceUserName: event.sourceUserName,eventType: event.eventType,
    eventTimeUtc: event.eventTimeUtc,rawState: event.rawState }, () => event.id);
  if (verified.contentSha256 !== event.contentSha256 || !isAttendanceMovement(event.eventType)) throw new Error('SOURCE_PROMOTION_CONTENT_INVALID');
}
async function defaultAttendance(event: SourceEventRecord, workerId: number, execution: AttendanceSourceExecution) {
  const actor = event.source === 'qr' ? Number(event.sourceEventId.split(':')[0]) : undefined;
  return recordAttendanceWithAdministrativeDay(workerId,event.source,undefined,
    actor && Number.isSafeInteger(actor) && actor > 0 ? actor : undefined,undefined,
    JSON.stringify({ source: event.source, receiptId: event.id }),event.eventType as 'check_in' | 'check_out',undefined,execution);
}
async function defaultFinance(workerId: number, workDate: string) {
  return (await import('../db/daily-finance')).processAttendanceToFinance(workerId,workDate);
}
async function defaultPeriodLocked(connection: PoolConnection, database: SourceAttendanceDatabase, workerId: number, workDate: string) {
  const [locked] = await connection.execute<RowDataPacket[]>(
    'SELECT id FROM worker_daily_finance WHERE worker_id=? AND work_date=? AND locked_batch_id IS NOT NULL LIMIT 1 FOR UPDATE', [workerId,workDate]);
  if (locked.length) return true;
  const { getEffectiveGroupForWorkerOnDate } = await import('../db/recalculation');
  const { checkPayrollBatchForDate } = await import('../db/payroll-locks');
  const groupId = await getEffectiveGroupForWorkerOnDate(workerId,workDate,database);
  return (await checkPayrollBatchForDate(workDate,groupId ?? undefined,database)) !== null;
}
