/**
 * ============================================
 * Administrative Day & Smart Attendance Logic
 * ============================================
 *
 * نظام اليوم الإداري + منطق ذكي لربط البصمات.
 *
 * القواعد الأساسية:
 * 1. قبل 2026-09-17: حد اليوم التشغيلي التاريخي 05:00 صباحاً.
 * 2. من 2026-09-17: حد اليوم التشغيلي المعتمد 04:40 صباحاً.
 * 3. نافذة 15 ساعة للبحث عن آخر حضور.
 * 4. منطق ذكي يعتمد على وردية المجموعة لتحديد نوع البصمة.
 */

import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { getDb } from "./db";
import { TRPCError } from "@trpc/server";
import type { QrAttendanceObservation } from './attendance-source-inbox/qr-observer';

/**
 * حساب تاريخ اليوم الإداري حسب القاعدة السارية وقت البصمة بتوقيت الرياض.
 * - قبل 2026-09-17: 05:00.
 * - من 2026-09-17: 04:40.
 *
 * @param timestamp - الوقت الفعلي للبصمة
 * @returns تاريخ اليوم الإداري بصيغة YYYY-MM-DD
 */
export const ADMINISTRATIVE_DAY_BOUNDARY_HOUR = 4;
export const ADMINISTRATIVE_DAY_BOUNDARY_MINUTE = 40;

/**
 * تاريخ بدء توحيد الاستعلامات الزمنية على حد 04:40.
 * الأيام السابقة تبقى على نطاق الاستعلام القديم 05:00 → 04:59:59 حتى لا يتغير عرض/معالجة التاريخ السابق.
 * لا يقوم هذا الثابت بأي تحديث للبيانات التاريخية.
 */
export const ADMINISTRATIVE_DAY_0440_EFFECTIVE_DATE = '2026-09-17';

const LEGACY_QUERY_BOUNDARY_HOUR = 5;
const LEGACY_QUERY_BOUNDARY_MINUTE = 0;

