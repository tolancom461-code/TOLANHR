import { eq, desc, and, or, like, gte, lt, lte, ne, sql, count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { getAdministrativeWorkDate } from '../attendance-logic';
import { 
  users, InsertUser, User,
  costCenters,
  groups, Group, InsertGroup,
  groupSchedules,
  workers, InsertWorker,
  attendanceEvents,
  workDays,
  workerDailyFinance,
  payOverrides,
  payrollBatches,
  payrollBatchItems,
  payrollBatchNotes,
  payrollBatchCorrections,
  operationalFlags,
  userCostCenters,
  temporaryAssignments,
  assignmentSettlements,
  deductionRules,
  auditLog,
  notifications,
  pushSubscriptions,
  restaurants,
  dailyWorkAssignments
} from "../../drizzle/schema";
import { sendNotification, sendNotificationToRoles, notifyStageAndAdmins, ADMIN_OWNER_ROLES } from '../notifications';
import { getRoleLabel } from '../permissions';
import { inArray, isNull, isNotNull, between } from "drizzle-orm";
import type { Worker as DbWorker } from "../../drizzle/schema";
import { ENV } from '../_core/env';
import { getDb, getExpandedDateRange, groupEventsByWorkDate } from './connection';
import { hashPassword, verifyPassword } from './auth-local';
import { processAttendanceToFinance } from './daily-finance';

// ============================================
// Attendance Functions
// ============================================

export async function getWorkerAttendance(workerId: number, limit: number = 30) {
  const db = await getDb();
  if (!db) return [];

  // Import attendanceEvents from schema
  const { attendanceEvents } = await import('../../drizzle/schema');
  
  return await db
    .select()
    .from(attendanceEvents)
    .where(eq(attendanceEvents.workerId, workerId))
    .orderBy(desc(attendanceEvents.eventTime))
    .limit(limit);
}

export async function getWorkerFinanceSummary(workerId: number) {
  const db = await getDb();
  if (!db) return { totalEarnings: 0, totalDeductions: 0, totalBonuses: 0, netAmount: 0, daysWorked: 0 };

  // Import workerDailyFinance from schema
  const { workerDailyFinance } = await import('../../drizzle/schema');
  
  const records = await db
    .select()
    .from(workerDailyFinance)
    .where(eq(workerDailyFinance.workerId, workerId));
  
  let totalEarnings = 0;
  let totalDeductions = 0;
  let totalBonuses = 0;
  let netAmount = 0;
  let daysWorked = records.length;
  
  for (const record of records) {
    totalEarnings += parseFloat(record.baseAmount || '0');
    totalDeductions += parseFloat(record.deductions || '0');
    totalBonuses += parseFloat(record.bonuses || '0');
    netAmount += parseFloat(record.netAmount || '0');
  }
  
  return { totalEarnings, totalDeductions, totalBonuses, netAmount, daysWorked };
}

export async function getWorkerPayOverrides(workerId: number) {
  const db = await getDb();
  if (!db) return [];

  // Import payOverrides from schema
  const { payOverrides } = await import('../../drizzle/schema');
  
  return await db
    .select()
    .from(payOverrides)
    .where(eq(payOverrides.workerId, workerId))
    .orderBy(desc(payOverrides.createdAt));
}

export async function changeUserPassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  
  // Get user with current password hash
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    throw new Error("User not found");
  }
  
  // Verify current password using bcrypt
  if (!user.passwordHash) {
    throw new Error("هذا الحساب لا يملك كلمة مرور محلية");
  }
  const isValid = await verifyPassword(currentPassword, user.passwordHash);
  if (!isValid) {
    throw new Error("كلمة المرور الحالية غير صحيحة");
  }
  
  // Hash new password before storing
  const newHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(users.id, userId));
}



// ============================================
// Attendance Functions (Phase 4)
// ============================================

/**
 * تسجيل حضور/انصراف - النسخة القديمة (مع eventType يدوي)
 * ❗ هذه الدالة محفوظة للتوافق مع الكود القديم
 * ✅ يفضل استخدام recordAttendanceWithAdministrativeDay للمنطق الجديد
 */
