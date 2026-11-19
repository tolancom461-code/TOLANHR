import { normalizeUtc } from '../attendance-source-inbox/validation';
import { validateCursor, validateSourceOrigin, validateStreamId } from './config';
import { BiometricSourceImportError, type SourcePunch, type SourcePunchApi, type SourcePunchPage } from './types';

const MAX_RESPONSE_BYTES = 1024 * 1024;
const canonicalStates = ['check_in', 'check_out', 'break_out', 'break_in', 'overtime_in', 'overtime_out'];
const pageFields = ['schemaVersion', 'streamId', 'items', 'nextCursor', 'hasMore'];
const punchFields = ['sourceEventId', 'sourceDeviceId', 'sourceDeviceUserId', 'sourceIdentityId', 'eventType', 'rawState', 'eventTimeUtc'];

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length
    || Object.keys(value).some(key => !keys.includes(key))) throw invalid();
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.trim() !== value || !value.length) throw invalid();
  const characters = Array.from(value);
  if (characters.length > 128 || /[\u0000-\u001f\u007f]/.test(value)
    || characters.some(character => {
      const point = character.codePointAt(0)!;
      return point >= 0xd800 && point <= 0xdfff;
    })) throw invalid();
  return value;
}

/** Shared by the HTTP boundary and runner so an injected source cannot bypass its page contract. */
export function validateSourcePunchPage(value: unknown, streamId: string, afterId: string, limit: number): SourcePunchPage {
  const page = object(value, pageFields);
  let actualStream: string;
  try { actualStream = validateStreamId(page.streamId); }
  catch { throw invalid(); }
  if (page.schemaVersion !== 1 || actualStream !== streamId || !Array.isArray(page.items)
    || page.items.length > limit || typeof page.hasMore !== 'boolean') throw invalid();
  let nextCursor: string;
  try { nextCursor = validateCursor(page.nextCursor); }
  catch { throw invalid(); }
  const advance = BigInt(nextCursor) - BigInt(afterId);
  if (advance < BigInt(0) || ((page.hasMore || page.items.length > 0) && advance === BigInt(0))) throw invalid();
  const seen = new Set<string>();
  const items = page.items.map(value => {
    const item = object(value, punchFields);
    const sourceEventId = text(item.sourceEventId);
    if (seen.has(sourceEventId)) throw invalid();
    seen.add(sourceEventId);
    const state = canonicalStates.indexOf(String(item.eventType));
    if (state < 0 || typeof item.eventType !== 'string' || item.rawState !== String(state)) throw invalid();
    let eventTimeUtc: string;
    try { eventTimeUtc = normalizeUtc(item.eventTimeUtc); }
    catch { throw invalid(); }
    return { sourceEventId, sourceDeviceId: text(item.sourceDeviceId),
      sourceDeviceUserId: text(item.sourceDeviceUserId), sourceIdentityId: item.sourceIdentityId === null ? null : text(item.sourceIdentityId),
      eventType: item.eventType as SourcePunch['eventType'], rawState: item.rawState as string, eventTimeUtc };
  });
  return { schemaVersion: 1, streamId, items, nextCursor, hasMore: page.hasMore };
}

/** Read-only HTTP requests. Neither URLs nor tokens are included in thrown errors. */
export function createSourcePunchHttpClient(config: { apiUrl: string; token: string; streamId: string },
  { fetchFn = fetch, timeoutMs = 5000 }: { fetchFn?: typeof fetch; timeoutMs?: number } = {}): SourcePunchApi {
  const origin = validateSourceOrigin(config.apiUrl);
  const streamId = validateStreamId(config.streamId);
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(config.token) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new BiometricSourceImportError('BIOMETRIC_SOURCE_CONFIG_INVALID');
  }
  const token = config.token;
  return {
    async fetchPage({ afterId, limit }) {
      validateCursor(afterId);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw invalid();
      const url = new URL('/api/v1/source-punches', origin);
      url.searchParams.set('after_id', afterId);
      url.searchParams.set('limit', String(limit));
      try {
        const response = await fetchFn(url, { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
        if (response.status === 401 || response.status === 403) {
          await response.body?.cancel();
          throw new BiometricSourceImportError('BIOMETRIC_SOURCE_AUTH_FAILED');
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw new BiometricSourceImportError('BIOMETRIC_SOURCE_UNAVAILABLE');
        }
        const length = response.headers.get('content-length');
        if ((length !== null && (!/^[0-9]+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES))
          || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) {
          await response.body?.cancel();
          throw invalid();
        }
        const reader = response.body.getReader();
        const parts: Uint8Array[] = [];
        let total = 0;
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > MAX_RESPONSE_BYTES) { await reader.cancel(); throw invalid(); }
            parts.push(value);
          }
        } finally { reader.releaseLock(); }
        let body: unknown;
        try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts))); }
        catch { throw invalid(); }
        return validateSourcePunchPage(body, streamId, afterId, limit);
      } catch (error) {
        if (error instanceof BiometricSourceImportError) throw error;
        throw new BiometricSourceImportError('BIOMETRIC_SOURCE_UNAVAILABLE');
      }
    },
  };
}

function invalid() { return new BiometricSourceImportError('BIOMETRIC_SOURCE_RESPONSE_INVALID'); }
