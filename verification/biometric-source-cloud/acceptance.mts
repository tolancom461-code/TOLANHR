import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import mysql from 'mysql2/promise';
import { startTolanHrMysql, osEnvironmentKeys } from '../tolanhr-pilot-mysql.mjs';

// This verification starts its own loopback server. No application bootstrap or env file is loaded.
const allowedEnvironment = new Set(osEnvironmentKeys.map(key => key.toLowerCase()));
for (const key of Object.keys(process.env)) if (!allowedEnvironment.has(key.toLowerCase())) delete process.env[key];
process.env.NODE_ENV = 'test';
process.env.TZ = 'UTC';

const streamId = '123e4567-e89b-42d3-a456-426614174099';
const types = ['check_in', 'check_out', 'break_out', 'break_in', 'overtime_in', 'overtime_out'];
const checks: string[] = [];
const cleanup: Record<string, unknown> = {};
let stage = 'start-owned-mysql';
let lab: Awaited<ReturnType<typeof startTolanHrMysql>> | undefined;
let fixture: mysql.Connection | undefined;
let producerPool: mysql.Pool | undefined;
let consumerPool: mysql.Pool | undefined;
let server: http.Server | undefined;
let failure: { stage: string; code: string; line?: number } | undefined;
let archiveCount = 0;