function addDaysToDateString(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatBoundaryTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

type AdministrativeBoundary = {
  hour: number;
  minute: number;
  label: '04:40' | '05:00';
};

/**
 * يحدد حد اليوم التشغيلي الساري لتاريخ تقويمي محلي في الرياض.
 * التاريخ هنا هو تاريخ لحظة البصمة/بداية النطاق، وليس work_date بعد طرح يوم.
 */
function getAdministrativeBoundaryForCalendarDate(calendarDate: string): AdministrativeBoundary {
  if (calendarDate >= ADMINISTRATIVE_DAY_0440_EFFECTIVE_DATE) {
    return {
      hour: ADMINISTRATIVE_DAY_BOUNDARY_HOUR,
      minute: ADMINISTRATIVE_DAY_BOUNDARY_MINUTE,
      label: '04:40',
    };
  }

  return {
    hour: LEGACY_QUERY_BOUNDARY_HOUR,
    minute: LEGACY_QUERY_BOUNDARY_MINUTE,
    label: '05:00',
  };
}

function formatRiyadhCalendarDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * يرجع نطاق اليوم التشغيلي في توقيت الرياض كنطاق نصف مفتوح [start, endExclusive).
 *
 * بداية النطاق تستخدم الحد الساري في تاريخ workDate، ونهاية النطاق تستخدم الحد
 * الساري في اليوم التقويمي التالي. هذا مهم في يوم الانتقال 2026-09-16:
 * 2026-09-16 05:00 → 2026-09-17 04:40، بدون فجوة أو تداخل مع يوم 2026-09-17.
 *
 * هذه الدالة لا تعيد تصنيف أو تحديث أي سجل قديم.
 */
export function getAdministrativeDayRange(workDate: string): {
  start: Date;
  endExclusive: Date;
  boundary: '04:40' | '05:00';
} {
  const nextDate = addDaysToDateString(workDate, 1);
  const startBoundary = getAdministrativeBoundaryForCalendarDate(workDate);
  const endBoundary = getAdministrativeBoundaryForCalendarDate(nextDate);
  const startTime = formatBoundaryTime(startBoundary.hour, startBoundary.minute);
  const endTime = formatBoundaryTime(endBoundary.hour, endBoundary.minute);

  return {
    start: new Date(`${workDate}T${startTime}+03:00`),
    endExclusive: new Date(`${nextDate}T${endTime}+03:00`),
    boundary: startBoundary.label,
  };
}

export function getAdministrativeWorkDate(timestamp: Date): string {
  // تحويل للتوقيت الرياض (UTC+3) بشكل صريح. السعودية لا تستخدم التوقيت الصيفي.
  const riyadhOffset = 3 * 60 * 60 * 1000;
  const riyadhTime = new Date(timestamp.getTime() + riyadhOffset);
  const calendarDate = formatRiyadhCalendarDate(riyadhTime);
  const boundary = getAdministrativeBoundaryForCalendarDate(calendarDate);

  const hours = riyadhTime.getUTCHours();
  const minutes = riyadhTime.getUTCMinutes();

  // إذا كانت البصمة قبل الحد الساري في تاريخها المحلي، تُنسب لليوم التشغيلي السابق.
  if (hours < boundary.hour || (hours === boundary.hour && minutes < boundary.minute)) {
    riyadhTime.setUTCDate(riyadhTime.getUTCDate() - 1);
  }

  return formatRiyadhCalendarDate(riyadhTime);
}

/**
 * الحصول على معلومات وردية المجموعة لليوم المحدد
 * 
 * @param groupId - معرف المجموعة
 * @param workDate - تاريخ اليوم الإداري
 * @returns معلومات الوردية أو null إذا كانت المجموعة مرنة
 */
export async function getGroupShiftInfo(groupId: number, workDate: string) {
  const db = await getDb();
  if (!db) return null;
  
  const { groups, groupSchedules } = await import('../drizzle/schema');
  
  // الحصول على معلومات المجموعة
  const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!group) return null;
  
  // إذا كانت المجموعة مرنة، لا توجد أوقات محددة
  if (group.isFlexibleSchedule) {
    return {
      isFlexible: true,
      requiredHours: group.requiredHours || 0,
      startTime: null,
      endTime: null,
    };
  }
  
  // الحصول على يوم الأسبوع (0 = الأحد)
  const date = new Date(workDate);
  const dayOfWeek = date.getDay();
  
  // البحث عن جدول الوردية لهذا اليوم
  const [schedule] = await db
    .select()
    .from(groupSchedules)
    .where(
      and(
        eq(groupSchedules.groupId, groupId),
        eq(groupSchedules.dayOfWeek, dayOfWeek),
        eq(groupSchedules.isActive, true)
      )
    )
    .orderBy(desc(groupSchedules.effectiveDate))
    .limit(1);
  
  if (schedule) {
    return {
      isFlexible: false,
      requiredHours: schedule.requiredHours,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
    };
  }
  
  // لا يوجد جدول محدد، استخدام القيم الافتراضية من المجموعة
  return {
    isFlexible: false,
    requiredHours: 0,
    startTime: null,
    endTime: null,
  };
}

/**
 * تحليل وقت البصمة لتحديد نوعها بذكاء
 * 
 * @param timestamp - وقت البصمة
 * @param shiftInfo - معلومات الوردية
 * @returns نوع البصمة المقترح (check_in أو check_out)
 */
