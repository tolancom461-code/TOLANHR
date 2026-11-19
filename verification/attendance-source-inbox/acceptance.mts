import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { startTolanHrMysql, osEnvironmentKeys } from '../tolanhr-pilot-mysql.mjs';
import type { CaptureSourceEvent } from '../../server/attendance-source-inbox/types.ts';

// Dedicated synthetic process. No application bootstrap, environment file, or live URL is loaded.
const allowedEnvironment = new Set(osEnvironmentKeys.map(key => key.toLowerCase()));
for (const key of Object.keys(process.env)) {
  if (!allowedEnvironment.has(key.toLowerCase())) delete process.env[key];
}
process.env.TZ = 'UTC';
process.env.NODE_ENV = 'test';

const checks: string[] = [];
let stage = 'start-owned-mysql';
let lab: Awaited<ReturnType<typeof startTolanHrMysql>> | undefined;
let fixture: mysql.Connection | undefined;
let pool: mysql.Pool | undefined;
let failure: { stage: string; code: string; line?: number } | undefined;
const cleanup: Record<string, unknown> = {};

try {
  lab = await startTolanHrMysql();
  fixture = await lab.connect();
  const [[identity]] = await fixture.query<any[]>('SELECT DATABASE() AS db, @@port AS port, @@datadir AS datadir');
  assert.equal(identity.db, lab.schema);
  assert.equal(Number(identity.port), lab.port);
  assert.equal(path.resolve(identity.datadir), path.resolve(lab.data));
  const url = new URL(lab.databaseUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(Number(url.port), lab.port);
  assert.equal(url.pathname, `/${lab.schema}`);
  pool = mysql.createPool({ host: '127.0.0.1', port: lab.port, database: lab.schema,
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    dateStrings: true, supportBigNumbers: true, bigNumberStrings: true, timezone: 'Z',
    connectionLimit: 5, multipleStatements: false, flags: '-LOCAL_FILES' });
  // The stored UTC values must also be correct when the driver's session is not UTC.
  pool.on('connection', connection => { connection.query("SET SESSION time_zone = '+03:00'"); });
  const { createAttendanceSourceInbox } = await import('../../server/attendance-source-inbox/service.ts');
  const { createMysqlAttendanceSourceInboxStore } = await import('../../server/attendance-source-inbox/mysql-store.ts');
  const inbox = createAttendanceSourceInbox(createMysqlAttendanceSourceInboxStore(pool, lab.schema));
  checks.push('Owned random loopback port, datadir and schema verified before using an explicit local pool');

  stage = 'seed-existing-attendance-ledger';
  await fixture.execute("INSERT INTO workers (id, code, full_name, status, last_attendance_at) VALUES (1, 'INBOX-W1', 'Synthetic inbox worker', 'active', '2026-11-18 08:00:00'), (2, 'INBOX-W2', 'Synthetic other worker', 'active', NULL)");
  await fixture.execute("INSERT INTO attendance_events (id, worker_id, event_type, event_time, work_date, method) VALUES (1, 1, 'check_in', '2026-11-18 08:00:00', '2026-11-18', 'qr'), (2, 1, 'check_out', '2026-11-18 09:00:00', '2026-11-18', 'qr'), (3, 2, 'check_in', '2026-11-18 08:00:00', '2026-11-18', 'manual')");
  await fixture.execute("INSERT INTO worker_daily_finance (worker_id, work_date, worked_minutes, net_amount, notes) VALUES (1, '2026-11-18', 60, 25.00, 'Synthetic preserved finance')");
  const baseline = await ledger();

  stage = 'reject-missing-migration-and-wrong-database';
  await rejects(() => inbox.assertReady(), 'INBOX_SCHEMA_NOT_READY');
  await rejects(() => inbox.capture(input('missing-table')), 'INBOX_SCHEMA_NOT_READY');
  const wrong = createAttendanceSourceInbox(createMysqlAttendanceSourceInboxStore(pool, 'different_expected_schema'));
  await rejects(() => wrong.assertReady(), 'INBOX_DATABASE_MISMATCH');
  assert.deepEqual(await ledger(), baseline);
  checks.push('Missing migration and wrong expected database reject without changing the existing ledger');

  stage = 'apply-reviewed-ddl-only-to-owned-schema';
  const ddlPath = path.resolve(import.meta.dirname, '../../docs/sql/attendance-source-events-2026-11-19/02-create.sql');
  const ddl = (await fs.readFile(ddlPath, 'utf8')).split(/\r?\n/)
    .filter(line => !line.trimStart().startsWith('--')).join('\n').trim();
  const target = '`test`.`attendance_source_events`';
  assert.equal(ddl.split(target).length - 1, 1);
  assert.match(lab.schema, /^tolanhr_pilot_test_[a-f0-9]{12}$/);
  assert.match(ddl, /^CREATE TABLE `test`\.`attendance_source_events` \(/);
  assert.equal(ddl.split(';').filter(value => value.trim()).length, 1);
  await fixture.query(ddl.replace(target, `\`${lab.schema}\`.\`attendance_source_events\``));
  await inbox.assertReady();
  checks.push('Reviewed CREATE TABLE applied by replacing only the exact qualified target with the owned synthetic schema');

  stage = 'reject-altered-receipt-schema';
  const schemaChanges = [
    ['nontransactional-engine', 'ALTER TABLE attendance_source_events ENGINE=MyISAM',
      'ALTER TABLE attendance_source_events ENGINE=InnoDB'],
    ['invented-attendance-reference', 'ALTER TABLE attendance_source_events ALTER COLUMN attendance_event_id SET DEFAULT 1',
      'ALTER TABLE attendance_source_events ALTER COLUMN attendance_event_id DROP DEFAULT'],
    ['invented-processing-time', 'ALTER TABLE attendance_source_events MODIFY COLUMN processed_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6)',
      'ALTER TABLE attendance_source_events MODIFY COLUMN processed_at DATETIME(6) NULL DEFAULT NULL'],
    ['extra-index', 'CREATE INDEX unexpected_guard_index ON attendance_source_events (id)',
      'DROP INDEX unexpected_guard_index ON attendance_source_events'],
  ];
  for (const [name, alter, restore] of schemaChanges) {
    stage = `reject-altered-receipt-schema-${name}`;
    await fixture.query(alter);
    try {
      await rejects(() => inbox.assertReady(), 'INBOX_SCHEMA_NOT_READY');
      await rejects(() => inbox.capture(input(`schema-guard-${name}`)), 'INBOX_SCHEMA_NOT_READY');
      const [[receiptCount]] = await fixture.query<any[]>('SELECT COUNT(*) AS total FROM attendance_source_events');
      assert.equal(Number(receiptCount.total), 0);
      assert.deepEqual(await ledger(), baseline);
    } finally {
      await fixture.query(restore);
    }
    await inbox.assertReady();
  }
  checks.push('MyISAM, manufactured outcome defaults and extra indexes reject before capture; exact schema restored after every local tamper');

  stage = 'capture-six-movements-without-processing';
  const captures = [];
  const canonical = ['check_in', 'check_out', 'break_out', 'break_in', 'overtime_in', 'overtime_out'];
  const beforeCapture = Date.now();
  for (let code = 0; code <= 5; code++) {
    const captured = await inbox.capture({ ...input(`all-six-${code}`), eventType: code, rawState: String(code) });
    assert.equal(captured.replayed, false);
    assert.equal(captured.event.eventType, canonical[code]);
    assert.equal(captured.event.rawState, String(code));
    assert.equal(captured.event.eventTimeUtc, '2026-11-19T01:40:00.123456Z');
    assert.equal(captured.event.sourceDeviceUserId, '00017');
    assert.equal(captured.event.status, code <= 1 ? 'pending' : 'review_only');
    const received = Date.parse(captured.event.receivedAtUtc);
    assert.ok(received >= beforeCapture - 2000 && received <= Date.now() + 2000);
    captures.push(captured.event);
    const eligible = await inbox.getEligibleForExistingWorkflow(captured.event.id);
    assert.equal(Boolean(eligible), code <= 1);
  }
  assert.deepEqual(await ledger(), baseline);
  checks.push('All six states retained with exact UTC microseconds and device identity; only in/out eligible and no attendance or finance effects');

  stage = 'verify-unmapped-and-list-reads';
  const unmapped = await inbox.capture({ ...input('unmapped-person'), workerId: null, sourcePersonCode: 'SYNTHETIC-UNKNOWN' });
  assert.equal(unmapped.event.status, 'unmapped');
  assert.equal(await inbox.getEligibleForExistingWorkflow(unmapped.event.id), null);
  const auxiliary = await inbox.list({ workerId: 1, status: 'review_only', limit: 200 });
  assert.deepEqual(auxiliary.map(row => row.eventType).sort(), canonical.slice(2).sort());
  assert.deepEqual(await inbox.get(captures[0].id), captures[0]);
  checks.push('Unmapped receipts and four review-only states remain queryable without automatic processing');

  stage = 'verify-technical-replay-and-payload-conflict';
  const replay = await inbox.capture({ ...input('all-six-0'), eventType: 0, rawState: '0' });
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.event, captures[0]);
  await rejects(() => inbox.capture({ ...input('all-six-0'), eventTimeUtc: '2026-11-19T01:40:01.123456Z' }), 'INBOX_SOURCE_EVENT_CONFLICT');
  const independent = await inbox.capture({ ...input('all-six-0'), source: 'qr' });
  assert.equal(independent.replayed, false);
  assert.notEqual(independent.event.id, captures[0].id);
  checks.push('Same source/key replays immutably, changed payload conflicts, and QR has its own technical source namespace');

  stage = 'retain-distinct-close-timestamps';
  const distinct = [];
  for (let second = 0; second < 10; second++) {
    distinct.push(await inbox.capture({ ...input(`same-type-${second}`),
      eventTimeUtc: `2026-11-19T01:40:${String(second).padStart(2, '0')}Z` }));
  }
  assert.equal(new Set(distinct.map(value => value.event.id)).size, 10);
  assert.ok(distinct.every(value => !value.replayed && value.event.status === 'pending'));
  checks.push('Ten distinct same-worker/same-type receipts one second apart remain separate pending receipts');

  stage = 'concurrent-identical-source-receipts';
  const simultaneous = await Promise.all(Array.from({ length: 12 }, () => inbox.capture(input('concurrent-replay'))));
  assert.equal(new Set(simultaneous.map(value => value.event.id)).size, 1);
  assert.equal(simultaneous.filter(value => !value.replayed).length, 1);
  const [duplicates] = await fixture.query<any[]>("SELECT COUNT(*) AS total FROM attendance_source_events WHERE source = 'biometric' AND source_event_id = 'concurrent-replay'");
  assert.equal(Number(duplicates[0].total), 1);
  checks.push('Twelve concurrent same-source arrivals produce one immutable receipt with eleven replays');

  stage = 'acknowledge-only-an-existing-workflow-result';
  const accepted = await inbox.recordExistingWorkflowOutcome({ id: captures[0].id, status: 'accepted', attendanceEventId: 1 });
  assert.equal(accepted.attendanceEventId, 1);
  assert.equal(accepted.status, 'accepted');
  assert.ok(accepted.processedAtUtc);
  assert.deepEqual(await inbox.recordExistingWorkflowOutcome({ id: captures[0].id, status: 'accepted', attendanceEventId: 1 }), accepted);
  await rejects(() => inbox.recordExistingWorkflowOutcome({ id: captures[0].id, status: 'rejected', decisionCode: 'CHANGED_OUTCOME' }), 'INBOX_OUTCOME_CONFLICT');
  for (const captured of captures.slice(2)) {
    await rejects(() => inbox.recordExistingWorkflowOutcome({ id: captured.id, status: 'accepted', attendanceEventId: 1 }), 'INBOX_EVENT_NOT_ELIGIBLE');
  }
  const another = await inbox.capture(input('existing-workflow-review'));
  await rejects(() => inbox.recordExistingWorkflowOutcome({ id: another.event.id, status: 'accepted', attendanceEventId: 2 }), 'INBOX_ATTENDANCE_REFERENCE_MISMATCH');
  await rejects(() => inbox.recordExistingWorkflowOutcome({ id: another.event.id, status: 'accepted', attendanceEventId: 3 }), 'INBOX_ATTENDANCE_REFERENCE_MISMATCH');
  const rejected = await inbox.recordExistingWorkflowOutcome({ id: another.event.id, status: 'rejected', decisionCode: 'EXISTING_WORKFLOW_RULE' });
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.attendanceEventId, null);
  assert.deepEqual(await ledger(), baseline);
  checks.push('Outcome acknowledgement verifies an existing attendance reference, preserves auxiliary eligibility, and leaves the entire prior ledger unchanged');

  async function ledger() {
    const contents: Record<string, unknown> = {};
    for (const table of ['workers', 'attendance_events', 'worker_daily_finance', 'settings', 'biometric_final_event_imports']) {
      const [rows] = await fixture!.query(`SELECT * FROM \`${table}\` ORDER BY id`);
      contents[table] = rows;
    }
    return contents;
  }
} catch (error) {
  const code = (error as any)?.code;
  const line = /acceptance\.mts:(\d+):\d+/.exec((error as any)?.stack ?? '')?.[1];
  failure = { stage, code: typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,70}$/.test(code) ? code : 'INBOX_ACCEPTANCE_FAILED',
    ...(line ? { line: Number(line) } : {}) };
} finally {
  try { await pool?.end(); await fixture?.end(); cleanup.localConnectionsClosed = true; }
  catch { failure ??= { stage: 'close-local-connections', code: 'INBOX_ACCEPTANCE_CLEANUP_FAILED' }; }
  try { if (lab) Object.assign(cleanup, await lab.close()); }
  catch { failure ??= { stage: 'stop-owned-mysql', code: 'INBOX_ACCEPTANCE_CLEANUP_FAILED' }; }
}

const report = { passed: !failure, completedAtUtc: new Date().toISOString(),
  fixture: 'Synthetic records on a process-owned random loopback MySQL instance; no application bootstrap or live database',
  checks, cleanup, ...(failure ? { failure } : {}) };
await fs.writeFile(path.join(import.meta.dirname, 'result.json'), JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify(report) + '\n');
if (failure) process.exitCode = 1;

function input(sourceEventId: string): CaptureSourceEvent {
  return { source: 'biometric', sourceEventId, eventType: 'check_in', rawState: '0', workerId: 1,
    eventTimeUtc: '2026-11-19T01:40:00.123456Z', sourcePersonCode: 'SYNTHETIC-PERSON',
    sourceDeviceId: 'SYNTHETIC-DEVICE', sourceDeviceUserId: '00017', sourceIdentityId: 'SYNTHETIC-IDENTITY' };
}

async function rejects(operation: () => Promise<unknown>, code: string) {
  await assert.rejects(operation, (error: any) => error?.code === code);
}
