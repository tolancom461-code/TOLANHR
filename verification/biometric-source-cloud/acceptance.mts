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
  await applyReviewedCreate(new URL('../../docs/sql/attendance-biometric-directory-2026-11-19.test.sql', import.meta.url),
    '`test`.`attendance_biometric_users`');
  await applyReviewedCreate(new URL('../../docs/sql/attendance-biometric-directory-2026-11-19.test.sql', import.meta.url),
    '`test`.`attendance_biometric_worker_links`');
  await fixture.query(`CREATE TABLE biometric_svc_punches (
    id BIGINT UNSIGNED PRIMARY KEY, event_key CHAR(64) NOT NULL, device_id BIGINT UNSIGNED NOT NULL,
    device_user_id VARCHAR(128) NOT NULL, device_user_row_id BIGINT UNSIGNED NULL,
    vendor VARCHAR(64) NOT NULL, serial_number VARCHAR(128) NOT NULL,
    punch_state VARCHAR(64) NULL, raw_status VARCHAR(32) NULL, device_event_time_utc DATETIME(6) NULL
  ) ENGINE=InnoDB`);
  await fixture.query(`CREATE TABLE biometric_svc_devices (id BIGINT UNSIGNED PRIMARY KEY, display_name VARCHAR(255), serial_number VARCHAR(128)) ENGINE=InnoDB`);
  await fixture.query(`CREATE TABLE biometric_svc_device_users (
    id BIGINT UNSIGNED PRIMARY KEY, device_id BIGINT UNSIGNED NOT NULL, device_user_id VARCHAR(128), display_name VARCHAR(255), status VARCHAR(32),
    first_seen_at DATETIME(6), last_seen_at DATETIME(6), identity_started_at DATETIME(6), identity_ended_at DATETIME(6)
  ) ENGINE=InnoDB`);
  await fixture.query('CREATE TABLE biometric_svc_final_events (id BIGINT UNSIGNED PRIMARY KEY, status VARCHAR(32)) ENGINE=InnoDB');
  await fixture.execute("INSERT INTO biometric_svc_devices VALUES (9007199254740999, 'Synthetic first device', 'AJE1261900133'), (9007199254740998, 'Synthetic other device', 'SYNTHETIC-DEVICE-2')");
  await fixture.execute(`INSERT INTO biometric_svc_device_users VALUES
    (73,9007199254740999,'00017','Synthetic historical enrollment','absent_from_device','2026-11-01 01:00:00.123456','2026-11-02 02:00:00.123456',NULL,'2026-11-02 02:00:00.123456'),
    (74,9007199254740999,'00017','Synthetic current enrollment','seen','2026-11-03 01:00:00.123456','2026-11-19 07:00:00.123456','2026-11-03 01:00:00.123456',NULL),
    (75,9007199254740998,'00017','Synthetic other-device enrollment','seen',NULL,NULL,NULL,NULL),
    (76,9007199254740999,'00018','Synthetic contested enrollment','seen',NULL,NULL,NULL,NULL),
    (77,9007199254740999,'00019','Synthetic inactive-worker target','seen',NULL,NULL,NULL,NULL)`);
  checks.push('Five reviewed CREATE definitions were retargeted exactly to the owned schema; production GRANT was never executed');

  stage = 'seed-independent-existing-ledger-and-source-backlog';
  await fixture.execute(`INSERT INTO workers (id, code, full_name, status, last_attendance_at, biometric_person_code) VALUES
    (1, 'SOURCE-LAB-W1', 'Synthetic preserved worker', 'active', '2026-11-18 08:00:00','LEGACY-WORKER-PERSON'),
    (2, 'SOURCE-LAB-W2', 'Synthetic second worker', 'active', NULL,NULL),
    (3, 'SOURCE-LAB-W3', 'Synthetic inactive worker', 'inactive', NULL,NULL)`);
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
  const { DeviceIdentitiesService } = await import('../../../biometric-system/src/application/device-identities-service.js');
  const { TiDbDeviceIdentitiesReadStore } = await import('../../../biometric-system/src/infrastructure/storage/tidb-device-identities-read-store.js');
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
  const directoryService = new DeviceIdentitiesService({ streamId,
    readStore: new TiDbDeviceIdentitiesReadStore(producerPool, { deviceUserIdentityEnabled: true }) });
  const handler = createSourcePunchesApiHandler({ service: sourceService, connections, directoryService });
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

  stage = 'sync-real-producer-directory-http-into-local-cache';
  const { createMysqlBiometricDirectoryStore } = await import('../../server/biometric-directory/mysql-store.ts');
  const { createBiometricDirectoryService } = await import('../../server/biometric-directory/service.ts');
  const { createBiometricDirectoryHttpClient } = await import('../../server/biometric-directory/http-source.ts');
  const { createBiometricDirectorySync } = await import('../../server/biometric-directory/sync.ts');
  const directoryCache = createMysqlBiometricDirectoryStore(consumerPool!, lab.schema);
  const directoryLinks = createBiometricDirectoryService(directoryCache);
  const directorySource = createBiometricDirectoryHttpClient({ apiUrl: origin, token: secondKey.token, streamId });
  const directorySync = createBiometricDirectorySync({ source: directorySource, cache: directoryCache, streamId, pageSize: 2, maxPages: 20 });
  const rawInboxBefore = (await fixture.query<any[]>('SELECT * FROM attendance_source_events ORDER BY id'))[0];
  await directoryCache.assertReady();
  const firstDirectory = await directorySync.runOnce();
  assert.equal(firstDirectory.sweepCompleted, true);
  assert.equal(firstDirectory.upserted, 5);
  const allUsers = await directoryLinks.listUsers({ streamId, roster: 'all', currentWorkerId: 1, page: 1, limit: 100 });
  assert.equal(allUsers.page.total, 5);
  assert.equal(allUsers.items.filter(item => item.status === 'historical').length, 1);
  assert.equal(allUsers.items.filter(item => item.deviceUserId === '00017').length, 3);
  assert.ok(allUsers.items.every(item => item.linkState === 'available' && item.linkedWorker === null));
  const paged = await directoryLinks.listUsers({ streamId, roster: 'all', page: 2, limit: 2 });
  assert.deepEqual(paged.page, { number: 2, limit: 2, total: 5, totalPages: 3 });
  const searched = await directoryLinks.listUsers({ streamId, roster: 'all', search: '00017' });
  assert.equal(searched.items.length, 3);
  checks.push('Real producer identity SQL -> protected HTTP -> consumer directory sync mirrors current and historical enrollments without matching repeated PINs or names to workers');

  stage = 'manual-explicit-versioned-identity-assignment';
  const assign = (workerId: number, identityId: string, expectedLinkId: string | null = null, confirmHistorical = false) =>
    directoryLinks.setLink({ streamId, workerId, identityId, expectedLinkId, confirmHistorical, actor: 1 });
  await assert.rejects(() => assign(2, '73'), (error: any) => error.code === 'BIOMETRIC_DIRECTORY_HISTORICAL_CONFIRMATION_REQUIRED');
  const historicalLink = await assign(2, '73', null, true);
  const currentLink = await assign(1, '74');
  const otherDeviceLink = await assign(1, '75');
  assert.equal((await directoryLinks.listWorkerLinks({ workerId: 1 })).items.length, 2);
  assert.equal(historicalLink.link.status, 'historical');
  assert.equal(currentLink.link.deviceUserId, '00017');
  assert.notEqual(currentLink.link.identityId, historicalLink.link.identityId);
  assert.equal((await assign(1, '74', currentLink.link.linkId)).unchanged, true);
  await assert.rejects(() => assign(2, '74', currentLink.link.linkId), (error: any) => error.code === 'BIOMETRIC_DIRECTORY_LINK_CONFLICT');
  await assert.rejects(() => assign(1, '74', null), (error: any) => error.code === 'BIOMETRIC_DIRECTORY_LINK_CONFLICT');
  await assert.rejects(() => assign(3, '77'), (error: any) => error.code === 'BIOMETRIC_DIRECTORY_WORKER_INACTIVE');
  await assert.rejects(() => assign(1, '999999'), (error: any) => error.code === 'BIOMETRIC_DIRECTORY_IDENTITY_NOT_FOUND');
  const picker = await directoryLinks.listUsers({ streamId, roster: 'all', currentWorkerId: 1 });
  assert.equal(picker.items.find(item => item.identityId === '74')?.linkState, 'linked_current');
  assert.equal(picker.items.find(item => item.identityId === '73')?.linkState, 'linked_other');
  assert.equal(picker.items.find(item => item.identityId === '74')?.linkedWorker?.fullName, 'Synthetic preserved worker');
  assert.deepEqual(await ledger(), ledgerBefore);
  checks.push('Explicit manual identity version assignment supports multiple devices/history, requires historical confirmation, rejects inactive/unknown targets, and never steals another worker link');

  stage = 'source-renames-archive-and-same-pin-new-enrollment';
  await fixture.execute("UPDATE biometric_svc_device_users SET display_name = '  Renamed source enrollment  ' WHERE id = 74");
  await directorySync.runOnce();
  assert.equal((await directoryLinks.listWorkerLinks({ workerId: 1 })).items.find(item => item.identityId === '74')?.displayName,
    '  Renamed source enrollment  ');
  await fixture.execute("UPDATE biometric_svc_device_users SET status = 'absent_from_device', identity_ended_at = '2026-11-19 10:01:00.123456', display_name = NULL WHERE id = 74");
  await fixture.execute(`INSERT INTO biometric_svc_device_users VALUES
    (78,9007199254740999,'00017','Synthetic newly reused PIN enrollment','seen',NULL,NULL,'2026-11-19 10:02:00.123456',NULL)`);
  await directorySync.runOnce();
  const afterReuse = await directoryLinks.listUsers({ streamId, roster: 'all', currentWorkerId: 1 });
  assert.equal(afterReuse.items.find(item => item.identityId === '74')?.status, 'historical');
  assert.equal(afterReuse.items.find(item => item.identityId === '74')?.linkId, currentLink.link.linkId);
  assert.equal(afterReuse.items.find(item => item.identityId === '78')?.linkId, null);
  assert.equal((await directoryLinks.listWorkerLinks({ workerId: 1 })).items.find(item => item.identityId === '74')?.displayName, null);
  const [[originalSnapshot]] = await fixture.execute<any[]>('SELECT display_name_snapshot FROM attendance_biometric_worker_links WHERE id = ?', [currentLink.link.linkId]);
  assert.equal(originalSnapshot.display_name_snapshot, 'Synthetic current enrollment');
  assert.deepEqual((await fixture.query<any[]>('SELECT * FROM attendance_source_events ORDER BY id'))[0], rawInboxBefore);
  checks.push('Padded/blank names refresh through real HTTP without changing workers; archiving an enrollment retains its link while a new same-PIN identity stays unlinked; original link snapshot and punch hashes remain unchanged');

  stage = 'reject-coordinate-change-and-rollback-the-complete-page';
  const [cachePageBefore] = await fixture.query<any[]>("SELECT * FROM attendance_biometric_users WHERE source_identity_id IN ('75','76') ORDER BY source_identity_id");
  await fixture.execute("UPDATE biometric_svc_device_users SET display_name = 'SHOULD-ROLL-BACK' WHERE id = 75");
  await fixture.execute('UPDATE biometric_svc_device_users SET device_id = ? WHERE id = 76', ['9007199254740998']);
  await assert.rejects(() => directorySync.runOnce(), (error: any) => error.code === 'BIOMETRIC_DIRECTORY_IDENTITY_CONFLICT');
  const [cachePageAfter] = await fixture.query<any[]>("SELECT * FROM attendance_biometric_users WHERE source_identity_id IN ('75','76') ORDER BY source_identity_id");
  assert.deepEqual(cachePageAfter, cachePageBefore);
  await fixture.execute("UPDATE biometric_svc_device_users SET display_name = 'Synthetic other-device enrollment' WHERE id = 75");
  await fixture.execute('UPDATE biometric_svc_device_users SET device_id = ? WHERE id = 76', ['9007199254740999']);
  await directorySync.runOnce();
  await fixture.execute('DELETE FROM biometric_svc_device_users WHERE id = 77');
  await directorySync.runOnce();
  assert.ok((await directoryLinks.listUsers({ streamId, roster: 'all' })).items.some(item => item.identityId === '77'));
  checks.push('Same-identity device/PIN coordinates cannot change: an earlier valid update in the same page rolls back on conflict; missing source rows do not delete cached identities');

  stage = 'concurrent-binding-and-versioned-revocation';
  const attempts = await Promise.allSettled([assign(1, '76'), assign(2, '76')]);
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
  const loser = attempts.find(result => result.status === 'rejected') as PromiseRejectedResult;
  assert.equal(loser.reason.code, 'BIOMETRIC_DIRECTORY_LINK_CONFLICT');
  const [[activeRace]] = await fixture.query<any[]>("SELECT COUNT(*) AS count FROM attendance_biometric_worker_links WHERE source_identity_id = '76' AND status = 'active'");
  assert.equal(Number(activeRace.count), 1);
  const revoke = (workerId: number, identityId: string, expectedLinkId: string, actor = 1) =>
    directoryLinks.revokeLink({ streamId, workerId, identityId, expectedLinkId, actor });
  await assert.rejects(() => revoke(2, '74', currentLink.link.linkId), (error: any) => error.code === 'BIOMETRIC_DIRECTORY_LINK_CONFLICT');
  assert.equal((await revoke(1, '74', currentLink.link.linkId)).unchanged, false);
  assert.equal((await revoke(1, '74', currentLink.link.linkId, 2)).unchanged, true);
  const moved = await assign(2, '74', null, true);
  assert.notEqual(moved.link.linkId, currentLink.link.linkId);
  await assert.rejects(() => revoke(1, '74', currentLink.link.linkId), (error: any) => error.code === 'BIOMETRIC_DIRECTORY_LINK_CONFLICT');
  const [history] = await fixture.execute<any[]>('SELECT worker_id,status,created_by,revoked_by,revoked_at_utc FROM attendance_biometric_worker_links WHERE stream_id = ? AND source_identity_id = ? ORDER BY created_at_utc,id', [streamId, '74']);
  assert.equal(history.length, 2);
  assert.equal(history.filter(row => row.status === 'active').length, 1);
  const old = history.find(row => row.status === 'revoked');
  assert.equal(old.worker_id, 1);
  assert.equal(old.created_by, 1);
  assert.equal(old.revoked_by, 1);
  assert.ok(old.revoked_at_utc);
  await assert.rejects(() => fixture!.execute(`INSERT INTO attendance_biometric_worker_links
    (id,stream_id,source_identity_id,worker_id,status,device_id_snapshot,device_user_id_snapshot,display_name_snapshot,device_name_snapshot,
      serial_number_snapshot,worker_name_snapshot,created_by,created_at_utc)
    SELECT '123e4567-e89b-42d3-a456-426614174098',stream_id,source_identity_id,2,'active',device_id_snapshot,device_user_id_snapshot,
      display_name_snapshot,device_name_snapshot,serial_number_snapshot,worker_name_snapshot,1,UTC_TIMESTAMP(6)
    FROM attendance_biometric_worker_links WHERE id = ?`, [otherDeviceLink.link.linkId]), (error: any) => error.code === 'ER_DUP_ENTRY');
  assert.deepEqual(await ledger(), ledgerBefore);
  assert.deepEqual((await fixture.query<any[]>('SELECT * FROM attendance_source_events ORDER BY id'))[0], rawInboxBefore);
  assert.equal(await receiptCount(), archiveCount);
  checks.push('Concurrent different-worker assignment produces exactly one active link; generated unique key enforces it in SQL, explicit revoke/relink retains immutable history and stale requests cannot remove the newer assignment');

  stage = 'release-orphan-binding-without-recreating-a-deleted-worker';
  await fixture.execute("INSERT INTO workers (id,code,full_name,status) VALUES (99,'SOURCE-LAB-TEMP','Synthetic deleted worker snapshot','active')");
  const orphan = await assign(99, '77');
  await fixture.execute('DELETE FROM workers WHERE id = ?', [99]);
  const orphanPicker = (await directoryLinks.listUsers({ streamId, roster: 'all', currentWorkerId: 1 })).items.find(item => item.identityId === '77');
  assert.equal(orphanPicker?.linkedWorkerExists, false);
  assert.equal(orphanPicker?.linkedWorker?.id, 99);
  assert.equal(orphanPicker?.linkedWorker?.fullName, 'Synthetic deleted worker snapshot');
  assert.equal(orphanPicker?.linkState, 'linked_other');
  await assert.rejects(() => assign(1, '77', orphan.link.linkId), (error: any) => error.code === 'BIOMETRIC_DIRECTORY_LINK_CONFLICT');
  await assert.rejects(() => assign(99, '77', orphan.link.linkId), (error: any) => error.code === 'BIOMETRIC_DIRECTORY_WORKER_NOT_FOUND');
  await revoke(99, '77', orphan.link.linkId);
  const orphanReassigned = await assign(2, '77');
  assert.notEqual(orphanReassigned.link.linkId, orphan.link.linkId);
  const [[orphanHistory]] = await fixture.execute<any[]>('SELECT status,worker_id,worker_name_snapshot,revoked_by FROM attendance_biometric_worker_links WHERE id = ?', [orphan.link.linkId]);
  assert.equal(orphanHistory.status, 'revoked');
  assert.equal(orphanHistory.worker_id, 99);
  assert.equal(orphanHistory.worker_name_snapshot, 'Synthetic deleted worker snapshot');
  assert.equal(orphanHistory.revoked_by, 1);
  assert.equal((await directoryLinks.listUsers({ streamId, roster: 'all', currentWorkerId: 2 })).items.find(item => item.identityId === '77')?.linkedWorkerExists, true);
  checks.push('A hard-deleted worker leaves an explicitly marked blocked orphan link; exact-version revocation releases it while retaining the deleted worker snapshot and audit history');
  assert.deepEqual(await ledger(), ledgerBefore);
  assert.deepEqual((await fixture.query<any[]>('SELECT * FROM attendance_source_events ORDER BY id'))[0], rawInboxBefore);
  checks.push('Directory sync and manual binding leave every archived movement/content hash, original worker/person-code field, attendance record, finance row and setting byte-for-byte unchanged');

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
