import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import {
  attendanceEvents,
  biometricDevices,
  biometricRawEvents,
  biometricWorkerMappings,
  workers,
} from "../../drizzle/schema";
import { getDb } from "./connection";
import { processAttendanceToFinance } from "./daily-finance";
import { formatRiyadhDateTime, type BiometricEventType } from "../biometric/zkteco-push-parser";
import { decideBiometricAttendanceEvent } from "../biometric/biometric-attendance-rules";

export type BiometricRawProcessingStatus = 'pending' | 'processed' | 'duplicate' | 'unmapped' | 'review' | 'error';

function nowSqlDateTime(): string {
  return formatRiyadhDateTime(new Date());
}

export async function getBiometricDeviceBySerial(serialNumber: string) {
  const db = await getDb();
  if (!db) return null;
  const [device] = await db
    .select()
    .from(biometricDevices)
    .where(eq(biometricDevices.serialNumber, serialNumber))
    .limit(1);
  return device ?? null;
}

export async function touchBiometricDevice(
  deviceId: number,
  input: { ipAddress?: string | null; firmwareVersion?: string | null; platform?: string | null } = {},
) {
  const db = await getDb();
  if (!db) return;
  const patch: Record<string, unknown> = {
    lastSeenAt: nowSqlDateTime(),
  };
  if (input.ipAddress !== undefined) patch.lastIpAddress = input.ipAddress;
  if (input.firmwareVersion) patch.firmwareVersion = input.firmwareVersion;
  if (input.platform) patch.platform = input.platform;
  await db.update(biometricDevices).set(patch as any).where(eq(biometricDevices.id, deviceId));
}

export async function getBiometricWorkerMapping(deviceId: number, deviceUserId: string) {
  const db = await getDb();
  if (!db) return null;
  const [mapping] = await db
    .select()
    .from(biometricWorkerMappings)
    .where(and(
      eq(biometricWorkerMappings.deviceId, deviceId),
      eq(biometricWorkerMappings.deviceUserId, deviceUserId),
      eq(biometricWorkerMappings.isActive, 1),
    ))
    .limit(1);
  return mapping ?? null;
}

export async function getRawBiometricEventById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(biometricRawEvents)
    .where(eq(biometricRawEvents.id, id)).limit(1);
  return row ?? null;
}

export async function findRawBiometricEventByHash(payloadHash: string) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(biometricRawEvents)
    .where(eq(biometricRawEvents.payloadHash, payloadHash)).limit(1);
  return row ?? null;
}

