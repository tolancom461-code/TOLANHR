import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import mysql from 'mysql2/promise';
import { startTolanHrMysql, osEnvironmentKeys } from '../tolanhr-pilot-mysql.mjs';
import type { CaptureSourceEvent, InboxStatus, MovementType } from '../../server/attendance-source-inbox/types';

const allowedEnvironment = new Set(osEnvironmentKeys.map(key => key.toLowerCase()));
for (const key of Object.keys(process.env)) if (!allowedEnvironment.has(key.toLowerCase())) delete process.env[key];
process.env.NODE_ENV = 'test';
process.env.TZ = 'Asia/Riyadh';

const streamId = '123e4567-e89b-42d3-a456-426614174097';
const activationUtc = '2026-11-25T00:00:00.000000Z';
const oldLink = uuid(901);
const checks: string[] = [];
const cleanup: Record<string, unknown> = {};
const collationProfiles: Array<Record<string, unknown>> = [];
let stage = 'start-owned-review-mysql';
let failure: { stage: string; code: string; line?: number } | undefined;
let lab: Awaited<ReturnType<typeof startTolanHrMysql>> | undefined;
let fixture: mysql.Connection | undefined;
let pool: mysql.Pool | undefined;
let binaryPool: mysql.Pool | undefined;
let previewServer: http.Server | undefined;
let sourceCount = 0;
const originalConsole = { log: console.log, warn: console.warn, error: console.error };
console.log = console.warn = console.error = () => {};

