import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { startTolanHrMysql, osEnvironmentKeys } from '../tolanhr-pilot-mysql.mjs';
import type { DirectoryIdentity } from '../../server/biometric-directory/types';

// Synthetic data on a private loopback MySQL instance; never load the application or an env file.
const allowed = new Set(osEnvironmentKeys.map(key => key.toLowerCase()));
for (const key of Object.keys(process.env)) if (!allowed.has(key.toLowerCase())) delete process.env[key];
process.env.NODE_ENV = 'test';
const streamId = '35d108c3-6b73-41b1-a4d6-e65dc4db3c74';
const stamp = '2026-11-25T12:00:00.000000Z';
const checks: string[] = [];
let lab: Awaited<ReturnType<typeof startTolanHrMysql>> | undefined;
let connection: mysql.Connection | undefined;
let pool: mysql.Pool | undefined;
let httpServer: import('node:http').Server | undefined;
let failure: { stage: string; code: string } | undefined;
let stage = 'owned-mysql';
const cleanup: Record<string, unknown> = {};
const root = path.resolve(import.meta.dirname, '../..');

try {
  lab = await startTolanHrMysql();
  connection = await lab.connect();
  const [[actual]] = await connection.query<any[]>('SELECT DATABASE() AS db, @@port AS port, @@datadir AS datadir');
  assert.equal(actual.db, lab.schema);
  assert.equal(Number(actual.port), lab.port);
  assert.equal(path.resolve(actual.datadir), path.resolve(lab.data));
  const address = new URL(lab.databaseUrl);
  assert.equal(address.hostname, '127.0.0.1');
  pool = mysql.createPool({ host: '127.0.0.1', port: lab.port, database: lab.schema,
    user: decodeURIComponent(address.username), password: decodeURIComponent(address.password), timezone: 'Z',
    dateStrings: true, supportBigNumbers: true, bigNumberStrings: true, connectionLimit: 3,
    multipleStatements: false, flags: '-LOCAL_FILES' });
  const reviewed = (await fs.readFile(path.join(root, 'docs/sql/attendance-biometric-directory-2026-11-19.TESTCOPY2.sql'), 'utf8'));
  for (const table of ['attendance_biometric_users', 'attendance_biometric_worker_links']) {
    const target = `\`TESTCOPY2\`.\`${table}\``;
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const statements = reviewed.match(new RegExp(`CREATE TABLE ${escaped} \\([\\s\\S]*?\\) ENGINE=InnoDB[^;]*;`, 'g'));
    assert.equal(statements?.length, 1);
    await connection.query(statements![0].replace(target, `\`${lab.schema}\`.\`${table}\``));
  }
  await connection.execute("INSERT INTO workers (id,code,full_name,status) VALUES (1,'DEMO-W1','عامل تجريبي','active')");
  const { createMysqlBiometricDirectoryStore } = await import('../../server/biometric-directory/mysql-store');
  const store = createMysqlBiometricDirectoryStore(pool, lab.schema);
  const make = (id: string, pin: string, name: string | null, status: 'current' | 'historical' = 'current'): DirectoryIdentity => ({
    identityId: id, deviceId: '1', deviceUserId: pin, displayName: name,
    deviceName: 'SpeedFace — جهاز تجريبي', serialNumber: 'DEMO-ONLY', status,
    firstSeenAtUtc: stamp, lastSeenAtUtc: stamp, identityStartedAtUtc: stamp,
    identityEndedAtUtc: status === 'historical' ? stamp : null });
  const identities = [make('1', '2', 'Zulu'), make('2', '10', 'alpha'), make('3', '1212', 'MUAMEDRADMAN'),
    make('4', '0002', 'ALPHA'), make('5', '9007199254740992', 'Beta'), make('6', '9007199254740993', 'beta'),
    make('7', '9'.repeat(128), null), make('8', `1${'0'.repeat(126)}`, ''), make('9', '0', '   '),
    make('10', 'staff_A', 'literal%_mark'), make('11', 'X-7', 'Exclamation!'),
    ...Array.from({ length: 45 }, (_, index) => make(String(index + 20), String(index + 100), `Person ${String(index).padStart(2, '0')}`)),
    make('99', '3', 'Archived RAD', 'historical')];
  await store.upsertDirectoryPage({ streamId, items: identities });
  const snapshot = async () => {
    const output = {} as Record<string, unknown>;
    for (const table of ['attendance_biometric_users', 'attendance_biometric_worker_links', 'workers', 'attendance_events', 'worker_daily_finance']) {
      output[table] = (await connection!.query(`SELECT * FROM \`${table}\` ORDER BY 1`))[0];
    }
    return output;
  };
  const before = await snapshot();
  const allPages = async (sortBy: 'device_user_id' | 'name', search?: string) => {
    const result = [] as Awaited<ReturnType<typeof store.listUsers>>['items'];
    let total = 0;
    for (let page = 1; ; page++) {
      const response = await store.listUsers({ streamId, currentWorkerId: 1, roster: 'current', sortBy, search, page, limit: 20 });
      total = response.page.total;
      result.push(...response.items);
      if (page >= response.page.totalPages) break;
    }
    assert.equal(result.length, total);
    assert.equal(new Set(result.map(item => item.identityId)).size, total);
    return result;
  };
  stage = 'numeric-order-before-pagination';
  const byPin = await allPages('device_user_id');
  const numeric = byPin.filter(item => /^\d+$/.test(item.deviceUserId));
  assert.equal(byPin.slice(0, numeric.length).every(item => /^\d+$/.test(item.deviceUserId)), true);
  for (let index = 1; index < numeric.length; index++) assert.ok(BigInt(numeric[index - 1].deviceUserId) <= BigInt(numeric[index].deviceUserId));
  assert.ok(byPin.findIndex(item => item.deviceUserId === '2') < byPin.findIndex(item => item.deviceUserId === '10'));
  assert.ok(byPin.findIndex(item => item.deviceUserId === '10') < byPin.findIndex(item => item.deviceUserId === '1212'));
  assert.equal(byPin.slice(0, 20).some(item => item.identityId === '3'), false);
  assert.equal((await store.listUsers({ streamId, roster: 'current', limit: 20 })).items[0].deviceUserId, '0');
  checks.push('Numeric ordering covers every page, leading zeros, 128-digit PINs and values beyond JavaScript integer precision');
  stage = 'name-order-before-pagination';
  const byName = await allPages('name');
  const normalized = byName.map(item => item.displayName?.trim().toLowerCase() || null);
  let empty = false;
  for (let index = 0; index < normalized.length; index++) {
    if (normalized[index] === null) { empty = true; continue; }
    assert.equal(empty, false);
    if (index && normalized[index - 1] !== null) assert.ok(normalized[index - 1]! <= normalized[index]!);
  }
  assert.deepEqual((await allPages('name')).map(item => item.identityId), byName.map(item => item.identityId));
  checks.push('Case-insensitive A–Z order is global across pages, deterministic, with empty names last');
  stage = 'infix-search-across-pages';
  for (const search of ['RAD', 'rad', 'rAd']) {
    assert.deepEqual((await allPages('name', search)).map(item => item.displayName), ['MUAMEDRADMAN']);
  }
  assert.equal((await store.listUsers({ streamId, roster: 'all', sortBy: 'name', search: 'RAD' })).page.total, 2);
  checks.push('RAD, rad and rAd find MUAMEDRADMAN outside the initial page and honor the current/historical filter');
  stage = 'literal-search';
  for (const search of ['%', '_']) assert.deepEqual((await allPages('device_user_id', search)).map(item => item.displayName), ['literal%_mark']);
  assert.deepEqual((await allPages('name', '!')).map(item => item.displayName), ['Exclamation!']);
  checks.push('Search treats percent, underscore and exclamation as literal characters');
  stage = 'read-only';
  assert.deepEqual(await snapshot(), before);
  checks.push('All list/search/sort requests preserve directory rows, worker links, workers, attendance and finance');

  if (process.argv.includes('--ui')) {
    stage = 'synthetic-ui';
    const express = (await import('express')).default;
    const { build } = await import('esbuild');
    const { createExpressMiddleware } = await import('@trpc/server/adapters/express');
    const { router } = await import('../../server/_core/trpc');
    const { createBiometricDirectoryWorkerProcedures } = await import('../../server/biometric-directory/router');
    const api = router({ workers: router(createBiometricDirectoryWorkerProcedures(async () => ({ streamId, store }), () => true)) });
    const bundle = await build({ absWorkingDir: root, entryPoints: [path.join(root, 'verification/biometric-directory/preview.tsx')], bundle: true,
      platform: 'browser', format: 'esm', write: false, jsx: 'automatic', alias: { '@': path.join(root, 'client/src'), '@shared': path.join(root, 'shared') }, logLevel: 'error' });
    const assetDirectory = path.join(root, 'dist/public/assets');
    const cssFile = (await fs.readdir(assetDirectory)).find(file => /^index-.*\.css$/.test(file));
    assert.ok(cssFile);
    const css = await fs.readFile(path.join(assetDirectory, cssFile));
    const app = express();
    let finishPreview: (() => void) | undefined;
    const previewFinished = new Promise<void>(resolve => { finishPreview = resolve; });
    app.post('/__finish-preview', (_req, res) => { res.sendStatus(204); finishPreview?.(); });
    app.get('/', (_req, res) => res.type('html').send('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>اختبار ترتيب وبحث مستخدمي البصمة</title><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script type="module" src="/preview.js"></script></body></html>'));
    app.get('/preview.css', (_req, res) => res.type('css').send(css));
    app.get('/preview.js', (_req, res) => res.type('js').send(Buffer.from(bundle.outputFiles[0].contents)));
    app.use('/api/trpc', createExpressMiddleware({ router: api, createContext: () => ({ user: { id: 7, role: 'super_admin' } } as any) }));
    httpServer = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => httpServer!.once('listening', resolve));
    process.stdout.write(JSON.stringify({ passed: true, checks, previewUrl: `http://127.0.0.1:${(httpServer.address() as any).port}/` }) + '\n');
    await Promise.race([previewFinished, new Promise<void>(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); })]);
  }
} catch (error) {
  failure = { stage, code: typeof (error as any)?.code === 'string' ? (error as any).code : 'SORT_ACCEPTANCE_FAILED' };
} finally {
  if (httpServer) await new Promise<void>(resolve => { httpServer!.close(() => resolve()); httpServer!.closeAllConnections(); });
  try { await pool?.end(); await connection?.end(); cleanup.connectionsClosed = true; } catch { failure ??= { stage: 'cleanup', code: 'CLOSE_FAILED' }; }
  try { if (lab) Object.assign(cleanup, await lab.close()); } catch { failure ??= { stage: 'cleanup', code: 'MYSQL_STOP_FAILED' }; }
}
const report = { passed: !failure, checkedAtUtc: new Date().toISOString(), syntheticLoopbackOnly: true, checks, cleanup, ...(failure ? { failure } : {}) };
await fs.writeFile(path.join(import.meta.dirname, 'result.json'), JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify(report) + '\n');
if (failure) process.exitCode = 1;