export async function insertRawBiometricEvent(input: {
  deviceId: number | null;
  deviceSerial: string;
  deviceUserId: string;
  eventTimeLocal: string;
  rawStatus: string | null;
  normalizedEventType: BiometricEventType;
  verifyMode: string | null;
  workCode: string | null;
  rawPayload: string;
  payloadHash: string;
  sourceIp?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const existing = await findRawBiometricEventByHash(input.payloadHash);
  if (existing) return { row: existing, inserted: false as const };

  try {
    const result = await db.insert(biometricRawEvents).values({
      deviceId: input.deviceId,
      deviceSerial: input.deviceSerial,
      deviceUserId: input.deviceUserId,
      eventTimeLocal: input.eventTimeLocal,
      rawStatus: input.rawStatus,
      normalizedEventType: input.normalizedEventType,
      verifyMode: input.verifyMode,
      workCode: input.workCode,
      rawPayload: input.rawPayload,
      payloadHash: input.payloadHash,
      sourceIp: input.sourceIp ?? null,
      processingStatus: 'pending',
    });
    const insertId = Number((result as any)[0]?.insertId ?? 0);
    const [row] = insertId
      ? await db.select().from(biometricRawEvents).where(eq(biometricRawEvents.id, insertId)).limit(1)
      : await db.select().from(biometricRawEvents).where(eq(biometricRawEvents.payloadHash, input.payloadHash)).limit(1);
    if (!row) throw new Error('Failed to read inserted biometric event');
    return { row, inserted: true as const };
  } catch (error: any) {
    // The unique hash is the final concurrency guard if two identical PUSH
    // requests arrive at the same instant.
    const row = await findRawBiometricEventByHash(input.payloadHash);
    if (row) return { row, inserted: false as const };
    throw error;
  }
}

export async function updateRawBiometricEventStatus(
  id: number,
  status: BiometricRawProcessingStatus,
  patch: { attendanceEventId?: number | null; errorMessage?: string | null } = {},
) {
  const db = await getDb();
  if (!db) return;
  await db.update(biometricRawEvents).set({
    processingStatus: status,
    attendanceEventId: patch.attendanceEventId ?? null,
    errorMessage: patch.errorMessage ?? null,
    processedAt: nowSqlDateTime(),
  }).where(eq(biometricRawEvents.id, id));
}

/**
 * Converts one saved raw punch into the existing attendance_events model.
 * Device-selected IN/OUT is respected only when it does not break the current
 * session sequence. Ambiguous or contradictory punches are retained for review.
 */
export async function recordBiometricAttendance(input: {
  rawEventId: number;
  deviceId: number;
  deviceSerial: string;
  workerId: number;
  eventTime: Date;
  requestedEventType: BiometricEventType;
  verifyMode?: string | null;
  sourceIp?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const [worker] = await db.select().from(workers).where(eq(workers.id, input.workerId)).limit(1);
  if (!worker || worker.status !== 'active') {
    return { status: 'review' as const, reason: 'العامل غير موجود أو غير نشط' };
  }

  // Protect the unified attendance stream from double scans, regardless of
  // whether the previous scan came from QR, manual input, or another device.
  const cooldownStart = new Date(input.eventTime.getTime() - 3 * 60 * 1000);
  const cooldownEnd = new Date(input.eventTime.getTime() + 3 * 60 * 1000);
  const [recent] = await db.select().from(attendanceEvents)
    .where(and(
      eq(attendanceEvents.workerId, input.workerId),
      gte(attendanceEvents.eventTime, cooldownStart as any),
      lte(attendanceEvents.eventTime, cooldownEnd as any),
    ))
    .orderBy(desc(attendanceEvents.eventTime))
    .limit(1);

  if (recent) {
    return { status: 'duplicate' as const, attendanceEventId: recent.id, reason: 'حركة خلال نافذة منع التكرار (3 دقائق)' };
  }

  const lookback = new Date(input.eventTime.getTime() - 15 * 60 * 60 * 1000);
  const recentEvents = await db.select().from(attendanceEvents)
    .where(and(
      eq(attendanceEvents.workerId, input.workerId),
      gte(attendanceEvents.eventTime, lookback as any),
      lte(attendanceEvents.eventTime, input.eventTime as any),
    ))
    .orderBy(desc(attendanceEvents.eventTime))
    .limit(50);

  const decision = decideBiometricAttendanceEvent(
    input.requestedEventType,
    recentEvents[0]?.eventType ?? null,
  );
  if (decision.action === 'review') {
    return { status: 'review' as const, reason: decision.reason };
  }
  const eventType = decision.eventType;
  const isAutomatic = decision.isAutomatic;

  const { getAdministrativeWorkDate } = await import('../attendance-logic');
  const workDate = getAdministrativeWorkDate(input.eventTime);

  const result = await db.insert(attendanceEvents).values({
    workerId: input.workerId,
    eventType,
    eventTime: input.eventTime as any,
    workDate,
    method: 'biometric',
    // attendance_events.device_id belongs to the legacy generic devices model.
    // Keep it null to avoid mixing identifier domains; the biometric device
    // link is preserved losslessly through raw_event + deviceInfo.
    deviceId: null,
    verifiedBy: null,
    isAutomatic,
    note: `ZKTeco ADMS raw_event=${input.rawEventId}`,
    ipAddress: input.sourceIp ?? null,
    deviceInfo: JSON.stringify({
      provider: 'zkteco_adms',
      serialNumber: input.deviceSerial,
      verifyMode: input.verifyMode ?? null,
      rawEventId: input.rawEventId,
    }),
  });
  const attendanceEventId = Number((result as any)[0]?.insertId ?? 0);

  const workerLast = (worker as any).lastAttendanceAt ? new Date((worker as any).lastAttendanceAt) : null;
  if (!workerLast || input.eventTime.getTime() > workerLast.getTime()) {
    await db.update(workers).set({ lastAttendanceAt: input.eventTime as any }).where(eq(workers.id, input.workerId));
  }

  if (eventType === 'check_out') {
    try {
      await processAttendanceToFinance(input.workerId, workDate);
    } catch (error) {
      console.error('[Biometric] Daily finance recalculation failed:', error);
    }
  }

  return { status: 'processed' as const, attendanceEventId, eventType, workDate };
}

export async function listBiometricDevices() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(biometricDevices).orderBy(desc(biometricDevices.id));
}

export async function createBiometricDevice(input: {
  name: string;
  serialNumber: string;
  model?: string | null;
  protocolMode?: 'ta_push' | 'ac_push' | 'unknown';
  locationName?: string | null;
  costCenterId?: number | null;
  timezone?: string;
  createdBy?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const result = await db.insert(biometricDevices).values({
    name: input.name,
    serialNumber: input.serialNumber.trim(),
    model: input.model ?? null,
    protocolMode: input.protocolMode ?? 'ta_push',
    locationName: input.locationName ?? null,
    costCenterId: input.costCenterId ?? null,
    timezone: input.timezone ?? 'Asia/Riyadh',
    createdBy: input.createdBy ?? null,
    provider: 'zkteco_adms',
    isActive: 1,
    acceptEventsAfter: nowSqlDateTime(),
  });
  return Number((result as any)[0]?.insertId ?? 0);
}

export async function updateBiometricDevice(
  id: number,
  patch: Partial<{
    name: string;
    model: string | null;
    protocolMode: 'ta_push' | 'ac_push' | 'unknown';
    locationName: string | null;
    costCenterId: number | null;
    timezone: string;
    acceptEventsAfter: string;
    isActive: number;
  }>,
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(biometricDevices).set(patch as any).where(eq(biometricDevices.id, id));
}

export async function resetBiometricDeviceAcceptanceWindow(id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const acceptEventsAfter = nowSqlDateTime();
  await db.update(biometricDevices).set({ acceptEventsAfter }).where(eq(biometricDevices.id, id));
  return acceptEventsAfter;
}

export async function listBiometricMappings(deviceId?: number) {
  const db = await getDb();
  if (!db) return [];
  const base = db.select({
    id: biometricWorkerMappings.id,
    deviceId: biometricWorkerMappings.deviceId,
    workerId: biometricWorkerMappings.workerId,
    deviceUserId: biometricWorkerMappings.deviceUserId,
    isActive: biometricWorkerMappings.isActive,
    workerName: workers.fullName,
    workerCode: workers.code,
  }).from(biometricWorkerMappings)
    .leftJoin(workers, eq(workers.id, biometricWorkerMappings.workerId));

  if (deviceId) {
    return base.where(eq(biometricWorkerMappings.deviceId, deviceId)).orderBy(desc(biometricWorkerMappings.id));
  }
  return base.orderBy(desc(biometricWorkerMappings.id));
}

export async function upsertBiometricMapping(input: { deviceId: number; workerId: number; deviceUserId: string }) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.insert(biometricWorkerMappings).values({
    deviceId: input.deviceId,
    workerId: input.workerId,
    deviceUserId: input.deviceUserId.trim(),
    isActive: 1,
  }).onDuplicateKeyUpdate({
    set: { workerId: input.workerId, isActive: 1 },
  });
}

export async function setBiometricMappingActive(id: number, isActive: boolean) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(biometricWorkerMappings).set({ isActive: isActive ? 1 : 0 }).where(eq(biometricWorkerMappings.id, id));
}

