import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import mysql from 'mysql2/promise';
import { startTolanHrMysql, osEnvironmentKeys } from '../tolanhr-pilot-mysql.mjs';

const allowedEnvironment = new Set(osEnvironmentKeys.map(key => key.toLowerCase()));
for (const key of Object.keys(process.env)) if (!allowedEnvironment.has(key.toLowerCase())) delete process.env[key];
process.env.NODE_ENV = 'test';
process.env.TZ = 'Asia/Riyadh';

const streamId = '123e4567-e89b-42d3-a456-426614174097';
const otherStream = '123e4567-e89b-42d3-a456-426614174098';
const checks: string[] = [];
const cleanup: Record<string, unknown> = {};
let stage = 'start-owned-mysql';
let failure: { stage: string; code: string; line?: number } | undefined;
let lab: Awaited<ReturnType<typeof startTolanHrMysql>> | undefined;
let fixture: mysql.Connection | undefined;
let pool: mysql.Pool | undefined;
let previewServer: http.Server | undefined;

try {
  lab = await startTolanHrMysql();
  fixture = await lab.connect();
  const [[identity]] = await fixture.query<any[]>('SELECT DATABASE() AS db,@@port AS port,@@datadir AS datadir');
  assert.equal(identity.db, lab.schema);
  assert.equal(Number(identity.port), lab.port);
  assert.equal(path.resolve(identity.datadir), path.resolve(lab.data));
  assert.match(lab.schema, /^tolanhr_pilot_test_[a-f0-9]{12}$/);
  const fixtureUrl = new URL(lab.databaseUrl);
  assert.equal(fixtureUrl.hostname, '127.0.0.1');
  assert.equal(Number(fixtureUrl.port), lab.port);
  pool = mysql.createPool({ host: '127.0.0.1', port: lab.port, database: lab.schema,
    user: decodeURIComponent(fixtureUrl.username), password: decodeURIComponent(fixtureUrl.password),
    dateStrings: true, supportBigNumbers: true, bigNumberStrings: true, timezone: 'Z',
    connectionLimit: 3, multipleStatements: false, flags: '-LOCAL_FILES' });
  checks.push('A process-owned random loopback MySQL schema and datadir were verified before fixture writes; no env file, real database or application startup');

  stage = 'install-owned-directory-tables-and-synthetic-data';
  await installCreate('attendance_biometric_users');
  await installCreate('attendance_biometric_worker_links');
  await fixture.execute("INSERT INTO `groups` (id,code,name,is_active) VALUES (1,'BADGE-DEMO','مجموعة تجريبية',1)");
  await fixture.execute(`INSERT INTO workers (id,code,full_name,group_id,biometric_person_code,status) VALUES
    (288,'DEMO-W288','عامل تجريبي — الربط الملغى',1,'900002','active'),
    (1,'DEMO-W1','عامل تجريبي — روابط متعددة',1,'900001','active'),
    (2,'DEMO-W2','عامل تجريبي — مصدر آخر',1,NULL,'active'),
    (3,'DEMO-W3','عامل تجريبي — لقطة محفوظة',1,NULL,'active')`);
  await fixture.execute("INSERT INTO attendance_events (id,worker_id,event_type,event_time,work_date,method) VALUES (1,288,'check_in','2026-11-27 08:00:00','2026-11-27','qr')");
  await fixture.execute("INSERT INTO worker_daily_finance (worker_id,work_date,worked_minutes,net_amount,notes) VALUES (288,'2026-11-27',120,25,'Synthetic immutable payroll fixture')");
  await fixture.execute("INSERT INTO settings (`key`,value,description) VALUES ('badge_preserved_setting','unchanged','Synthetic unrelated setting')");
  await directory('701', '1', 'current', 'Synthetic Alpha');
  await directory('702', '77', 'current', 'Synthetic Beta');
  await directory('703', '0001', 'historical', 'Synthetic Historical');
  await directory('704', '99', 'current', 'Synthetic Saved Name');
  await directory('901', '88', 'current', 'Synthetic Other Stream', otherStream);
  const { createMysqlBiometricDirectoryStore } = await import('../../server/biometric-directory/mysql-store.ts');
  const { attachWorkerSourceBiometricLinks } = await import('../../server/biometric-directory/worker-list-links.ts');
  const directoryStore = createMysqlBiometricDirectoryStore(pool, lab.schema);
  await directoryStore.assertReady();
  const env = { BIOMETRIC_SOURCE_DIRECTORY_ENABLED: 'true', ATTENDANCE_SOURCE_DB_CONFIRMED_NAME: lab.schema,
    BIOMETRIC_SOURCE_STREAM_ID: streamId };
  const [rows] = await fixture.query<any[]>('SELECT id,code,full_name AS fullName,group_id AS groupId,status,biometric_person_code AS biometricPersonCode FROM workers ORDER BY id');
  const raw = rows.map(row => ({ ...row }));
  const preservedBusinessRows = await businessSnapshot();
  const trace: Array<{ sql: string; parameters: unknown[] }> = [];
  let acquisitions = 0;
  const observedPool = {
    async getConnection() {
      acquisitions++;
      const connection = await pool!.getConnection();
      return {
        query(sql: any, parameters: unknown[] = []) { trace.push({ sql: typeof sql === 'string' ? sql : sql.sql, parameters }); return connection.query(sql, parameters as any); },
        execute(sql: any, parameters: unknown[] = []) { trace.push({ sql: typeof sql === 'string' ? sql : sql.sql, parameters }); return connection.execute(sql, parameters as any); },
        release() { connection.release(); },
        destroy() { connection.destroy(); },
      };
    },
  } as unknown as mysql.Pool;
  const getPool = async () => observedPool;
  const attach = async (workers: typeof raw = raw, override: Record<string, string | undefined> = {}) => {
    trace.length = 0; acquisitions = 0;
    const before = await snapshot();
    const result = await attachWorkerSourceBiometricLinks(workers, { env: { ...env, ...override }, getPool });
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual(await businessSnapshot(), preservedBusinessRows);
    assert.ok(trace.every(entry => /^(?:SELECT|WITH|SET SESSION)\b/i.test(entry.sql.trim())));
    return result;
  };
  const summary = (values: Awaited<ReturnType<typeof attach>>, id: number) => values.find(row => row.id === id)!.sourceBiometricLink!;
  checks.push('Synthetic workers preserve old code 900002 alongside versioned device identities, attendance, payroll and an unrelated setting');

  stage = 'legacy-mode-does-not-touch-new-storage';
  const legacy = await attach(raw, { BIOMETRIC_SOURCE_DIRECTORY_ENABLED: 'false' });
  assert.deepEqual(legacy, raw);
  assert.ok(legacy.every(worker => !Object.hasOwn(worker, 'sourceBiometricLink')));
  assert.equal(acquisitions, 0);
  const empty = await attach([]);
  assert.deepEqual(empty, []);
  assert.equal(acquisitions, 0);
  checks.push('Disabled directory mode preserves legacy worker payloads without acquiring a connection; an empty page performs no query');

  stage = 'new-mode-does-not-trust-old-worker-code';
  const unlinked = await attach();
  assert.deepEqual(summary(unlinked, 288), { state: 'unlinked', links: [] });
  assert.equal(unlinked.find(worker => worker.id === 288)!.biometricPersonCode, '900002');
  assert.equal(acquisitions, 1);
  const batch = trace.filter(entry => /FROM\s+`?attendance_biometric_worker_links`?\s/i.test(entry.sql));
  assert.equal(batch.length, 1);
  for (const worker of raw) assert.ok(batch[0].parameters.includes(worker.id));
  const single = await attach(raw.filter(worker => worker.id === 288));
  assert.deepEqual(single.map(worker => worker.id), [288]);
  assert.equal(trace.filter(entry => /FROM\s+`?attendance_biometric_worker_links`?\s/i.test(entry.sql)).length, 1);
  assert.ok(trace.some(entry => entry.parameters.includes(288)));
  checks.push('New mode ignores legacy code 900002 for active status and uses one batch query restricted to current page worker IDs');

  stage = 'actual-link-then-revoke-and-preserve-history';
  const linked = await directoryStore.setLink({ streamId, workerId: 288, identityId: '701', expectedLinkId: null, actor: 1 });
  const afterLink = await attach();
  assert.deepEqual(summary(afterLink, 288), { state: 'linked', links: [{ deviceUserId: '1', displayName: 'Synthetic Alpha' }] });
  assert.equal(afterLink.find(worker => worker.id === 288)!.biometricPersonCode, '900002');
  await directoryStore.revokeLink({ streamId, workerId: 288, identityId: '701', expectedLinkId: linked.link.linkId, actor: 1 });
  const revoked = await attach();
  assert.deepEqual(summary(revoked, 288), { state: 'unlinked', links: [] });
  const [[oldLink]] = await fixture.execute<any[]>('SELECT status,worker_id,display_name_snapshot FROM attendance_biometric_worker_links WHERE id=?', [linked.link.linkId]);
  assert.equal(oldLink.status, 'revoked');
  assert.equal(Number(oldLink.worker_id), 288);
  assert.equal(oldLink.display_name_snapshot, 'Synthetic Alpha');
  assert.deepEqual(await businessSnapshot(), preservedBusinessRows);
  checks.push('The real link writer shows active PIN1, and real revocation immediately shows unlinked while preserving the old code, versioned link snapshot, attendance and finance');

  stage = 'multiple-identities-stream-isolation-and-snapshot-fallback';
  for (const identityId of ['701','702','703']) await directoryStore.setLink({ streamId, workerId: 1, identityId,
    expectedLinkId: null, actor: 1, confirmHistorical: identityId === '703' });
  await directoryStore.setLink({ streamId: otherStream, workerId: 2, identityId: '901', expectedLinkId: null, actor: 1 });
  await directoryStore.setLink({ streamId, workerId: 3, identityId: '704', expectedLinkId: null, actor: 1 });
  await fixture.execute('DELETE FROM attendance_biometric_users WHERE stream_id=? AND source_identity_id=?', [streamId, '704']);
  let finalRows = await attach();
  assert.equal(summary(finalRows, 1).state, 'linked');
  assert.deepEqual(summary(finalRows, 1).links.map(item => item.deviceUserId).sort(), ['0001','1','77']);
  assert.deepEqual(summary(finalRows, 2), { state: 'unlinked', links: [] });
  assert.deepEqual(summary(finalRows, 3), { state: 'linked', links: [{ deviceUserId: '99', displayName: 'Synthetic Saved Name' }] });
  await fixture.execute("UPDATE attendance_biometric_users SET device_id='different-device',display_name='Wrong coordinates must not rename saved binding' WHERE stream_id=? AND source_identity_id='702'", [streamId]);
  finalRows = await attach();
  assert.ok(summary(finalRows, 1).links.some(item => item.deviceUserId === '77' && item.displayName === 'Synthetic Beta'));
  assert.equal(acquisitions, 1);
  assert.equal(trace.filter(entry => /FROM\s+`?attendance_biometric_worker_links`?\s/i.test(entry.sql)).length, 1);
  checks.push('Multiple active versioned identities remain visible, other streams cannot supply current bindings, and absent or mismatched cache coordinates use saved link snapshots');

  stage = 'fail-closed-display-without-breaking-worker-page';
  const wrongDb = await attach(raw, { ATTENDANCE_SOURCE_DB_CONFIRMED_NAME: `${lab.schema}_other` });
  assert.ok(wrongDb.every(worker => worker.sourceBiometricLink?.state === 'unavailable'));
  assert.equal(trace.filter(entry => /FROM\s+`?attendance_biometric_worker_links`?\s/i.test(entry.sql)).length, 0);
  const malformed = await attach(raw, { BIOMETRIC_SOURCE_STREAM_ID: 'not-a-stream' });
  assert.ok(malformed.every(worker => worker.sourceBiometricLink?.state === 'unavailable'));
  assert.equal(acquisitions, 0);
  const unavailable = await attachWorkerSourceBiometricLinks(raw, { env, getPool: async () => { throw new Error('PRIVATE_SYNTHETIC_DB_ERROR'); } });
  assert.ok(unavailable.every(worker => worker.sourceBiometricLink?.state === 'unavailable'));
  assert.equal(JSON.stringify(unavailable).includes('PRIVATE_'), false);
  await fixture.query('RENAME TABLE attendance_biometric_worker_links TO owned_temporarily_missing_links');
  try {
    const missing = await attach();
    assert.ok(missing.every(worker => worker.sourceBiometricLink?.state === 'unavailable'));
  } finally { await fixture.query('RENAME TABLE owned_temporarily_missing_links TO attendance_biometric_worker_links'); }
  checks.push('Wrong database, invalid stream, missing tables and connection failures report unavailable without legacy fallback, false unlinked status, private errors or worker page failure');

  stage = 'real-worker-row-render-regressions';
  const { build } = await import('esbuild');
  const appDirectory = path.resolve(import.meta.dirname, '../..');
  const renderer = await build({ stdin: { contents: `
    import React from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    import WorkerRow from '@/components/WorkerRow';
    export function renderRow(worker,{biometricStatusUnavailable=Boolean(worker.previewRequestFailed)}={}){return renderToStaticMarkup(React.createElement('table',null,React.createElement('tbody',null,
      React.createElement(WorkerRow,{worker,biometricStatusUnavailable,onView:()=>{},onShowQR:()=>{},onExportQR:()=>{},onEdit:()=>{},hasPermission:false,
        getInitials:()=> 'تج',getGroupName:()=> 'مجموعة تجريبية',getStatusBadge:()=>React.createElement('span',null,'نشط')}))));}
    export function renderRows(workers){return workers.map(worker=>renderRow(worker)).join('');}
  `, resolveDir: appDirectory, sourcefile: 'worker-row-renderer.tsx', loader: 'tsx' }, bundle: true,
    write: false, platform: 'node', packages: 'external', format: 'esm', target: 'es2022', jsx: 'automatic',
    alias: { '@': path.join(appDirectory, 'client/src'), '@shared': path.join(appDirectory, 'shared') }, logLevel: 'silent' });
  const rendererFile = path.join(path.dirname(lab.data), 'worker-row-renderer.mjs');
  await fs.writeFile(rendererFile, renderer.outputFiles[0].contents);
  const { renderRow, renderRows } = await import(pathToFileURL(rendererFile).href);
  const legacyWorker = legacy.find(worker => worker.id === 288)!;
  const activeWorker = afterLink.find(worker => worker.id === 288)!;
  const revokedWorker = revoked.find(worker => worker.id === 288)!;
  const unavailableWorker = unavailable.find(worker => worker.id === 288)!;
  const legacyHtml = renderRow(legacyWorker);
  const activeHtml = renderRow(activeWorker);
  const revokedHtml = renderRow(revokedWorker);
  const unavailableHtml = renderRow(unavailableWorker);
  const refreshFailureHtml = renderRow(activeWorker, { biometricStatusUnavailable: true });
  const multipleHtml = renderRow(finalRows.find(worker => worker.id === 1));
  assert.ok(legacyHtml.includes('900002'));
  assert.ok(legacyHtml.includes('>مربوط<'));
  assert.equal(activeHtml.includes('900002'), false);
  assert.match(activeHtml, /<bdi[^>]*>1<\/bdi>/);
  assert.ok(activeHtml.includes('>مربوط<'));
  assert.equal(revokedHtml.includes('900002'), false);
  assert.ok(revokedHtml.includes('>غير مربوط<'));
  assert.equal(revokedHtml.includes('>مربوط<'), false);
  assert.ok(unavailableHtml.includes('تعذر التحقق من الربط'));
  assert.equal(unavailableHtml.includes('900002'), false);
  assert.equal(unavailableHtml.includes('>غير مربوط<'), false);
  assert.ok(refreshFailureHtml.includes('تعذر التحقق من الربط'));
  assert.equal(refreshFailureHtml.includes('900002'), false);
  assert.equal(refreshFailureHtml.includes('>مربوط<'), false);
  assert.equal(refreshFailureHtml.includes('>1</bdi>'), false);
  assert.ok(multipleHtml.includes('+2'));
  for (const pin of ['0001','1','77']) assert.ok(multipleHtml.includes(pin));
  checks.push('The actual WorkerRow renders active device PIN instead of 900002, shows unlinked after revocation, distinguishes unavailable, suppresses stale linked cache after a page refresh failure, preserves the legacy-only display and represents multiple active identities');

  stage = 'final-read-only-snapshot';
  const beforePreview = await snapshot();
  assert.deepEqual(await businessSnapshot(), preservedBusinessRows);
  if (process.argv.includes('--ui')) {
    const assets = path.join(appDirectory, 'dist/public/assets');
    const cssFiles = (await fs.readdir(assets)).filter(file => file.endsWith('.css')).sort();
    assert.ok(cssFiles.length);
    const css = await fs.readFile(path.join(assets, cssFiles[0]));
    let finish!: () => void;
    const finished = new Promise<void>(resolve => { finish = resolve; });
    previewServer = http.createServer(async (request, response) => {
      if (request.url === '/__finish-preview' && request.method === 'POST') { response.writeHead(204).end(); finish(); return; }
      if (request.method !== 'GET') { response.writeHead(405).end(); return; }
      if (request.url === '/preview.css') { response.writeHead(200, { 'content-type': 'text/css' }).end(css); return; }
      if (request.url !== '/') { response.writeHead(404).end(); return; }
      try {
        const currentRows = await attach();
        const errorDemo = { ...unavailableWorker, code: 'DEMO-ERROR', fullName: 'عامل تجريبي — تعذر التحقق' };
        const refreshDemo = { ...activeWorker, code: 'DEMO-REFRESH', fullName: 'عامل تجريبي — تعثر التحديث', previewRequestFailed: true };
        const legacyDemo = { ...legacyWorker, code: 'DEMO-LEGACY', fullName: 'عامل تجريبي — الوضع القديم' };
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        response.end(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>فحص شارة ربط العمال</title><link rel="stylesheet" href="/preview.css"><style>table{width:100%;margin-block:12px}</style></head><body class="bg-background text-foreground"><main class="mx-auto max-w-6xl space-y-5 p-5"><p class="text-sm text-muted-foreground">معاينة محلية ببيانات اصطناعية</p>${renderRows([...currentRows,errorDemo,refreshDemo,legacyDemo])}</main></body></html>`);
      } catch { response.writeHead(500).end('PREVIEW_FAILED'); }
    });
    await new Promise<void>((resolve, reject) => { previewServer!.once('error', reject); previewServer!.listen(0, '127.0.0.1', resolve); });
    const address = previewServer.address();
    assert.ok(address && typeof address !== 'string' && address.address === '127.0.0.1');
    process.stdout.write(JSON.stringify({ previewUrl: `http://127.0.0.1:${address.port}/`, finishUrl: `http://127.0.0.1:${address.port}/__finish-preview`,
      reads: 'Actual WorkerRow and current CSS, one real batch summary query; synthetic fixtures only' }) + '\n');
    await finished;
    checks.push('The real WorkerRow and current CSS were served with live read-only summary queries on the isolated fixture for browser review');
  }
  assert.deepEqual(await snapshot(), beforePreview);
  assert.deepEqual(await businessSnapshot(), preservedBusinessRows);
  checks.push('All helper and rendered-preview reads preserve every worker, legacy code, attendance row, financial row, setting and link history');

  async function installCreate(table: string) {
    const qualified = `\`test\`.\`${table}\``;
    const definition = (await fs.readFile(new URL('../../docs/sql/attendance-biometric-directory-2026-11-19.test.sql', import.meta.url), 'utf8'))
      .split(/\r?\n/).filter(line => !line.trimStart().startsWith('--')).join('\n')
      .split(';').map(value => value.trim()).find(value => value.startsWith(`CREATE TABLE ${qualified} (`));
    assert.ok(definition && lab && fixture);
    await fixture.query(definition.replace(qualified, `\`${lab.schema}\`.\`${table}\``));
  }
  async function directory(identityId: string, pin: string, status: string, name: string, stream = streamId) {
    await fixture!.execute(`INSERT INTO attendance_biometric_users
      (stream_id,source_identity_id,device_id,device_user_id,display_name,device_name,serial_number,status,last_synced_at_utc)
      VALUES (?,?,'9001',?,?,'Synthetic Device','SYNTHETIC-SERIAL',?,UTC_TIMESTAMP(6))`, [stream, identityId, pin, name, status]);
  }
  async function businessSnapshot() {
    const result: Record<string, unknown> = {};
    for (const table of ['workers','attendance_events','worker_daily_finance','settings']) {
      const [rows] = await fixture!.query(`SELECT * FROM \`${table}\``);
      result[table] = (rows as any[]).map(row => JSON.stringify(row)).sort();
    }
    return result;
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
  const candidate = (error as any)?.code ?? (error as any)?.message;
  const line = /acceptance\.mts:(\d+):\d+/.exec((error as any)?.stack ?? '')?.[1];
  failure = { stage, code: typeof candidate === 'string' && /^[A-Z][A-Z0-9_]{1,80}$/.test(candidate) ? candidate : 'WORKER_BADGE_ACCEPTANCE_FAILED',
    ...(line ? { line: Number(line) } : {}) };
} finally {
  try {
    if (previewServer) {
      const closed = new Promise<void>((resolve, reject) => previewServer!.close(error => error ? reject(error) : resolve()));
      previewServer.closeIdleConnections();
      await closed;
    }
  } catch { failure ??= { stage: 'close-preview', code: 'WORKER_BADGE_CLEANUP_FAILED' }; }
  try { await pool?.end(); await fixture?.end(); cleanup.localConnectionsClosed = true; }
  catch { failure ??= { stage: 'close-owned-connections', code: 'WORKER_BADGE_CLEANUP_FAILED' }; }
  try { if (lab) Object.assign(cleanup, await lab.close()); }
  catch { failure ??= { stage: 'stop-owned-mysql', code: 'WORKER_BADGE_CLEANUP_FAILED' }; }
}

const report = { passed: !failure, completedAtUtc: new Date().toISOString(),
  fixture: 'Synthetic records on a process-owned random loopback MySQL schema; no env file, real database or application startup',
  checks, cleanup, ...(failure ? { failure } : {}) };
await fs.writeFile(path.join(import.meta.dirname, 'result.json'), JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify(report) + '\n');
if (failure) process.exitCode = 1;
