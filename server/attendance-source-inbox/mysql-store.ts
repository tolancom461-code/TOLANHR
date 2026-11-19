import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import {
  SourceInboxError, type ExistingWorkflowOutcome, type InboxListFilter,
  type PreparedSourceEvent, type SourceEventRecord, type SourceInboxLookupStore, type SourceSystem,
} from './types';
import { isAttendanceMovement, prepareSourceEvent, validateId, validateListFilter, validateOutcome, validateSourceIdentity } from './validation';

const TABLE = '`attendance_source_events`';
const PROJECTION = `id, source, source_event_id, content_sha256, worker_id,
  source_person_code, source_device_id, source_device_user_id, source_identity_id, source_user_name,
  event_type, raw_state, status, attendance_event_id, decision_code, decision_note,
  DATE_FORMAT(event_time_utc, '%Y-%m-%dT%H:%i:%s.%fZ') AS event_time_iso,
  DATE_FORMAT(received_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS received_at_iso,
  DATE_FORMAT(processed_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS processed_at_iso`;

const COLUMNS: Record<string, [string, number | null, boolean]> = {
  id: ['char', 36, false], source: ['varchar', 16, false], source_event_id: ['varchar', 128, false],
  content_sha256: ['char', 64, false], worker_id: ['int', null, true], source_person_code: ['varchar', 100, true],
  source_device_id: ['varchar', 128, true], source_device_user_id: ['varchar', 128, true],
  source_identity_id: ['varchar', 128, true], source_user_name: ['varchar', 255, true],
  event_type: ['varchar', 32, false], raw_state: ['varchar', 32, true],
  event_time_utc: ['datetime', 6, false], received_at: ['datetime', 6, false], status: ['varchar', 32, false],
  attendance_event_id: ['int', null, true], decision_code: ['varchar', 64, true],
  decision_note: ['varchar', 500, true], processed_at: ['datetime', 6, true],
};
const INDEXES: Record<string, [boolean, string[]]> = {
  PRIMARY: [true, ['id']],
  uq_attendance_source_key: [true, ['source', 'source_event_id']],
  idx_attendance_source_worker_time: [false, ['worker_id', 'event_time_utc']],
  idx_attendance_source_status_received: [false, ['status', 'received_at', 'id']],
  idx_attendance_source_received: [false, ['received_at', 'id']],
  idx_attendance_source_attendance: [false, ['attendance_event_id']],
};

