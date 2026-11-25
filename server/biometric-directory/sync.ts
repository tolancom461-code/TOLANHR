import { validateStreamId } from '../biometric-source-importer/config';
import { BiometricDirectorySyncError, validateDirectoryPage, type DirectorySourceApi } from './http-source';
import { BiometricDirectoryError, type DirectoryCacheStore } from './types';

export interface DirectorySyncResult {
  state: 'completed' | 'busy' | 'stopped';
  pages: number;
  upserted: number;
  nextCursor: string;
  sweepCompleted: boolean;
}

/** Periodic callers mirror explicit metadata. Missing identities never imply a deletion. */
export function createBiometricDirectorySync({ source, cache, streamId: configuredStream, pageSize = 100, maxPages = 20 }:
  { source: DirectorySourceApi; cache: DirectoryCacheStore; streamId: string; pageSize?: number; maxPages?: number }) {
  const streamId = validateStreamId(configuredStream);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 20) {
    throw new BiometricDirectorySyncError('BIOMETRIC_DIRECTORY_CONFIG_INVALID');
  }
  let cursor = '0';
  let running = false;
  let stopped = false;
  let controller: AbortController | undefined;
  const resultFor = (state: DirectorySyncResult['state']): DirectorySyncResult =>
    ({ state, pages: 0, upserted: 0, nextCursor: cursor, sweepCompleted: false });
  return {
    async runOnce(): Promise<DirectorySyncResult> {
      if (stopped) return resultFor('stopped');
      if (running) return resultFor('busy');
      running = true;
      controller = new AbortController();
      const result = resultFor('completed');
      try {
        await cache.assertReady();
        for (let count = 0; count < maxPages && !stopped; count++) {
          const page = validateDirectoryPage(await source.fetchPage({ afterId: cursor, limit: pageSize }, controller.signal), streamId, cursor, pageSize);
          if (stopped) break;
          const saved = await cache.upsertDirectoryPage({ streamId, items: page.items });
          result.pages++;
          result.upserted += saved.upserted;
          cursor = page.hasMore ? page.nextCursor : '0';
          result.nextCursor = cursor;
          if (!page.hasMore) { result.sweepCompleted = true; break; }
        }
        if (stopped) result.state = 'stopped';
        return result;
      } catch (error) {
        cursor = '0';
        if (stopped) return resultFor('stopped');
        if (error instanceof BiometricDirectorySyncError || error instanceof BiometricDirectoryError) throw error;
        throw new BiometricDirectorySyncError('BIOMETRIC_DIRECTORY_SYNC_FAILED');
      } finally { running = false; controller = undefined; }
    },
    stop() { stopped = true; controller?.abort(); },
  };
}
