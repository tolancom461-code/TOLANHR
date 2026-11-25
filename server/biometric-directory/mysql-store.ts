import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { BiometricDirectoryError, type BiometricDirectoryStore, type DirectoryIdentity,
  type DirectoryUser, type ListDirectoryUsersInput, type RevokeDirectoryLinkInput,
  type SetDirectoryLinkInput, type WorkerLinkItem } from './types';
import { identity, invalid, listInput, positiveId, revokeInput, setInput, snapshot, uuid } from './validation';

const USERS = '`attendance_biometric_users`';
const LINKS = '`attendance_biometric_worker_links`';
const NUMERIC_PIN = "u.device_user_id REGEXP '^[0-9]+$'";
const PIN_DIGITS = "TRIM(LEADING '0' FROM u.device_user_id)";
// Length and lexical comparison retain every digit of the VARCHAR(128) PIN.
const PIN_ORDER = `CASE WHEN ${NUMERIC_PIN} THEN 0 ELSE 1 END ASC,
  CASE WHEN ${NUMERIC_PIN} THEN CHAR_LENGTH(${PIN_DIGITS}) END ASC,
  CASE WHEN ${NUMERIC_PIN} THEN ${PIN_DIGITS} END ASC,
  LOWER(u.device_user_id) ASC, u.device_user_id ASC, u.source_identity_id ASC`;
const LIST_ORDER = {
  device_user_id: PIN_ORDER,
  name: `CASE WHEN NULLIF(TRIM(u.display_name), '') IS NULL THEN 1 ELSE 0 END ASC,
    LOWER(TRIM(u.display_name)) ASC, ${PIN_ORDER}`,
} as const;
type Shape = [string, number | null, boolean, string | null];
const SHAPES: Record<string, Record<string, Shape>> = {
  attendance_biometric_users: {
    stream_id: ['char', 36, false, 'ascii_bin'], source_identity_id: ['varchar', 128, false, 'utf8mb4_bin'],
    device_id: ['varchar', 128, false, 'utf8mb4_bin'], device_user_id: ['varchar', 128, false, 'utf8mb4_bin'],
    display_name: ['varchar', 255, true, 'utf8mb4_bin'], device_name: ['varchar', 255, true, 'utf8mb4_bin'],
    serial_number: ['varchar', 128, true, 'utf8mb4_bin'], status: ['varchar', 16, false, 'ascii_bin'],
    first_seen_at_utc: ['datetime', 6, true, null], last_seen_at_utc: ['datetime', 6, true, null],
    identity_started_at_utc: ['datetime', 6, true, null], identity_ended_at_utc: ['datetime', 6, true, null],
    last_synced_at_utc: ['datetime', 6, false, null],
  },
  attendance_biometric_worker_links: {
    id: ['char', 36, false, 'ascii_bin'], stream_id: ['char', 36, false, 'ascii_bin'],
    source_identity_id: ['varchar', 128, false, 'utf8mb4_bin'], current_source_identity_id: ['varchar', 128, true, 'utf8mb4_bin'],
    worker_id: ['int', null, false, null], status: ['varchar', 16, false, 'ascii_bin'],
    device_id_snapshot: ['varchar', 128, false, 'utf8mb4_bin'], device_user_id_snapshot: ['varchar', 128, false, 'utf8mb4_bin'],
    display_name_snapshot: ['varchar', 255, true, 'utf8mb4_bin'], device_name_snapshot: ['varchar', 255, true, 'utf8mb4_bin'],
    serial_number_snapshot: ['varchar', 128, true, 'utf8mb4_bin'], worker_name_snapshot: ['varchar', 255, false, 'utf8mb4_bin'],
    created_by: ['int', null, false, null], created_at_utc: ['datetime', 6, false, null],
    revoked_by: ['int', null, true, null], revoked_at_utc: ['datetime', 6, true, null],
  },
};
const INDEXES: Record<string, Record<string, [number, string[]]>> = {
  attendance_biometric_users: { PRIMARY: [0, ['stream_id', 'source_identity_id']],
    idx_biometric_users_roster: [1, ['stream_id', 'status', 'source_identity_id']] },
  attendance_biometric_worker_links: { PRIMARY: [0, ['id']],
    uq_biometric_worker_identity_active: [0, ['stream_id', 'current_source_identity_id']],
    idx_biometric_worker_links_worker: [1, ['worker_id', 'status', 'created_at_utc']],
    idx_biometric_worker_links_identity: [1, ['stream_id', 'source_identity_id', 'created_at_utc']] },
};
const PROFILE = `u.stream_id, u.source_identity_id, u.device_id, u.device_user_id, u.display_name, u.device_name,
  u.serial_number, u.status,
  DATE_FORMAT(u.first_seen_at_utc,'%Y-%m-%dT%H:%i:%s.%fZ') AS first_seen_iso,
  DATE_FORMAT(u.last_seen_at_utc,'%Y-%m-%dT%H:%i:%s.%fZ') AS last_seen_iso,
  DATE_FORMAT(u.identity_started_at_utc,'%Y-%m-%dT%H:%i:%s.%fZ') AS started_iso,
  DATE_FORMAT(u.identity_ended_at_utc,'%Y-%m-%dT%H:%i:%s.%fZ') AS ended_iso,
  DATE_FORMAT(u.last_synced_at_utc,'%Y-%m-%dT%H:%i:%s.%fZ') AS synced_iso`;