export async function recordAttendance(
  workerId: number, 
  eventType: 'check_in' | 'check_out', 
  method: string = 'manual', 
  deviceId?: number, 
  verifiedBy?: number,
  ipAddress?: string,
  deviceInfo?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { attendanceEvents, workers } = await import('../../drizzle/schema');
  const { getAdministrativeWorkDate } = await import('../attendance-logic');
  
  // Check if worker exists
  const [worker] = await db.select().from(workers).where(eq(workers.id, workerId)).limit(1);
  if (!worker) throw new Error("العامل غير موجود");
  
  const eventTime = new Date();
  const workDate = getAdministrativeWorkDate(eventTime);
  
  // 🔥 RULE 1: Prevent any punch within 60 seconds of the last punch (regardless of type)
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
  
  // 🔥 RULE 2: Prevent duplicate check-out (must have check-in first)
  // Get the last punch for this worker
  const lastPunch = await db.select()
    .from(attendanceEvents)
    .where(eq(attendanceEvents.workerId, workerId))
    .orderBy(desc(attendanceEvents.eventTime))
    .limit(1);
  
  if (lastPunch.length > 0) {
    const lastEventType = lastPunch[0].eventType;
    
    // If trying to check out but last event was also check out
    if (eventType === 'check_out' && lastEventType === 'check_out') {
      throw new Error('لا يمكن تسجيل انصراف متتالي، أنت مسجل كمنصرف بالفعل.');
    }
    
    // If trying to check in but last event was also check in
    if (eventType === 'check_in' && lastEventType === 'check_in') {
      throw new Error('لا يمكن تسجيل حضور متتالي، أنت مسجل كحاضر بالفعل.');
    }
  }
  
  // Insert attendance event with work_date and security fields
  const result = await db.insert(attendanceEvents).values({
    workerId,
    eventType,
    eventTime,
    workDate, // ✅ تسجيل تاريخ اليوم الإداري
    method,
    deviceId: deviceId || null,
    verifiedBy: verifiedBy || null,
    // 🔒 حقول أمنية
    ipAddress: ipAddress || null,
    deviceInfo: deviceInfo || null,
  });
  
  const eventId = result[0].insertId;
  
  // Update worker's last attendance
  await db.update(workers).set({ lastAttendanceAt: eventTime }).where(eq(workers.id, workerId));
  
  // 🔥 AUTO-CALCULATE FINANCE ON CHECK_OUT
  if (eventType === 'check_out') {
    try {
      await processAttendanceToFinance(workerId, workDate);
    } catch (error) {
      console.error('Error calculating daily finance:', error);
      // Don't throw - we still want to record the attendance even if finance calculation fails
    }
  }
  
  return { success: true, eventType, workerId, eventId, timestamp: eventTime, workDate };
}

// ✅ تصدير الدالة الجديدة مع المنطق الهجين المتطور
export { recordAttendanceWithAdministrativeDay } from '../attendance-logic';

export async function getWorkerByQRToken(qrToken: string) {
  const db = await getDb();
  if (!db) return null;

  const { workers } = await import('../../drizzle/schema');
  
  const [worker] = await db.select().from(workers).where(eq(workers.qrToken, qrToken)).limit(1);
  return worker || null;
}

export async function getWorkerByManualCode(code: string) {
  const db = await getDb();
  if (!db) return null;

  const { workers } = await import('../../drizzle/schema');
  
  // Search in both manual_code and code fields using OR condition
  const [worker] = await db.select()
    .from(workers)
    .where(
      or(
        eq(workers.manualCode, code),
        eq(workers.code, code)
      )
    )
    .limit(1);
  
  return worker || null;
}

