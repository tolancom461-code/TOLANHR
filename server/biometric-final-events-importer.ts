import { and, desc, eq, gte, lte } from 'drizzle-orm';
import {
  attendanceEvents,
  biometricFinalEventImports,
  settings,
  workers,
} from '../drizzle/schema';
import { getAdministrativeWorkDate } from './attendance-logic';
import {
  BiometricIntegrationError,
  fetchBiometricFinalEventsPage,
  type BiometricFinalEvent,
} from './biometric-integration';
import { getDb } from './db/connection';
import { processAttendanceToFinance } from './db/daily-finance';

const CURSOR_SETTING_KEY = 'biometric_final_events_cursor';
const CURSOR_SETTING_DESCRIPTION = 'Main app cursor for biometric-service Final Events API';
const DEFAULT_POLL_INTERVAL_MS = 10_000;
const MIN_POLL_INTERVAL_MS = 5_000;
const MAX_POLL_INTERVAL_MS = 300_000;
const PAGE_LIMIT = 100;
const BOOTSTRAP_PAGE_LIMIT = 500;
const DUPLICATE_WINDOW_MS = 3 * 60 * 1000;

export type BiometricFinalEventImportStatus =
  | 'processed'
  | 'duplicate'
  | 'unmapped'
  | 'worker_inactive'
  | 'unsupported_event'
  | 'already_processed';

type SupportedAttendanceEventType = 'check_in' | 'check_out';

export type BiometricFinalEventImportOutcome = {
  eventId: string;
  status: BiometricFinalEventImportStatus;
  workerId: number | null;
  attendanceEventId: number | null;
  eventType: string;
};

export type BiometricFinalEventsImportRunResult = {
  state: 'disabled' | 'initialized' | 'polled';
  cursor: string | null;
  fetched: number;
  skippedHistorical: number;
  counts: Record<string, number>;
};

export function isSupportedFinalAttendanceEventType(value: string): value is SupportedAttendanceEventType {
  return value === 'check_in' || value === 'check_out';
}

export function finalEventUtcToSqlDateTime(value: string): string {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(\.\d{1,6})?Z$/);
  if (!match) throw new Error('Invalid biometric Final Event UTC timestamp');
  return `${match[1]} ${match[2]}${match[3] ?? ''}`;
}