try {
  lab = await startTolanHrMysql();
  fixture = await lab.connect();
  const [[identity]] = await fixture.query<any[]>('SELECT DATABASE() AS db,@@port AS port,@@datadir AS datadir');
  assert.equal(identity.db, lab.schema);
  assert.equal(Number(identity.port), lab.port);
  assert.equal(path.resolve(identity.datadir), path.resolve(lab.data));
  assert.match(lab.schema, /^tolanhr_pilot_test_[a-f0-9]{12}$/);
  const url = new URL(lab.databaseUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(Number(url.port), lab.port);
  const poolOptions = { host: '127.0.0.1', port: lab.port, database: lab.schema,
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    dateStrings: true, supportBigNumbers: true, bigNumberStrings: true, timezone: 'Z',
    connectionLimit: 3, multipleStatements: false, flags: '-LOCAL_FILES' };
  pool = mysql.createPool({ ...poolOptions, charset: 'UTF8MB4_UNICODE_CI' });
  binaryPool = mysql.createPool({ ...poolOptions, charset: 'UTF8MB4_BIN' });
  checks.push('Process-owned random loopback MySQL server, schema and data directory verified before fixture DDL; no env file or application startup');

  stage = 'seed-reviewed-schema-and-history';
  await installCreate('../../docs/sql/attendance-source-events-2026-11-19/02-create.sql', 'test', 'attendance_source_events');
  await installCreate('../../docs/sql/attendance-biometric-directory-2026-11-19.test.sql', 'test', 'attendance_biometric_users');
  await installCreate('../../docs/sql/attendance-biometric-directory-2026-11-19.test.sql', 'test', 'attendance_biometric_worker_links');
  await installCreate('../../docs/sql/attendance-source-promotion-state-2026-11-25.TESTCOPY2.sql', 'TESTCOPY2', 'attendance_source_promotion_state');
  for (const table of ['workers','groups','attendance_events']) {
    await fixture.query(`ALTER TABLE \`${table}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  }
  const [collations] = await fixture.execute<any[]>(`SELECT TABLE_NAME,COLUMN_NAME,COLLATION_NAME
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND
    ((TABLE_NAME='workers' AND COLUMN_NAME='full_name') OR (TABLE_NAME='attendance_events' AND COLUMN_NAME='method')
      OR (TABLE_NAME='attendance_source_events' AND COLUMN_NAME IN ('id','source_device_user_id'))
      OR (TABLE_NAME='attendance_biometric_worker_links' AND COLUMN_NAME='id'))`, [lab.schema]);
  const columnCollation = (table: string, column: string) => collations.find(row => row.TABLE_NAME===table && row.COLUMN_NAME===column)?.COLLATION_NAME;
  assert.equal(columnCollation('workers','full_name'), 'utf8mb4_unicode_ci');
  assert.equal(columnCollation('attendance_events','method'), 'utf8mb4_unicode_ci');
  assert.equal(columnCollation('attendance_source_events','id'), 'ascii_bin');
  assert.equal(columnCollation('attendance_biometric_worker_links','id'), 'ascii_bin');
  assert.equal(columnCollation('attendance_source_events','source_device_user_id'), 'utf8mb4_bin');
  for (const [name, candidate, expected] of [['unicode_ci',pool,'utf8mb4_unicode_ci'],['bin',binaryPool,'utf8mb4_bin']] as const) {
    const connection = await candidate.getConnection();
    try {
      const [[profile]] = await connection.execute<any[]>(`SELECT @@collation_connection AS connection_collation,
        COLLATION(?) AS bound_value_collation,COLLATION(JSON_UNQUOTE(JSON_EXTRACT(?,'$.l'))) AS json_uuid_collation`,
      [streamId,JSON.stringify({l:oldLink})]);
      assert.equal(profile.connection_collation, expected);
      assert.equal(profile.bound_value_collation, expected);
      collationProfiles.push({ name, ...profile });
    } finally { connection.release(); }
  }
  checks.push('Explicit unicode_ci and binary connection profiles are verified against mixed legacy unicode_ci text, new ASCII binary UUIDs and UTF-8 binary identity/PIN columns; JSON collation is recorded rather than assumed to match TiDB');
  await fixture.execute("INSERT INTO `groups` (id,code,name,is_active) VALUES (1,'REVIEW-OLD','Synthetic Old Group',1),(2,'REVIEW-CURRENT','Synthetic Current Group',1),(3,'REVIEW-INACTIVE','Synthetic Inactive Group',0)");
  await fixture.execute(`INSERT INTO workers (id,code,full_name,group_id,status) VALUES
    (1,'S-W1','Synthetic Current Alpha',2,'active'),(2,'S-W2','Synthetic Current Beta',1,'active'),
    (3,'S-W3','Synthetic Current Gamma',2,'active'),(4,'S-W4','Synthetic Deleted Worker',3,'active')`);
  await fixture.execute(`INSERT INTO attendance_source_promotion_state (id,stream_id,started_at_utc,activated_by)
    VALUES ('primary',?,?,NULL)`, [streamId, sql(activationUtc)]);
  await directory('700', '00017', 'historical', 'Synthetic Current Old Identity');
  await directory('701', '00017', 'current', 'Synthetic New PIN Registration');
  await directory('702', '00077', 'historical', 'Synthetic Deleted Identity');
  await link(901, 1, '700', '00017', 'revoked', 'Synthetic Frozen Alpha', 'Synthetic Frozen Directory Name', 'Synthetic Old Device');
  await link(902, 2, '700', '00017', 'active', 'Synthetic Current Beta', 'Synthetic Rebound Directory Name', 'Synthetic Current Device');
  await link(903, 3, '701', '00017', 'active', 'Synthetic Current Gamma', 'Synthetic New PIN Registration', 'Synthetic Current Device');
  await link(904, 4, '702', '00077', 'revoked', 'Synthetic Deleted Worker', 'Synthetic Deleted Identity', 'Synthetic Historical Device');
  await fixture.execute(`INSERT INTO attendance_events (id,worker_id,event_type,event_time,work_date,method) VALUES
    (101,1,'check_in','2026-11-25 14:26:30','2026-11-25','qr'),
    (102,1,'check_out','2026-11-25 15:22:16','2026-11-25','biometric'),
    (103,2,'check_out','2026-11-25 15:30:00','2026-11-25','biometric'),
    (104,4,'check_in','2026-11-25 12:00:00','2026-11-25','biometric'),
    (105,1,'check_out','2026-11-25 15:40:00','2026-11-25','biometric')`);
  await fixture.execute("INSERT INTO worker_daily_finance (worker_id,work_date,worked_minutes,financial_minutes,net_amount,notes) VALUES (1,'2026-11-25',0,0,0,'Synthetic review must not recalculate')");
  await fixture.execute("INSERT INTO settings (`key`,value,description) VALUES ('review_preserved_setting','unchanged','Synthetic unrelated setting')");
  await fixture.execute('DELETE FROM attendance_events WHERE id=105');
  await fixture.execute('DELETE FROM workers WHERE id=4');

  const { prepareSourceEvent } = await import('../../server/attendance-source-inbox/validation.ts');
  const source = async (number: number, overrides: Partial<CaptureSourceEvent> & {
    status?: InboxStatus; attendanceId?: number | null; decisionCode?: string | null; note?: string | null; received?: string;
  } = {}) => {
    const { status = 'unmapped', attendanceId = null, decisionCode = null, note = cohort(),
      received = '2026-11-25T14:00:00.000000Z', ...payload } = overrides;
    const prepared = prepareSourceEvent({ source: 'biometric', sourceEventId: `bio:${String(number).padStart(64, '0')}`,
      eventType: 'check_out', rawState: '1', eventTimeUtc: '2026-11-25T12:00:00.000000Z',
      workerId: null, sourceDeviceId: '9001', sourceDeviceUserId: '00017', sourceIdentityId: '700', ...payload }, () => uuid(number));
    await fixture!.execute(`INSERT INTO attendance_source_events
      (id,source,source_event_id,content_sha256,worker_id,source_person_code,source_device_id,source_device_user_id,
       source_identity_id,source_user_name,event_type,raw_state,event_time_utc,received_at,status,attendance_event_id,
       decision_code,decision_note,processed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [prepared.id,prepared.source,prepared.sourceEventId,prepared.contentSha256,prepared.workerId,prepared.sourcePersonCode,
      prepared.sourceDeviceId,prepared.sourceDeviceUserId,prepared.sourceIdentityId,prepared.sourceUserName,prepared.eventType,
      prepared.rawState,sql(prepared.eventTimeUtc),sql(received),status,attendanceId,decisionCode,note,
      ['accepted','rejected','manual_review'].includes(status) ? '2026-11-25 14:01:00.000000' : null]);
    sourceCount++;
  };
  const qr = { source: 'qr' as const, workerId: 1, sourceDeviceId: null, sourceDeviceUserId: null,
    sourceIdentityId: null, rawState: null, sourceUserName: 'محمد التجريبي "QR" \\ 😀' };
  await source(1, { ...qr, eventType: 'check_in', eventTimeUtc: '2026-11-25T11:26:30.000000Z', status: 'accepted', attendanceId: 101, decisionCode: 'SOURCE_ACCEPTED', note: journal(1, null, 101) });
  await source(2, { eventTimeUtc: '2026-11-25T12:22:16.000000Z', status: 'accepted', attendanceId: 102, decisionCode: 'SOURCE_ACCEPTED', note: journal(1, oldLink, 101) });
  await source(3, { ...qr, eventTimeUtc: '2026-11-25T12:30:00.000000Z', status: 'rejected', decisionCode: 'SOURCE_FIRST_ARRIVAL', note: journal(1, null, 102) });
  await source(4, { sourceIdentityId: null });
  await source(5, { sourceIdentityId: '701', eventTimeUtc: '2026-11-24T20:00:00.000000Z', note: null });
  await source(6, { sourceIdentityId: '701', note: null });
  await source(7, { sourceIdentityId: '701' });
  await source(8, { status: 'accepted', attendanceId: 105, decisionCode: 'SOURCE_ACCEPTED', note: journal(1, oldLink, 101) });
  await source(9, { status: 'accepted', attendanceId: 103, decisionCode: 'SOURCE_ACCEPTED', note: journal(1, oldLink, 101) });
  await source(10, { ...qr, status: 'rejected', decisionCode: 'SOURCE_FIRST_ARRIVAL', note: journal(1, null, 103) });
  await source(11, { ...qr, status: 'rejected', decisionCode: 'QR_COOLDOWN', note: journal(1, null, 101) });
  await source(12, { status: 'manual_review', decisionCode: 'SOURCE_TIME_FUTURE', note: journal(1, oldLink, 101) });
  await source(13, { status: 'manual_review', decisionCode: 'SOURCE_WORKER_INACTIVE', note: journal(1, oldLink, 101) });
  await source(14, { status: 'manual_review', decisionCode: 'SOURCE_PERIOD_LOCKED', note: journal(1, oldLink, 101) });
  await source(15, { ...qr, status: 'pending' });
  await source(16, { sourceIdentityId: 'unknown', sourceUserName: 'Synthetic Unmapped Identity' });
  for (const [index, type] of ['break_out','break_in','overtime_in','overtime_out'].entries()) {
    await source(17 + index, { eventType: type as MovementType, rawState: String(index + 2), sourceIdentityId: '701', status: 'review_only' });
  }
  await source(21, { sourceIdentityId: 'unknown', eventTimeUtc: '2026-11-24T20:59:59.999999Z' });
  await source(22, { sourceIdentityId: 'unknown', eventTimeUtc: '2026-11-24T21:00:00.000000Z', received: '2026-11-26T00:05:00.000000Z' });
  await source(23, { sourceIdentityId: 'unknown', eventTimeUtc: '2026-11-25T21:00:00.000000Z' });
  await source(24, { sourceIdentityId: 'unknown', eventTimeUtc: '2026-11-25T20:59:59.999999Z' });
  await source(25, { sourceIdentityId: 'unknown', sourceDeviceUserId: 'PIN-50%_17', sourceUserName: 'Synthetic 50%_DiScOuNt! Alpha عربي 😀' });
  await source(26);
  await source(27, { sourceIdentityId: '702', sourceDeviceUserId: '00077', eventType: 'check_in', rawState: '0',
    eventTimeUtc: '2026-11-25T09:00:00.000000Z', status: 'accepted', attendanceId: 104,
    decisionCode: 'SOURCE_ACCEPTED', note: journal(4, uuid(904), 104) });
  for (let number = 100; number < 160; number++) await source(number, { ...qr, workerId: 2,
    sourceUserName: 'Synthetic Bulk Beta', eventType: 'check_in', eventTimeUtc: '2026-11-25T13:00:00.000000Z', status: 'pending' });
  assert.equal(sourceCount, 87);
  checks.push('Eighty-seven synthetic receipts include QR/biometric approvals, frozen historic identities, reused PINs, dangling references, auxiliary states, wildcard text and a sixty-row timestamp tie');

  const { createMysqlAttendanceSourceReviewStore } = await import('../../server/attendance-source-review/mysql-store.ts');
  const { createAttendanceSourceReviewProcedures } = await import('../../server/attendance-source-review/router.ts');
  const { router } = await import('../../server/_core/trpc.ts');
  const store = createMysqlAttendanceSourceReviewStore(pool, lab.schema, streamId);
  const binaryStore = createMysqlAttendanceSourceReviewStore(binaryPool, lab.schema, streamId);
  const before = await snapshot();
  let loads = 0;
  const reviewRouter = router(createAttendanceSourceReviewProcedures(async () => { loads++; return { store }; }));
  const caller = (role: string | null) => reviewRouter.createCaller({ user: role ? { id: 1, role } : null,
    req: { headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res: {} } as any);

  stage = 'real-router-permissions-before-loading-database';
  await rejects(() => caller(null).list({}), 'UNAUTHORIZED');
  await rejects(() => caller('guard').list({}), 'FORBIDDEN');
  await rejects(() => caller('guard').detail({ id: uuid(1) }), 'FORBIDDEN');
  assert.equal(loads, 0);
  const auditor = caller('auditor');
  const all = await auditor.list({ limit: 100, sort: 'asc' });
  assert.equal(all.items.length, 87);
  assert.equal(all.page.total, 87);
  assert.equal(loads, 1);
  assert.deepEqual(Object.keys(reviewRouter._def.procedures).sort(), ['detail','list']);
  checks.push('Actual tRPC middleware permits an auditor, rejects anonymous users and guards before database loading, and exposes only list/detail read procedures');

  stage = 'approved-and-already-recorded-utc-projection';
  const first = (await store.detail(uuid(1))).item;
  const biometric = (await store.detail(uuid(2))).item;
  const duplicate = (await auditor.detail({ id: uuid(3) })).item;
  assert.equal(first.displayStatus, 'accepted');
  assert.equal(first.worker?.name, qr.sourceUserName);
  assert.equal(first.approvedMovement?.eventTimeUtc, '2026-11-25T11:26:30.000000Z');
  assert.equal(biometric.displayStatus, 'accepted');
  assert.equal(biometric.worker?.id, 1);
  assert.equal(biometric.worker?.name, 'Synthetic Frozen Alpha');
  assert.equal(biometric.worker?.currentGroupId, 2);
  assert.equal(biometric.worker?.currentGroupName, 'Synthetic Current Group');
  assert.equal(biometric.sourceUserName, 'Synthetic Frozen Directory Name');
  assert.equal(biometric.deviceName, 'Synthetic Old Device');
  assert.equal(biometric.original.sourceIdentityId, '700');
  assert.equal(biometric.approvedMovement?.eventTimeUtc, '2026-11-25T12:22:16.000000Z');
  assert.equal(duplicate.displayStatus, 'already_recorded');
  assert.equal(duplicate.rawStatus, 'rejected');
  assert.equal(duplicate.approvedMovement?.id, 102);
  assert.equal(duplicate.approvedMovement?.kind, 'already_recorded');
  assert.equal(duplicate.approvedMovement?.eventTimeUtc, biometric.approvedMovement?.eventTimeUtc);
  assert.equal(duplicate.referenceIssue, false);
  checks.push('The real CTE projects stored Riyadh attendance as UTC and shows duplicate QR against its original biometric winner without confusing its rejected raw status');

  stage = 'immutable-history-current-links-and-missing-workers';
  const ambiguous = (await store.detail(uuid(4))).item;
  assert.equal(ambiguous.worker, null);
  assert.equal(ambiguous.displayStatus, 'unmapped');
  assert.equal((await store.detail(uuid(26))).item.worker?.id, 2);
  assert.equal((await store.detail(uuid(7))).item.worker?.id, 3);
  assert.equal(biometric.worker?.id, 1);
  const deletedWorker = (await store.detail(uuid(27))).item;
  assert.equal(deletedWorker.worker?.id, 4);
  assert.equal(deletedWorker.worker?.name, 'Synthetic Deleted Worker');
  assert.equal(deletedWorker.worker?.currentGroupName, null);
  assert.equal(deletedWorker.displayStatus, 'accepted');
  checks.push('Acted biometric history keeps the original worker/name/link snapshot despite PIN reuse and reassignment; unmapped identities never guess by PIN, while deleted worker history remains identifiable');

  stage = 'dangling-or-edited-attendance-references';
  for (const number of [8, 9, 10]) {
    const item = (await store.detail(uuid(number))).item;
    assert.equal(item.referenceIssue, true);
    assert.equal(item.displayStatus, 'manual_review');
    assert.equal(item.approvedMovement, null);
  }
  checks.push('Deleted or worker-edited attendance references, including duplicate winner pointers, become review issues instead of falsely appearing approved');

  stage = 'cutoff-provenance-and-auxiliary-statuses';
  assert.equal((await store.detail(uuid(5))).item.displayStatus, 'before_activation');
  const untagged = (await store.detail(uuid(6))).item;
  assert.equal(untagged.worker?.id, 3);
  assert.equal(untagged.displayStatus, 'manual_review');
  assert.match(untagged.reason, /للأرشفة/);
  assert.equal((await store.detail(uuid(7))).item.displayStatus, 'pending');
  for (let number = 17; number <= 20; number++) {
    const item = (await store.detail(uuid(number))).item;
    assert.equal(item.displayStatus, 'review_only');
    assert.equal(item.approvedMovement, null);
  }
  assert.match((await store.detail(uuid(11))).item.reason, /ثلاث دقائق/);
  assert.match((await store.detail(uuid(12))).item.reason, /المستقبل/);
  assert.match((await store.detail(uuid(13))).item.reason, /غير نشط/);
  assert.match((await store.detail(uuid(14))).item.reason, /مقفلة/);
  checks.push('Currently linked pre-cutoff receipts remain before activation, post-cutoff untagged receipts remain archival review, and all four auxiliary states stay review-only with accurate fixed reasons');

  stage = 'global-case-insensitive-infix-search-with-literal-wildcards';
  const needle = await store.list({ search: 'dIsCoUnT', limit: 100 });
  assert.deepEqual(needle.items.map(item => item.id), [uuid(25)]);
  assert.equal((await store.list({ search: '50%_', limit: 100 })).page.total, 1);
  assert.equal((await store.list({ search: '!', limit: 100 })).page.total, 1);
  assert.equal((await store.list({ search: 'S-W2', limit: 20 })).page.total, 61);
  const frozenNames = await store.list({ search: 'fRoZeN', limit: 100 });
  assert.ok(frozenNames.items.some(item => item.id === uuid(2)));
  assert.ok(frozenNames.items.every(item => item.worker?.name.includes('Frozen') || item.sourceUserName?.includes('Frozen')));
  checks.push('Case-insensitive infix search applies to the entire result set and preserves literal percent, underscore and escape characters rather than treating them as wildcards');

  stage = 'riyadh-calendar-boundaries-and-time-basis';
  const byEvent = await store.list({ dateFrom: '2026-11-25', dateTo: '2026-11-25', timeBasis: 'event_time', limit: 100 });
  const eventIds = new Set(byEvent.items.map(item => item.id));
  assert.equal(eventIds.has(uuid(21)), false);
  assert.equal(eventIds.has(uuid(22)), true);
  assert.equal(eventIds.has(uuid(23)), false);
  assert.equal(eventIds.has(uuid(24)), true);
  assert.equal(byEvent.page.total, 84);
  const byReceived = await store.list({ dateFrom: '2026-11-25', dateTo: '2026-11-25', timeBasis: 'received_at', limit: 100 });
  const receiptIds = new Set(byReceived.items.map(item => item.id));
  assert.equal(receiptIds.has(uuid(21)), true);
  assert.equal(receiptIds.has(uuid(22)), false);
  assert.equal(receiptIds.has(uuid(23)), true);
  assert.equal(byReceived.page.total, 86);
  checks.push('Riyadh midnight bounds are inclusive/exclusive at UTC21:00 with microseconds preserved, and original-event versus arrival-date filtering remains distinct');

  stage = 'whole-cohort-sort-pagination-and-status-independent-summaries';
  const ids: string[] = [];
  for (let page = 1; page <= 5; page++) ids.push(...(await store.list({ page, limit: 20, sort: 'asc' })).items.map(item => item.id));
  assert.equal(ids.length, 87);
  assert.equal(new Set(ids).size, 87);
  assert.deepEqual(ids, all.items.map(item => item.id));
  const descending = await store.list({ limit: 100, sort: 'desc' });
  assert.deepEqual(descending.items.map(item => item.id), [...ids].reverse());
  const summary = { all: 87, accepted: 3, alreadyRecorded: 1, needsReview: 13, pending: 63 };
  assert.deepEqual(all.summary, summary);
  const accepted = await store.list({ status: 'accepted', limit: 20 });
  assert.equal(accepted.page.total, 3);
  assert.deepEqual(accepted.summary, summary);
  const needs = await store.list({ status: 'needs_review', limit: 100 });
  assert.equal(needs.page.total, 13);
  assert.ok(needs.items.every(item => ['unmapped','manual_review','rejected'].includes(item.displayStatus)));
  const qrOnly = await store.list({ source: 'qr', status: 'accepted', limit: 20 });
  assert.equal(qrOnly.page.total, 1);
  assert.equal(qrOnly.summary.all, 65);
  const breaks = await store.list({ movement: 'break_in', limit: 20 });
  assert.deepEqual(breaks.items.map(item => item.id), [uuid(18)]);
  checks.push('Five pages and reverse sort cover all eighty-seven receipts exactly once, including sixty timestamp ties; summary cards ignore only the selected status while retaining other filters');

  stage = 'current-group-filter-and-invalid-input';
  assert.deepEqual(all.groups.map(group => group.id).sort(), [1, 2, 3]);
  const oldCurrentGroup = await store.list({ groupId: 1, limit: 100 });
  assert.equal(oldCurrentGroup.page.total, 61);
  assert.ok(oldCurrentGroup.items.every(item => item.worker?.id === 2));
  const newCurrentGroup = await store.list({ groupId: 2, limit: 100 });
  assert.ok(newCurrentGroup.items.some(item => item.id === uuid(2)));
  assert.ok(newCurrentGroup.items.every(item => item.worker?.currentGroupName === 'Synthetic Current Group'));
  await rejects(() => auditor.list({ dateFrom: '2026-02-30' }), 'BAD_REQUEST');
  await rejects(() => auditor.list({ dateFrom: '2026-11-26', dateTo: '2026-11-25' }), 'BAD_REQUEST');
  await rejects(() => auditor.detail({ id: uuid(9999) }), 'NOT_FOUND');
  checks.push('Group options retain inactive groups for historical reporting, filtering uses explicitly labelled current groups without rewriting historical worker names, and invalid dates/missing IDs return safe public errors');

  stage = 'mixed-collation-read-profile-equivalence';
  await compareProfiles();
  checks.push('Actual list, detail, Unicode/infix/literal-wildcard search, current-group filters, summaries and pagination return identical DTOs under unicode_ci and binary connections without changing any row');

  stage = 'mixed-collation-exact-stored-uuid-and-pin';
  const [[savedLink]] = await fixture.execute<any[]>('SELECT id,device_user_id_snapshot FROM attendance_biometric_worker_links WHERE id=?', [oldLink]);
  const [[savedSource]] = await fixture.execute<any[]>('SELECT decision_note FROM attendance_source_events WHERE id=?', [uuid(2)]);
  const alphabeticLink = 'a0000000-0000-4000-8000-000000000901';
  try {
    await fixture.execute('UPDATE attendance_biometric_worker_links SET id=? WHERE id=?', [alphabeticLink,oldLink]);
    await fixture.execute('UPDATE attendance_source_events SET decision_note=? WHERE id=?', [journal(1,alphabeticLink,101),uuid(2)]);
    await eachDetail(2, item => assert.equal(item.displayStatus, 'accepted'));
    await fixture.execute('UPDATE attendance_biometric_worker_links SET id=? WHERE id=?', [alphabeticLink.toUpperCase(),alphabeticLink]);
    await eachDetail(2, item => {
      assert.equal(item.displayStatus, 'manual_review'); assert.equal(item.worker, null);
      assert.equal(item.approvedMovement, null); assert.equal(item.referenceIssue, true);
    });
  } finally {
    await fixture.execute('UPDATE attendance_biometric_worker_links SET id=? WHERE id IN (?,?)', [savedLink.id,alphabeticLink,alphabeticLink.toUpperCase()]);
    await fixture.execute('UPDATE attendance_source_events SET decision_note=? WHERE id=?', [savedSource.decision_note,uuid(2)]);
  }
  await withSourcePin(2, 'PIN-Ab17', async () => {
    try {
      await fixture!.execute('UPDATE attendance_biometric_worker_links SET device_user_id_snapshot=? WHERE id=?', ['PIN-Ab17',oldLink]);
      await eachDetail(2, item => assert.equal(item.displayStatus, 'accepted'));
      await fixture!.execute('UPDATE attendance_biometric_worker_links SET device_user_id_snapshot=? WHERE id=?', ['pin-Ab17',oldLink]);
      await eachDetail(2, item => {
        assert.equal(item.displayStatus, 'manual_review'); assert.equal(item.worker, null);
        assert.equal(item.approvedMovement, null); assert.equal(item.referenceIssue, true);
      });
    } finally { await fixture!.execute('UPDATE attendance_biometric_worker_links SET device_user_id_snapshot=? WHERE id=?', [savedLink.device_user_id_snapshot,oldLink]); }
  });
  const [[savedUser]] = await fixture.execute<any[]>('SELECT device_user_id FROM attendance_biometric_users WHERE stream_id=? AND source_identity_id=?', [streamId,'700']);
  await withSourcePin(26, 'PIN-Ab17', async () => {
    try {
      await fixture!.execute('UPDATE attendance_biometric_users SET device_user_id=? WHERE stream_id=? AND source_identity_id=?', ['PIN-Ab17',streamId,'700']);
      await eachDetail(26, item => assert.equal(item.worker?.id, 2));
      await fixture!.execute('UPDATE attendance_biometric_users SET device_user_id=? WHERE stream_id=? AND source_identity_id=?', ['pin-Ab17',streamId,'700']);
      await eachDetail(26, item => { assert.equal(item.worker, null); assert.equal(item.displayStatus, 'unmapped'); });
    } finally { await fixture!.execute('UPDATE attendance_biometric_users SET device_user_id=? WHERE stream_id=? AND source_identity_id=?', [savedUser.device_user_id,streamId,'700']); }
  });
  assert.deepEqual(await snapshot(), before);
  checks.push('Exact binary stored UUID and acted/current PIN comparisons reject case-only mismatches under both connection profiles; matching controls remain accepted/linked, and every temporary synthetic probe is restored');

  stage = 'mixed-collation-duplicate-winner-proof';
  const [[winnerEvidence]] = await fixture.execute<any[]>(`SELECT attendance_event_id,decision_note,decision_code,content_sha256,received_at
    FROM attendance_source_events WHERE id=?`, [uuid(2)]);
  const invalidWinnerEvidence: Array<[string,unknown]> = [
    ['content_sha256','f'.repeat(64)], ['attendance_event_id',null], ['decision_code','SOURCE_PERIOD_LOCKED'],
    ['decision_note',JSON.stringify({v:1,s:uuid(777),a:activationUtc,w:1,l:oldLink,p:101})],
    ['received_at','2026-11-25 14:00:01.000000'],
  ];
  for (const [column,value] of invalidWinnerEvidence) {
    assert.ok(['content_sha256','attendance_event_id','decision_code','decision_note','received_at'].includes(column));
    try {
      await fixture.execute(`UPDATE attendance_source_events SET \`${column}\`=? WHERE id=?`, [value,uuid(2)]);
      await eachDetail(3, item => {
        assert.equal(item.displayStatus, 'manual_review'); assert.equal(item.approvedMovement, null);
        assert.equal(item.referenceIssue, true); assert.equal(item.rawStatus, 'rejected');
      });
    } finally { await fixture.execute(`UPDATE attendance_source_events SET \`${column}\`=? WHERE id=?`, [winnerEvidence[column],uuid(2)]); }
  }
  try {
    await source(9002, {eventTimeUtc:'2026-11-25T12:22:16.000000Z',status:'accepted',attendanceId:102,
      decisionCode:'SOURCE_ACCEPTED',note:journal(1,oldLink,101)});
    await eachDetail(3, item => {
      assert.equal(item.displayStatus, 'manual_review'); assert.equal(item.approvedMovement, null);
      assert.equal(item.referenceIssue, true);
    });
  } finally {
    const [removed] = await fixture.execute<mysql.ResultSetHeader>('DELETE FROM attendance_source_events WHERE id=?', [uuid(9002)]);
    sourceCount -= removed.affectedRows;
  }
  assert.equal(sourceCount, 87);
  await eachDetail(3, item => {
    assert.equal(item.displayStatus, 'already_recorded'); assert.equal(item.approvedMovement?.id, 102);
    assert.equal(item.referenceIssue, false);
  });
  assert.deepEqual(await snapshot(), before);
  checks.push('Both collation profiles preserve the proven duplicate winner while rejecting forged hashes, missing receipt pointers, wrong decisions/streams, late evidence and multiple valid accepted receipts; synthetic probes leave the original 87 receipts unchanged');

  stage = 'mixed-collation-independent-optional-table-absence';
  for (const absent of [['attendance_source_promotion_state'],['attendance_biometric_users','attendance_biometric_worker_links']]) {
    for (const table of absent) await fixture.query(`RENAME TABLE \`${table}\` TO \`owned_paused_${table}\``);
    try { await compareProfiles(); }
    finally { for (const table of absent) await fixture.query(`RENAME TABLE \`owned_paused_${table}\` TO \`${table}\``); }
  }
  checks.push('Mixed-collation reads remain identical when activation alone or directory alone is absent, including NULL CTE context and empty-directory projections');

  stage = 'optional-directory-and-activation-absent-legacy-read';
  for (const table of ['attendance_biometric_users','attendance_biometric_worker_links','attendance_source_promotion_state']) {
    await fixture.query(`RENAME TABLE \`${table}\` TO \`owned_paused_${table}\``);
  }
  try {
    const legacy = createMysqlAttendanceSourceReviewStore(pool, lab.schema, streamId);
    const legacyAll = await legacy.list({ limit: 100 });
    assert.equal(legacyAll.page.total, 87);
    assert.equal(legacyAll.activation, null);
    assert.equal((await legacy.detail(uuid(1))).item.displayStatus, 'accepted');
    assert.equal((await legacy.detail(uuid(2))).item.worker, null);
    await compareProfiles();
  } finally {
    for (const table of ['attendance_biometric_users','attendance_biometric_worker_links','attendance_source_promotion_state']) {
      await fixture.query(`RENAME TABLE \`owned_paused_${table}\` TO \`${table}\``);
    }
  }
  checks.push('The same read-only SQL remains usable when optional directory and activation tables are absent, preserving QR evidence without inventing biometric bindings');

  stage = 'assert-query-read-only-and-safe-dto';
  assert.deepEqual(await snapshot(), before);
  const dto = JSON.stringify(all);
  assert.equal(dto.includes('content_sha256'), false);
  assert.equal(dto.includes('decision_note'), false);
  assert.equal(dto.includes('decision_code'), false);
  assert.equal(dto.includes('DATABASE_URL'), false);
  checks.push('Every existing/new table row remains unchanged after all real list/detail and permission checks; public DTOs omit internal journal/hash and configuration fields');

  if (process.argv.includes('--ui')) {
    stage = 'actual-review-page-read-only-local-preview';
    const [{ build }, { default: express }, { createExpressMiddleware }] = await Promise.all([
      import('esbuild'), import('express'), import('@trpc/server/adapters/express'),
    ]);
    const appDirectory = path.resolve(import.meta.dirname, '../..');
    const built = await build({ stdin: { contents: `
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
      import {httpBatchLink} from '@trpc/client';
      import superjson from 'superjson';
      import {trpc} from '@/lib/trpc';
      import AttendanceSourceEvents from '@/pages/AttendanceSourceEvents';
      const queryClient=new QueryClient({defaultOptions:{queries:{retry:false}}});
      const client=trpc.createClient({links:[httpBatchLink({url:'/api/trpc',transformer:superjson})]});
      createRoot(document.getElementById('root')).render(
        <trpc.Provider client={client} queryClient={queryClient}><QueryClientProvider client={queryClient}>
          <AttendanceSourceEvents/>
        </QueryClientProvider></trpc.Provider>);
    `, sourcefile: 'source-review-preview.tsx', resolveDir: appDirectory, loader: 'tsx' },
      bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2020', jsx: 'automatic',
      alias: { '@': path.join(appDirectory, 'client/src'), '@shared': path.join(appDirectory, 'shared') },
      define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'silent' });
    const assets = path.join(appDirectory, 'dist/public/assets');
    const cssFiles = (await fs.readdir(assets)).filter(file => file.endsWith('.css')).sort();
    assert.ok(cssFiles.length);
    const css = await fs.readFile(path.join(assets, cssFiles[0]));
    const app = express();
    const previewRouter = router({ attendanceSources: reviewRouter });
    const middleware = createExpressMiddleware({ router: previewRouter,
      createContext: ({ req, res }) => ({ user: { id: 1, role: 'auditor' }, req, res } as any) });
    app.use('/api/trpc', (req, res, next) => req.method === 'GET' ? next() : res.status(405).end(), middleware);
    app.get('/preview.js', (_req, res) => res.type('application/javascript').send(Buffer.from(built.outputFiles[0].contents)));
    app.get('/preview.css', (_req, res) => res.type('text/css').send(css));
    app.get('/', (_req, res) => res.type('html').send('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>مراجعة حركات تجريبية</title><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script type="module" src="/preview.js"></script></body></html>'));
    let finish!: () => void;
    const finished = new Promise<void>(resolve => { finish = resolve; });
    app.post('/__finish-preview', (_req, res) => { res.status(204).end(); finish(); });
    previewServer = http.createServer(app);
    await new Promise<void>((resolve, reject) => { previewServer!.once('error', reject); previewServer!.listen(0, '127.0.0.1', resolve); });
    const address = previewServer.address();
    assert.ok(address && typeof address !== 'string' && address.address === '127.0.0.1');
    process.stdout.write(JSON.stringify({ previewUrl: `http://127.0.0.1:${address.port}/`,
      finishUrl: `http://127.0.0.1:${address.port}/__finish-preview`, syntheticRows: sourceCount,
      role: 'auditor', reads: 'Actual React page and tRPC list/detail store; no writes enabled' }) + '\n');
    await finished;
    await snapshot().then(after => assert.deepEqual(after, before));
    checks.push('The actual React review page and application CSS were served with real read-only tRPC/MySQL data as a synthetic auditor; UI queries preserved all rows');
  }

  async function installCreate(relativeFile: string, expectedSchema: string, table: string) {
    assert.ok(lab && fixture);
    const qualified = `\`${expectedSchema}\`.\`${table}\``;
    const file = await fs.readFile(new URL(relativeFile, import.meta.url), 'utf8');
    const create = file.split(/\r?\n/).filter(line => !line.trimStart().startsWith('--')).join('\n')
      .split(';').map(value => value.trim()).find(value => value.startsWith(`CREATE TABLE ${qualified} (`));
    assert.ok(create);
    assert.equal(create.split(qualified).length, 2);
    await fixture.query(create.replace(qualified, `\`${lab.schema}\`.\`${table}\``));
  }
  async function compareProfiles() {
    const unchanged = await snapshot();
    const filters = [{limit:100,sort:'asc'}, {search:'dIsCoUnT',limit:100}, {search:'50%_',limit:100},
      {search:'عربي',limit:100}, {search:'S-W2',limit:20}, {search:'fRoZeN',limit:100},
      {groupId:1,limit:100}, {groupId:2,status:'accepted',limit:100}, {source:'qr',limit:100},
      {movement:'break_in',limit:20}, {status:'needs_review',limit:100}, {page:2,limit:20,sort:'desc'},
      {dateFrom:'2026-11-25',dateTo:'2026-11-25',timeBasis:'received_at',limit:100}] as const;
    for (const filter of filters) assert.deepEqual(await binaryStore.list(filter), await store.list(filter));
    for (const number of [1,2,3,4,5,6,7,8,9,10,11,12,17,18,19,20,25,26,27]) {
      assert.deepEqual(await binaryStore.detail(uuid(number)), await store.detail(uuid(number)));
    }
    assert.deepEqual(await snapshot(), unchanged);
  }
  async function eachDetail(number: number, check: (item: Awaited<ReturnType<typeof store.detail>>['item']) => void) {
    const unchanged = await snapshot();
    const left = await store.detail(uuid(number)); const right = await binaryStore.detail(uuid(number));
    assert.deepEqual(right,left); check(left.item); assert.deepEqual(await snapshot(), unchanged);
  }
  async function withSourcePin(number: number, pin: string, operation: () => Promise<void>) {
    const [[original]] = await fixture!.execute<any[]>(`SELECT *,DATE_FORMAT(event_time_utc,'%Y-%m-%dT%H:%i:%s.%fZ') AS source_time_iso
      FROM attendance_source_events WHERE id=?`, [uuid(number)]);
    const prepared = prepareSourceEvent({ source:original.source,sourceEventId:original.source_event_id,workerId:original.worker_id,
      sourcePersonCode:original.source_person_code,sourceDeviceId:original.source_device_id,sourceDeviceUserId:pin,
      sourceIdentityId:original.source_identity_id,sourceUserName:original.source_user_name,eventType:original.event_type,
      rawState:original.raw_state,eventTimeUtc:original.source_time_iso }, () => original.id);
    try {
      await fixture!.execute('UPDATE attendance_source_events SET source_device_user_id=?,content_sha256=? WHERE id=?',
        [prepared.sourceDeviceUserId,prepared.contentSha256,original.id]);
      await operation();
    } finally {
      await fixture!.execute('UPDATE attendance_source_events SET source_device_user_id=?,content_sha256=? WHERE id=?',
        [original.source_device_user_id,original.content_sha256,original.id]);
    }
  }
  async function directory(identityId: string, pin: string, status: string, name: string) {
    await fixture!.execute(`INSERT INTO attendance_biometric_users
      (stream_id,source_identity_id,device_id,device_user_id,display_name,device_name,status,last_synced_at_utc)
      VALUES (?,?,'9001',?,?,'Synthetic Current Device',?,UTC_TIMESTAMP(6))`, [streamId,identityId,pin,name,status]);
  }
  async function link(number: number, workerId: number, identityId: string, pin: string, status: string,
    name: string, sourceName: string, deviceName: string) {
    await fixture!.execute(`INSERT INTO attendance_biometric_worker_links
      (id,stream_id,source_identity_id,worker_id,status,device_id_snapshot,device_user_id_snapshot,
       display_name_snapshot,device_name_snapshot,worker_name_snapshot,created_by,created_at_utc,revoked_by,revoked_at_utc)
      VALUES (?,?,?, ?,?,'9001',?,?,?, ?,1,'2026-11-24 00:00:00',?,?)`,
    [uuid(number),streamId,identityId,workerId,status,pin,sourceName,deviceName,name,
      status === 'revoked' ? 1 : null,status === 'revoked' ? '2026-11-25 10:00:00' : null]);
  }
  async function snapshot() {
    const [tables] = await fixture!.query<any[]>("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME", [lab!.schema]);
    const result: Record<string, unknown> = {};
    for (const row of tables) {
      assert.match(row.TABLE_NAME, /^[a-z0-9_]+$/);
      const [rows] = await fixture!.query(`SELECT * FROM \`${row.TABLE_NAME}\``);
      result[row.TABLE_NAME] = (rows as any[]).map(value => JSON.stringify(value)).sort();
    }
    return result;
  }
} catch (error) {
  if (stage === 'actual-review-page-read-only-local-preview') {
    const diagnostics = Array.isArray((error as any)?.errors)
      ? (error as any).errors.slice(0, 3).map((item: any) => String(item.text).slice(0, 220))
      : [String((error as any)?.message ?? 'PREVIEW_FAILED').slice(0, 220)];
    process.stdout.write(JSON.stringify({ previewDiagnostics: diagnostics }) + '\n');
  }
  const candidate = (error as any)?.code ?? (error as any)?.message;
  const line = /acceptance\.mts:(\d+):\d+/.exec((error as any)?.stack ?? '')?.[1];
  failure = { stage, code: typeof candidate === 'string' && /^[A-Z][A-Z0-9_]{1,80}$/.test(candidate) ? candidate : 'SOURCE_REVIEW_ACCEPTANCE_FAILED',
    ...(line ? { line: Number(line) } : {}) };
} finally {
  try {
    if (previewServer) {
      const closed = new Promise<void>((resolve, reject) => previewServer!.close(error => error ? reject(error) : resolve()));
      previewServer.closeIdleConnections();
      await closed;
    }
  } catch { failure ??= { stage: 'close-preview-server', code: 'SOURCE_REVIEW_CLEANUP_FAILED' }; }
  try { await pool?.end(); await binaryPool?.end(); await fixture?.end(); cleanup.localConnectionsClosed = true; }
  catch { failure ??= { stage: 'close-owned-connections', code: 'SOURCE_REVIEW_CLEANUP_FAILED' }; }
  try { if (lab) Object.assign(cleanup, await lab.close()); }
  catch { failure ??= { stage: 'stop-owned-mysql', code: 'SOURCE_REVIEW_CLEANUP_FAILED' }; }
  console.log = originalConsole.log; console.warn = originalConsole.warn; console.error = originalConsole.error;
}

const report = { passed: !failure, completedAtUtc: new Date().toISOString(),
  fixture: 'Synthetic records on a process-owned random loopback MySQL schema; no env file, live database or application startup',
  sourceCount,collationProfiles,checks,cleanup,...(failure ? {failure} : {}) };
await fs.writeFile(path.join(import.meta.dirname, 'result.json'), JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify(report) + '\n');
if (failure) process.exitCode = 1;

function uuid(number: number) { return `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`; }
function sql(value: string) { return value.slice(0, -1).replace('T', ' '); }
function cohort() { return JSON.stringify({v:1,s:streamId,a:activationUtc}); }
function journal(workerId: number, link: string|null, winner: number) { return JSON.stringify({v:1,s:streamId,a:activationUtc,w:workerId,l:link,p:winner}); }
async function rejects(operation: () => Promise<unknown>, code: string) {
  await assert.rejects(operation, (error: any) => error?.code === code || error?.message === code);
}
