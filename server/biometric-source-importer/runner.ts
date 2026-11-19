import { createHash } from 'node:crypto';
import { SourceInboxError } from '../attendance-source-inbox/types';
import { validateCursor, validateStreamId } from './config';
import { validateSourcePunchPage } from './http-source';
import { BiometricSourceImportError, type ImportProgress, type SourceImportInbox,
  type SourceImportProgressStore, type SourceImportRunResult, type SourcePunchApi } from './types';

export function sourcePunchInboxKey(streamId: string, sourceEventId: string): string {
  return `bio:${createHash('sha256').update(JSON.stringify([validateStreamId(streamId), sourceEventId])).digest('hex')}`;
}

export function validateImportProgress(value: unknown, expectedStream: string): ImportProgress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidProgress();
  const state = value as Record<string, unknown>;
  if (Object.keys(state).length !== 4 || state.schemaVersion !== 1 || state.streamId !== expectedStream
    || !Object.hasOwn(state, 'tailCursor') || !Object.hasOwn(state, 'reconcileCursor')) throw invalidProgress();
  try { validateCursor(state.tailCursor); validateCursor(state.reconcileCursor); }
  catch { throw invalidProgress(); }
  if (BigInt(state.reconcileCursor as string) > BigInt(state.tailCursor as string)) throw invalidProgress();
  return { schemaVersion: 1, streamId: expectedStream, tailCursor: state.tailCursor as string,
    reconcileCursor: state.reconcileCursor as string };
}

/** Explicit one-batch runner. Timers, startup activation and automatic attendance processing belong to callers. */
export function createBiometricSourceImporter({ source, inbox, progress, streamId: configuredStream,
  pageSize = 100, maxPages = 5 }: { source: SourcePunchApi; inbox: SourceImportInbox;
    progress: SourceImportProgressStore; streamId: string; pageSize?: number; maxPages?: number }) {
  const streamId = validateStreamId(configuredStream);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || !Number.isInteger(maxPages) || maxPages < 2 || maxPages > 20) {
    throw new BiometricSourceImportError('BIOMETRIC_SOURCE_CONFIG_INVALID');
  }
  let running = false;
  return {
    async runOnce(): Promise<SourceImportRunResult> {
      if (running) return { state: 'busy', pages: 0, received: 0, inserted: 0, replayed: 0,
        nextCursor: null, tailCursor: null, reconcileCursor: null, sweepCompleted: false };
      running = true;
      try {
        await inbox.assertReady();
        const saved = await progress.load();
        const position = saved === null ? { schemaVersion: 1 as const, streamId, tailCursor: '0', reconcileCursor: '0' }
          : validateImportProgress(saved, streamId);
        const result: SourceImportRunResult = { state: 'completed', pages: 0, received: 0, inserted: 0,
          replayed: 0, nextCursor: position.tailCursor, tailCursor: position.tailCursor,
          reconcileCursor: position.reconcileCursor, sweepCompleted: false };

        const capturePage = async (cursor: string) => {
          const page = validateSourcePunchPage(await source.fetchPage({ afterId: cursor, limit: pageSize }), streamId, cursor, pageSize);
          for (const event of page.items) {
            const captured = await inbox.capture({ source: 'biometric', sourceEventId: sourcePunchInboxKey(streamId, event.sourceEventId),
              sourceDeviceId: event.sourceDeviceId, sourceDeviceUserId: event.sourceDeviceUserId,
              sourceIdentityId: event.sourceIdentityId, workerId: null, sourcePersonCode: null, sourceUserName: null,
              eventType: event.eventType, rawState: event.rawState, eventTimeUtc: event.eventTimeUtc });
            result.received++;
            if (captured.replayed) result.replayed++;
            else result.inserted++;
          }
          result.pages++;
          return page;
        };

        const savePosition = async () => {
          await progress.save({ ...position });
          result.nextCursor = position.tailCursor;
          result.tailCursor = position.tailCursor;
          result.reconcileCursor = position.reconcileCursor;
        };

        // Reserve at least one page for reconciliation even while the tail is busy.
        for (let count = 0; count < maxPages - 1; count++) {
          const page = await capturePage(position.tailCursor);
          position.tailCursor = page.nextCursor;
          await savePosition();
          if (!page.hasMore) break;
        }
        while (result.pages < maxPages) {
          const page = await capturePage(position.reconcileCursor);
          position.reconcileCursor = page.hasMore ? page.nextCursor : '0';
          if (BigInt(page.nextCursor) > BigInt(position.tailCursor)) position.tailCursor = page.nextCursor;
          await savePosition();
          if (!page.hasMore) { result.sweepCompleted = true; break; }
        }
        return result;
      } catch (error) {
        if (error instanceof BiometricSourceImportError || error instanceof SourceInboxError) throw error;
        throw new BiometricSourceImportError('BIOMETRIC_SOURCE_IMPORT_FAILED');
      } finally { running = false; }
    },
  };
}

function invalidProgress() { return new BiometricSourceImportError('BIOMETRIC_SOURCE_PROGRESS_INVALID'); }
