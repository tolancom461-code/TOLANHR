import {
  getBiometricDeviceBySerial,
  getBiometricWorkerMapping,
  getRawBiometricEventById,
  insertRawBiometricEvent,
  recordBiometricAttendance,
  touchBiometricDevice,
  updateRawBiometricEventStatus,
} from "../db/biometric";
import { parseRiyadhLocalDateTime, parseZktecoAttLogBody } from "./zkteco-push-parser";


function validateEventWindow(device: { acceptEventsAfter: string }, eventTime: Date): string | null {
  const cutoff = parseRiyadhLocalDateTime(device.acceptEventsAfter);
  if (cutoff && eventTime.getTime() < cutoff.getTime()) {
    return `الحركة أقدم من بداية قبول الجهاز (${device.acceptEventsAfter})`;
  }

  // A small tolerance allows harmless clock drift, but prevents a badly set
  // device clock from writing attendance into the future.
  const futureToleranceMs = 10 * 60 * 1000;
  if (eventTime.getTime() > Date.now() + futureToleranceMs) {
    return 'وقت الجهاز متقدم أكثر من 10 دقائق عن وقت السيرفر';
  }
  return null;
}

export interface ZktecoUploadResult {
  serialNumber: string;
  received: number;
  accepted: number;
  duplicate: number;
  unmapped: number;
  review: number;
  errors: number;
  unknownDevice: boolean;
}

export async function processZktecoAttendanceUpload(input: {
  serialNumber: string;
  body: string;
  sourceIp?: string | null;
}) : Promise<ZktecoUploadResult> {
  const result: ZktecoUploadResult = {
    serialNumber: input.serialNumber,
    received: 0,
    accepted: 0,
    duplicate: 0,
    unmapped: 0,
    review: 0,
    errors: 0,
    unknownDevice: false,
  };

  const device = await getBiometricDeviceBySerial(input.serialNumber);
  if (!device || !device.isActive) {
    result.unknownDevice = true;
    return result;
  }

  await touchBiometricDevice(device.id, { ipAddress: input.sourceIp ?? null });

  const punches = parseZktecoAttLogBody(input.serialNumber, input.body)
    .sort((a, b) => a.eventTimeLocal.localeCompare(b.eventTimeLocal));
  result.received = punches.length;

  for (const punch of punches) {
    let rawEventId: number | null = null;
    try {
      const stored = await insertRawBiometricEvent({
        deviceId: device.id,
        deviceSerial: input.serialNumber,
        deviceUserId: punch.deviceUserId,
        eventTimeLocal: punch.eventTimeLocal,
        rawStatus: punch.rawStatus,
        normalizedEventType: punch.normalizedEventType,
        verifyMode: punch.verifyMode,
        workCode: punch.workCode,
        rawPayload: punch.rawLine,
        payloadHash: punch.payloadHash,
        sourceIp: input.sourceIp ?? null,
      });

      if (!stored.inserted) {
        result.duplicate += 1;
        continue;
      }

      rawEventId = Number(stored.row.id);
      const eventTime = parseRiyadhLocalDateTime(punch.eventTimeLocal);
      if (!eventTime) {
        await updateRawBiometricEventStatus(rawEventId!, 'error', { errorMessage: 'وقت البصمة غير صالح' });
        result.errors += 1;
        continue;
      }

      const windowProblem = validateEventWindow(device, eventTime);
      if (windowProblem) {
        await updateRawBiometricEventStatus(rawEventId!, 'review', { errorMessage: windowProblem });
        result.review += 1;
        continue;
      }

      const mapping = await getBiometricWorkerMapping(device.id, punch.deviceUserId);
      if (!mapping) {
        await updateRawBiometricEventStatus(rawEventId!, 'unmapped', {
          errorMessage: `لا يوجد ربط لرقم المستخدم ${punch.deviceUserId} على الجهاز`,
        });
        result.unmapped += 1;
        continue;
      }

      const attendance = await recordBiometricAttendance({
        rawEventId,
        deviceId: device.id,
        deviceSerial: input.serialNumber,
        workerId: mapping.workerId,
        eventTime,
        requestedEventType: punch.normalizedEventType,
        verifyMode: punch.verifyMode,
        sourceIp: input.sourceIp ?? null,
      });

      if (attendance.status === 'processed') {
        await updateRawBiometricEventStatus(rawEventId!, 'processed', { attendanceEventId: attendance.attendanceEventId });
        result.accepted += 1;
      } else if (attendance.status === 'duplicate') {
        await updateRawBiometricEventStatus(rawEventId!, 'duplicate', {
          attendanceEventId: attendance.attendanceEventId,
          errorMessage: attendance.reason,
        });
        result.duplicate += 1;
      } else {
        await updateRawBiometricEventStatus(rawEventId!, 'review', { errorMessage: attendance.reason });
        result.review += 1;
      }
    } catch (error: any) {
      console.error('[Biometric] Punch processing failed:', error);
      if (rawEventId) {
        try {
          await updateRawBiometricEventStatus(rawEventId, 'error', { errorMessage: String(error?.message || error).slice(0, 500) });
        } catch (statusError) {
          console.error('[Biometric] Failed to mark raw event as error:', statusError);
        }
      }
      result.errors += 1;
    }
  }

  return result;
}

