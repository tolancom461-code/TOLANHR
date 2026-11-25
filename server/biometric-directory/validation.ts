import { BiometricDirectoryError, type DirectoryIdentity, type ListDirectoryUsersInput,
  type RevokeDirectoryLinkInput, type SetDirectoryLinkInput } from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BAD_TEXT = new RegExp('[\\u0000-\\u001f\\u007f\\p{Surrogate}]', 'u');
export function invalid(): BiometricDirectoryError { return new BiometricDirectoryError('BIOMETRIC_DIRECTORY_INVALID_INPUT'); }
export function snapshot(value: unknown, allowed: string[]): Record<string, unknown> {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw invalid();
    const result: Record<string, unknown> = Object.create(null);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || !allowed.includes(key)) throw invalid();
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw invalid();
      result[key] = descriptor.value;
    }
    return result;
  } catch { throw invalid(); }
}
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw invalid();
  return value.toLowerCase();
}
export function positiveId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 2147483647) throw invalid();
  return value;
}
export function text(value: unknown, maximum: number, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !value.length || Array.from(value).length > maximum || value.trim() !== value || BAD_TEXT.test(value)) throw invalid();
  return value;
}
function utc(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw invalid();
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?Z$/.exec(value);
  if (!match || Number(match[1].slice(0, 4)) < 1000) throw invalid();
  const second = `${match[1]}T${match[2]}`;
  const fraction = (match[3] ?? '').padEnd(6, '0');
  const parsed = new Date(`${second}.${fraction.slice(0, 3)}Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 19) !== second) throw invalid();
  return `${second}.${fraction}Z`;
}
function metadataText(value: unknown, maximum: number, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || Array.from(value).length > maximum || BAD_TEXT.test(value)) throw invalid();
  return value;
}
export function identity(value: DirectoryIdentity): DirectoryIdentity {
  const input = snapshot(value, ['identityId', 'deviceId', 'deviceUserId', 'displayName', 'deviceName', 'serialNumber', 'status',
    'firstSeenAtUtc', 'lastSeenAtUtc', 'identityStartedAtUtc', 'identityEndedAtUtc']);
  if (Object.keys(input).length !== 11 || typeof input.status !== 'string' || !['current', 'historical'].includes(input.status)) throw invalid();
  return { identityId: text(input.identityId, 128)!, deviceId: text(input.deviceId, 128)!, deviceUserId: text(input.deviceUserId, 128)!,
    displayName: metadataText(input.displayName, 255, true), deviceName: metadataText(input.deviceName, 255)!,
    serialNumber: metadataText(input.serialNumber, 128)!, status: input.status as DirectoryIdentity['status'],
    firstSeenAtUtc: utc(input.firstSeenAtUtc), lastSeenAtUtc: utc(input.lastSeenAtUtc),
    identityStartedAtUtc: utc(input.identityStartedAtUtc), identityEndedAtUtc: utc(input.identityEndedAtUtc) };
}
export function listInput(value: ListDirectoryUsersInput): Required<Omit<ListDirectoryUsersInput, 'currentWorkerId'>> & { currentWorkerId?: number } {
  const input = snapshot(value, ['streamId', 'search', 'roster', 'sortBy', 'currentWorkerId', 'page', 'limit']);
  const search = input.search === undefined || input.search === '' ? '' : text(input.search, 128)!;
  const roster = input.roster === undefined ? 'current' : input.roster;
  const sortBy = input.sortBy === undefined ? 'device_user_id' : input.sortBy;
  const page = input.page === undefined ? 1 : input.page;
  const limit = input.limit === undefined ? 25 : input.limit;
  if (typeof roster !== 'string' || !['current', 'historical', 'all'].includes(roster) ||
      typeof sortBy !== 'string' || !['device_user_id', 'name'].includes(sortBy) || !Number.isInteger(page) || Number(page) < 1 || Number(page) > 10000 ||
      !Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 100) throw invalid();
  return { streamId: uuid(input.streamId), search, roster: roster as 'current' | 'historical' | 'all',
    sortBy: sortBy as 'device_user_id' | 'name', page: page as number, limit: limit as number,
    ...(input.currentWorkerId === undefined ? {} : { currentWorkerId: positiveId(input.currentWorkerId) }) };
}
export function setInput(value: SetDirectoryLinkInput): Required<SetDirectoryLinkInput> {
  const input = snapshot(value, ['workerId', 'identityId', 'streamId', 'actor', 'expectedLinkId', 'confirmHistorical']);
  if (input.confirmHistorical !== undefined && typeof input.confirmHistorical !== 'boolean') throw invalid();
  return { workerId: positiveId(input.workerId), identityId: text(input.identityId, 128)!, streamId: uuid(input.streamId),
    actor: positiveId(input.actor), expectedLinkId: input.expectedLinkId === null ? null : uuid(input.expectedLinkId),
    confirmHistorical: input.confirmHistorical === true };
}
export function revokeInput(value: RevokeDirectoryLinkInput): RevokeDirectoryLinkInput {
  const input = snapshot(value, ['workerId', 'identityId', 'streamId', 'actor', 'expectedLinkId']);
  return { workerId: positiveId(input.workerId), identityId: text(input.identityId, 128)!, streamId: uuid(input.streamId),
    actor: positiveId(input.actor), expectedLinkId: uuid(input.expectedLinkId) };
}
