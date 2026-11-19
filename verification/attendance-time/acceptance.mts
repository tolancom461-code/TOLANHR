import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { mock } from 'node:test';
import { eq } from 'drizzle-orm';
import { startTolanHrMysql, osEnvironmentKeys } from '../tolanhr-pilot-mysql.mjs';

// New dedicated synthetic runner. No dotenv/application startup or external connection is loaded.
const allowedEnvironment = new Set(osEnvironmentKeys.map(key => key.toLowerCase()));
for (const key of Object.keys(process.env)) {
  if (!allowedEnvironment.has(key.toLowerCase())) delete process.env[key];
}
process.env.TZ = 'Asia/Riyadh';
process.env.NODE_ENV = 'test';

const checks: string[] = [];
const cleanup: Record<string, unknown> = {};
let stage = 'start-owned-timezone-mysql';
let failure: { stage: string; code: string; line?: number } | undefined;
let lab: Awaited<ReturnType<typeof startTolanHrMysql>> | undefined;
let fixture: Awaited<ReturnType<Awaited<ReturnType<typeof startTolanHrMysql>>['connect']>> | undefined;
let applicationPool: any;
const originalConsole = { log: console.log, warn: console.warn, error: console.error };
console.log = console.warn = console.error = () => {};

try {
  lab = await startTolanHrMysql();
  fixture = await lab.connect();
  const [[identity]] = await fixture.query<any[]>('SELECT DATABASE() AS db, @@port AS port, @@datadir AS datadir, @@session.time_zone AS zone');
  assert.equal(identity.db, lab.schema);
  assert.equal(Number(identity.port), lab.port);
  assert.equal(path.resolve(identity.datadir), path.resolve(lab.data));
  assert.equal(identity.zone, '+00:00');
  const url = new URL(lab.databaseUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(Number(url.port), lab.port);
  assert.equal(url.pathname, `/${lab.schema}`);
  url.searchParams.delete('timezone');
  assert.equal(url.searchParams.has('timezone'), false);
  process.env.DATABASE_URL = url.toString();
  process.env.ATTENDANCE_SOURCE_QR_ENABLED = 'true';
  process.env.ATTENDANCE_SOURCE_DB_CONFIRMED_NAME = lab.schema;
  process.env.BIOMETRIC_FINAL_EVENTS_IMPORT_FROM_UTC = '2026-11-19T00:00:00Z';
  assert.equal(new Date('2026-11-19T10:00:00Z').getHours(), 13);
  checks.push('Application runs in Asia/Riyadh with a verified owned loopback database and no UTC driver timezone option masking Date conversion');

  stage = 'seed-unchanged-legacy-riyadh-values';
  await fixture.execute("INSERT INTO `groups` (id, code, name, daily_wage, is_flexible_schedule, required_hours, early_leave_penalty_rate) VALUES (1, 'TZ-GROUP', 'Synthetic timezone group', 180, 1, 3, 100)");
  await fixture.execute("INSERT INTO users (id, username, full_name, role) VALUES (1, 'synthetic-time-guard', 'Synthetic time guard', 'guard')");
  await fixture.execute("INSERT INTO workers (id, code, full_name, group_id, qr_token, status, last_attendance_at, biometric_person_code) VALUES (1, 'TZ-W1', 'Synthetic legacy open worker', 1, 'SYNTHETIC-TZ-QR-1', 'active', '2026-11-19 13:00:00', NULL), (2, 'TZ-W2', 'Synthetic historical worker', 1, 'SYNTHETIC-TZ-QR-2', 'active', '2026-11-18 15:00:00', NULL), (3, 'TZ-W3', 'Synthetic manual worker', 1, 'SYNTHETIC-TZ-QR-3', 'active', NULL, NULL), (4, 'TZ-W4', 'Synthetic boundary before', 1, 'SYNTHETIC-TZ-QR-4', 'active', NULL, NULL), (5, 'TZ-W5', 'Synthetic boundary after', 1, 'SYNTHETIC-TZ-QR-5', 'active', NULL, NULL), (6, 'TZ-W6', 'Synthetic imported worker', 1, 'SYNTHETIC-TZ-QR-6', 'active', NULL, 'SYNTHETIC-TZ-PERSON')");
  await fixture.execute("INSERT INTO attendance_events (id, worker_id, event_type, event_time, work_date, method) VALUES (101, 1, 'check_in', '2026-11-19 13:00:00', '2026-11-19', 'qr'), (102, 2, 'check_in', '2026-11-18 13:00:00', '2026-11-18', 'qr'), (103, 2, 'check_out', '2026-11-18 15:00:00', '2026-11-18', 'qr')");
  await fixture.execute("INSERT INTO worker_daily_finance (worker_id, work_date, check_in_time, check_out_time, worked_minutes, financial_minutes, net_amount, notes) VALUES (2, '2026-11-18', '2026-11-18 13:00:00', '2026-11-18 15:00:00', 120, 120, 120.00, 'Synthetic immutable historical finance')");
  await installInboxTable();
  const beforeCodec = await legacySnapshot();
  // A pool must set its own SQL UTC session, regardless of the owned server's default.
  await fixture.query("SET GLOBAL time_zone = '+02:00'");

  stage = 'load-real-application-codecs-and-utc-sql-session';
  const { getDb } = await import('../../server/db/connection.ts');
  const db = await getDb();
  assert.ok(db?.$client);
  applicationPool = db.$client.promise();
  const [[session]] = await applicationPool.query('SELECT DATABASE() AS db, @@port AS port, @@datadir AS datadir, @@session.time_zone AS zone');
  assert.equal(session.db, lab.schema);
  assert.equal(Number(session.port), lab.port);
  assert.equal(path.resolve(session.datadir), path.resolve(lab.data));
  assert.equal(session.zone, '+00:00');
  assert.equal(db.$client.config.connectionConfig.timezone, 'local');
  const { attendanceEvents, workers, workerDailyFinance } = await import('../../drizzle/schema.ts');
  const { attendanceRouter } = await import('../../server/routers/attendance.ts');
  const { getTodayAttendanceWithPagination } = await import('../../server/db/attendance.ts');
  const { importOneBiometricFinalEvent } = await import('../../server/biometric-final-events-importer.ts');
  const { parseAttendanceTime, attendanceTimeInput } = await import('../../shared/attendance-time.ts');
  const caller = attendanceRouter.createCaller({ user: { id: 1, role: 'guard' },
    req: { headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res: {},
  } as any);

  const [legacyOpen] = await db.select().from(attendanceEvents).where(eq(attendanceEvents.id, 101));
  const [legacyWorker] = await db.select().from(workers).where(eq(workers.id, 1));
  const [legacyFinance] = await db.select().from(workerDailyFinance).where(eq(workerDailyFinance.workerId, 2));
  assert.equal(legacyOpen.eventTime, '2026-11-19T13:00:00+03:00');
  assert.equal(parseAttendanceTime(legacyOpen.eventTime).toISOString(), '2026-11-19T10:00:00.000Z');
  assert.equal(legacyWorker.lastAttendanceAt, '2026-11-19T13:00:00+03:00');
  assert.equal(legacyFinance.checkInTime, '2026-11-18T13:00:00+03:00');
  assert.equal(legacyFinance.checkOutTime, '2026-11-18T15:00:00+03:00');
  assert.deepEqual(await legacySnapshot(), beforeCodec);
  checks.push('Four codecs decode legacy wall clocks with +03:00 while old attendance and financial rows remain identical; application SQL sessions pin UTC independently');

  stage = 'legacy-open-lookup-and-three-minute-cooldown';
  const lookup = await at('2026-11-19T10:01:00Z', () => caller.getWorkerFromQR({ qrToken: 'SYNTHETIC-TZ-QR-1' }));
  assert.equal(lookup.nextEventType, 'check_out');
  assert.equal(lookup.lastEvent.eventTime, '2026-11-19T10:00:00.000Z');
  await at('2026-11-19T10:01:00Z', () => assert.rejects(() => caller.confirmAttendance({
    workerId: 1, eventType: 'check_out', sourceAttemptId: attempt(1),
  }), (error: any) => error?.code === 'BAD_REQUEST' && error.message.includes('حركتين متتاليتين')));
  const [[afterCooldown]] = await fixture.query<any[]>('SELECT COUNT(*) AS total FROM attendance_events WHERE worker_id = 1');
  assert.equal(Number(afterCooldown.total), 1);
  assert.deepEqual(await legacySnapshot(), beforeCodec);
  checks.push('A raw legacy 13:00 check-in is found as the open session and still triggers the current three-minute cooldown at Riyadh 13:01');

  stage = 'new-checkout-pairs-with-unchanged-legacy-checkin';
  const checkout = await at('2026-11-19T12:00:00Z', () => caller.confirmAttendance({
    workerId: 1, eventType: 'check_out', sourceAttemptId: attempt(2),
  }));
  assert.equal(checkout.workDate, '2026-11-19');
  const [[storedCheckout]] = await fixture.query<any[]>('SELECT event_time, work_date FROM attendance_events WHERE id = ?', [checkout.eventId]);
  assert.deepEqual(storedCheckout, { event_time: '2026-11-19 15:00:00', work_date: '2026-11-19' });
  const [decodedCheckout] = await db.select().from(attendanceEvents).where(eq(attendanceEvents.id, checkout.eventId));
  assert.equal(decodedCheckout.eventTime, '2026-11-19T15:00:00+03:00');
  const [[source]] = await fixture.query<any[]>("SELECT DATE_FORMAT(event_time_utc, '%Y-%m-%dT%H:%i:%s.%fZ') AS source_time_iso FROM attendance_source_events WHERE source = 'qr' AND source_event_id = ?", [`1:${attempt(2)}`]);
  assert.equal(source.source_time_iso, '2026-11-19T12:00:00.000000Z');
  assert.equal(parseAttendanceTime(decodedCheckout.eventTime).getTime(), new Date(source.source_time_iso).getTime());
  const [[finance]] = await fixture.query<any[]>('SELECT check_in_time, check_out_time, worked_minutes, net_amount FROM worker_daily_finance WHERE worker_id = 1');
  assert.deepEqual(finance, { check_in_time: '2026-11-19 13:00:00', check_out_time: '2026-11-19 15:00:00', worked_minutes: 120, net_amount: '120.00' });
  const [lastWorker] = await db.select().from(workers).where(eq(workers.id, 1));
  assert.equal(lastWorker.lastAttendanceAt, '2026-11-19T15:00:00+03:00');
  assert.deepEqual(await legacySnapshot(), beforeCodec);
  checks.push('Actual QR legacy 13:00 plus new 15:00 gives 120 minutes/net120.00; raw Riyadh attendance and UTC source refer to the same instant');

  stage = 'qr-lookup-and-paginated-report-match';
  const afterLookup = await at('2026-11-19T12:01:00Z', () => caller.getWorkerFromQR({ qrToken: 'SYNTHETIC-TZ-QR-1' }));
  assert.equal(afterLookup.nextEventType, 'check_in');
  assert.equal(afterLookup.lastEvent.eventTime, '2026-11-19T12:00:00.000Z');
  const report = await getTodayAttendanceWithPagination(undefined, '2026-11-19', 1, 20);
  const reportWorker = report.data.find((row: any) => row.workerId === 1);
  assert.ok(reportWorker);
  assert.equal(attendanceTimeInput(reportWorker.checkInTime), '13:00');
  assert.equal(attendanceTimeInput(reportWorker.checkOutTime), '15:00');
  checks.push('Actual QR lookup ISO values and day-report values agree on Riyadh13:00/15:00 and the same administrative day');

  stage = 'manual-insert-and-edit-roundtrip-with-current-column';
  const manualInsert = await db.insert(attendanceEvents).values({ workerId: 3, eventType: 'check_in',
    eventTime: new Date('2026-11-19T13:10:00Z') as any, workDate: '2026-11-19', method: 'manual' });
  const manualId = Number((manualInsert as any)[0].insertId);
  const [[manualBeforeEdit]] = await fixture.query<any[]>('SELECT event_time FROM attendance_events WHERE id = ?', [manualId]);
  assert.equal(manualBeforeEdit.event_time, '2026-11-19 16:10:00');
  await db.update(attendanceEvents).set({ eventTime: '2026-11-19T17:45:00+03:00' }).where(eq(attendanceEvents.id, manualId));
  const [[manualAfterEdit]] = await fixture.query<any[]>('SELECT event_time FROM attendance_events WHERE id = ?', [manualId]);
  assert.equal(manualAfterEdit.event_time, '2026-11-19 17:45:00');
  const [manualDecoded] = await db.select().from(attendanceEvents).where(eq(attendanceEvents.id, manualId));
  assert.equal(manualDecoded.eventTime, '2026-11-19T17:45:00+03:00');
  assert.deepEqual(await legacySnapshot(), beforeCodec);
  checks.push('Date-based manual insert and ISO-offset edit roundtrip through the actual column codec without changing the seeded historical rows');

  stage = 'administrative-day-boundary-0440';
  const beforeBoundary = await at('2026-11-19T01:39:59Z', () => caller.confirmAttendance({
    workerId: 4, eventType: 'check_in', sourceAttemptId: attempt(4),
  }));
  const atBoundary = await at('2026-11-19T01:40:00Z', () => caller.confirmAttendance({
    workerId: 5, eventType: 'check_in', sourceAttemptId: attempt(5),
  }));
  assert.equal(beforeBoundary.workDate, '2026-11-18');
  assert.equal(atBoundary.workDate, '2026-11-19');
  const [boundaryRows] = await fixture.query<any[]>('SELECT worker_id, event_time, work_date FROM attendance_events WHERE worker_id IN (4,5) ORDER BY worker_id');
  assert.deepEqual(boundaryRows, [{ worker_id: 4, event_time: '2026-11-19 04:39:59', work_date: '2026-11-18' },
    { worker_id: 5, event_time: '2026-11-19 04:40:00', work_date: '2026-11-19' }]);
  checks.push('Actual QR keeps Riyadh04:39:59 on the prior administrative day and Riyadh04:40:00 on the current day');

  stage = 'final-event-utc-keeps-legacy-attendance-encoding';
  const importedId = '123e4567-e89b-42d3-a456-4266141740ab';
  const imported = await importOneBiometricFinalEvent({ eventId: importedId, personCode: 'SYNTHETIC-TZ-PERSON',
    eventType: 'check_in', eventTimeUtc: '2026-11-20T10:00:00Z', eventTimeLocal: '2026-11-20T13:00:00',
    eventTimezone: 'Asia/Riyadh', verificationMethod: 'fingerprint', finalizationVersion: 'v1' });
  assert.equal(imported.status, 'processed');
  const [[importedAttendance]] = await fixture.query<any[]>('SELECT event_time, work_date FROM attendance_events WHERE id = ?', [imported.attendanceEventId]);
  assert.deepEqual(importedAttendance, { event_time: '2026-11-20 13:00:00', work_date: '2026-11-20' });
  const [[importedAudit]] = await fixture.query<any[]>('SELECT event_time_utc FROM biometric_final_event_imports WHERE event_uuid = ?', [importedId]);
  assert.equal(importedAudit.event_time_utc, '2026-11-20 10:00:00.000000');
  assert.deepEqual(await legacySnapshot(), beforeCodec);
  checks.push('The existing final-event importer stores UTC10:00 as legacy Riyadh13:00 attendance and retains UTC10:00 in its source audit');

  async function installInboxTable() {
    const ddlFile = path.resolve(import.meta.dirname, '../../docs/sql/attendance-source-events-2026-11-19/02-create.sql');
    const ddl = (await fs.readFile(ddlFile, 'utf8')).split(/\r?\n/)
      .filter(line => !line.trimStart().startsWith('--')).join('\n').trim();
    const target = '`test`.`attendance_source_events`';
    assert.equal(ddl.split(target).length - 1, 1);
    assert.match(lab!.schema, /^tolanhr_pilot_test_[a-f0-9]{12}$/);
    assert.match(ddl, /^CREATE TABLE `test`\.`attendance_source_events` \(/);
    assert.equal(ddl.split(';').filter(part => part.trim()).length, 1);
    await fixture!.query(ddl.replace(target, `\`${lab!.schema}\`.\`attendance_source_events\``));
  }

  async function legacySnapshot() {
    const [events] = await fixture!.query('SELECT * FROM attendance_events WHERE id IN (101,102,103) ORDER BY id');
    const [finance] = await fixture!.query('SELECT * FROM worker_daily_finance WHERE worker_id = 2 ORDER BY id');
    return { events, finance };
  }
} catch (error) {
  const code = (error as any)?.code;
  const line = /attendance-time[\\/]acceptance\.mts:(\d+):\d+/.exec((error as any)?.stack ?? '')?.[1];
  failure = { stage, code: typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,70}$/.test(code) ? code : 'ATTENDANCE_TIME_ACCEPTANCE_FAILED',
    ...(line ? { line: Number(line) } : {}) };
} finally {
  mock.timers.reset();
  try { await applicationPool?.end(); await fixture?.end(); cleanup.localConnectionsClosed = true; }
  catch { failure ??= { stage: 'close-time-local-connections', code: 'ATTENDANCE_TIME_CLEANUP_FAILED' }; }
  try { if (lab) Object.assign(cleanup, await lab.close()); }
  catch { failure ??= { stage: 'stop-owned-time-mysql', code: 'ATTENDANCE_TIME_CLEANUP_FAILED' }; }
  Object.assign(console, originalConsole);
}

const result = { passed: !failure, completedAtUtc: new Date().toISOString(),
  fixture: 'Synthetic legacy Riyadh wall-clock TIMESTAMP rows on owned loopback MySQL; Asia/Riyadh application runtime with local driver Date timezone',
  storageContract: 'Preserve Riyadh physical attendance wall clocks; source and import audit DATETIME UTC fields remain UTC',
  checks, cleanup, ...(failure ? { failure } : {}) };
await fs.writeFile(path.join(import.meta.dirname, 'result.json'), JSON.stringify(result, null, 2) + '\n');
process.stdout.write(JSON.stringify(result) + '\n');
if (failure) process.exitCode = 1;

function attempt(index: number) { return `123e4567-e89b-42d3-a456-42661417${index.toString(16).padStart(4, '0')}`; }

async function at<T>(instant: string, operation: () => Promise<T>): Promise<T> {
  mock.timers.enable({ apis: ['Date'], now: new Date(instant) });
  try { return await operation(); } finally { mock.timers.reset(); }
}