export async function reprocessZktecoRawEvent(rawEventId: number) {
  const raw = await getRawBiometricEventById(rawEventId);
  if (!raw) throw new Error('حركة البصمة الخام غير موجودة');
  if (raw.processingStatus === 'processed' || raw.processingStatus === 'duplicate') {
    return { status: raw.processingStatus, attendanceEventId: raw.attendanceEventId };
  }
  if (!raw.deviceId) throw new Error('الحركة غير مرتبطة بجهاز معروف');

  const device = await getBiometricDeviceBySerial(raw.deviceSerial);
  if (!device || !device.isActive || device.id !== raw.deviceId) {
    await updateRawBiometricEventStatus(rawEventId, 'error', { errorMessage: 'الجهاز غير موجود أو غير نشط' });
    return { status: 'error' as const };
  }

  const eventTime = parseRiyadhLocalDateTime(raw.eventTimeLocal);
  if (!eventTime) {
    await updateRawBiometricEventStatus(rawEventId, 'error', { errorMessage: 'وقت البصمة غير صالح' });
    return { status: 'error' as const };
  }

  const windowProblem = validateEventWindow(device, eventTime);
  if (windowProblem) {
    await updateRawBiometricEventStatus(rawEventId, 'review', { errorMessage: windowProblem });
    return { status: 'review' as const, reason: windowProblem };
  }

  const mapping = await getBiometricWorkerMapping(device.id, raw.deviceUserId);
  if (!mapping) {
    await updateRawBiometricEventStatus(rawEventId, 'unmapped', { errorMessage: `لا يوجد ربط لرقم المستخدم ${raw.deviceUserId} على الجهاز` });
    return { status: 'unmapped' as const };
  }

  try {
    const attendance = await recordBiometricAttendance({
      rawEventId,
      deviceId: device.id,
      deviceSerial: raw.deviceSerial,
      workerId: mapping.workerId,
      eventTime,
      requestedEventType: raw.normalizedEventType,
      verifyMode: raw.verifyMode,
      sourceIp: raw.sourceIp,
    });

    if (attendance.status === 'processed') {
      await updateRawBiometricEventStatus(rawEventId, 'processed', { attendanceEventId: attendance.attendanceEventId });
    } else if (attendance.status === 'duplicate') {
      await updateRawBiometricEventStatus(rawEventId, 'duplicate', { attendanceEventId: attendance.attendanceEventId, errorMessage: attendance.reason });
    } else {
      await updateRawBiometricEventStatus(rawEventId, 'review', { errorMessage: attendance.reason });
    }
    return attendance;
  } catch (error: any) {
    const message = String(error?.message || error).slice(0, 500);
    await updateRawBiometricEventStatus(rawEventId, 'error', { errorMessage: message });
    throw error;
  }
}

/**
 * Compatibility profile for the initial ZKTeco PUSH handshake. Exact option
 * names/values can differ between firmware generations. We keep this isolated
 * so it can be adjusted after capturing the first real MB2000 handshake,
 * without touching attendance business logic.
 */
export function buildZktecoInitializationResponse(serialNumber: string): string {
  return [
    `GET OPTION FROM: ${serialNumber}`,
    'Stamp=9999',
    'OpStamp=9999',
    'ErrorDelay=30',
    'Delay=10',
    'TransInterval=1',
    'TransFlag=1111000000',
    'Realtime=1',
    'Encrypt=0',
  ].join('\n');
}