const LINK_PROFILE = `l.id AS link_id, l.stream_id, l.source_identity_id, l.worker_id,
  COALESCE(u.device_id,l.device_id_snapshot) AS device_id,
  COALESCE(u.device_user_id,l.device_user_id_snapshot) AS device_user_id,
  CASE WHEN u.source_identity_id IS NULL THEN l.display_name_snapshot ELSE u.display_name END AS display_name,
  CASE WHEN u.source_identity_id IS NULL THEN l.device_name_snapshot ELSE u.device_name END AS device_name,
  CASE WHEN u.source_identity_id IS NULL THEN l.serial_number_snapshot ELSE u.serial_number END AS serial_number,
  COALESCE(u.status,'historical') AS status,
  DATE_FORMAT(u.first_seen_at_utc,'%Y-%m-%dT%H:%i:%s.%fZ') AS first_seen_iso,
  DATE_FORMAT(u.last_seen_at_utc,'%Y-%m-%dT%H:%i:%s.%fZ') AS last_seen_iso,
  DATE_FORMAT(u.identity_started_at_utc,'%Y-%m-%dT%H:%i:%s.%fZ') AS started_iso,
  DATE_FORMAT(u.identity_ended_at_utc,'%Y-%m-%dT%H:%i:%s.%fZ') AS ended_iso,
  DATE_FORMAT(l.created_at_utc,'%Y-%m-%dT%H:%i:%s.%fZ') AS linked_iso`;