function storageError(error: unknown): SourceInboxError {
  if (error instanceof SourceInboxError) return error;
  const code = (error as { code?: string })?.code;
  return new SourceInboxError(['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(code ?? '')
    ? 'INBOX_SCHEMA_NOT_READY' : 'INBOX_STORAGE_ERROR');
}

function decode(row: RowDataPacket): SourceEventRecord {
  return {
    id: row.id, source: row.source, sourceEventId: row.source_event_id, contentSha256: row.content_sha256,
    workerId: row.worker_id == null ? null : Number(row.worker_id), sourcePersonCode: row.source_person_code,
    sourceDeviceId: row.source_device_id, sourceDeviceUserId: row.source_device_user_id,
    sourceIdentityId: row.source_identity_id, sourceUserName: row.source_user_name,
    eventType: row.event_type, rawState: row.raw_state, eventTimeUtc: row.event_time_iso,
    receivedAtUtc: row.received_at_iso, status: row.status,
    attendanceEventId: row.attendance_event_id == null ? null : Number(row.attendance_event_id),
    decisionCode: row.decision_code, decisionNote: row.decision_note, processedAtUtc: row.processed_at_iso,
  };
}

/** Supplied pool only: never reads DATABASE_URL, creates a pool, runs DDL, or starts a worker. */
export function createMysqlAttendanceSourceInboxStore(pool: Pool, expectedDatabase: string): SourceInboxLookupStore {
  if (typeof expectedDatabase !== 'string' || !/^[A-Za-z0-9_]+$/.test(expectedDatabase)) {
    throw new SourceInboxError('INBOX_INVALID_DATABASE_NAME');
  }

  async function ready(connection: PoolConnection) {
    const [[selected]] = await connection.query<RowDataPacket[]>('SELECT DATABASE() AS database_name');
    if (selected.database_name !== expectedDatabase) throw new SourceInboxError('INBOX_DATABASE_MISMATCH');
    const [tables] = await connection.execute<RowDataPacket[]>(
      `SELECT ENGINE, TABLE_TYPE FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'attendance_source_events'`, [expectedDatabase],
    );
    if (tables.length !== 1 || tables[0].ENGINE?.toUpperCase() !== 'INNODB' || tables[0].TABLE_TYPE !== 'BASE TABLE') {
      throw new SourceInboxError('INBOX_SCHEMA_NOT_READY');
    }
    const [columns] = await connection.execute<RowDataPacket[]>(
      `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, DATETIME_PRECISION, IS_NULLABLE, COLLATION_NAME,
              COLUMN_DEFAULT, EXTRA
       FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'attendance_source_events'`,
      [expectedDatabase],
    );
    if (columns.length !== Object.keys(COLUMNS).length) throw new SourceInboxError('INBOX_SCHEMA_NOT_READY');
    for (const [name, [type, size, nullable]] of Object.entries(COLUMNS)) {
      const column = columns.find(item => item.COLUMN_NAME === name);
      const actualSize = type === 'datetime' ? column?.DATETIME_PRECISION : column?.CHARACTER_MAXIMUM_LENGTH;
      if (!column || column.DATA_TYPE !== type || (size !== null && Number(actualSize) !== size)
        || column.IS_NULLABLE !== (nullable ? 'YES' : 'NO')
        || (nullable && column.COLUMN_DEFAULT !== null)
        || (column.EXTRA !== '' && !(name === 'received_at' && column.EXTRA?.toUpperCase() === 'DEFAULT_GENERATED'))
        || (type === 'char' && column.COLLATION_NAME !== 'ascii_bin')
        || (type === 'varchar' && column.COLLATION_NAME !== (
          ['source', 'event_type', 'status', 'decision_code'].includes(name) ? 'ascii_bin' : 'utf8mb4_bin'))) {
        throw new SourceInboxError('INBOX_SCHEMA_NOT_READY');
      }
    }
    const [indexes] = await connection.execute<RowDataPacket[]>(
      `SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'attendance_source_events' ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
      [expectedDatabase],
    );
    if (indexes.some(entry => !Object.hasOwn(INDEXES, entry.INDEX_NAME))) throw new SourceInboxError('INBOX_SCHEMA_NOT_READY');
    for (const [name, [unique, names]] of Object.entries(INDEXES)) {
      const entries = indexes.filter(item => item.INDEX_NAME === name);
      if (entries.length !== names.length || entries.some((entry, position) =>
        entry.COLUMN_NAME !== names[position] || Number(entry.NON_UNIQUE) !== (unique ? 0 : 1) || entry.SUB_PART !== null)) {
        throw new SourceInboxError('INBOX_SCHEMA_NOT_READY');
      }
    }
  }

  async function use<T>(operation: (connection: PoolConnection) => Promise<T>): Promise<T> {
    let connection: PoolConnection | undefined;
    try {
      connection = await pool.getConnection();
      await ready(connection);
      return await operation(connection);
    } catch (error) {
      throw storageError(error);
    } finally {
      connection?.release();
    }
  }

  async function find(connection: PoolConnection, id: string, lock = false): Promise<SourceEventRecord | null> {
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT ${PROJECTION} FROM ${TABLE} WHERE id = ?${lock ? ' FOR UPDATE' : ''}`, [id],
    );
    return rows[0] ? decode(rows[0]) : null;
  }

  return {
    assertReady: () => use(async () => {}),
    async insert(event: PreparedSourceEvent) {
      const verified = prepareSourceEvent({
        source: event.source, sourceEventId: event.sourceEventId, workerId: event.workerId,
        sourcePersonCode: event.sourcePersonCode, sourceDeviceId: event.sourceDeviceId,
        sourceDeviceUserId: event.sourceDeviceUserId, sourceIdentityId: event.sourceIdentityId,
        sourceUserName: event.sourceUserName, eventType: event.eventType,
        rawState: event.rawState, eventTimeUtc: event.eventTimeUtc,
      }, () => event.id);
      if (event.contentSha256 !== verified.contentSha256 || event.status !== verified.status) {
        throw new SourceInboxError('INBOX_INVALID_INPUT');
      }
      return use(async connection => {
        try {
          await connection.execute(
            `INSERT INTO ${TABLE} (id, source, source_event_id, content_sha256, worker_id,
             source_person_code, source_device_id, source_device_user_id, source_identity_id, source_user_name,
             event_type, raw_state, event_time_utc, received_at, status,
             attendance_event_id, decision_code, decision_note, processed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(6), ?, NULL, NULL, NULL, NULL)`,
            [verified.id, verified.source, verified.sourceEventId, verified.contentSha256, verified.workerId,
              verified.sourcePersonCode, verified.sourceDeviceId, verified.sourceDeviceUserId,
              verified.sourceIdentityId, verified.sourceUserName, verified.eventType, verified.rawState,
              verified.eventTimeUtc.slice(0, -1).replace('T', ' '), verified.status],
          );
        } catch (error) {
          if ((error as { code?: string }).code !== 'ER_DUP_ENTRY') throw error;
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT ${PROJECTION} FROM ${TABLE} WHERE source = ? AND source_event_id = ?`,
            [verified.source, verified.sourceEventId],
          );
          if (!rows[0]) throw new SourceInboxError('INBOX_ID_CONFLICT');
          const previous = decode(rows[0]);
          if (previous.contentSha256 !== verified.contentSha256) throw new SourceInboxError('INBOX_SOURCE_EVENT_CONFLICT');
          return { event: previous, replayed: true };
        }
        const saved = await find(connection, verified.id);
        if (!saved) throw new SourceInboxError('INBOX_EVENT_NOT_FOUND');
        return { event: saved, replayed: false };
      });
    },
    get(id: string) {
      const checkedId = validateId(id);
      return use(connection => find(connection, checkedId));
    },
    getBySourceEventId(source: SourceSystem, sourceEventId: string) {
      const checked = validateSourceIdentity(source, sourceEventId);
      return use(async connection => {
        const [rows] = await connection.execute<RowDataPacket[]>(
          `SELECT ${PROJECTION} FROM ${TABLE} WHERE source = ? AND source_event_id = ?`,
          [checked.source, checked.sourceEventId],
        );
        return rows[0] ? decode(rows[0]) : null;
      });
    },
    list(filter: InboxListFilter) {
      const checked = validateListFilter(filter);
      const clauses: string[] = [];
      const values: Array<string | number> = [];
      for (const [field, value] of [
        ['source', checked.source], ['worker_id', checked.workerId], ['status', checked.status],
      ] as const) {
        if (value !== undefined) { clauses.push(`${field} = ?`); values.push(value); }
      }
      // Limit is bounded and validated before being embedded; column names are fixed above.
      return use(async connection => {
        const [rows] = await connection.execute<RowDataPacket[]>(
          `SELECT ${PROJECTION} FROM ${TABLE}${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''}
           ORDER BY received_at DESC, id DESC LIMIT ${checked.limit}`, values,
        );
        return rows.map(decode);
      });
    },
    recordExistingWorkflowOutcome(input: ExistingWorkflowOutcome) {
      const validated = validateOutcome(input);
      const outcome = { ...validated, attendanceEventId: validated.attendanceEventId ?? null,
        decisionCode: validated.decisionCode ?? null, decisionNote: validated.decisionNote ?? null };
      return use(async connection => {
        await connection.beginTransaction();
        try {
          const event = await find(connection, outcome.id, true);
          if (!event) throw new SourceInboxError('INBOX_EVENT_NOT_FOUND');
          if (!isAttendanceMovement(event.eventType) || event.status === 'review_only') {
            throw new SourceInboxError('INBOX_EVENT_NOT_ELIGIBLE');
          }
          const sameOutcome = event.status === outcome.status && event.attendanceEventId === outcome.attendanceEventId
            && event.decisionCode === outcome.decisionCode && event.decisionNote === outcome.decisionNote;
          if (sameOutcome) { await connection.commit(); return event; }
          if (!['pending', 'unmapped'].includes(event.status)) throw new SourceInboxError('INBOX_OUTCOME_CONFLICT');
          if (outcome.status === 'accepted') {
            if (event.workerId === null) throw new SourceInboxError('INBOX_EVENT_NOT_ELIGIBLE');
            // Link evidence only. No INSERT/UPDATE to attendance_events or any financial table.
            const [attendance] = await connection.execute<RowDataPacket[]>(
              'SELECT worker_id, event_type FROM attendance_events WHERE id = ?', [outcome.attendanceEventId],
            );
            if (!attendance[0] || Number(attendance[0].worker_id) !== event.workerId
              || attendance[0].event_type !== event.eventType) {
              throw new SourceInboxError('INBOX_ATTENDANCE_REFERENCE_MISMATCH');
            }
          }
          await connection.execute(
            `UPDATE ${TABLE} SET status = ?, attendance_event_id = ?, decision_code = ?, decision_note = ?,
             processed_at = UTC_TIMESTAMP(6) WHERE id = ?`,
            [outcome.status, outcome.attendanceEventId, outcome.decisionCode, outcome.decisionNote, event.id],
          );
          const saved = await find(connection, event.id);
          if (!saved) throw new SourceInboxError('INBOX_EVENT_NOT_FOUND');
          await connection.commit();
          return saved;
        } catch (error) {
          try { await connection.rollback(); } catch { /* Preserve the safe domain error. */ }
          throw error;
        }
      });
    },
  };
}