try {
  lab = await startTolanHrMysql();
  fixture = await lab.connect();
  const [[identity]] = await fixture.query<any[]>('SELECT DATABASE() AS db, @@port AS port, @@datadir AS datadir');
  assert.equal(identity.db, lab.schema);
  assert.equal(Number(identity.port), lab.port);
  assert.equal(path.resolve(identity.datadir), path.resolve(lab.data));
  assert.match(lab.schema, /^tolanhr_pilot_test_[a-f0-9]{12}$/);
  const url = new URL(lab.databaseUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(Number(url.port), lab.port);
  assert.equal(url.pathname, `/${lab.schema}`);
  const poolOptions = { host: '127.0.0.1', port: lab.port, database: lab.schema,
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    dateStrings: true, supportBigNumbers: true, bigNumberStrings: true, timezone: 'Z',
    connectionLimit: 3, multipleStatements: false, flags: '-LOCAL_FILES' };
  producerPool = mysql.createPool(poolOptions);
  consumerPool = mysql.createPool(poolOptions);
  // Match the actual ordinary settings index; the consumer must not rely on its misleading name.
  await fixture.query('ALTER TABLE settings DROP INDEX settings_key_unique');
  await fixture.query('CREATE INDEX settings_key_unique ON settings (`key`)');
  const [settingsIndex] = await fixture.query<any[]>("SHOW INDEX FROM settings WHERE Key_name = 'settings_key_unique'");
  assert.equal(Number(settingsIndex[0].Non_unique), 1);
  checks.push('Owned random loopback MySQL port, data directory and synthetic schema verified before any fixture DDL');

  stage = 'apply-reviewed-new-table-definitions-only-to-owned-schema';
  await applyReviewedCreate(new URL('../../docs/sql/attendance-source-events-2026-11-19/02-create.sql', import.meta.url),
    '`test`.`attendance_source_events`');
  await applyReviewedCreate(new URL('../../../biometric-system/database/ADD_PROGRAM_CONNECTIONS_FINGERPRINT_NOT_APPLIED.sql', import.meta.url),
    '`fingerprint`.`biometric_svc_program_connections`');
  await applyReviewedCreate(new URL('../../docs/sql/attendance-biometric-import-progress-2026-11-19.sql', import.meta.url),
    '`test`.`attendance_biometric_import_progress`');
  await fixture.query(`CREATE TABLE biometric_svc_punches (
    id BIGINT UNSIGNED PRIMARY KEY, event_key CHAR(64) NOT NULL, device_id BIGINT UNSIGNED NOT NULL,
    device_user_id VARCHAR(128) NOT NULL, device_user_row_id BIGINT UNSIGNED NULL,
    vendor VARCHAR(64) NOT NULL, serial_number VARCHAR(128) NOT NULL,
    punch_state VARCHAR(64) NULL, raw_status VARCHAR(32) NULL, device_event_time_utc DATETIME(6) NULL
  ) ENGINE=InnoDB`);
  await fixture.query('CREATE TABLE biometric_svc_device_users (id BIGINT UNSIGNED PRIMARY KEY, device_user_id VARCHAR(128), status VARCHAR(32)) ENGINE=InnoDB');
  await fixture.query('CREATE TABLE biometric_svc_final_events (id BIGINT UNSIGNED PRIMARY KEY, status VARCHAR(32)) ENGINE=InnoDB');
  await fixture.execute("INSERT INTO biometric_svc_device_users VALUES (73, '00017', 'absent_from_device'), (74, '00017', 'seen')");
  checks.push('Only the three reviewed CREATE definitions were retargeted exactly to the owned schema; production GRANT was never executed');

  stage = 'seed-independent-existing-ledger-and-source-backlog';
  await fixture.execute("INSERT INTO workers (id, code, full_name, status, last_attendance_at) VALUES (1, 'SOURCE-LAB-W1', 'Synthetic preserved worker', 'active', '2026-11-18 08:00:00')");
  await fixture.execute("INSERT INTO attendance_events (id, worker_id, event_type, event_time, work_date, method) VALUES (1, 1, 'check_in', '2026-11-18 08:00:00', '2026-11-18', 'qr')");
  await fixture.execute("INSERT INTO worker_daily_finance (worker_id, work_date, worked_minutes, net_amount, notes) VALUES (1, '2026-11-18', 60, 25.00, 'Synthetic preserved finance')");
  await fixture.execute("INSERT INTO settings (`key`, value, description) VALUES ('source_lab_preserved_setting', 'unchanged', 'Synthetic unrelated setting')");
  await fixture.execute("INSERT INTO settings (`key`, value, description) VALUES ('source_lab_preserved_setting', 'duplicate-key-unchanged', 'Synthetic ordinary-index setting')");
  for (let state = 0; state < 6; state++) await addPunch({ id: String((state + 1) * 100), state,
    canonical: state === 1 ? null : types[state], identity: state === 0 ? null : state === 1 ? '73' : '74' });
  await addPunch({ id: '700', state: 9, canonical: null });
  await addPunch({ id: '701', state: 0, canonical: 'check_out' });
  await addPunch({ id: '702', state: 0, canonical: 'check_in', utc: null });
  await addPunch({ id: '703', state: 0, canonical: null, serial: 'SYNTHETIC-UNPROVEN-PROFILE' });
  const ledgerBefore = await ledger();

  const { ProgramConnectionsService } = await import('../../../biometric-system/src/application/program-connections-service.js');
  const { TiDbProgramConnectionsStore } = await import('../../../biometric-system/src/infrastructure/storage/tidb-program-connections-store.js');
  const { SourcePunchesService } = await import('../../../biometric-system/src/application/source-punches-service.js');
  const { TiDbSourcePunchesReadStore } = await import('../../../biometric-system/src/infrastructure/storage/tidb-source-punches-read-store.js');
  const { createSourcePunchesApiHandler } = await import('../../../biometric-system/src/infrastructure/integration/source-punches-api-server.js');
  const { createSourcePunchHttpClient, createMysqlSourceImportProgressStore, createBiometricSourceImporter,
    sourcePunchInboxKey } = await import('../../server/biometric-source-importer/index.ts');
  const { createAttendanceSourceInbox } = await import('../../server/attendance-source-inbox/service.ts');
  const { createMysqlAttendanceSourceInboxStore } = await import('../../server/attendance-source-inbox/mysql-store.ts');
  const connections = new ProgramConnectionsService({ store: new TiDbProgramConnectionsStore(producerPool) });
  const firstKey = await connections.create({ programName: 'Synthetic Tolan archive consumer', actor: 'fixture-admin' });
  const secondKey = await connections.create({ programName: 'Synthetic independent consumer', actor: 'fixture-admin' });
  const sourceService = new SourcePunchesService({ streamId,
    readStore: new TiDbSourcePunchesReadStore(producerPool, { deviceUserIdentityEnabled: true }) });
  const handler = createSourcePunchesApiHandler({ service: sourceService, connections });
  server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res)).then(handled => {
      if (!handled && !res.writableEnded) { res.writeHead(404); res.end(); }
    }, () => { if (!res.writableEnded) { res.writeHead(503); res.end(); } });
  });
  await new Promise<void>((resolve, reject) => { server!.once('error', reject); server!.listen(0, '127.0.0.1', () => resolve()); });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  assert.equal(address.address, '127.0.0.1');
  const origin = `http://127.0.0.1:${address.port}`;
  const request = (query: string, token?: string, method = 'GET') => fetch(`${origin}/api/v1/source-punches${query}`, {
    method, headers: token ? { Authorization: `Bearer ${token}` } : {}, redirect: 'error', signal: AbortSignal.timeout(5000) });
  const runner = (token: string) => createBiometricSourceImporter({ streamId, pageSize: 2, maxPages: 2,
    source: createSourcePunchHttpClient({ apiUrl: origin, token, streamId }),
    inbox: createAttendanceSourceInbox(createMysqlAttendanceSourceInboxStore(consumerPool!, lab!.schema)),
    progress: createMysqlSourceImportProgressStore(consumerPool!, lab!.schema, streamId) });

  stage = 'verify-real-protected-source-api-and-backlog-projection';
  assert.equal((await request('?limit=2')).status, 401);
  assert.equal((await request('', firstKey.token, 'POST')).status, 405);
  assert.equal((await request('?limit=2&limit=3', firstKey.token)).status, 400);
  const client = createSourcePunchHttpClient({ apiUrl: origin, token: firstKey.token, streamId });
  const exported: any[] = [];
  let cursor = '0';
  for (let page = 0; page < 5; page++) {
    const response = await client.fetchPage({ afterId: cursor, limit: 2 });
    exported.push(...response.items); cursor = response.nextCursor;
    if (!response.hasMore) break;
  }
  assert.equal(exported.length, 6);
  assert.deepEqual(exported.map(item => item.eventType), types);
  assert.equal(exported[0].sourceIdentityId, null);
  assert.equal(exported[1].sourceIdentityId, '73');
  assert.ok(exported.every(item => item.sourceDeviceUserId === '00017' && item.sourceDeviceId === '9007199254740999'));
  assert.equal(exported[0].eventTimeUtc, '2026-11-19T07:08:09.123456Z');
  assert.equal(cursor, '600');
  const [[finals]] = await fixture.query<any[]>('SELECT COUNT(*) AS count FROM biometric_svc_final_events');
  assert.equal(Number(finals.count), 0);
  checks.push('Real SQL and authenticated HTTP export all six valid movement states across pages, including null and archived identities, with no final-event prerequisite');
  checks.push('Leading-zero PINs, identifiers beyond JS safe integers and UTC microseconds survive; unsupported, contradictory, untimed and unproven legacy states stay at source');

  stage = 'archive-six-states-with-durable-two-cursor-progress';
  let importer = runner(firstKey.token);
  let sweep = false;
  for (let run = 0; run < 8; run++) {
    const result = await importer.runOnce();
    assert.equal(result.state, 'completed');
    if (await receiptCount() === 6 && result.sweepCompleted) { sweep = true; break; }
  }
  assert.equal(sweep, true);
  let receipts = await archive();
  assert.equal(receipts.length, 6);
  const beforeIds = receipts.map(row => row.id).sort();
  assert.ok(receipts.every(row => row.worker_id === null && row.source_person_code === null && row.source_user_name === null && row.attendance_event_id === null));
  assert.equal(receipts.filter(row => row.status === 'unmapped').length, 2);
  assert.equal(receipts.filter(row => row.status === 'review_only').length, 4);
  for (const item of exported) {
    const row = receipts.find(row => row.source_event_id === sourcePunchInboxKey(streamId, item.sourceEventId));
    assert.ok(row);
    assert.equal(row.event_type, item.eventType);
    assert.equal(row.source_identity_id, item.sourceIdentityId);
    assert.equal(row.source_device_user_id, '00017');
    assert.equal(row.utc, item.eventTimeUtc);
  }
  assert.deepEqual(await ledger(), ledgerBefore);
  checks.push('Consumer HTTP -> inbox SQL -> dedicated durable progress archives only: in/out unmapped and four auxiliary states review-only; all existing settings and ledger unchanged');

  stage = 'restart-and-replay-without-duplicates';
  const beforeRestart = await progressValue();
  await consumerPool.end();
  consumerPool = mysql.createPool(poolOptions);
  importer = runner(firstKey.token);
  const restarted = await importer.runOnce();
  assert.equal(restarted.inserted, 0);
  assert.ok(restarted.replayed > 0);
  assert.deepEqual((await archive()).map(row => row.id).sort(), beforeIds);
  assert.equal(JSON.parse(beforeRestart!).tail_cursor, '600');
  checks.push('Fresh consumer instance and pooled connections reload durable progress; replay returns the same six receipt UUIDs');

  stage = 'recover-late-lower-id-while-preserving-tail';
  await addPunch({ id: '150', state: 2, canonical: 'break_out', identity: '73' });
  let recovered = false;
  for (let run = 0; run < 8; run++) {
    const result = await importer.runOnce();
    assert.equal(result.tailCursor, '600');
    if (await receiptCount() === 7 && result.sweepCompleted) { recovered = true; break; }
  }
  assert.equal(recovered, true);
  assert.equal((await archive()).filter(row => row.source_event_id === sourcePunchInboxKey(streamId, eventKey('150'))).length, 1);
  await addPunch({ id: '900', state: 0, canonical: 'check_in', identity: '74', utc: '2026-11-19 10:00:00.000001' });
  let tailAdvanced = false;
  for (let run = 0; run < 8; run++) {
    const result = await importer.runOnce();
    if (await receiptCount() === 8 && result.tailCursor === '900' && result.sweepCompleted) { tailAdvanced = true; break; }
  }
  assert.equal(tailAdvanced, true);
  assert.deepEqual(await ledger(), ledgerBefore);
  checks.push('Full reconciliation recovers a newly committed ID below the tail once, while the independent tail cursor imports newer IDs');

  stage = 'reject-malformed-source-page-without-moving-progress';
  await addPunch({ id: '950', state: 0, canonical: 'check_in', key: 'malformed-synthetic-key' });
  const beforeBadPage = await progressValue();
  const beforeBadCount = await receiptCount();
  await assert.rejects(() => importer.runOnce(), (error: any) => error?.code === 'BIOMETRIC_SOURCE_UNAVAILABLE');
  assert.equal(await progressValue(), beforeBadPage);
  assert.equal(await receiptCount(), beforeBadCount);
  await fixture.execute('DELETE FROM biometric_svc_punches WHERE id = ?', ['950']);
  checks.push('Malformed source event yields a fixed source failure and does not advance that page or fabricate an archive item');

  stage = 'revoke-one-key-and-preserve-progress-and-other-consumer';
  const beforeRevoke = await progressValue();
  await connections.revoke({ id: firstKey.connection.id, actor: 'fixture-admin' });
  assert.equal((await request('?limit=2', firstKey.token)).status, 401);
  assert.equal((await request('?limit=2', secondKey.token)).status, 200);
  await assert.rejects(() => runner(firstKey.token).runOnce(), (error: any) => error?.code === 'BIOMETRIC_SOURCE_AUTH_FAILED');
  assert.equal(await progressValue(), beforeRevoke);
  const otherConsumer = await runner(secondKey.token).runOnce();
  assert.equal(otherConsumer.inserted, 0);
  assert.equal(await receiptCount(), 8);
  assert.deepEqual(await ledger(), ledgerBefore);
  checks.push('Revoking one durable key immediately denies its requests without progress movement; the other program key continues without duplicate receipts');

  stage = 'verify-secret-free-exports-and-stored-credential-digests';
  const [keyRows] = await fixture.query<any[]>('SELECT id, token_hash, token_prefix, status, revoked_by FROM biometric_svc_program_connections ORDER BY id');
  const listed = await connections.list();
  const evidence = JSON.stringify({ exported, keyRows, listed, receipts: await archive(), progress: await progressValue() });
  for (const token of [firstKey.token, secondKey.token]) {
    assert.equal(evidence.includes(token), false);
    assert.ok(keyRows.some(row => row.token_hash === createHash('sha256').update(token).digest('hex')));
  }
  assert.equal(JSON.stringify(listed).includes('token_hash'), false);
  assert.equal(JSON.stringify(listed).includes('tokenHash'), false);
  assert.ok(exported.every(item => Object.keys(item).sort().join(',') ===
    ['sourceEventId', 'sourceDeviceId', 'sourceDeviceUserId', 'sourceIdentityId', 'eventType', 'rawState', 'eventTimeUtc'].sort().join(',')));
  archiveCount = await receiptCount();
  checks.push('Only credential digests/prefixes persist, plaintext keys never enter punch exports/inbox/progress/list metadata, and unrelated attendance/finance/worker data stays identical');

  async function progressValue(): Promise<string | null> {
    const [rows] = await fixture!.execute<any[]>(`SELECT id, stream_id, schema_version, tail_cursor, reconcile_cursor,
      DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS updated_at_utc
      FROM attendance_biometric_import_progress WHERE id = ?`, ['primary']);
    return rows[0] ? JSON.stringify(rows[0]) : null;
  }
} catch (error) {
  const code = (error as any)?.code;
  const line = /acceptance\.mts:(\d+):\d+/.exec((error as any)?.stack ?? '')?.[1];
  failure = { stage, code: typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,70}$/.test(code) ? code : 'BIOMETRIC_SOURCE_ACCEPTANCE_FAILED',
    ...(line ? { line: Number(line) } : {}) };
} finally {
  try {
    if (server) await new Promise<void>(resolve => { server!.close(() => resolve()); server!.closeAllConnections(); });
    cleanup.httpServerClosed = true;
  } catch { failure ??= { stage: 'close-owned-http', code: 'BIOMETRIC_SOURCE_CLEANUP_FAILED' }; }
  try { await consumerPool?.end(); await producerPool?.end(); await fixture?.end(); cleanup.localConnectionsClosed = true; }
  catch { failure ??= { stage: 'close-owned-connections', code: 'BIOMETRIC_SOURCE_CLEANUP_FAILED' }; }
  try { if (lab) Object.assign(cleanup, await lab.close()); }
  catch { failure ??= { stage: 'stop-owned-mysql', code: 'BIOMETRIC_SOURCE_CLEANUP_FAILED' }; }
}

