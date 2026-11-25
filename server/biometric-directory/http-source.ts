import { normalizeUtc } from '../attendance-source-inbox/validation';
import { validateCursor, validateSourceOrigin, validateStreamId } from '../biometric-source-importer/config';
import type { DirectoryIdentity, DirectoryPage } from './types';

const MAX_RESPONSE_BYTES = 1024 * 1024;
const pageFields = ['schemaVersion', 'streamId', 'items', 'nextCursor', 'hasMore'];
const identityFields = ['identityId', 'deviceId', 'deviceUserId', 'displayName', 'deviceName', 'serialNumber',
  'status', 'firstSeenAtUtc', 'lastSeenAtUtc', 'identityStartedAtUtc', 'identityEndedAtUtc'];

export class BiometricDirectorySyncError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'BiometricDirectorySyncError'; }
}

export interface DirectorySourceApi {
  fetchPage(input: { afterId: string; limit: number }, signal?: AbortSignal): Promise<DirectoryPage>;
}

function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== fields.length || Object.keys(value).some(key => !fields.includes(key))) throw invalid();
  return value as Record<string, unknown>;
}

function text(value: unknown, maximum: number, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && (!value.length || value.trim() !== value))) throw invalid();
  const characters = Array.from(value);
  if (characters.length > maximum || /[\u0000-\u001f\u007f]/.test(value) || characters.some(character => {
    const point = character.codePointAt(0)!;
    return point >= 0xd800 && point <= 0xdfff;
  })) throw invalid();
  return value;
}

function utcOrNull(value: unknown): string | null {
  if (value === null) return null;
  try { return normalizeUtc(value); }
  catch { throw invalid(); }
}

/** Names are directory metadata only. No punch snapshot or archive hash is constructed here. */
export function validateDirectoryPage(value: unknown, streamId: string, afterId: string, limit: number): DirectoryPage {
  const page = object(value, pageFields);
  let actualStream: string;
  let nextCursor: string;
  try { actualStream = validateStreamId(page.streamId); nextCursor = validateCursor(page.nextCursor); }
  catch { throw invalid(); }
  if (page.schemaVersion !== 1 || actualStream !== streamId || typeof page.hasMore !== 'boolean'
    || !Array.isArray(page.items) || page.items.length > limit) throw invalid();
  const advance = BigInt(nextCursor) - BigInt(afterId);
  if (advance < BigInt(0) || ((page.hasMore || page.items.length > 0) && advance === BigInt(0))) throw invalid();
  const seen = new Set<string>();
  const items: DirectoryIdentity[] = page.items.map(value => {
    const item = object(value, identityFields);
    const identityId = text(item.identityId, 128);
    if (seen.has(identityId) || typeof item.status !== 'string' || !['current', 'historical'].includes(item.status)) throw invalid();
    seen.add(identityId);
    return { identityId, deviceId: text(item.deviceId, 128), deviceUserId: text(item.deviceUserId, 128),
      displayName: item.displayName === null ? null : text(item.displayName, 255, true),
      deviceName: text(item.deviceName, 255, true), serialNumber: text(item.serialNumber, 128),
      status: item.status as DirectoryIdentity['status'], firstSeenAtUtc: utcOrNull(item.firstSeenAtUtc),
      lastSeenAtUtc: utcOrNull(item.lastSeenAtUtc), identityStartedAtUtc: utcOrNull(item.identityStartedAtUtc),
      identityEndedAtUtc: utcOrNull(item.identityEndedAtUtc) };
  });
  return { schemaVersion: 1, streamId, items, nextCursor, hasMore: page.hasMore };
}

export function createBiometricDirectoryHttpClient(config: { apiUrl: string; token: string; streamId: string },
  { fetchFn = fetch, timeoutMs = 5000 }: { fetchFn?: typeof fetch; timeoutMs?: number } = {}): DirectorySourceApi {
  const origin = validateSourceOrigin(config.apiUrl);
  const streamId = validateStreamId(config.streamId);
  const token = config.token;
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw invalid();
  return {
    async fetchPage({ afterId, limit }, signal) {
      validateCursor(afterId);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw invalid();
      const url = new URL('/api/v1/device-identities', origin);
      url.searchParams.set('after_id', afterId);
      url.searchParams.set('limit', String(limit));
      const timeout = AbortSignal.timeout(timeoutMs);
      try {
        const response = await fetchFn(url, { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          redirect: 'error', cache: 'no-store', signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
        if (response.status === 401 || response.status === 403) {
          await response.body?.cancel();
          throw new BiometricDirectorySyncError('BIOMETRIC_DIRECTORY_AUTH_FAILED');
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw new BiometricDirectorySyncError('BIOMETRIC_DIRECTORY_UNAVAILABLE');
        }
        const length = response.headers.get('content-length');
        if ((length !== null && (!/^[0-9]+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES))
          || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) {
          await response.body?.cancel();
          throw invalid();
        }
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > MAX_RESPONSE_BYTES) { await reader.cancel(); throw invalid(); }
            chunks.push(part.value);
          }
        } finally { reader.releaseLock(); }
        let value: unknown;
        try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
        catch { throw invalid(); }
        return validateDirectoryPage(value, streamId, afterId, limit);
      } catch (error) {
        if (error instanceof BiometricDirectorySyncError) throw error;
        throw new BiometricDirectorySyncError('BIOMETRIC_DIRECTORY_UNAVAILABLE');
      }
    },
  };
}

function invalid() { return new BiometricDirectorySyncError('BIOMETRIC_DIRECTORY_RESPONSE_INVALID'); }