// New paginated version
export async function getTodayAttendanceWithPagination(groupId?: number, dateStr?: string, page: number = 1, limit: number = 20) {
  const db = await getDb();
  if (!db) return { data: [], total: 0, totalPages: 0 };

  const { attendanceEvents, workers } = await import('../../drizzle/schema');
  
  // Use provided date or default to today (local time Asia/Riyadh)
  const targetDate = dateStr || new Date().toLocaleDateString('en-CA');
  
  // Expanded range to capture night shift check_outs from previous day
  const { startOfDay, endOfSearch } = getExpandedDateRange(targetDate);
  
  // Build where conditions
  const whereConditions: any[] = [
    gte(attendanceEvents.eventTime, startOfDay),
    lt(attendanceEvents.eventTime, endOfSearch)
  ];
  
  if (groupId) {
    whereConditions.push(eq(workers.groupId, groupId));
  }
  
  // Get all events for expanded range
  const events = await db
    .select({
      id: attendanceEvents.id,
      workerId: attendanceEvents.workerId,
      workerName: workers.fullName,
      workerCode: workers.code,
      groupId: workers.groupId,
      eventType: attendanceEvents.eventType,
      eventTime: attendanceEvents.eventTime,
      method: attendanceEvents.method,
    })
    .from(attendanceEvents)
    .innerJoin(workers, eq(attendanceEvents.workerId, workers.id))
    .where(and(...whereConditions))
    .orderBy(attendanceEvents.workerId, attendanceEvents.eventTime);
  
  // Use groupEventsByWorkDate to correctly pair check_in/check_out across midnight
  const grouped = groupEventsByWorkDate(events);
  const dayData = grouped[targetDate] || {};
  
  // Build worker map from grouped data
  const workerMap = new Map();
  
  // First, add workers from grouped data for the target date
  for (const [workerIdStr, data] of Object.entries(dayData)) {
    const wId = Number(workerIdStr);
    const checkInEvt = data.checkIn;
    const checkOutEvt = data.checkOut;
    // Find worker info from events
    const workerEvent = events.find(e => e.workerId === wId);
    if (!workerEvent) continue;
    
workerMap.set(wId, {
      workerId: wId,
      workerName: workerEvent.workerName,
      workerCode: workerEvent.workerCode,
      groupId: workerEvent.groupId,
      checkInId: checkInEvt?.id || null,
      checkInTime: checkInEvt?.eventTime || null,
      checkInMethod: checkInEvt?.method || null,
      checkOutId: checkOutEvt?.id || null,
      checkOutTime: checkOutEvt?.eventTime || null,
      checkOutMethod: checkOutEvt?.method || null,
      // ✅ كل الجلسات
      sessions: data.sessions || [],
    });
  }
  
  const allResults = Array.from(workerMap.values());
  const total = allResults.length;
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;
  const data = allResults.slice(offset, offset + limit);
  
  return { data, total, totalPages };
}
// Keep old function for backward compatibility
export async function getTodayAttendance(groupId?: number, dateStr?: string) {
  const db = await getDb();
  if (!db) return [];
  const { attendanceEvents, workers } = await import('../../drizzle/schema');
  
  // Use provided date or default to today (local time Asia/Riyadh)
  const targetDate = dateStr || new Date().toLocaleDateString('en-CA');
  
  // Expanded range to capture night shift check_outs
  const { startOfDay, endOfSearch } = getExpandedDateRange(targetDate);
  
  // Get all events for expanded range
  const events = await db
    .select({
      id: attendanceEvents.id,
      workerId: attendanceEvents.workerId,
      workerName: workers.fullName,
      workerCode: workers.code,
      groupId: workers.groupId,
      eventType: attendanceEvents.eventType,
      eventTime: attendanceEvents.eventTime,
      method: attendanceEvents.method,
    })
    .from(attendanceEvents)
    .innerJoin(workers, eq(attendanceEvents.workerId, workers.id))
    .where(and(
      gte(attendanceEvents.eventTime, startOfDay),
      lt(attendanceEvents.eventTime, endOfSearch)
    ))
    .orderBy(attendanceEvents.workerId, attendanceEvents.eventTime);
  
  // Use groupEventsByWorkDate to correctly pair check_in/check_out across midnight
  const grouped = groupEventsByWorkDate(events);
  const dayData = grouped[targetDate] || {};
  
  const workerMap = new Map();
  
  for (const [workerIdStr, data] of Object.entries(dayData)) {
    const wId = Number(workerIdStr);
    const checkInEvt = data.checkIn;
    const checkOutEvt = data.checkOut;
    const workerEvent = events.find(e => e.workerId === wId);
    if (!workerEvent) continue;
    
    workerMap.set(wId, {
      workerId: wId,
      workerName: workerEvent.workerName,
      workerCode: workerEvent.workerCode,
      groupId: workerEvent.groupId,
      checkInId: checkInEvt?.id || null,
      checkInTime: checkInEvt?.eventTime || null,
      checkInMethod: checkInEvt?.method || null,
      checkOutId: checkOutEvt?.id || null,
      checkOutTime: checkOutEvt?.eventTime || null,
      checkOutMethod: checkOutEvt?.method || null,
      // ✅ كل الجلسات
      sessions: data.sessions || [],
    });
  }
  
  let results = Array.from(workerMap.values());
  
  if (groupId) {
    results = results.filter(r => r.groupId === groupId);
  }
  
  return results;
}

