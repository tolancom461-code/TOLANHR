import { SourceReviewError, type SourceReviewFilter } from './types';

export const REVIEW_STATUSES = ['all','accepted','already_recorded','pending','unmapped','review_only','manual_review','rejected','before_activation','needs_review'] as const;
export const REVIEW_MOVEMENTS = ['all','check_in','check_out','break_out','break_in','overtime_in','overtime_out'] as const;
export function invalid() { return new SourceReviewError('SOURCE_REVIEW_INVALID_INPUT'); }
export function reviewId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw invalid();
  return value.toLowerCase();
}
function calendarDate(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) throw invalid();
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== value) throw invalid();
  return value;
}
export function reviewFilter(value: SourceReviewFilter = {}) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype,null].includes(Object.getPrototypeOf(value))) throw invalid();
    const input: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || !['search','source','movement','status','dateFrom','dateTo','timeBasis','groupId','sort','page','limit'].includes(key)) throw invalid();
      const descriptor = Object.getOwnPropertyDescriptor(value,key);
      if (!descriptor || !Object.hasOwn(descriptor,'value')) throw invalid();
      input[key] = descriptor.value;
    }
    const search = input.search === undefined ? '' : input.search;
    const source = input.source === undefined ? 'all' : input.source; const movement = input.movement === undefined ? 'all' : input.movement;
    const status = input.status === undefined ? 'all' : input.status;
    const timeBasis = input.timeBasis === undefined ? 'event_time' : input.timeBasis; const sort = input.sort === undefined ? 'desc' : input.sort;
    const page = input.page === undefined ? 1 : input.page; const limit = input.limit === undefined ? 20 : input.limit;
    if (typeof search !== 'string' || Array.from(search).length > 128 || /[\u0000-\u001f\u007f]/.test(search) ||
      !['all','qr','biometric'].includes(source as string) || !REVIEW_MOVEMENTS.includes(movement as any) ||
      !REVIEW_STATUSES.includes(status as any) || !['event_time','received_at'].includes(timeBasis as string) ||
      !['asc','desc'].includes(sort as string) || !Number.isInteger(page) || Number(page)<1 || Number(page)>100000 ||
      ![20,50,100].includes(limit as number) || (input.groupId !== undefined &&
        (typeof input.groupId !== 'number' || !Number.isSafeInteger(input.groupId) || input.groupId < 1 || input.groupId > 2147483647))) throw invalid();
    const dateFrom = input.dateFrom === undefined ? undefined : calendarDate(input.dateFrom);
    const dateTo = input.dateTo === undefined ? undefined : calendarDate(input.dateTo);
    if (dateFrom && dateTo && dateFrom > dateTo) throw invalid();
    return { search: search.trim(), source: source as 'all'|'qr'|'biometric', movement: movement as NonNullable<SourceReviewFilter['movement']>,
      status: status as NonNullable<SourceReviewFilter['status']>, timeBasis: timeBasis as 'event_time'|'received_at',
      sort: sort as 'asc'|'desc', page: page as number, limit: limit as 20|50|100, dateFrom,dateTo,
      groupId: input.groupId as number|undefined };
  } catch { throw invalid(); }
}

/** Selected dates are calendar days in Riyadh; the upper bound is exclusive. */
export function riyadhCalendarBounds(dateFrom?: string,dateTo?: string) {
  const lower = dateFrom ? new Date(`${calendarDate(dateFrom)}T00:00:00.000+03:00`) : null;
  const upper = dateTo ? new Date(new Date(`${calendarDate(dateTo)}T00:00:00.000+03:00`).getTime()+86400000) : null;
  const sql = (value: Date|null) => value ? value.toISOString().replace('T',' ').replace('Z','').padEnd(26,'0') : null;
  return { lowerUtc: sql(lower), upperUtcExclusive: sql(upper) };
}