/** Supplied application pool only; writes exclusively the two directory/link tables. */
export function createMysqlBiometricDirectoryStore(pool: Pool, expectedDatabase: string): BiometricDirectoryStore {
  if (typeof expectedDatabase !== 'string' || !/^[A-Za-z0-9_]+$/.test(expectedDatabase)) throw invalid();
  let readiness: Promise<void> | null = null;
  async function verifySchema(connection: PoolConnection) {
    for (const table of Object.keys(SHAPES)) {
      const [tables] = await connection.execute<RowDataPacket[]>(
        'SELECT ENGINE, TABLE_TYPE, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [expectedDatabase, table]);
      if (tables.length !== 1 || String(tables[0].ENGINE).toLowerCase() !== 'innodb' || tables[0].TABLE_TYPE !== 'BASE TABLE' || tables[0].TABLE_COLLATION !== 'utf8mb4_bin') throw schema();
      const [columns] = await connection.execute<RowDataPacket[]>(
        'SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, DATETIME_PRECISION, IS_NULLABLE, COLLATION_NAME, COLUMN_DEFAULT, EXTRA, GENERATION_EXPRESSION FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [expectedDatabase, table]);
      if (columns.length !== Object.keys(SHAPES[table]).length) throw schema();
      for (const [name, [type, size, nullable, collation]] of Object.entries(SHAPES[table])) {
        const column = columns.find(row => row.COLUMN_NAME === name);
        const generated = name === 'current_source_identity_id';
        if (!column || column.DATA_TYPE !== type || column.IS_NULLABLE !== (nullable ? 'YES' : 'NO') || column.COLLATION_NAME !== collation ||
            (size !== null && Number(type === 'datetime' ? column.DATETIME_PRECISION : column.CHARACTER_MAXIMUM_LENGTH) !== size) ||
            (!generated && nullable && column.COLUMN_DEFAULT !== null)) throw schema();
        if (generated) {
          const expression = String(column.GENERATION_EXPRESSION).replace(/\\'/g, "'")
            .replace(/_(?:utf8mb4|utf8mb3|utf8|ascii|binary)(?=')/g, '').replace(/[`()\s]/g, '').toLowerCase();
          if (String(column.EXTRA).toUpperCase() !== 'VIRTUAL GENERATED' || expression !== "casewhenstatus='active'thensource_identity_idelsenullend") throw schema();
        } else if (column.EXTRA !== '' && !(['created_at_utc', 'last_synced_at_utc'].includes(name) && String(column.EXTRA).toUpperCase() === 'DEFAULT_GENERATED')) throw schema();
      }
      const [indexes] = await connection.execute<RowDataPacket[]>(
        'SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY INDEX_NAME, SEQ_IN_INDEX', [expectedDatabase, table]);
      if (indexes.some(row => !Object.hasOwn(INDEXES[table], row.INDEX_NAME))) throw schema();
      for (const [name, [nonUnique, fields]] of Object.entries(INDEXES[table])) {
        const rows = indexes.filter(row => row.INDEX_NAME === name);
        if (rows.length !== fields.length || rows.some((row, index) => row.COLUMN_NAME !== fields[index] ||
            Number(row.NON_UNIQUE) !== nonUnique || Number(row.SEQ_IN_INDEX) !== index + 1 || row.SUB_PART !== null)) throw schema();
      }
    }
  }
  async function use<T>(operation: (connection: PoolConnection) => Promise<T>): Promise<T> {
    let connection: PoolConnection | undefined;
    try {
      connection = await pool.getConnection();
      const [[database]] = await connection.query<RowDataPacket[]>('SELECT DATABASE() AS database_name');
      if (database.database_name !== expectedDatabase) throw new BiometricDirectoryError('BIOMETRIC_DIRECTORY_DATABASE_MISMATCH', 503);
      if (!readiness) readiness = verifySchema(connection).catch(error => { readiness = null; throw error; });
      await readiness;
      return await operation(connection);
    } catch (error) { throw safe(error); }
    finally { connection?.release(); }
  }
  async function transaction<T>(connection: PoolConnection, operation: () => Promise<T>): Promise<T> {
    await connection.beginTransaction();
    try { const value = await operation(); await connection.commit(); return value; }
    catch (error) { try { await connection.rollback(); } catch { /* Keep the safe domain failure. */ } throw error; }
  }
  async function profile(connection: PoolConnection, streamId: string, identityId: string, lock = false) {
    const [rows] = await connection.execute<RowDataPacket[]>(`SELECT ${PROFILE} FROM ${USERS} u WHERE u.stream_id = ? AND u.source_identity_id = ?${lock ? ' FOR UPDATE' : ''}`, [streamId, identityId]);
    return rows[0] ?? null;
  }
  async function lockWorker(connection: PoolConnection, workerId: number, allowMissing = false) {
    const [rows] = await connection.execute<RowDataPacket[]>('SELECT id, code, full_name, status FROM workers WHERE id = ? FOR UPDATE', [workerId]);
    if (!rows[0] && !allowMissing) throw new BiometricDirectoryError('BIOMETRIC_DIRECTORY_WORKER_NOT_FOUND', 404);
    return rows[0] ?? null;
  }
  async function activeLink(connection: PoolConnection, streamId: string, identityId: string) {
    const [rows] = await connection.execute<RowDataPacket[]>(`SELECT id, worker_id FROM ${LINKS} WHERE stream_id = ? AND source_identity_id = ? AND status = 'active' FOR UPDATE`, [streamId, identityId]);
    if (rows.length > 1) throw schema();
    return rows[0] ?? null;
  }
  async function linkItem(connection: PoolConnection, id: string): Promise<WorkerLinkItem> {
    const [rows] = await connection.execute<RowDataPacket[]>(`SELECT ${LINK_PROFILE} FROM ${LINKS} l LEFT JOIN ${USERS} u ON u.stream_id = l.stream_id AND u.source_identity_id = l.source_identity_id WHERE l.id = ?`, [id]);
    if (!rows[0]) throw conflict();
    return decodeLink(rows[0]);
  }
  return {
    assertReady: () => use(async () => {}),
    async upsertDirectoryPage(value) {
      const input = snapshot(value, ['streamId', 'items']);
      const streamId = uuid(input.streamId);
      if (!Array.isArray(input.items) || input.items.length > 500) throw invalid();
      const items = input.items.map(value => identity(value));
      if (new Set(items.map(item => item.identityId)).size !== items.length) throw invalid();
      items.sort((left, right) => left.identityId < right.identityId ? -1 : left.identityId > right.identityId ? 1 : 0);
      return use(connection => transaction(connection, async () => {
        for (const item of items) {
          const existing = await profile(connection, streamId, item.identityId, true);
          if (existing && (existing.device_id !== item.deviceId || existing.device_user_id !== item.deviceUserId)) {
            throw new BiometricDirectoryError('BIOMETRIC_DIRECTORY_IDENTITY_CONFLICT', 409);
          }
          const details = [item.displayName, item.deviceName, item.serialNumber, item.status,
            sqlTime(item.firstSeenAtUtc), sqlTime(item.lastSeenAtUtc), sqlTime(item.identityStartedAtUtc), sqlTime(item.identityEndedAtUtc)];
          if (existing) {
            await connection.execute(`UPDATE ${USERS} SET display_name = ?, device_name = ?, serial_number = ?, status = ?,
              first_seen_at_utc = ?, last_seen_at_utc = ?, identity_started_at_utc = ?, identity_ended_at_utc = ?, last_synced_at_utc = UTC_TIMESTAMP(6)
              WHERE stream_id = ? AND source_identity_id = ?`, [...details, streamId, item.identityId]);
          } else {
            await connection.execute(`INSERT INTO ${USERS} (stream_id, source_identity_id, device_id, device_user_id,
              display_name, device_name, serial_number, status, first_seen_at_utc, last_seen_at_utc, identity_started_at_utc, identity_ended_at_utc, last_synced_at_utc)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(6))`, [streamId, item.identityId, item.deviceId, item.deviceUserId, ...details]);
          }
        }
        return { upserted: items.length };
      }));
    },
    listUsers(value: ListDirectoryUsersInput) {
      const input = listInput(value);
      const clauses = ['u.stream_id = ?'];
      const params: Array<string | number> = [input.streamId];
      if (input.roster !== 'all') { clauses.push('u.status = ?'); params.push(input.roster); }
      if (input.search) {
        clauses.push("(LOWER(u.display_name) LIKE LOWER(?) ESCAPE '!' OR LOWER(u.device_user_id) LIKE LOWER(?) ESCAPE '!' OR LOWER(u.device_name) LIKE LOWER(?) ESCAPE '!' OR LOWER(u.serial_number) LIKE LOWER(?) ESCAPE '!')");
        const pattern = `%${input.search.replace(/[!%_]/g, value => `!${value}`)}%`;
        params.push(pattern, pattern, pattern, pattern);
      }
      const joins = `FROM ${USERS} u LEFT JOIN ${LINKS} l ON l.stream_id = u.stream_id AND l.current_source_identity_id = u.source_identity_id
        LEFT JOIN workers w ON w.id = l.worker_id WHERE ${clauses.join(' AND ')}`;
      return use(async connection => {
        const [[count]] = await connection.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total ${joins}`, params);
        const total = Number(count.total);
        if (!Number.isSafeInteger(total) || total < 0) throw schema();
        const [rows] = await connection.execute<RowDataPacket[]>(`SELECT ${PROFILE}, l.id AS link_id, l.worker_id AS linked_worker_id, w.id AS existing_worker_id,
          COALESCE(w.code,'') AS worker_code, COALESCE(w.full_name,l.worker_name_snapshot) AS worker_name ${joins}
          ORDER BY ${LIST_ORDER[input.sortBy]} LIMIT ${input.limit} OFFSET ${(input.page - 1) * input.limit}`, params);
        const items: DirectoryUser[] = rows.map(row => ({ ...decodeProfile(row), streamId: row.stream_id, lastSyncedAtUtc: row.synced_iso,
          linkedWorker: row.linked_worker_id == null ? null : { id: Number(row.linked_worker_id), code: row.worker_code, fullName: row.worker_name },
          linkedWorkerExists: row.linked_worker_id == null ? null : row.existing_worker_id != null,
          linkId: row.link_id ?? null, linkState: row.linked_worker_id == null ? 'available'
            : Number(row.linked_worker_id) === input.currentWorkerId ? 'linked_current' : 'linked_other' }));
        return { items, page: { number: input.page, limit: input.limit, total, totalPages: Math.max(1, Math.ceil(total / input.limit)) } };
      });
    },
    listWorkerLinks(value) {
      const input = snapshot(value, ['workerId', 'streamId']);
      const workerId = positiveId(input.workerId);
      const streamId = input.streamId === undefined ? undefined : uuid(input.streamId);
      return use(async connection => {
        const [rows] = await connection.execute<RowDataPacket[]>(`SELECT ${LINK_PROFILE} FROM ${LINKS} l LEFT JOIN ${USERS} u
          ON u.stream_id = l.stream_id AND u.source_identity_id = l.source_identity_id
          WHERE l.worker_id = ? AND l.status = 'active'${streamId ? ' AND l.stream_id = ?' : ''} ORDER BY l.created_at_utc, l.id LIMIT 501`, streamId ? [workerId, streamId] : [workerId]);
        if (rows.length > 500) throw new BiometricDirectoryError('BIOMETRIC_DIRECTORY_TOO_MANY_LINKS', 409);
        return { items: rows.map(decodeLink) };
      });
    },
    setLink(value: SetDirectoryLinkInput) {
      const input = setInput(value);
      return use(connection => transaction(connection, async () => {
        const worker = await lockWorker(connection, input.workerId);
        if (!worker) throw new BiometricDirectoryError('BIOMETRIC_DIRECTORY_WORKER_NOT_FOUND', 404);
        if (worker.status !== 'active') throw new BiometricDirectoryError('BIOMETRIC_DIRECTORY_WORKER_INACTIVE', 409);
        const user = await profile(connection, input.streamId, input.identityId, true);
        if (!user) throw new BiometricDirectoryError('BIOMETRIC_DIRECTORY_IDENTITY_NOT_FOUND', 404);
        if (user.status === 'historical' && !input.confirmHistorical) throw new BiometricDirectoryError('BIOMETRIC_DIRECTORY_HISTORICAL_CONFIRMATION_REQUIRED', 409);
        if (!['current', 'historical'].includes(user.status)) throw schema();
        const current = await activeLink(connection, input.streamId, input.identityId);
        if (current) {
          if (current.id !== input.expectedLinkId || Number(current.worker_id) !== input.workerId) throw conflict();
          return { link: await linkItem(connection, current.id), unchanged: true };
        }
        if (input.expectedLinkId !== null) throw conflict();
        const linkId = randomUUID();
        await connection.execute(`INSERT INTO ${LINKS} (id, stream_id, source_identity_id, worker_id, status,
          device_id_snapshot, device_user_id_snapshot, display_name_snapshot, device_name_snapshot, serial_number_snapshot,
          worker_name_snapshot, created_by, created_at_utc, revoked_by, revoked_at_utc)
          VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(6), NULL, NULL)`,
        [linkId, input.streamId, input.identityId, input.workerId, user.device_id, user.device_user_id, user.display_name,
          user.device_name, user.serial_number, worker.full_name, input.actor]);
        return { link: await linkItem(connection, linkId), unchanged: false };
      }));
    },
    revokeLink(value: RevokeDirectoryLinkInput) {
      const input = revokeInput(value);
      return use(connection => transaction(connection, async () => {
        // An old hard-deleted worker leaves an auditable link that an operator must still be able to revoke.
        await lockWorker(connection, input.workerId, true);
        if (!await profile(connection, input.streamId, input.identityId, true)) throw new BiometricDirectoryError('BIOMETRIC_DIRECTORY_IDENTITY_NOT_FOUND', 404);
        const current = await activeLink(connection, input.streamId, input.identityId);
        if (!current) {
          const [previous] = await connection.execute<RowDataPacket[]>(`SELECT id, worker_id, stream_id, source_identity_id, status FROM ${LINKS} WHERE id = ? FOR UPDATE`, [input.expectedLinkId]);
          const row = previous[0];
          if (!row || Number(row.worker_id) !== input.workerId || row.stream_id !== input.streamId || row.source_identity_id !== input.identityId || row.status !== 'revoked') throw conflict();
          return { revoked: true as const, linkId: row.id as string, unchanged: true };
        }
        if (current.id !== input.expectedLinkId || Number(current.worker_id) !== input.workerId) throw conflict();
        await connection.execute(`UPDATE ${LINKS} SET status = 'revoked', revoked_by = ?, revoked_at_utc = UTC_TIMESTAMP(6) WHERE id = ? AND status = 'active'`, [input.actor, current.id]);
        return { revoked: true as const, linkId: current.id as string, unchanged: false };
      }));
    },
  };
}

function sqlTime(value: string | null) { return value === null ? null : value.slice(0, -1).replace('T', ' '); }
function decodeProfile(row: RowDataPacket): DirectoryIdentity {
  return { identityId: row.source_identity_id, deviceId: row.device_id, deviceUserId: row.device_user_id,
    displayName: row.display_name ?? null, deviceName: row.device_name ?? row.device_id, serialNumber: row.serial_number ?? '', status: row.status,
    firstSeenAtUtc: row.first_seen_iso ?? null, lastSeenAtUtc: row.last_seen_iso ?? null,
    identityStartedAtUtc: row.started_iso ?? null, identityEndedAtUtc: row.ended_iso ?? null };
}
function decodeLink(row: RowDataPacket): WorkerLinkItem {
  return { ...decodeProfile(row), streamId: row.stream_id, linkId: row.link_id, workerId: Number(row.worker_id), linkedAtUtc: row.linked_iso };
}
function conflict() { return new BiometricDirectoryError('BIOMETRIC_DIRECTORY_LINK_CONFLICT', 409); }
function schema() { return new BiometricDirectoryError('BIOMETRIC_DIRECTORY_SCHEMA_NOT_READY', 503); }
function safe(error: unknown): BiometricDirectoryError {
  if (error instanceof BiometricDirectoryError) return error;
  if ((error as { code?: string })?.code === 'ER_DUP_ENTRY') return conflict();
  return new BiometricDirectoryError('BIOMETRIC_DIRECTORY_STORAGE_UNAVAILABLE', 503);
}