export async function getWorkerLastEvent(workerId: number) {
  const db = await getDb();
  if (!db) return null;

  const { attendanceEvents } = await import('../../drizzle/schema');
  
  // ✅ استخدام طريقة آمنة لإنشاء تاريخ اليوم
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  
  const [lastEvent] = await db
    .select()
    .from(attendanceEvents)
    .where(and(
      eq(attendanceEvents.workerId, workerId),
      gte(attendanceEvents.eventTime, today)
    ))
    .orderBy(desc(attendanceEvents.eventTime))
    .limit(1);
  
  return lastEvent || null;
}

export async function getMonthlyAttendanceReport(year: number, month: number, groupId?: number) {
  const db = await getDb();
  if (!db) return [];

  const { attendanceEvents, workers, groups } = await import('../../drizzle/schema');
  
  const startDate = new Date(year, month - 1, 1);
  // Extend end date to capture night shift check_outs on last day of month
  const lastDayOfMonth = new Date(year, month, 0);
  const endDateStr = lastDayOfMonth.toLocaleDateString('en-CA');
  const { endOfSearch: endDate } = getExpandedDateRange(endDateStr);
  
  // Get all workers
  let workersQuery = db.select().from(workers).where(eq(workers.status, 'active'));
  const allWorkers = await workersQuery;
  
  // Filter by group if specified
  const filteredWorkers = groupId ? allWorkers.filter(w => w.groupId === groupId) : allWorkers;
  
  // Get attendance events for the month (expanded range)
  const events = await db
    .select()
    .from(attendanceEvents)
    .where(and(
      gte(attendanceEvents.eventTime, startDate),
      lte(attendanceEvents.eventTime, endDate)
    ));
  
  // Use groupEventsByWorkDate for correct night shift handling
  const grouped = groupEventsByWorkDate(events);
  
  // Calculate statistics for each worker
  const report = filteredWorkers.map(worker => {
    let daysPresent = 0;
    let totalCheckIns = 0;
    let totalCheckOuts = 0;
    let totalHours = 0;
    
    // Iterate over all work dates in the grouped data
    for (const [workDate, workerData] of Object.entries(grouped)) {
      // Only count dates within the month
      if (workDate < startDate.toLocaleDateString('en-CA') || workDate > endDateStr) continue;
      
      const wd = workerData[worker.id];
      if (!wd) continue;
      
      daysPresent++;
      if (wd.checkIn) totalCheckIns++;
      if (wd.checkOut) totalCheckOuts++;
      
      if (wd.checkIn && wd.checkOut) {
        const hours = (new Date(wd.checkOut.eventTime).getTime() - new Date(wd.checkIn.eventTime).getTime()) / (1000 * 60 * 60);
        totalHours += hours;
      }
    }
    
    return {
      workerId: worker.id,
      workerName: worker.fullName,
      workerCode: worker.code,
      groupId: worker.groupId,
      daysPresent,
      totalCheckIns,
      totalCheckOuts,
      totalHours: Math.round(totalHours * 100) / 100,
      avgHoursPerDay: daysPresent > 0 ? Math.round((totalHours / daysPresent) * 100) / 100 : 0,
    };
  });
  
  return report;
}

