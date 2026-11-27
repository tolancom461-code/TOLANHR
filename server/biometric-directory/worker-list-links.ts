import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { positiveId, text, uuid } from './validation';

export interface SourceBiometricLinkSummary {
  state: 'linked' | 'unlinked' | 'unavailable';
  links: Array<{ deviceUserId: string; displayName: string | null }>;
}

export interface WorkerListLinksOptions {
  env?: Record<string, string | undefined>;
  getPool?: () => Promise<Pool>;
}

type WithSourceLinks<T> = T & { sourceBiometricLink?: SourceBiometricLinkSummary };
const MAX_PAGE_WORKERS = 500;
const MAX_PAGE_LINKS = 5000;

async function applicationPool(): Promise<Pool> {
  const { getDb } = await import('../db/connection');
  const database = await getDb();
  const client = database?.$client;
  if (!client || typeof client.promise !== 'function') throw new Error('WORKER_LINKS_UNAVAILABLE');
  return client.promise();
}

function unavailable<T>(workers: T[]): WithSourceLinks<T>[] {
  return workers.map(worker => ({ ...worker, sourceBiometricLink: { state: 'unavailable', links: [] } }));
}

function name(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || Array.from(value).length > 255 || /[\u0000-\u001f\u007f]/.test(value) ||
      Array.from(value).some(character => { const point = character.codePointAt(0)!; return point >= 0xd800 && point <= 0xdfff; })) {
    throw new Error('WORKER_LINKS_UNAVAILABLE');
  }
  return value;
}

/** Adds display metadata only; never edits legacy worker fields, link history or attendance. */
export async function attachWorkerSourceBiometricLinks<T extends { id: number }>(
  workers: T[],
  { env = process.env, getPool = applicationPool }: WorkerListLinksOptions = {},
): Promise<WithSourceLinks<T>[]> {
  if (env.BIOMETRIC_SOURCE_DIRECTORY_ENABLED !== 'true' || workers.length === 0) return workers;
  let connection: PoolConnection | undefined;
  try {
    const expectedDatabase = env.ATTENDANCE_SOURCE_DB_CONFIRMED_NAME;
    if (!expectedDatabase || !/^[A-Za-z0-9_]+$/.test(expectedDatabase) || workers.length > MAX_PAGE_WORKERS) {
      throw new Error('WORKER_LINKS_UNAVAILABLE');
    }
    const streamId = uuid(env.BIOMETRIC_SOURCE_STREAM_ID);
    const workerIds = Array.from(new Set(workers.map(worker => positiveId(worker.id))));
    const allowedWorkers = new Set(workerIds);
    connection = await (await getPool()).getConnection();
    const [[selected]] = await connection.query<RowDataPacket[]>({ sql: 'SELECT DATABASE() AS database_name', timeout: 5000 });
    if (selected?.database_name !== expectedDatabase) throw new Error('WORKER_LINKS_UNAVAILABLE');

    // One query for the current page. An absent cache row keeps the frozen link snapshot;
    // matching another enrollment by its PIN would incorrectly reuse a prior person's identity.
    const [rows] = await connection.execute<RowDataPacket[]>({
      sql: `SELECT l.id AS link_id,l.worker_id,l.source_identity_id,l.current_source_identity_id,
        l.device_id_snapshot,l.device_user_id_snapshot,
        CASE WHEN u.source_identity_id IS NULL THEN l.display_name_snapshot ELSE u.display_name END AS display_name
        FROM attendance_biometric_worker_links l
        LEFT JOIN attendance_biometric_users u ON u.stream_id=l.stream_id
          AND u.source_identity_id=l.source_identity_id AND u.device_id=l.device_id_snapshot
          AND u.device_user_id=l.device_user_id_snapshot
        WHERE l.stream_id=? AND l.status='active' AND l.worker_id IN (${workerIds.map(() => '?').join(',')})
        ORDER BY l.worker_id,l.created_at_utc,l.id LIMIT ${MAX_PAGE_LINKS + 1}`,
      timeout: 5000,
    }, [streamId, ...workerIds]);
    if (rows.length > MAX_PAGE_LINKS) throw new Error('WORKER_LINKS_UNAVAILABLE');

    const links = new Map<number, SourceBiometricLinkSummary['links']>();
    const seenLinks = new Set<string>();
    const seenIdentities = new Set<string>();
    for (const row of rows) {
      const workerId = positiveId(row.worker_id);
      const linkId = uuid(row.link_id);
      const identityId = text(row.source_identity_id, 128)!;
      if (!allowedWorkers.has(workerId) || row.current_source_identity_id !== identityId ||
          seenLinks.has(linkId) || seenIdentities.has(identityId)) throw new Error('WORKER_LINKS_UNAVAILABLE');
      text(row.device_id_snapshot, 128);
      const deviceUserId = text(row.device_user_id_snapshot, 128)!;
      const displayName = name(row.display_name);
      const workerLinks = links.get(workerId) ?? [];
      if (workerLinks.length >= 500) throw new Error('WORKER_LINKS_UNAVAILABLE');
      workerLinks.push({ deviceUserId, displayName });
      links.set(workerId, workerLinks);
      seenLinks.add(linkId);
      seenIdentities.add(identityId);
    }
    return workers.map(worker => {
      const active = links.get(worker.id) ?? [];
      return { ...worker, sourceBiometricLink: { state: active.length ? 'linked' : 'unlinked', links: active } };
    });
  } catch {
    // Failure is visible and cannot turn an old legacy code into a new active binding.
    return unavailable(workers);
  } finally {
    try { connection?.release(); } catch { /* A stale pooled read cannot fail the worker list. */ }
  }
}
