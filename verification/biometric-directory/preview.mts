// Local UI fixture only: real worker-link procedures with an in-memory store. No database/env-file access.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import { build } from 'esbuild';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { router } from '../../server/_core/trpc';
import { createBiometricDirectoryWorkerProcedures } from '../../server/biometric-directory/router';
import type { DirectoryIdentity, WorkerLinkItem } from '../../server/biometric-directory/types';

const root = path.resolve(import.meta.dirname, '../..');
const streamId = '35d108c3-6b73-41b1-a4d6-e65dc4db3c74';
const stamp = '2026-11-19T12:00:00.000000Z';
const identities: DirectoryIdentity[] = [
  { identityId: '73', deviceId: '1', deviceUserId: '1', displayName: 'demo user', deviceName: 'SpeedFace — جهاز تجريبي', serialNumber: 'DEMO-ONLY', status: 'current', firstSeenAtUtc: stamp, lastSeenAtUtc: stamp, identityStartedAtUtc: stamp, identityEndedAtUtc: null },
  { identityId: '74', deviceId: '1', deviceUserId: '1212', displayName: 'nnbb', deviceName: 'SpeedFace — جهاز تجريبي', serialNumber: 'DEMO-ONLY', status: 'current', firstSeenAtUtc: stamp, lastSeenAtUtc: stamp, identityStartedAtUtc: stamp, identityEndedAtUtc: null },
  { identityId: '75', deviceId: '1', deviceUserId: '2', displayName: 'another worker', deviceName: 'SpeedFace — جهاز تجريبي', serialNumber: 'DEMO-ONLY', status: 'current', firstSeenAtUtc: stamp, lastSeenAtUtc: stamp, identityStartedAtUtc: stamp, identityEndedAtUtc: null },
  { identityId: '71', deviceId: '1', deviceUserId: '1', displayName: 'previous user', deviceName: 'SpeedFace — جهاز تجريبي', serialNumber: 'DEMO-ONLY', status: 'historical', firstSeenAtUtc: stamp, lastSeenAtUtc: stamp, identityStartedAtUtc: null, identityEndedAtUtc: stamp },
  { identityId: '76', deviceId: '1', deviceUserId: '99', displayName: 'orphan user', deviceName: 'SpeedFace — جهاز تجريبي', serialNumber: 'DEMO-ONLY', status: 'current', firstSeenAtUtc: stamp, lastSeenAtUtc: stamp, identityStartedAtUtc: stamp, identityEndedAtUtc: null },
];
const links = new Map<string, WorkerLinkItem>([['75', { ...identities[2], linkId: crypto.randomUUID(), streamId, workerId: 2, linkedAtUtc: stamp }], ['76', { ...identities[4], linkId: crypto.randomUUID(), streamId, workerId: 99, linkedAtUtc: stamp }]]);
const store = {
  async listUsers(input: any) {
    const rows = identities.filter(item => (input.roster === 'all' || item.status === input.roster)
      && (!input.search || `${item.displayName} ${item.deviceUserId}`.toLowerCase().includes(input.search.toLowerCase())));
    return { items: rows.map(item => { const link = links.get(item.identityId); return { ...item, streamId, lastSyncedAtUtc: stamp,
      linkId: link?.linkId ?? null, linkedWorkerExists: link ? link.workerId !== 99 : null, linkedWorker: link ? { id: link.workerId, code: link.workerId === 1 ? 'DEMO-W1' : link.workerId === 99 ? '' : 'DEMO-W2', fullName: link.workerId === 1 ? 'عامل تجريبي' : link.workerId === 99 ? 'عامل محذوف' : 'عامل آخر' } : null,
      linkState: !link ? 'available' : link.workerId === input.currentWorkerId ? 'linked_current' : 'linked_other' }; }), page: { number: 1, limit: 20, total: rows.length, totalPages: 1 } };
  },
  async listWorkerLinks(input: any) { return { items: [...links.values()].filter(link => link.workerId === input.workerId) }; },
  async setLink(input: any) {
    const identity = identities.find(item => item.identityId === input.identityId)!;
    const old = links.get(input.identityId);
    if ((old && old.workerId !== input.workerId) || (old?.linkId ?? null) !== input.expectedLinkId) throw Object.assign(new Error('CONFLICT'), { code: 'BIOMETRIC_DIRECTORY_CONFLICT' });
    if (identity.status === 'historical' && !input.confirmHistorical) throw Object.assign(new Error('HISTORICAL'), { code: 'BIOMETRIC_DIRECTORY_HISTORICAL_CONFIRMATION_REQUIRED' });
    const link = old ?? { ...identity, linkId: crypto.randomUUID(), streamId, workerId: input.workerId, linkedAtUtc: stamp };
    links.set(input.identityId, link); return { link, unchanged: Boolean(old) };
  },
  async revokeLink(input: any) { const old = links.get(input.identityId); if (!old || old.linkId !== input.expectedLinkId || old.workerId !== input.workerId) throw Object.assign(new Error('CONFLICT'), { code: 'BIOMETRIC_DIRECTORY_CONFLICT' }); links.delete(input.identityId); return { revoked: true, linkId: old.linkId, unchanged: false }; },
};
const api = router({ workers: router(createBiometricDirectoryWorkerProcedures(async () => ({ streamId, store: store as any }), () => true)) });
const bundle = await build({ absWorkingDir: root, entryPoints: ['verification/biometric-directory/preview.tsx'], bundle: true,
  platform: 'browser', format: 'esm', write: false, jsx: 'automatic', alias: { '@': path.join(root, 'client/src'), '@shared': path.join(root, 'shared') }, logLevel: 'error' });
const cssDirectory = path.join(root, 'dist/public/assets');
const cssFile = (await fs.readdir(cssDirectory)).find(name => /^index-.*\.css$/.test(name));
if (!cssFile) throw new Error('Preview requires the existing application stylesheet');
const css = await fs.readFile(path.join(root, 'verification/biometric-directory/preview-built.css')).catch(() => fs.readFile(path.join(cssDirectory, cssFile)));
const app = express();
app.get('/', (_req, res) => res.type('html').send('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>معاينة ربط مستخدمي البصمة</title><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script type="module" src="/preview.js"></script></body></html>'));
app.get('/preview.css', (_req, res) => res.type('css').send(css));
app.get('/preview.js', (_req, res) => res.type('js').send(Buffer.from(bundle.outputFiles[0].contents)));
app.use('/api/trpc', createExpressMiddleware({ router: api, createContext: () => ({ user: { id: 7, role: 'super_admin' } } as any) }));
const server = app.listen(0, '127.0.0.1', () => console.log(`Synthetic worker-link preview http://127.0.0.1:${(server.address() as any).port}/`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