const report = { passed: !failure, completedAtUtc: new Date().toISOString(), archiveCount,
  fixture: 'Owned random loopback MySQL and HTTP; synthetic records only; no env file, application startup, live database or device',
  checks, cleanup, ...(failure ? { failure } : {}) };
await fs.writeFile(path.join(import.meta.dirname, 'result.json'), JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify(report) + '\n');
if (failure) process.exitCode = 1;

function eventKey(id: string) { return createHash('sha256').update(`synthetic-source-punch:${id}`).digest('hex'); }
async function addPunch({ id, state, canonical, identity = null, utc = '2026-11-19 07:08:09.123456',
  serial = 'AJE1261900133', key = eventKey(id) }: { id: string; state: number; canonical: string | null; identity?: string | null;
    utc?: string | null; serial?: string; key?: string }) {
  await fixture!.execute(`INSERT INTO biometric_svc_punches
    (id,event_key,device_id,device_user_id,device_user_row_id,vendor,serial_number,punch_state,raw_status,device_event_time_utc)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, [id, key, '9007199254740999', '00017', identity, 'zkteco', serial, canonical, String(state), utc]);
}
async function receiptCount() {
  const [[row]] = await fixture!.query<any[]>('SELECT COUNT(*) AS count FROM attendance_source_events');
  return Number(row.count);
}
async function archive() {
  const [rows] = await fixture!.query<any[]>(`SELECT id,source_event_id,event_type,source_device_id,source_device_user_id,source_identity_id,
    worker_id,source_person_code,source_user_name,attendance_event_id,status,
    DATE_FORMAT(event_time_utc,'%Y-%m-%dT%H:%i:%s.%fZ') AS utc FROM attendance_source_events ORDER BY source_event_id`);
  return rows;
}
async function ledger() {
  const result: Record<string, unknown> = {};
  for (const table of ['workers', 'attendance_events', 'worker_daily_finance', 'biometric_final_event_imports']) {
    const [rows] = await fixture!.query(`SELECT * FROM \`${table}\` ORDER BY id`);
    result[table] = rows;
  }
  const [settings] = await fixture!.query('SELECT * FROM settings ORDER BY id');
  result.settings = settings;
  return result;
}
async function applyReviewedCreate(url: URL, target: string) {
  const sql = (await fs.readFile(url, 'utf8')).split(/\r?\n/).filter(line => !line.trimStart().startsWith('--')).join('\n');
  assert.equal(sql.split(target).length - 1 >= 1, true);
  const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const statements = sql.match(new RegExp(`CREATE TABLE ${escapedTarget} \\([\\s\\S]*?\\) ENGINE=InnoDB[^;]*;`, 'g'));
  assert.equal(statements?.length, 1);
  assert.equal(statements![0].split(target).length - 1, 1);
  const table = target.slice(target.indexOf('.') + 1);
  await fixture!.query(statements![0].replace(target, `\`${lab!.schema}\`.${table}`));
}
