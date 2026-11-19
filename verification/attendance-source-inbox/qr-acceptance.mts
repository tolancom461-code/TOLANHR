import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { mock } from 'node:test';
import { startTolanHrMysql, osEnvironmentKeys } from '../tolanhr-pilot-mysql.mjs';

// Dedicated synthetic process. The application receives only the owned loopback URL.
const allowedEnvironment = new Set(osEnvironmentKeys.map(key => key.toLowerCase()));
for (const key of Object.keys(process.env)) {
  if (!allowedEnvironment.has(key.toLowerCase())) delete process.env[key];
}
process.env.TZ = 'UTC';
process.env.NODE_ENV = 'test';

const checks: string[] = [];
const cleanup: Record<string, unknown> = {};
let stage = 'start-owned-qr-mysql';
let failure: { stage: string; code: string; line?: number } | undefined;
let lab: Awaited<ReturnType<typeof startTolanHrMysql>> | undefined;
let fixture: Awaited<ReturnType<Awaited<ReturnType<typeof startTolanHrMysql>>['connect']>> | undefined;
let applicationPool: any;
const originalConsole = { log: console.log, warn: console.warn, error: console.error };
console.log = console.warn = console.error = () => {};

try {
  lab = await startTolanHrMysql();
  fixture = await lab.connect();
  const [[identity]] = await fixture.query<any[]>('SELECT DATABASE() AS db, @@port AS port, @@datadir AS datadir');
  assert.equal(identity.db, lab.schema);
  assert.equal(Number(identity.port), lab.port);
  assert.equal(path.resolve(identity.datadir), path.resolve(lab.data));
  const url = new URL(lab.databaseUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.pathname, `/${lab.schema}`);
  process.env.DATABASE_URL = lab.databaseUrl;
  checks.push('A fresh synthetic MySQL schema, random loopback port and owned datadir verified before loading the application');

  stage = 'seed-qr-workflow-fixture';
  await fixture.execute("INSERT INTO `groups` (id, code, name, daily_wage, is_flexible_schedule, required_hours, early_leave_penalty_rate) VALUES (1, 'QR-INBOX-GROUP', 'Synthetic QR group', 180, 1, 3, 100)");
  await fixture.execute("INSERT INTO users (id, username, full_name, role) VALUES (1, 'synthetic-qr-guard', 'Synthetic QR guard', 'guard')");
  await fixture.execute("INSERT INTO workers (id, code, full_name, group_id, qr_token, manual_code, status) VALUES (1, 'QR-W1', 'Synthetic confirmed QR worker', 1, 'SYNTHETIC-QR-1', 'SYNTHETIC-MANUAL-1', 'active'), (2, 'QR-W2', 'Synthetic legacy QR worker', 1, 'SYNTHETIC-QR-2', 'SYNTHETIC-MANUAL-2', 'active'), (3, 'QR-W3', 'Synthetic manual worker', 1, 'SYNTHETIC-QR-3', 'SYNTHETIC-MANUAL-3', 'active')");

  process.env.ATTENDANCE_SOURCE_QR_ENABLED = 'true';
  process.env.ATTENDANCE_SOURCE_DB_CONFIRMED_NAME = lab.schema;
  const { getDb } = await import('../../server/db/connection.ts');
  const applicationDb = await getDb();
  assert.ok(applicationDb?.$client);
  applicationPool = applicationDb.$client.promise();
  const [[applicationIdentity]] = await applicationPool.query('SELECT DATABASE() AS db, @@port AS port, @@datadir AS datadir');
  assert.equal(applicationIdentity.db, lab.schema);
  assert.equal(Number(applicationIdentity.port), lab.port);
  assert.equal(path.resolve(applicationIdentity.datadir), path.resolve(lab.data));
  const { attendanceRouter } = await import('../../server/routers/attendance.ts');
  const { recordAttendanceWithAdministrativeDay } = await import('../../server/attendance-logic.ts');
  const { recordQrWithSourceInbox } = await import('../../server/attendance-source-inbox/qr-observer.ts');
  const { createMysqlAttendanceSourceInboxStore } = await import('../../server/attendance-source-inbox/mysql-store.ts');
  const caller = attendanceRouter.createCaller({ user: { id: 1, role: 'guard' },
    req: { headers: { 'x-forwarded-for': '198.51.100.7, 192.0.2.9' }, socket: { remoteAddress: '127.0.0.1' } }, res: {},
  } as any);

  stage = 'capture-failure-before-current-qr-processing';
  const beforeMissingSchema = await ledger();
  await at('2026-11-19T08:00:00.000Z', () => rejects(() => caller.confirmAttendance({
    workerId: 1, eventType: 'check_in', sourceAttemptId: attempt(1),
  }), 'INTERNAL_SERVER_ERROR'));
  assert.deepEqual(await ledger(), beforeMissingSchema);
  await installInboxTable();
  checks.push('Actual confirmAttendance refuses a missing inbox migration before changing attendance, workers or finance');

  stage = 'confirm-qr-and-replay-accepted-source-attempt';
  const confirmed = await at('2026-11-19T08:00:00.000Z', () => caller.confirmAttendance({
    workerId: 1, eventType: 'check_in', sourceAttemptId: attempt(1), deviceInfo: 'Synthetic QR browser',
  }));
  assert.equal(confirmed.eventType, 'check_in');
  assert.equal(confirmed.workDate, '2026-11-19');
  const acceptedIn = await receipt(attempt(1));
  assert.equal(acceptedIn.status, 'accepted');
  assert.equal(acceptedIn.attendance_event_id, confirmed.eventId);
  assert.equal(acceptedIn.source_user_name, 'Synthetic confirmed QR worker');
  const [[attendanceIn]] = await fixture.query<any[]>('SELECT method, event_time, work_date, verified_by, ip_address, device_info FROM attendance_events WHERE id = ?', [confirmed.eventId]);
  assert.deepEqual(attendanceIn, { method: 'qr', event_time: '2026-11-19 08:00:00', work_date: '2026-11-19',
    verified_by: 1, ip_address: '198.51.100.7', device_info: 'Synthetic QR browser' });
  const afterCheckIn = await ledger();
  const replayedIn = await at('2026-11-19T08:01:00.000Z', () => caller.confirmAttendance({
    workerId: 1, eventType: 'check_in', sourceAttemptId: attempt(1),
  }));
  assert.equal(replayedIn.eventId, confirmed.eventId);
  assert.equal(replayedIn.timestamp.toISOString(), '2026-11-19T08:00:00.000Z');
  assert.deepEqual(await ledger(), afterCheckIn);
  await rejects(() => caller.confirmAttendance({ workerId: 1, eventType: 'check_out', sourceAttemptId: attempt(1) }), 'CONFLICT');
  checks.push('Explicit QR check-in is acknowledged with its real attendance ID; stable attempt replay and changed-intent conflict preserve the saved movement');

  stage = 'preserve-existing-any-type-cooldown';
  await at('2026-11-19T08:00:30.000Z', () => rejects(() => caller.confirmAttendance({
    workerId: 1, eventType: 'check_out', sourceAttemptId: attempt(2),
  }), 'BAD_REQUEST'));
  const rejected = await receipt(attempt(2));
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.decision_code, 'QR_COOLDOWN');
  assert.equal(rejected.attendance_event_id, null);
  assert.deepEqual(await ledger(), afterCheckIn);
  await at('2026-11-19T08:05:00.000Z', () => rejects(() => caller.confirmAttendance({
    workerId: 1, eventType: 'check_out', sourceAttemptId: attempt(2),
  }), 'BAD_REQUEST'));
  assert.deepEqual(await ledger(), afterCheckIn);
  checks.push('The current cooldown still rejects a distinct checkout within three minutes and retains the same rejection on source-attempt replay');

  stage = 'confirm-checkout-with-the-existing-finance-calculation';
  const checkout = await at('2026-11-19T10:00:00.000Z', () => caller.confirmAttendance({
    workerId: 1, eventType: 'check_out', sourceAttemptId: attempt(3),
  }));
  const acceptedOut = await receipt(attempt(3));
  assert.equal(acceptedOut.status, 'accepted');
  assert.equal(acceptedOut.attendance_event_id, checkout.eventId);
  const [finance] = await fixture.query<any[]>('SELECT worker_id, work_date, worked_minutes, net_amount FROM worker_daily_finance WHERE worker_id = 1');
  assert.deepEqual(finance, [{ worker_id: 1, work_date: '2026-11-19', worked_minutes: 120, net_amount: '120.00' }]);
  const afterCheckout = await ledger();
  await at('2026-11-19T11:00:00.000Z', () => caller.confirmAttendance({
    workerId: 1, eventType: 'check_out', sourceAttemptId: attempt(3),
  }));
  assert.deepEqual(await ledger(), afterCheckout);
  checks.push('Actual QR checkout retains the current 120-minute finance result and accepted replay changes neither finance nor attendance');

  stage = 'concurrent-same-source-attempt';
  const concurrent = await at('2026-11-19T12:00:00.000Z', () => Promise.allSettled(Array.from({ length: 6 }, () =>
    caller.confirmAttendance({ workerId: 2, eventType: 'check_in', sourceAttemptId: attempt(4) }))));
  assert.ok(concurrent.some(value => value.status === 'fulfilled'));
  for (const value of concurrent) {
    if (value.status === 'rejected') assert.equal(value.reason.code, 'CONFLICT');
  }
  const [[sameAttemptAttendance]] = await fixture.query<any[]>('SELECT COUNT(*) AS total FROM attendance_events WHERE worker_id = 2');
  assert.equal(Number(sameAttemptAttendance.total), 1);
  const concurrentReceipt = await receipt(attempt(4));
  assert.equal(concurrentReceipt.status, 'accepted');
  const eventualReplay = await at('2026-11-19T12:01:00.000Z', () => caller.confirmAttendance({
    workerId: 2, eventType: 'check_in', sourceAttemptId: attempt(4),
  }));
  assert.equal(eventualReplay.eventId, concurrentReceipt.attendance_event_id);
  checks.push('Six concurrent confirmations of one source attempt produce one attendance movement and later replay returns that same result');

  stage = 'legacy-and-manual-paths-keep-current-behavior';
  const beforeLegacy = await receiptCount();
  const legacy = await at('2026-11-19T12:04:00.000Z', () => caller.scanQR({ qrToken: 'SYNTHETIC-QR-2' }));
  assert.equal(legacy.eventType, 'check_out');
  assert.equal(await receiptCount(), beforeLegacy);
  const manual = await at('2026-11-19T13:00:00.000Z', () => caller.manualEntry({ code: 'SYNTHETIC-MANUAL-3' }));
  assert.equal(manual.eventType, 'check_in');
  assert.equal(await receiptCount(), beforeLegacy);
  const [[manualRow]] = await fixture.query<any[]>('SELECT method FROM attendance_events WHERE id = ?', [manual.eventId]);
  assert.equal(manualRow.method, 'manual');
  checks.push('Legacy scanQR infers checkout and manualEntry remains manual without manufacturing explicit-intent source receipts');

  stage = 'disabled-inbox-requires-no-source-table';
  process.env.ATTENDANCE_SOURCE_QR_ENABLED = 'false';
  await fixture.query('RENAME TABLE attendance_source_events TO owned_source_events_paused');
  try {
    const oldPath = await at('2026-11-19T14:00:00.000Z', () => caller.confirmAttendance({
      workerId: 1, eventType: 'check_in', sourceAttemptId: attempt(5),
    }));
    assert.equal(oldPath.eventType, 'check_in');
  } finally {
    await fixture.query('RENAME TABLE owned_source_events_paused TO attendance_source_events');
    process.env.ATTENDANCE_SOURCE_QR_ENABLED = 'true';
  }
  assert.equal(await receiptCount(), beforeLegacy);
  checks.push('Disabling the feature runs the existing explicit QR path successfully even while the inbox table is unavailable');

  stage = 'acknowledgement-failure-after-real-qr-success';
  const diagnosticCodes: string[] = [];
  let pendingObserved = false;
  const beforeAckFailure = await ledger();
  const ackFailureDependencies = {
    getPool: async () => applicationPool,
    createStore(pool: any, database: string) {
      const store = createMysqlAttendanceSourceInboxStore(pool, database);
      return { ...store, async recordExistingWorkflowOutcome() { throw new Error('Synthetic acknowledgement failure'); } };
    },
    diagnostic: (code: string) => diagnosticCodes.push(code),
    execute: async (observation: any) => recordAttendanceWithAdministrativeDay(3, 'qr', undefined, 1, undefined,
      undefined, 'check_out', { async beforeValidation(context: any) {
        await observation.beforeValidation(context);
        assert.equal((await receipt(attempt(6))).status, 'pending');
        assert.deepEqual(await ledger(), beforeAckFailure);
        pendingObserved = true;
      }, attendanceSaved: (id: number) => observation.attendanceSaved(id) }),
  };
  const ackFailureRequest = { workerId: 3, eventType: 'check_out' as const, actorId: 1, attemptId: attempt(6) };
  const savedDespiteAck = await at('2026-11-19T15:00:00.000Z', () => recordQrWithSourceInbox(ackFailureRequest, ackFailureDependencies));
  assert.equal(savedDespiteAck.eventType, 'check_out');
  assert.equal(pendingObserved, true);
  assert.deepEqual(diagnosticCodes, ['QR_ACCEPTED_OUTCOME_NOT_RECORDED']);
  assert.equal((await receipt(attempt(6))).status, 'pending');
  const afterAckFailure = await ledger();
  await rejects(() => recordQrWithSourceInbox(ackFailureRequest, ackFailureDependencies), 'CONFLICT');
  assert.deepEqual(await ledger(), afterAckFailure);
  checks.push('The actual workflow sees a pending receipt before insertion; failed acknowledgement preserves its success and prevents a second attendance or finance calculation');

  stage = 'post-insert-failure-remains-reviewable';
  const postInsertRequest = { workerId: 2, eventType: 'check_in' as const, actorId: 1, attemptId: attempt(7) };
  const postInsertDependencies = { getPool: async () => applicationPool,
    async execute(observation: any) {
      await recordAttendanceWithAdministrativeDay(2, 'qr', undefined, 1, undefined, undefined, 'check_in', observation);
      throw Object.assign(new Error('Synthetic failure after the existing insert'), { code: 'SYNTHETIC_POST_INSERT' });
    } };
  await at('2026-11-19T16:00:00.000Z', () => rejects(() => recordQrWithSourceInbox(postInsertRequest, postInsertDependencies), 'SYNTHETIC_POST_INSERT'));
  const postInsert = await receipt(attempt(7));
  assert.equal(postInsert.status, 'manual_review');
  assert.equal(postInsert.decision_code, 'QR_POST_INSERT_FAILURE');
  assert.match(postInsert.decision_note, /^attendance_event_id=\d+$/);
  const afterPostInsert = await ledger();
  await rejects(() => recordQrWithSourceInbox(postInsertRequest, postInsertDependencies), 'CONFLICT');
  assert.deepEqual(await ledger(), afterPostInsert);
  checks.push('A failure after the real attendance insert is recorded for manual review with its saved ID and cannot automatically replay the old workflow');

  async function receipt(attemptId: string) {
    const [rows] = await fixture!.query<any[]>("SELECT * FROM attendance_source_events WHERE source = 'qr' AND source_event_id = ?", [`1:${attemptId}`]);
    assert.equal(rows.length, 1);
    return rows[0];
  }

  async function receiptCount() {
    const [[row]] = await fixture!.query<any[]>('SELECT COUNT(*) AS total FROM attendance_source_events');
    return Number(row.total);
  }

  async function installInboxTable() {
    const filename = path.resolve(import.meta.dirname, '../../docs/sql/attendance-source-events-2026-11-19/02-create.sql');
    const ddl = (await fs.readFile(filename, 'utf8')).split(/\r?\n/)
      .filter(line => !line.trimStart().startsWith('--')).join('\n').trim();
    const target = '`test`.`attendance_source_events`';
    assert.equal(ddl.split(target).length - 1, 1);
    assert.match(lab!.schema, /^tolanhr_pilot_test_[a-f0-9]{12}$/);
    assert.match(ddl, /^CREATE TABLE `test`\.`attendance_source_events` \(/);
    assert.equal(ddl.split(';').filter(value => value.trim()).length, 1);
    await fixture!.query(ddl.replace(target, `\`${lab!.schema}\`.\`attendance_source_events\``));
  }

  async function ledger() {
    const result: Record<string, unknown> = {};
    for (const table of ['workers', 'attendance_events', 'worker_daily_finance', 'settings', 'biometric_final_event_imports']) {
      const [rows] = await fixture!.query(`SELECT * FROM \`${table}\` ORDER BY id`);
      result[table] = rows;
    }
    return result;
  }
} catch (error) {
  const code = (error as any)?.code;
  const line = /qr-acceptance\.mts:(\d+):\d+/.exec((error as any)?.stack ?? '')?.[1];
  failure = { stage, code: typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,70}$/.test(code) ? code : 'QR_ACCEPTANCE_FAILED',
    ...(line ? { line: Number(line) } : {}) };
} finally {
  mock.timers.reset();
  try { await applicationPool?.end(); await fixture?.end(); cleanup.localConnectionsClosed = true; }
  catch { failure ??= { stage: 'close-qr-local-connections', code: 'QR_ACCEPTANCE_CLEANUP_FAILED' }; }
  try { if (lab) Object.assign(cleanup, await lab.close()); }
  catch { failure ??= { stage: 'stop-owned-qr-mysql', code: 'QR_ACCEPTANCE_CLEANUP_FAILED' }; }
  Object.assign(console, originalConsole);
}

const report = { passed: !failure, completedAtUtc: new Date().toISOString(),
  fixture: 'Real QR attendance callers with synthetic workers on a process-owned random loopback MySQL instance',
  checks, cleanup, ...(failure ? { failure } : {}) };
await fs.writeFile(path.join(import.meta.dirname, 'qr-result.json'), JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify(report) + '\n');
if (failure) process.exitCode = 1;

async function at<T>(instant: string, operation: () => Promise<T>): Promise<T> {
  mock.timers.enable({ apis: ['Date'], now: new Date(instant) });
  try { return await operation(); } finally { mock.timers.reset(); }
}

function attempt(index: number) {
  return `123e4567-e89b-42d3-a456-42661417${index.toString(16).padStart(4, '0')}`;
}

async function rejects(operation: () => Promise<unknown>, code: string) {
  await assert.rejects(operation, (error: any) => error?.code === code);
}