export function analyzeTimestampForEventType(
  timestamp: Date,
  shiftInfo: { isFlexible: boolean; startTime: string | null; endTime: string | null }
): 'check_in' | 'check_out' | null {
  // إذا كانت الوردية مرنة، لا يمكن التحديد التلقائي
  if (shiftInfo.isFlexible || !shiftInfo.startTime || !shiftInfo.endTime) {
    return null;
  }
  
  const hours = timestamp.getHours();
  const minutes = timestamp.getMinutes();
  const currentTimeInMinutes = hours * 60 + minutes;
  
  // تحويل أوقات الوردية إلى دقائق
  const [startHour, startMin] = shiftInfo.startTime.split(':').map(Number);
  const [endHour, endMin] = shiftInfo.endTime.split(':').map(Number);
  const shiftStartInMinutes = startHour * 60 + startMin;
  let shiftEndInMinutes = endHour * 60 + endMin;
  
  // معالجة الورديات الليلية (إذا كان وقت الانتهاء أقل من وقت البداية)
  if (shiftEndInMinutes < shiftStartInMinutes) {
    shiftEndInMinutes += 24 * 60; // إضافة 24 ساعة
  }
  
  // نافذة 90 دقيقة قبل بداية الوردية
  const earlyCheckInWindow = shiftStartInMinutes - 90;
  
  // نافذة 90 دقيقة بعد نهاية الوردية
  const lateCheckOutWindow = shiftEndInMinutes + 90;
  
  // إذا كانت البصمة قريبة من بداية الوردية (قبل أو بعد بـ 90 دقيقة)
  if (currentTimeInMinutes >= earlyCheckInWindow && currentTimeInMinutes <= shiftStartInMinutes + 90) {
    return 'check_in';
  }
  
  // إذا كانت البصمة قريبة من نهاية الوردية (قبل أو بعد بـ 90 دقيقة)
  if (currentTimeInMinutes >= shiftEndInMinutes - 90 && currentTimeInMinutes <= lateCheckOutWindow) {
    return 'check_out';
  }
  
  // لا يمكن التحديد بثقة
  return null;
}

/**
 * تسجيل حضور/انصراف مع المنطق الهجين المتطور
 * 
 * القواعد:
 * 1. منع البصمات المتتالية خلال 60 ثانية
 * 2. البحث عن آخر حضور في آخر 15 ساعة فقط
 * 3. إذا لم يوجد حضور في 15 ساعة، افتح حضور جديد
 * 4. إذا وجد حضور، سجل انصراف
 * 5. إذا اختار الحارس نوع البصمة يدوياً، يتم استخدام اختياره مباشرة
 */
