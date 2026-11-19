import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { mock } from 'node:test';
import { startTolanHrMysql, osEnvironmentKeys } from './tolanhr-pilot-mysql.mjs';

// Run only as a dedicated process. No application dotenv bootstrap is imported.
const allowedEnvironment = new Set(osEnvironmentKeys.map(key => key.toLowerCase()));
for (const key of Object.keys(process.env)) {
  if (!allowedEnvironment.has(key.toLowerCase())) delete process.env[key];
}
process.env.TZ = 'UTC';
process.env.NODE_ENV = 'test';

const personCode = 'TEST-INGEST-100';
const qrToken = 'SYNTHETIC-TOLANHR-PILOT-QR';
const workDate = '2026-11-10';
const cursorKey = 'biometric_final_events_cursor';
const checks: string[] = [];
const cleanup: Record<string, unknown> = {};
let stage = 'initialize-owned-tolanhr-mysql';
let failure: { stage: string; code: string; line?: number } | null = null;
let lab: Awaited<ReturnType<typeof startTolanHrMysql>> | undefined;
let fixtureDb: any;
let applicationDb: any;
let applicationPool: any;
let producer: any;

// Report named assertions and error codes only. App error objects can include SQL parameters.
const originalConsole = { log: console.log, warn: console.warn, error: console.error };
console.log = console.warn = console.error = () => {};

