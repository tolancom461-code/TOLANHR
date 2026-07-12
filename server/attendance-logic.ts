/**
 * ============================================
 * Administrative Day & Smart Attendance Logic
 * ============================================
 * 
 * نظام اليوم الإداري (5 AM Boundary) + منطق ذكي لربط البصمات
 * 
 * القواعد الأساسية:
 * 1. اليوم الإداري يبدأ الساعة 5:00 صباحاً وينتهي 4:59 صباح اليوم التالي
 * 2. نافذة 15 ساعة للبحث عن آخر حضور
 * 3. منطق ذكي يعتمد على وردية المجموعة لتحديد نوع البصمة
 */

import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { getDb } from "./db";

/**
 * حساب تاريخ اليوم الإداري بناءً على قاعدة 5 صباحاً
 * 
 * @param timestamp - الوقت الفعلي للبصمة
 * @returns تاريخ اليوم الإداري بصيغة YYYY-MM-DD
 * 
 * أمثلة:
 * - 2024-01-15 04:30:00 → 2024-01-14 (قبل 5 صباحاً، يعتبر من اليوم السابق)
 * - 2024-01-15 05:00:00 → 2024-01-15 (بعد 5 صباحاً، يعتبر من نفس اليوم)
 * - 2024-01-15 23:00:00 → 2024-01-15 (مساءً، يعتبر من نفس اليوم)
 */
export function getAdministrativeWorkDate(timestamp: Date): string {
  // ✅ تحويل للتوقيت الرياض (UTC+3) بشكل صريح
  const riyadhOffset = 3 * 60 * 60 * 1000; // 3 ساعات بالميلي ثانية
  const riyadhTime = new Date(timestamp.getTime() + riyadhOffset);
  
  const hours = riyadhTime.getUTCHours(); // ← الآن بتوقيت الرياض
  const minutes = riyadhTime.getUTCMinutes();
  
  // إذا كانت الساعة قبل 4:40 صباحاً بتوقيت الرياض، نطرح يوم واحد
  if (hours < 4 || (hours === 4 && minutes < 40)) {
    riyadhTime.setUTCDate(riyadhTime.getUTCDate() - 1);
  }
  
  // استخراج التاريخ بصيغة YYYY-MM-DD بتوقيت الرياض
  const year = riyadhTime.getUTCFullYear();
  const month = String(riyadhTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(riyadhTime.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  forcedEventType?: 'check_in' | 'check_out'  // ✅ التعديل: اختيار الحارس
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { attendanceEvents, workers } = await import('../drizzle/schema');
  
  // التحقق من وجود العامل
  const [worker] = await db.select().from(workers).where(eq(workers.id, workerId)).limit(1);
  if (!worker) throw new Error("العامل غير موجود");
  
  const eventTime = new Date();
  const workDate = getAdministrativeWorkDate(eventTime);
  
  // 🔥 القاعدة 1: منع أي بصمة خلال 60 ثانية من آخر بصمة
  const sixtySecondsAgo = new Date(eventTime.getTime() - 60 * 1000);
  const recentPunches = await db.select()
    .from(attendanceEvents)
    .where(
      and(
        eq(attendanceEvents.workerId, workerId),
        gte(attendanceEvents.eventTime, sixtySecondsAgo)
      )
    )
    .orderBy(desc(attendanceEvents.eventTime))
    .limit(1);
  
  if (recentPunches.length > 0) {
    throw new Error('عذراً، لا يمكن تسجيل حركتين متتاليتين خلال نفس الدقيقة، يرجى الانتظار.');
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
