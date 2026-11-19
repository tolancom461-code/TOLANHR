/**
 * Compatibility contract: existing attendance TIMESTAMP columns contain Riyadh
 * wall-clock text in a UTC SQL session. Preserve those values; do not silently
 * mix true-UTC rows into them. The source inbox's *_utc fields remain UTC.
 */
export const RIYADH_TIME_ZONE = 'Asia/Riyadh';
export const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const WALL_CLOCK = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2})(\.\d{1,6})?)?$/;
const OFFSET_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function invalidDate() { return new Date(Number.NaN); }

/** Unqualified legacy SQL strings mean Riyadh, independently of the host timezone. */
export function parseAttendanceTime(value: Date | string | number): Date {
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value === 'number') return new Date(value);
  if (typeof value !== 'string') return invalidDate();
  const wall = WALL_CLOCK.exec(value);
  if (wall) {
    const second = wall[3] ?? '00';
    const fraction = wall[4] ?? '';
    const date = new Date(`${wall[1]}T${wall[2]}:${second}${fraction}+03:00`);
    if (!Number.isFinite(date.getTime())) return invalidDate();
    // Reject rolled dates such as February 30 instead of silently changing history.
    const expected = `${wall[1]}T${wall[2]}:${second}`;
    return new Date(date.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 19) === expected ? date : invalidDate();
  }
  return OFFSET_TIME.test(value) ? new Date(value) : invalidDate();
}

/** Canonical SQL parameter for legacy attendance columns, never mysql2's local Date conversion. */
export function attendanceTimeToDatabase(value: Date | string | number): string {
  const instant = parseAttendanceTime(value);
  if (!Number.isFinite(instant.getTime())) throw new Error('ATTENDANCE_TIME_INVALID');
  return new Date(instant.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 23).replace('T', ' ');
}

/** Explicit offset makes API values represent the same instant as the source inbox. */
export function attendanceTimeFromDatabase(value: string): string {
  const wall = typeof value === 'string' ? WALL_CLOCK.exec(value) : null;
  if (!wall || !Number.isFinite(parseAttendanceTime(value).getTime())) {
    // Preserve invalid historical values; UI helpers render them as unavailable.
    return value;
  }
  return `${wall[1]}T${wall[2]}:${wall[3] ?? '00'}${wall[4] ?? ''}+03:00`;
}

export function formatRiyadhAttendanceTime(
  value: Date | string | number | null | undefined,
  options: Intl.DateTimeFormatOptions = {},
): string {
  if (value === null || value === undefined || value === '') return '-';
  const instant = parseAttendanceTime(value);
  if (!Number.isFinite(instant.getTime())) return '-';
  return instant.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', ...options, timeZone: RIYADH_TIME_ZONE });
}

/** HH:mm for a Riyadh editing input; never getHours() in the browser's local zone. */
export function attendanceTimeInput(value: Date | string | number | null | undefined): string {
  if (value == null || value === '') return '';
  const instant = parseAttendanceTime(value);
  return Number.isFinite(instant.getTime())
    ? new Date(instant.getTime() + RIYADH_OFFSET_MS).toISOString().slice(11, 16) : '';
}

export function riyadhDateTime(day: string, time: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) return invalidDate();
  return parseAttendanceTime(`${day} ${time}:00`);
}