export async function recordAttendanceWithAdministrativeDay(
  workerId: number,
  method: string = 'manual',
  deviceId?: number,
  verifiedBy?: number,
  ipAddress?: string,
  deviceInfo?: string,
  forcedEventType?: 'check_in' | 'check_out',  // ✅ التعديل: اختيار الحارس
  sourceObservation?: QrAttendanceObservation
) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: "Database not available" });

  const { attendanceEvents, workers } = await import('../drizzle/schema');
  
  // التحقق من وجود العامل
  const [worker] = await db.select().from(workers).where(eq(workers.id, workerId)).limit(1);
  if (!worker) throw new TRPCError({ code: 'NOT_FOUND', message: "العامل غير موجود" });
  
  const eventTime = new Date();
  const workDate = getAdministrativeWorkDate(eventTime);
  if (method === 'qr' && forcedEventType) {
    await sourceObservation?.beforeValidation({ eventTime,
      workerName: worker.fullName ?? null, personCode: worker.biometricPersonCode ?? null });
  }
  
  // 🔥 القاعدة 1: منع أي بصمة خلال 3 دقائق من آخر بصمة
  const cooldownSecondsAgo = new Date(eventTime.getTime() - 180 * 1000);
  const recentPunches = await db.select()
    .from(attendanceEvents)
    .where(
      and(
        eq(attendanceEvents.workerId, workerId),
        gte(attendanceEvents.eventTime, cooldownSecondsAgo)
      )
    )
    .orderBy(desc(attendanceEvents.eventTime))
    .limit(1);
  
  if (recentPunches.length > 0) {
    // ✅ TRPCError بكود BAD_REQUEST يرجع HTTP 400 — لا يُعاد المحاولة تلقائياً
    // من resilientFetch بالفرونت (التي تعيد المحاولة فقط على 5xx/429/403)،
    // فتصل رسالة الرفض فوراً بدل انتظار 3 محاولات × 3 ثوانٍ
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'عذراً، لا يمكن تسجيل حركتين متتاليتين خلال أقل من 3 دقائق، يرجى الانتظار.',
    });
  }
  
  // 🔥 القاعدة 2: البحث عن آخر حضور في آخر 15 ساعة فقط
  const fifteenHoursAgo = new Date(eventTime.getTime() - 15 * 60 * 60 * 1000);
  
  const lastCheckIn = await db.select()
    .from(attendanceEvents)
    .where(
      and(
        eq(attendanceEvents.workerId, workerId),
        eq(attendanceEvents.eventType, 'check_in'),
        gte(attendanceEvents.eventTime, fifteenHoursAgo)
      )
    )
    .orderBy(desc(attendanceEvents.eventTime))
    .limit(1);
  
  let eventType: 'check_in' | 'check_out';
  let isAutomatic = false;

  // ✅ التعديل: إذا اختار الحارس نوع البصمة يدوياً — نستخدم اختياره مباشرة
  if (forcedEventType) {
    eventType = forcedEventType;
  } else {
    // البرنامج يقرر تلقائياً
    // إذا لم يوجد حضور في آخر 15 ساعة، افتح حضور جديد
    if (lastCheckIn.length === 0) {
      eventType = 'check_in';
    } else {
      // يوجد حضور، تحقق من وجود انصراف له
      const checkInTime = lastCheckIn[0].eventTime;

      const matchingCheckOut = await db.select()
        .from(attendanceEvents)
        .where(
          and(
            eq(attendanceEvents.workerId, workerId),
            eq(attendanceEvents.eventType, 'check_out'),
            gte(attendanceEvents.eventTime, checkInTime)
          )
        )
        .limit(1);

      // إذا لم يوجد انصراف، سجل انصراف
      if (matchingCheckOut.length === 0) {
        eventType = 'check_out';
      } else {
        // يوجد حضور وانصراف، افتح حضور جديد
        eventType = 'check_in';
      }
    }
  }
  
  // 🔥 القاعدة 3: استخدام ذكاء الوردية (اختياري - للتحسين المستقبلي)
  // يمكن تفعيل هذا المنطق لاحقاً
  const shiftInfo = await getGroupShiftInfo(worker.groupId, workDate);
  if (shiftInfo && !shiftInfo.isFlexible) {
    const suggestedType = analyzeTimestampForEventType(eventTime, shiftInfo);
    if (suggestedType && eventType === 'check_in' && suggestedType === 'check_out') {
      // إذا كان النظام يقترح انصراف ولكن المنطق يقول حضور
      // نعطي الأولوية لمنطق الـ 15 ساعة
      // يمكن تفعيل هذا لاحقاً: eventType = suggestedType;
    }
  }
  
  // إدراج حدث الحضور/الانصراف
  const result = await db.insert(attendanceEvents).values({
    workerId,
    eventType,
    eventTime,
    workDate, // ✅ تسجيل تاريخ اليوم الإداري
    method,
    deviceId: deviceId || null,
    verifiedBy: verifiedBy || null,
    isAutomatic,
    // 🔒 حقول أمنية
    ipAddress: ipAddress || null,
    deviceInfo: deviceInfo || null,
  });
  
  const eventId = result[0].insertId;
  sourceObservation?.attendanceSaved(eventId);
  
  // تحديث آخر حضور للعامل
  await db.update(workers).set({ lastAttendanceAt: eventTime }).where(eq(workers.id, workerId));
  
  // 🔥 حساب المالية التلقائي عند الانصراف
  if (eventType === 'check_out') {
    try {
      const { processAttendanceToFinance } = await import('./db');
      await processAttendanceToFinance(workerId, workDate);
    } catch (error) {
      console.error('Error calculating daily finance:', error);
      // لا نرمي خطأ - نريد تسجيل الحضور حتى لو فشل حساب المالية
    }
  }
  
  return { 
    success: true, 
    eventType, 
    workerId, 
    eventId, 
    timestamp: eventTime,
    workDate 
  };
}