try {
  lab = await startTolanHrMysql();
  process.env.DATABASE_URL = lab.databaseUrl;
  fixtureDb = await lab.connect();
  stage = 'validate-production-db-connection';
  const { getDb } = await import('../server/db/connection.ts');
  applicationDb = await getDb();
  assert.ok(applicationDb?.$client);
  applicationPool = applicationDb.$client.promise();
  const [[identity]] = await applicationPool.execute('SELECT DATABASE() AS db, @@port AS port, @@datadir AS datadir');
  assert.equal(identity.db, lab.schema);
  assert.equal(Number(identity.port), lab.port);
  assert.equal(path.resolve(identity.datadir), path.resolve(lab.data));
  checks.push('getDb connected to owned loopback MySQL and a newly generated test schema');

  stage = 'seed-synthetic-workers-and-groups';
  await fixtureDb.execute("INSERT INTO `groups` (id, code, name, daily_wage, is_flexible_schedule, required_hours, early_leave_penalty_rate) VALUES (1, 'PILOT-BASE', 'Synthetic base group', 180, 1, 3, 100), (2, 'PILOT-TRANSFER', 'Synthetic transfer group', 180, 1, 3, 100)");
  await fixtureDb.execute("INSERT INTO users (id, username, full_name, role) VALUES (1, 'synthetic-guard', 'Synthetic guard', 'guard')");
  await fixtureDb.execute("INSERT INTO workers (id, code, full_name, group_id, biometric_person_code, qr_token, status) VALUES (1, 'PILOT-WORKER', 'Synthetic worker', 1, ?, ?, 'active')", [personCode, qrToken]);

  stage = 'start-real-fingerprint-producer-and-authenticated-api';
  const { startSyntheticFingerprintPilot } = await import('../../biometric-system/scripts/test-fixtures/tolanhr-pilot-producer.mjs');
  producer = await startSyntheticFingerprintPilot();
  const api = new URL(producer.apiBase);
  assert.equal(api.protocol, 'http:');
  assert.equal(api.hostname, '127.0.0.1');
  assert.ok(api.port);
  assert.equal(api.username + api.password + api.search + api.hash, '');
  process.env.BIOMETRIC_SERVICE_API_URL = `${api.origin}/api/v1`;
  process.env.BIOMETRIC_SERVICE_API_TOKEN = producer.token;
  process.env.BIOMETRIC_FINAL_EVENTS_IMPORT_ENABLED = 'true';
  process.env.BIOMETRIC_FINAL_EVENTS_IMPORT_FROM_UTC = '2026-11-10T21:00:00Z';
  const { fetchBiometricFinalEventsPage } = await import('../server/biometric-integration.ts');
  const { runBiometricFinalEventsImportOnce } = await import('../server/biometric-final-events-importer.ts');

  stage = 'initialize-real-importer-on-empty-api';
  assert.deepEqual(await runBiometricFinalEventsImportOnce(), {
    state: 'initialized', cursor: '0', fetched: 0, skippedHistorical: 0, counts: {},
  });
  checks.push('real importer initializes a cursor through the authenticated local Fingerprint API');

  stage = 'record-qr-through-real-attendance-router';
  const { attendanceRouter } = await import('../server/routers/attendance.ts');
  const caller = attendanceRouter.createCaller({
    user: { id: 1, role: 'guard' }, req: { headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res: {},
  } as any);
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-10T22:00:00Z') });
  try {
    const lookup = await caller.getWorkerFromQR({ qrToken });
    assert.equal(lookup.worker.id, 1);
    assert.equal(lookup.nextEventType, 'check_in');
    const result = await caller.confirmAttendance({ workerId: lookup.worker.id, eventType: 'check_in' });
    assert.equal(result.eventType, 'check_in');
    assert.equal(result.workDate, workDate);
  } finally { mock.timers.reset(); }
  const [qrRows] = await fixtureDb.execute('SELECT event_type, method, work_date, event_time, verified_by FROM attendance_events');
  assert.deepEqual(qrRows, [{ event_type: 'check_in', method: 'qr', work_date: workDate,
    event_time: '2026-11-10 22:00:00', verified_by: 1 }]);
  checks.push('real QR lookup and confirmation handlers store a QR check-in on the expected Riyadh administrative date');

  stage = 'publish-and-fetch-a-final-fingerprint-checkout';
  const checkout = await producer.publishPunch({ timestamp: '2026-11-11 03:00:00' });
  const page = await fetchBiometricFinalEventsPage({ afterId: '0', limit: 10 });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].eventId, checkout.eventId);
  assert.equal(page.items[0].eventType, 'check_out');
  assert.match(page.items[0].eventTimeUtc, /^2026-11-11T00:00:00(?:\.0+)?Z$/);
  assert.equal(page.items[0].eventTimezone, 'Asia/Riyadh');
  checks.push('real ADMS ingest finalizes a synthetic fingerprint checkout and exposes it through the real API');

  stage = 'import-checkout-and-verify-daily-finance';
  const firstImport = await runBiometricFinalEventsImportOnce();
  assert.equal(firstImport.cursor, checkout.cursor);
  assert.deepEqual(firstImport.counts, { processed: 1 });
  stage = 'verify-biometric-attendance-row';
  // Use text-protocol reads for TIMESTAMP assertions. mysql2's binary parser can
  // return only the date for a midnight TIMESTAMP when dateStrings is enabled.
  const [attendance] = await fixtureDb.query('SELECT id, event_type, method, work_date, event_time FROM attendance_events ORDER BY id');
  assert.equal(attendance.length, 2);
  assert.equal(attendance[1].event_type, 'check_out');
  assert.equal(attendance[1].method, 'biometric');
  assert.equal(attendance[1].work_date, workDate);
  assert.equal(attendance[1].event_time, '2026-11-11 00:00:00');
  stage = 'verify-finance-amounts-and-minutes';
  const [finance] = await fixtureDb.query('SELECT work_date, check_in_time, check_out_time, worked_minutes, financial_minutes, base_amount, deductions, net_amount, effective_group_id FROM worker_daily_finance');
  assert.deepEqual(finance, [{ work_date: workDate, check_in_time: '2026-11-10 22:00:00', check_out_time: '2026-11-11 00:00:00',
    worked_minutes: 120, financial_minutes: 120, base_amount: '180.00', deductions: '60.00', net_amount: '120.00', effective_group_id: 1 }]);
  const [[imported]] = await fixtureDb.execute('SELECT status, attendance_event_id, message FROM biometric_final_event_imports WHERE event_uuid = ?', [checkout.eventId]);
  assert.equal(imported.status, 'processed');
  assert.equal(imported.attendance_event_id, attendance[1].id);
  assert.equal(imported.message, null);
  checks.push('QR check-in and fingerprint checkout produce 120 minutes and a net 120.00 on the same administrative day');

  stage = 'reject-before-cutoff-without-changing-attendance-or-finance';
  const early = await producer.publishPunch({ timestamp: '2026-11-10 23:45:00' });
  await verifyBlocked(early, 'before_cutoff');
  checks.push('movement before BIOMETRIC_FINAL_EVENTS_IMPORT_FROM_UTC records before_cutoff without changing payroll or attendance');

  stage = 'reject-locked-daily-finance-row';
  await fixtureDb.execute("INSERT INTO payroll_batches (id, batch_code, period_start, period_end, group_id, status, is_unlocked) VALUES (11, 'PILOT-DAY-LOCK', '2026-11-11', '2026-11-11', 1, 'approved', 1)");
  await fixtureDb.execute("INSERT INTO worker_daily_finance (worker_id, work_date, locked_batch_id, worked_minutes, base_amount, net_amount, notes) VALUES (1, '2026-11-11', 11, 30, 44.00, 44.00, 'Synthetic locked daily finance')");
  const lockedDay = await producer.publishPunch({ timestamp: '2026-11-11 08:00:00' });
  await verifyBlocked(lockedDay, 'period_locked');
  checks.push('a locked worker daily row blocks attendance while preserving the existing finance row');

  stage = 'reject-payroll-lock-for-effective-operational-group';
  await fixtureDb.execute("INSERT INTO daily_work_assignments (worker_id, restaurant_id, source_group_id, operational_group_id, work_date) VALUES (1, 99, 1, 2, '2026-11-12')");
  await fixtureDb.execute("INSERT INTO payroll_batches (id, batch_code, period_start, period_end, group_id, status, is_unlocked) VALUES (12, 'PILOT-GROUP-LOCK', '2026-11-12', '2026-11-12', 2, 'approved', 0)");
  await fixtureDb.execute('INSERT INTO payroll_batch_items (batch_id, worker_id, group_id) VALUES (12, 1, 2)');
  const lockedGroup = await producer.publishPunch({ timestamp: '2026-11-12 08:00:00' });
  await verifyBlocked(lockedGroup, 'period_locked');
  checks.push('an active payroll batch for the effective operational group blocks the movement and does not create a daily row');

  stage = 'reject-unmapped-final-event';
  const unmapped = await producer.publishPunch({ timestamp: '2026-11-12 09:00:00', personCode: 'TEST-INGEST-NO-WORKER' });
  await verifyBlocked(unmapped, 'unmapped');
  checks.push('a finalized biometric person without a TolanHR worker mapping leaves attendance and finance unchanged');

  stage = 'replay-the-same-api-events-by-rewinding-fixture-cursor';
  const previousLedger = await ledger();
  const [previousImports] = await fixtureDb.execute('SELECT * FROM biometric_final_event_imports ORDER BY id');
  assert.equal(previousImports.length, 5);
  await fixtureDb.execute('UPDATE settings SET `value` = ? WHERE `key` = ?', ['0', cursorKey]);
  const replay = await runBiometricFinalEventsImportOnce();
  assert.equal(replay.fetched, 5);
  assert.deepEqual(replay.counts, { already_processed: 5 });
  assert.equal(replay.cursor, unmapped.cursor);
  assert.deepEqual(await ledger(), previousLedger);
  const [replayedImports] = await fixtureDb.execute('SELECT * FROM biometric_final_event_imports ORDER BY id');
  assert.deepEqual(replayedImports, previousImports);
  checks.push('replaying the same five API UUIDs preserves exactly one biometric checkout and the original finance and import rows');

  async function ledger() {
    const [events] = await fixtureDb.execute('SELECT * FROM attendance_events ORDER BY id');
    const [daily] = await fixtureDb.execute('SELECT * FROM worker_daily_finance ORDER BY id');
    const [workers] = await fixtureDb.execute('SELECT id, last_attendance_at FROM workers ORDER BY id');
    return { events, daily, workers };
  }

  async function verifyBlocked(event: { eventId: string; cursor: string }, status: string) {
    const before = await ledger();
    const outcome = await runBiometricFinalEventsImportOnce();
    assert.deepEqual(outcome.counts, { [status]: 1 });
    assert.equal(outcome.cursor, event.cursor);
    assert.deepEqual(await ledger(), before);
    const [[row]] = await fixtureDb.execute('SELECT status, attendance_event_id FROM biometric_final_event_imports WHERE event_uuid = ?', [event.eventId]);
    assert.deepEqual(row, { status, attendance_event_id: null });
  }
} catch (error) {
  const candidate = (error as any)?.cause?.code ?? (error as any)?.code;
  const line = /tolanhr-pilot\.mts:(\d+):\d+/.exec((error as any)?.stack ?? '')?.[1];
  failure = { stage, code: typeof candidate === 'string' && /^[A-Z][A-Z0-9_]{1,70}$/.test(candidate) ? candidate : 'PILOT_ACCEPTANCE_FAILED',
    ...(line ? { line: Number(line) } : {}) };
} finally {
  try { await producer?.close(); cleanup.fingerprintProducerStopped = Boolean(producer); }
  catch { failure ??= { stage: 'close-fingerprint-producer', code: 'PILOT_CLEANUP_FAILED' }; }
  try { await applicationPool?.end(); await fixtureDb?.end(); }
  catch { failure ??= { stage: 'close-tolanhr-pools', code: 'PILOT_CLEANUP_FAILED' }; }
  try { if (lab) Object.assign(cleanup, await lab.close()); }
  catch { failure ??= { stage: 'stop-owned-tolanhr-mysql', code: 'PILOT_CLEANUP_FAILED' }; }
  Object.assign(console, originalConsole);
}

const report = {
  passed: !failure,
  completedAtUtc: new Date().toISOString(),
  fixture: 'Synthetic workers and events on two process-owned local MySQL instances, reduced TolanHR schema',
  fingerprintPath: 'Real ATTLOG intake, finalization, and authenticated Final Events API over loopback',
  tolanHrPath: 'Real getWorkerFromQR and confirmAttendance callers, getDb, importer, and daily finance calculation',
  checks, cleanup, ...(failure ? { failure } : {}),
};
await fs.writeFile(path.join(import.meta.dirname, 'tolanhr-pilot-result.json'), JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify(report) + '\n');
if (failure) process.exitCode = 1;
