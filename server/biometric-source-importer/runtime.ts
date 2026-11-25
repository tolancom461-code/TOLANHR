import type { Pool } from 'mysql2/promise';
import { createAttendanceSourceInbox } from '../attendance-source-inbox/service';
import { createMysqlAttendanceSourceInboxStore } from '../attendance-source-inbox/mysql-store';
import { SourceInboxError } from '../attendance-source-inbox/types';
import { readBiometricSourceImportConfig } from './config';
import { createSourcePunchHttpClient } from './http-source';
import { createMysqlSourceImportProgressStore } from './mysql-progress';
import { createBiometricSourceImporter } from './runner';
import { BiometricSourceImportError } from './types';
import { createBiometricDirectoryHttpClient, BiometricDirectorySyncError } from '../biometric-directory/http-source';
import { createBiometricDirectorySync } from '../biometric-directory/sync';
import { createMysqlBiometricDirectoryStore } from '../biometric-directory/mysql-store';
import { BiometricDirectoryError } from '../biometric-directory/types';

async function applicationPool(): Promise<Pool> {
  const { getDb } = await import('../db/connection');
  const database = await getDb();
  const client = database?.$client;
  if (!client || typeof client.promise !== 'function') throw new BiometricSourceImportError('BIOMETRIC_SOURCE_DB_UNAVAILABLE');
  return client.promise();
}

/** Opt-in archive consumer only. The application's shared pool is never closed here. */
export function startBiometricSourceImporter({ env = process.env, getPool = applicationPool,
  diagnostic = (code: string) => console.log(`[Biometric source inbox] ${code}`) }:
  { env?: Record<string, string | undefined>; getPool?: () => Promise<Pool>; diagnostic?: (code: string) => void } = {}): () => void {
  const report = (code: string) => { try { diagnostic(code); } catch { /* Logging cannot change receipt durability. */ } };
  let config;
  try { config = readBiometricSourceImportConfig(env); }
  catch { report('BIOMETRIC_SOURCE_CONFIG_INVALID'); return () => {}; }
  if (!config) return () => {};
  if (/^(?:1|true|yes|on)$/i.test(env.BIOMETRIC_FINAL_EVENTS_IMPORT_ENABLED?.trim() ?? '')) {
    report('BIOMETRIC_SOURCE_IMPORT_MODE_CONFLICT');
    return () => {};
  }
  const settings = config;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let importer: ReturnType<typeof createBiometricSourceImporter> | undefined;
  let directoryTimer: ReturnType<typeof setTimeout> | undefined;
  let directorySync: ReturnType<typeof createBiometricDirectorySync> | undefined;
  let poolPromise: Promise<Pool> | undefined;
  const sharedPool = () => {
    if (poolPromise) return poolPromise;
    const pending = Promise.resolve().then(getPool);
    poolPromise = pending;
    void pending.catch(() => { if (poolPromise === pending) poolPromise = undefined; });
    return pending;
  };
  const run = async () => {
    try {
      if (!importer) {
        const pool = await sharedPool();
        if (stopped) return;
        importer = createBiometricSourceImporter({ source: createSourcePunchHttpClient(settings),
          inbox: createAttendanceSourceInbox(createMysqlAttendanceSourceInboxStore(pool, settings.expectedDatabase)),
          progress: createMysqlSourceImportProgressStore(pool, settings.expectedDatabase, settings.streamId),
          streamId: settings.streamId, pageSize: settings.pageSize, maxPages: settings.maxPages });
      }
      const result = await importer.runOnce();
      report(`completed pages=${result.pages} inserted=${result.inserted} replayed=${result.replayed} sweepCompleted=${result.sweepCompleted}`);
    } catch (error) {
      const code = error instanceof BiometricSourceImportError && /^BIOMETRIC_SOURCE_[A-Z_]+$/.test(error.code)
        ? error.code : error instanceof SourceInboxError && /^INBOX_[A-Z_]+$/.test(error.code)
          ? error.code : 'BIOMETRIC_SOURCE_IMPORT_FAILED';
      report(code);
    } finally {
      if (!stopped) { timer = setTimeout(() => { void run(); }, settings.intervalMs); timer.unref?.(); }
    }
  };
  const runDirectory = async () => {
    try {
      if (!directorySync) {
        const pool = await sharedPool();
        if (stopped) return;
        directorySync = createBiometricDirectorySync({ source: createBiometricDirectoryHttpClient(settings),
          cache: createMysqlBiometricDirectoryStore(pool, settings.expectedDatabase), streamId: settings.streamId });
      }
      const result = await directorySync.runOnce();
      report(`directory completed pages=${result.pages} upserted=${result.upserted} sweepCompleted=${result.sweepCompleted}`);
    } catch (error) {
      const code = (error instanceof BiometricDirectorySyncError || error instanceof BiometricDirectoryError)
        && /^BIOMETRIC_DIRECTORY_[A-Z_]+$/.test(error.code)
        ? error.code : 'BIOMETRIC_DIRECTORY_SYNC_FAILED';
      report(code);
    } finally {
      if (!stopped) { directoryTimer = setTimeout(() => { void runDirectory(); }, 60_000); directoryTimer.unref?.(); }
    }
  };
  report('enabled archive-only; attendance promotion disabled');
  void run();
  if (env.BIOMETRIC_SOURCE_DIRECTORY_ENABLED === 'true') void runDirectory();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (directoryTimer) clearTimeout(directoryTimer);
    directorySync?.stop();
  };
}