function isImporterEnabled(): boolean {
  const value = String(process.env.BIOMETRIC_FINAL_EVENTS_IMPORT_ENABLED ?? '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function pollIntervalMs(): number {
  const raw = Number(process.env.BIOMETRIC_FINAL_EVENTS_IMPORT_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS);
  if (!Number.isFinite(raw)) return DEFAULT_POLL_INTERVAL_MS;
  return Math.min(Math.max(Math.trunc(raw), MIN_POLL_INTERVAL_MS), MAX_POLL_INTERVAL_MS);
}

function isDuplicateKeyError(error: any): boolean {
  return error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062;
}

async function readCursor(): Promise<string | null> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const [row] = await db.select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, CURSOR_SETTING_KEY))
    .limit(1);

  if (!row) return null;
  const value = String(row.value ?? '').trim();
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid ${CURSOR_SETTING_KEY} value in settings`);
  }
  return value;
}

async function saveCursor(cursor: string): Promise<void> {
  if (!/^\d+$/.test(cursor)) throw new Error('Invalid Final Events cursor');
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.insert(settings).values({
    key: CURSOR_SETTING_KEY,
    value: cursor,
    description: CURSOR_SETTING_DESCRIPTION,
  }).onDuplicateKeyUpdate({
    set: { value: cursor },
  });
}

async function discoverCurrentTail(): Promise<{ cursor: string; seen: number }> {
  let cursor = '0';
  let seen = 0;

  while (true) {
    const page = await fetchBiometricFinalEventsPage({ afterId: cursor, limit: BOOTSTRAP_PAGE_LIMIT });
    seen += page.items.length;
    const next = page.page.nextAfterId;

    if (page.page.hasMore && next === cursor) {
      throw new Error('Final Events API cursor did not advance during initialization');
    }

    cursor = next;
    if (!page.page.hasMore) return { cursor, seen };
  }
}

async function insertImportRecord(
  tx: any,
  event: BiometricFinalEvent,
  input: {
    workerId: number | null;
    status: Exclude<BiometricFinalEventImportStatus, 'already_processed'>;
    attendanceEventId?: number | null;
    message?: string | null;
  },
): Promise<void> {
  await tx.insert(biometricFinalEventImports).values({
    eventUuid: event.eventId,
    personCode: event.personCode,
    workerId: input.workerId,
    eventType: event.eventType,
    eventTimeUtc: finalEventUtcToSqlDateTime(event.eventTimeUtc),
    status: input.status,
    attendanceEventId: input.attendanceEventId ?? null,
    message: input.message ?? null,
  });
}

async function existingImportOutcome(event: BiometricFinalEvent): Promise<BiometricFinalEventImportOutcome | null> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const [existing] = await db.select({
    workerId: biometricFinalEventImports.workerId,
    attendanceEventId: biometricFinalEventImports.attendanceEventId,
  }).from(biometricFinalEventImports)
    .where(eq(biometricFinalEventImports.eventUuid, event.eventId))
    .limit(1);

  if (!existing) return null;
  return {
    eventId: event.eventId,
    status: 'already_processed',
    workerId: existing.workerId ?? null,
    attendanceEventId: existing.attendanceEventId ?? null,
    eventType: event.eventType,
  };
}

export async function importOneBiometricFinalEvent(
  event: BiometricFinalEvent,
): Promise<BiometricFinalEventImportOutcome> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  try {
    const outcome = await db.transaction(async (tx) => {
      const [alreadyImported] = await tx.select({
        workerId: biometricFinalEventImports.workerId,
        attendanceEventId: biometricFinalEventImports.attendanceEventId,
      }).from(biometricFinalEventImports)
        .where(eq(biometricFinalEventImports.eventUuid, event.eventId))
        .limit(1);

      if (alreadyImported) {
        return {
          eventId: event.eventId,
          status: 'already_processed' as const,
          workerId: alreadyImported.workerId ?? null,
          attendanceEventId: alreadyImported.attendanceEventId ?? null,
          eventType: event.eventType,
        };
      }

      const [worker] = await tx.select().from(workers)
        .where(eq(workers.biometricPersonCode, event.personCode))
        .limit(1);
      const workerId = worker?.id ?? null;

      if (!isSupportedFinalAttendanceEventType(event.eventType)) {
        await insertImportRecord(tx, event, {
          workerId,
          status: 'unsupported_event',
          message: `Final Event type ${event.eventType} is not an attendance check-in/check-out event`,
        });
        return {
          eventId: event.eventId,
          status: 'unsupported_event' as const,
          workerId,
          attendanceEventId: null,
          eventType: event.eventType,
        };
      }

      if (!worker) {
        await insertImportRecord(tx, event, {
          workerId: null,
          status: 'unmapped',
          message: 'No worker is linked to this biometric person code',
        });
        return {
          eventId: event.eventId,
          status: 'unmapped' as const,
          workerId: null,
          attendanceEventId: null,
          eventType: event.eventType,
        };
      }

      if (worker.status !== 'active') {
        await insertImportRecord(tx, event, {
          workerId: worker.id,
          status: 'worker_inactive',
          message: 'Linked worker is not active',
        });
        return {
          eventId: event.eventId,
          status: 'worker_inactive' as const,
          workerId: worker.id,
          attendanceEventId: null,
          eventType: event.eventType,
        };
      }

      const eventTime = new Date(event.eventTimeUtc);
      if (Number.isNaN(eventTime.getTime())) throw new Error('Invalid Final Event time');

      // QR and biometric can coexist. Only the SAME movement type inside the
      // 3-minute window is treated as a duplicate. check_in vs check_out stay distinct.
      const duplicateStart = new Date(eventTime.getTime() - DUPLICATE_WINDOW_MS);
      const duplicateEnd = new Date(eventTime.getTime() + DUPLICATE_WINDOW_MS);
      const [duplicateAttendance] = await tx.select({ id: attendanceEvents.id })
        .from(attendanceEvents)
        .where(and(
          eq(attendanceEvents.workerId, worker.id),
          eq(attendanceEvents.eventType, event.eventType),
          gte(attendanceEvents.eventTime, duplicateStart as any),
          lte(attendanceEvents.eventTime, duplicateEnd as any),
        ))
        .orderBy(desc(attendanceEvents.eventTime))
        .limit(1);

      if (duplicateAttendance) {
        await insertImportRecord(tx, event, {
          workerId: worker.id,
          status: 'duplicate',
          attendanceEventId: duplicateAttendance.id,
          message: 'Same attendance movement already exists within the 3-minute duplicate window',
        });
        return {
          eventId: event.eventId,
          status: 'duplicate' as const,
          workerId: worker.id,
          attendanceEventId: duplicateAttendance.id,
          eventType: event.eventType,
        };
      }

      const workDate = getAdministrativeWorkDate(eventTime);
      const result = await tx.insert(attendanceEvents).values({
        workerId: worker.id,
        eventType: event.eventType,
        eventTime: eventTime as any,
        workDate,
        method: 'biometric',
        deviceId: null,
        verifiedBy: null,
        isAutomatic: 1,
        note: 'Imported from biometric-service Final Events API',
        ipAddress: null,
        deviceInfo: JSON.stringify({ source: 'biometric-service', apiVersion: 'v1' }),
      });
      const attendanceEventId = Number((result as any)[0]?.insertId ?? 0);
      if (!attendanceEventId) throw new Error('Failed to read inserted attendance event id');

      const currentLastAttendance = worker.lastAttendanceAt
        ? new Date(worker.lastAttendanceAt as any)
        : null;
      if (
        !currentLastAttendance ||
        Number.isNaN(currentLastAttendance.getTime()) ||
        eventTime.getTime() > currentLastAttendance.getTime()
      ) {
        await tx.update(workers)
          .set({ lastAttendanceAt: eventTime as any })
          .where(eq(workers.id, worker.id));
      }

      await insertImportRecord(tx, event, {
        workerId: worker.id,
        status: 'processed',
        attendanceEventId,
      });

      return {
        eventId: event.eventId,
        status: 'processed' as const,
        workerId: worker.id,
        attendanceEventId,
        eventType: event.eventType,
        workDate,
      };
    });

    if (outcome.status === 'processed' && outcome.eventType === 'check_out') {
      try {
        await processAttendanceToFinance(outcome.workerId!, outcome.workDate);
      } catch (error) {
        console.error('[Biometric Final Events] Daily finance recalculation failed:', error);
        try {
          await db.update(biometricFinalEventImports).set({
            message: 'Attendance was recorded, but daily finance recalculation failed and should be retried',
          }).where(eq(biometricFinalEventImports.eventUuid, event.eventId));
        } catch {
          // Attendance/import idempotency must not depend on diagnostic message updates.
        }
      }
    }

    return outcome;
  } catch (error: any) {
    // The event UUID unique key is the final concurrency guard. If another
    // importer won the race, this transaction rolls back and we return the saved result.
    if (isDuplicateKeyError(error)) {
      const existing = await existingImportOutcome(event);
      if (existing) return existing;
    }
    throw error;
  }
}

function incrementCount(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

export async function runBiometricFinalEventsImportOnce(): Promise<BiometricFinalEventsImportRunResult> {
  if (!isImporterEnabled()) {
    return { state: 'disabled', cursor: null, fetched: 0, skippedHistorical: 0, counts: {} };
  }

  const currentCursor = await readCursor();
  if (currentCursor === null) {
    // Safe first start: establish a tail cursor without importing historical events.
    // This prevents the five existing test/finalized events (or any older history)
    // from suddenly changing the main attendance ledger when the consumer is enabled.
    const tail = await discoverCurrentTail();
    await saveCursor(tail.cursor);
    return {
      state: 'initialized',
      cursor: tail.cursor,
      fetched: 0,
      skippedHistorical: tail.seen,
      counts: {},
    };
  }

  const page = await fetchBiometricFinalEventsPage({ afterId: currentCursor, limit: PAGE_LIMIT });
  const counts: Record<string, number> = {};
  for (const event of page.items) {
    const outcome = await importOneBiometricFinalEvent(event);
    incrementCount(counts, outcome.status);
  }

  // Advance only after every event in this page has been durably handled.
  // If processing throws, the cursor remains unchanged and UUID idempotency makes retry safe.
  await saveCursor(page.page.nextAfterId);

  return {
    state: 'polled',
    cursor: page.page.nextAfterId,
    fetched: page.items.length,
    skippedHistorical: 0,
    counts,
  };
}

let importerTimer: NodeJS.Timeout | null = null;
let importerRunning = false;
let importerStopped = false;
let lastErrorKey = '';
let lastErrorLoggedAt = 0;

export function startBiometricFinalEventsImporter(): () => void {
  if (!isImporterEnabled()) {
    console.log('[Biometric Final Events] importer: disabled');
    return () => undefined;
  }

  if (importerTimer) return stopBiometricFinalEventsImporter;
  importerStopped = false;
  const interval = pollIntervalMs();
  console.log(`[Biometric Final Events] importer: enabled (poll every ${interval}ms)`);
  console.log('[Biometric Final Events] first enable is safe: historical events are skipped by cursor initialization');

  const run = async () => {
    if (importerStopped || importerRunning) return;
    importerRunning = true;
    try {
      const result = await runBiometricFinalEventsImportOnce();
      lastErrorKey = '';
      if (result.state === 'initialized') {
        console.log(`[Biometric Final Events] cursor initialized at ${result.cursor}; historical events skipped: ${result.skippedHistorical}`);
      } else if (result.state === 'polled' && result.fetched > 0) {
        console.log(`[Biometric Final Events] fetched ${result.fetched}; cursor=${result.cursor}; results=${JSON.stringify(result.counts)}`);
      }
    } catch (error: any) {
      const code = error instanceof BiometricIntegrationError ? error.code : (error?.code ?? error?.name ?? 'ERROR');
      const message = error instanceof Error ? error.message : String(error);
      const key = `${code}:${message}`;
      const now = Date.now();
      if (key !== lastErrorKey || now - lastErrorLoggedAt >= 60_000) {
        console.warn(`[Biometric Final Events] importer error (${code}): ${message}`);
        lastErrorKey = key;
        lastErrorLoggedAt = now;
      }
    } finally {
      importerRunning = false;
    }
  };

  void run();
  importerTimer = setInterval(() => void run(), interval);
  importerTimer.unref?.();
  return stopBiometricFinalEventsImporter;
}

export function stopBiometricFinalEventsImporter(): void {
  importerStopped = true;
  if (importerTimer) clearInterval(importerTimer);
  importerTimer = null;
}
