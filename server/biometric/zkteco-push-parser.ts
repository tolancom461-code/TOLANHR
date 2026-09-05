import crypto from "crypto";

export type BiometricEventType = 'check_in' | 'check_out' | 'unknown';

export interface ZktecoAttendancePunch {
  deviceSerial: string;
  deviceUserId: string;
  eventTimeLocal: string;
  rawStatus: string | null;
  normalizedEventType: BiometricEventType;
  verifyMode: string | null;
  workCode: string | null;
  rawLine: string;
  payloadHash: string;
}

/**
 * Conservative mapping for the attendance-state field used by the current
 * integration profile. We intentionally recognize only the two states that
 * are required by the project. Any other value stays `unknown` and is handled
 * by the application's pairing/review rules rather than guessed.
 */
export function normalizeZktecoStatus(status: string | null | undefined): BiometricEventType {
  const value = (status ?? '').trim();
  if (value === '0') return 'check_in';
  if (value === '1') return 'check_out';
  return 'unknown';
}

/**
 * ATTLOG lines are normally tab-delimited. Some firmware/integration layers
 * use comma-delimited rows, so a conservative fallback is supported.
 * Expected logical order: PIN, timestamp, status, verify, work-code, ...
 */
export function parseZktecoAttLogBody(serialNumber: string, body: string): ZktecoAttendancePunch[] {
  const serial = serialNumber.trim();
  if (!serial) return [];

  const lines = body
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const punches: ZktecoAttendancePunch[] = [];

  for (const rawLine of lines) {
    let fields = rawLine.split('\t');
    if (fields.length < 2 && rawLine.includes(',')) {
      fields = rawLine.split(',');
    }
    fields = fields.map(field => field.trim());

    const deviceUserId = fields[0] ?? '';
    const eventTimeLocal = fields[1] ?? '';
    if (!deviceUserId || !eventTimeLocal) continue;

    const rawStatus = fields[2] || null;
    const verifyMode = fields[3] || null;
    const workCode = fields[4] || null;
    const normalizedEventType = normalizeZktecoStatus(rawStatus);

    // Work-code is deliberately not part of idempotency: if a firmware retries
    // the same physical punch with a changed auxiliary work-code, it is still
    // the same attendance event.
    const canonical = [serial, deviceUserId, eventTimeLocal, rawStatus ?? '', verifyMode ?? ''].join('|');
    const payloadHash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');

    punches.push({
      deviceSerial: serial,
      deviceUserId,
      eventTimeLocal,
      rawStatus,
      normalizedEventType,
      verifyMode,
      workCode,
      rawLine,
      payloadHash,
    });
  }

  return punches;
}

/**
 * Device timestamps contain no timezone offset. The project operates in
 * Asia/Riyadh (UTC+3, no DST), therefore convert explicitly to a UTC Date
 * without depending on the OS timezone.
 */
export function parseRiyadhLocalDateTime(value: string): Date | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;

  const [, y, m, d, hh, mm, ss] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const hour = Number(hh);
  const minute = Number(mm);
  const second = Number(ss);

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  // First validate the local calendar components before applying UTC+3.
  const calendarProbe = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    calendarProbe.getUTCFullYear() !== year ||
    calendarProbe.getUTCMonth() !== month - 1 ||
    calendarProbe.getUTCDate() !== day ||
    calendarProbe.getUTCHours() !== hour ||
    calendarProbe.getUTCMinutes() !== minute ||
    calendarProbe.getUTCSeconds() !== second
  ) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day, hour - 3, minute, second));
}

export function formatRiyadhDateTime(date: Date): string {
  const shifted = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`;
}