export async function getDateRangeAttendanceReport(startDateStr: string, endDateStr: string, groupId?: number) {
  const db = await getDb();
  if (!db) return [];

  const { attendanceEvents, workers, groups } = await import('../../drizzle/schema');
  
  const startDate = new Date(startDateStr + 'T00:00:00');
  // Extend end date to capture night shift check_outs
  const { endOfSearch: endDate } = getExpandedDateRange(endDateStr);
  
  // Get all active workers
  const allWorkers = await db.select().from(workers).where(eq(workers.status, 'active'));
  
  // Filter by group if specified
  const filteredWorkers = groupId ? allWorkers.filter(w => w.groupId === groupId) : allWorkers;
  
  // Get attendance events for the date range (expanded)
  const events = await db
    .select()
    .from(attendanceEvents)
    .where(and(
      gte(attendanceEvents.eventTime, startDate),
      lte(attendanceEvents.eventTime, endDate)
    ));
  
  // Use groupEventsByWorkDate for correct night shift handling
  const grouped = groupEventsByWorkDate(events);
  
  // Calculate statistics for each worker
  const report = filteredWorkers.map(worker => {
    let daysPresent = 0;
    let totalCheckIns = 0;
    let totalCheckOuts = 0;
    let totalHours = 0;
    
    for (const [workDate, workerData] of Object.entries(grouped)) {
      if (workDate < startDateStr || workDate > endDateStr) continue;
      
      const wd = workerData[worker.id];
      if (!wd) continue;
      
      daysPresent++;
      if (wd.checkIn) totalCheckIns++;
      if (wd.checkOut) totalCheckOuts++;
      
      if (wd.checkIn && wd.checkOut) {
        const hours = (new Date(wd.checkOut.eventTime).getTime() - new Date(wd.checkIn.eventTime).getTime()) / (1000 * 60 * 60);
        totalHours += hours;
      }
    }
    
    return {
      workerId: worker.id,
      workerName: worker.fullName,
      workerCode: worker.code,
      groupId: worker.groupId,
      daysPresent,
      totalCheckIns,
      totalCheckOuts,
      totalHours: Math.round(totalHours * 100) / 100,
      avgHoursPerDay: daysPresent > 0 ? Math.round((totalHours / daysPresent) * 100) / 100 : 0,
    };
  });
  
  return report;
}

// Work Days Management
export async function getWorkDays(year: number, month: number) {
  const db = await getDb();
  if (!db) return [];

  
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  
  return await db
    .select()
    .from(workDays)
    .where(and(
      gte(workDays.workDate, sql`${startDate.toLocaleDateString('en-CA')}`),
      lte(workDays.workDate, sql`${endDate.toLocaleDateString('en-CA')}`)
    ));
}

export async function upsertWorkDay(workDate: string, dayType: 'normal' | 'holiday' | 'weekend', notes?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  
  // Check if exists
  const [existing] = await db.select().from(workDays).where(eq(workDays.workDate, sql`${workDate}`)).limit(1);
  
  if (existing) {
    await db.update(workDays).set({ dayType, notes }).where(eq(workDays.id, existing.id));
  } else {
    await db.insert(workDays).values({ workDate: sql`${workDate}`, dayType, notes });  
  }
  
  return { success: true };
}

export async function getAttendanceStats(startDate: Date, endDate: Date, groupId?: number) {
  const db = await getDb();
  if (!db) return { totalWorkers: 0, presentToday: 0, absentToday: 0, lateToday: 0 };

  const { workers, attendanceEvents } = await import('../../drizzle/schema');
  
  // Get all active workers
  let allWorkers = await db.select().from(workers).where(eq(workers.status, 'active'));
  if (groupId) {
    allWorkers = allWorkers.filter(w => w.groupId === groupId);
  }
  
  // Use work_date (administrative day: 5 AM to 4:59 AM next day) instead of eventTime
  // This ensures correct counting based on the administrative work day boundary
  // Use Asia/Riyadh timezone to get the correct local date (NOT toISOString which returns UTC)
  const workDateStr = startDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' }); // YYYY-MM-DD in Riyadh time
  
  const todayEvents = await db
    .select()
    .from(attendanceEvents)
    .where(and(
      sql`DATE(${attendanceEvents.workDate}) = ${workDateStr}`,
      eq(attendanceEvents.eventType, 'check_in')
    ));
  
  const presentWorkerIds = new Set(todayEvents.map(e => e.workerId));
  let presentWorkers = allWorkers.filter(w => presentWorkerIds.has(w.id));
  if (groupId) {
    presentWorkers = presentWorkers.filter(w => w.groupId === groupId);
  }
  const presentToday = presentWorkers.length;
  
  return {
    totalWorkers: allWorkers.length,
    presentToday,
    absentToday: allWorkers.length - presentToday,
    lateToday: 0, // Would need shift data to calculate
  };
}