export async function listBiometricRawEvents(input: {
  deviceId?: number;
  status?: BiometricRawProcessingStatus;
  limit?: number;
} = {}) {
  const db = await getDb();
  if (!db) return [];
  const clauses = [] as any[];
  if (input.deviceId) clauses.push(eq(biometricRawEvents.deviceId, input.deviceId));
  if (input.status) clauses.push(eq(biometricRawEvents.processingStatus, input.status));

  const query = db.select().from(biometricRawEvents);
  const filtered = clauses.length ? query.where(and(...clauses)) : query;
  return filtered.orderBy(desc(biometricRawEvents.id)).limit(Math.min(Math.max(input.limit ?? 100, 1), 500));
}

/**
 * Startup safety migration. The project already uses several idempotent runtime
 * migrations; these statements are kept here so a deployment can prepare the
 * feature without depending on the legacy Drizzle migration journal state.
 */
export async function runBiometricMigration() {
  const db = await getDb();
  if (!db) return;

  await db.execute(sql`CREATE TABLE IF NOT EXISTS biometric_devices (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    provider VARCHAR(50) NOT NULL DEFAULT 'zkteco_adms',
    model VARCHAR(80) NULL,
    serial_number VARCHAR(100) NOT NULL,
    protocol_mode ENUM('ta_push','ac_push','unknown') NOT NULL DEFAULT 'ta_push',
    location_name VARCHAR(160) NULL,
    cost_center_id INT NULL,
    timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Riyadh',
    is_active TINYINT NOT NULL DEFAULT 1,
    firmware_version VARCHAR(120) NULL,
    platform VARCHAR(120) NULL,
    last_seen_at DATETIME NULL,
    last_ip_address VARCHAR(45) NULL,
    accept_events_after DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_biometric_devices_serial (serial_number),
    KEY idx_biometric_devices_active (is_active),
    KEY idx_biometric_devices_cost_center (cost_center_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await db.execute(sql`CREATE TABLE IF NOT EXISTS biometric_worker_mappings (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    device_id INT NOT NULL,
    worker_id INT NOT NULL,
    device_user_id VARCHAR(50) NOT NULL,
    is_active TINYINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_biometric_mapping_device_user (device_id, device_user_id),
    KEY idx_biometric_mapping_worker (worker_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await db.execute(sql`CREATE TABLE IF NOT EXISTS biometric_raw_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    device_id INT NULL,
    device_serial VARCHAR(100) NOT NULL,
    device_user_id VARCHAR(50) NOT NULL,
    event_time_local VARCHAR(32) NOT NULL,
    raw_status VARCHAR(20) NULL,
    normalized_event_type ENUM('check_in','check_out','unknown') NOT NULL DEFAULT 'unknown',
    verify_mode VARCHAR(30) NULL,
    work_code VARCHAR(50) NULL,
    raw_payload TEXT NOT NULL,
    payload_hash CHAR(64) NOT NULL,
    processing_status ENUM('pending','processed','duplicate','unmapped','review','error') NOT NULL DEFAULT 'pending',
    attendance_event_id INT NULL,
    error_message VARCHAR(500) NULL,
    source_ip VARCHAR(45) NULL,
    received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME NULL,
    UNIQUE KEY uq_biometric_raw_payload_hash (payload_hash),
    KEY idx_biometric_raw_device_time (device_id, event_time_local),
    KEY idx_biometric_raw_user_time (device_user_id, event_time_local),
    KEY idx_biometric_raw_status (processing_status),
    KEY idx_biometric_raw_attendance (attendance_event_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}
