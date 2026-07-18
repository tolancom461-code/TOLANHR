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
import { processAttendanceToFinance } from './daily-finance';
import { checkPayrollBatchForDate } from './payroll-locks';

// ============================================
// Full Day Override Functions
// ============================================

export async function setFullDayOverride(
  workerId: number,
  workDate: string,
  override: boolean,
  reason?: string,
  userId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Check if payroll batch exists for this date (prevent both enable and disable)
  // ✅ القفل مرتبط بالتاريخ + مجموعة العامل: دفعة مجموعة أخرى لا تمنع التعديل
  const { workers: workersTable } = await import('../../drizzle/schema');
  const [fdWorker] = await db.select().from(workersTable).where(eq(workersTable.id, workerId)).limit(1);
  const batch = await checkPayrollBatchForDate(workDate, fdWorker?.groupId ?? undefined);
  if (batch) {
    throw new Error(`لا يمكن تعديل اعتماد الحضور الكامل بعد إنشاء دفعة العمال لمجموعة هذا العامل. يجب حذف المسودة أولاً (دفعة رقم: ${batch.batchCode})`);
  }

  const { workerDailyFinance } = await import('../../drizzle/schema');
  
  // Check if daily finance record exists
  const [existing] = await db
    .select()
    .from(workerDailyFinance)
    .where(and(
      eq(workerDailyFinance.workerId, workerId),
      eq(workerDailyFinance.workDate, sql`${workDate}`)
    ))
    .limit(1);
  
  if (!existing) {
    // Create new record with override
    await processAttendanceToFinance(workerId, workDate);
  }
  
  // Update override fields removed - feature deprecated
  await db.update(workerDailyFinance).set({
    updatedAt: new Date(),
  }).where(and(
    eq(workerDailyFinance.workerId, workerId),
    eq(workerDailyFinance.workDate, sql`${workDate}`)
  ));
  
  // Recalculate finance with override
  if (override) {
    await recalculateFinanceWithOverride(workerId, workDate);
  } else {
    // Recalculate without override
    await processAttendanceToFinance(workerId, workDate);
  }
  
  return { success: true };
}

async function recalculateFinanceWithOverride(workerId: number, workDate: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { workers, groups, workerDailyFinance } = await import('../../drizzle/schema');
  
  // Get worker and group info
  const [worker] = await db.select().from(workers).where(eq(workers.id, workerId)).limit(1);
  if (!worker) throw new Error("Worker not found");
  
  let dailyRate = worker.dailyRate ? parseFloat(worker.dailyRate.toString()) : 0;
  
  if (worker.groupId) {
    const [group] = await db.select().from(groups).where(eq(groups.id, worker.groupId)).limit(1);
    if (group && group.dailyRate) {
      dailyRate = dailyRate || parseFloat(group.dailyRate.toString());
    }
  }
  
  // Update with full day rate (no deductions)
  await db.update(workerDailyFinance).set({
    baseAmount: sql`${dailyRate}`,
    deductions: sql`0`,
    netAmount: sql`${dailyRate}`,
    updatedAt: new Date(),
  }).where(and(
    eq(workerDailyFinance.workerId, workerId),
    eq(workerDailyFinance.workDate, sql`${workDate}`)
  ));
}

// getFullDayOverrideStatus function removed - feature deprecated


// ============================================
// Full Day Override Functions (Daily Correction)
// ============================================

export async function getDailyFinanceForWorker(
  workerId: number,
  periodStart: string,
  periodEnd: string
) {
  const db = await getDb();
  if (!db) return [];

  const { workerDailyFinance } = await import('../../drizzle/schema');
  
  const records = await db
    .select()
    .from(workerDailyFinance)
    .where(and(
      eq(workerDailyFinance.workerId, workerId),
      gte(workerDailyFinance.workDate, sql`${periodStart}`),
      lte(workerDailyFinance.workDate, sql`${periodEnd}`)
    ))
    .orderBy(workerDailyFinance.workDate);
  
  return records;
}

/**
 * Get attendance events for a worker in a period
 * Groups check_in and check_out by date
 */
export async function getAttendanceForWorkerPeriod(
  workerId: number,
  periodStart: string,
  periodEnd: string
) {
  const db = await getDb();
  if (!db) return [];

  const { attendanceEvents } = await import('../../drizzle/schema');
  
  const startDate = new Date(`${periodStart}T00:00:00`);
  // Extend end date to capture night shift check_outs
  const { endOfSearch: endDate } = getExpandedDateRange(periodEnd);
  
  const events = await db
    .select()
    .from(attendanceEvents)
    .where(and(
      eq(attendanceEvents.workerId, workerId),
      gte(attendanceEvents.eventTime, startDate),
      lte(attendanceEvents.eventTime, endDate)
    ))
    .orderBy(attendanceEvents.eventTime);
  
  // Use groupEventsByWorkDate for correct night shift handling
  const grouped = groupEventsByWorkDate(events.map(e => ({ ...e, workerId })));
  
  // Convert to array and calculate actualWorkMinutes
  const results: Array<{ date: string; checkIn: any; checkOut: any; actualWorkMinutes: number }> = [];
  
  for (const [workDate, workerData] of Object.entries(grouped)) {
    // Only include dates within the requested period
    if (workDate < periodStart || workDate > periodEnd) continue;
    
    const wd = workerData[workerId];
    if (!wd) continue;
    
    let actualWorkMinutes = 0;
    if (wd.checkIn && wd.checkOut) {
      const checkInTime = new Date(wd.checkIn.eventTime);
      const checkOutTime = new Date(wd.checkOut.eventTime);
      actualWorkMinutes = Math.round((checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60));
    }
    
    results.push({
      date: workDate,
      checkIn: wd.checkIn || null,
      checkOut: wd.checkOut || null,
      actualWorkMinutes,
    });
  }
  
  return results.sort((a, b) => a.date.localeCompare(b.date));
}

// updateFullDayOverride function removed - feature deprecated


