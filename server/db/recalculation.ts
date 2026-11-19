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
import { getDb, type DatabaseReadExecutor } from './connection';
import { calculateDailyFinanceFromAttendance } from './daily-finance';


// ============================================
// Smart Recalculation Functions
// ============================================

/**
 * Get the last closed payroll batch date
 * Returns the latest periodEnd date from all closed payroll batches
 * If no closed batches exist, returns null
 */
export async function getLastClosedPayrollDate(): Promise<string | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { payrollBatches } = await import('../../drizzle/schema');

  const result = await db
    .select({
      lastDate: sql<string>`MAX(${payrollBatches.periodEnd})`
    })
    .from(payrollBatches)
    .where(eq(payrollBatches.status, 'closed'));

  return result[0]?.lastDate || null;
}

/**
 * Get the effective group for a worker on a specific date.
 * Priority:
 * 1) Daily operational transfer recorded by Operations.
 * 2) Existing active temporary assignment (legacy/current workflow).
 * 3) Worker's original group.
 *
 * Work-site changes alone never change the effective payroll group.
 */
export async function getEffectiveGroupForWorkerOnDate(
  workerId: number,
  date: string,
  database?: DatabaseReadExecutor
): Promise<number | null> {
  const db = database ?? await getDb();
  if (!db) throw new Error("Database not available");

  const dateStr = date.split('T')[0];

  // Phase 2: an explicit operational group transfer is the highest-priority daily decision.
  const operationalAssignment = await db
    .select({
      operationalGroupId: dailyWorkAssignments.operationalGroupId,
    })
    .from(dailyWorkAssignments)
    .where(
      and(
        eq(dailyWorkAssignments.workerId, workerId),
        eq(dailyWorkAssignments.workDate, dateStr)
      )
    )
    .limit(1);

  if (operationalAssignment[0]?.operationalGroupId) {
    return operationalAssignment[0].operationalGroupId;
  }

  // Preserve the existing temporary-assignment workflow as the fallback.
  const assignment = await db
    .select({
      toGroupId: temporaryAssignments.toGroupId,
    })
    .from(temporaryAssignments)
    .where(
      and(
        eq(temporaryAssignments.workerId, workerId),
        eq(temporaryAssignments.status, 'active'),
        lte(temporaryAssignments.startDate, dateStr),
        gte(temporaryAssignments.endDate, dateStr)
      )
    )
    .limit(1);

  if (assignment[0]?.toGroupId) {
    return assignment[0].toGroupId;
  }

  const worker = await db
    .select({ groupId: workers.groupId })
    .from(workers)
    .where(eq(workers.id, workerId))
    .limit(1);

  return worker[0]?.groupId || null;
}

/**
 * Recalculate worker daily finance for a specific period
 * This is a smart, targeted recalculation that:
 * 1. Only recalculates for the specified worker and date range
 * 2. Determines the effective group for each day (considering temporary assignments)
 * 3. Skips any dates that are in closed payroll periods
 * 4. Recalculates finance based on the effective group's settings for each day
 */
export async function recalculateWorkerFinanceForPeriod(
  workerId: number,
  startDate: string,
  endDate: string
): Promise<{ recalculated: number; skipped: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get last closed payroll date to protect closed periods
  const lastClosedDate = await getLastClosedPayrollDate();
  
  // Adjust start date if it's before the last closed date
  let effectiveStartDate = startDate;
  if (lastClosedDate && new Date(startDate) <= new Date(lastClosedDate)) {
    const nextDay = new Date(lastClosedDate);
    nextDay.setDate(nextDay.getDate() + 1);
    effectiveStartDate = nextDay.toISOString().split('T')[0];
  }

  // If effective start is after end, nothing to recalculate
  if (new Date(effectiveStartDate) > new Date(endDate)) {
    console.log(`[Recalc] Skipped: entire period is closed (worker ${workerId})`);
    return { recalculated: 0, skipped: 0 };
  }

  console.log(`[Recalc] Worker ${workerId}: ${effectiveStartDate} → ${endDate}`);

  let recalculated = 0;
  let skipped = 0;

  // Iterate through each day in the period
  const currentDate = new Date(effectiveStartDate);
  const endDateObj = new Date(endDate);

  while (currentDate <= endDateObj) {
    const dateStr = currentDate.toISOString().split('T')[0];

    try {
      // Determine effective group for this specific day
      const effectiveGroupId = await getEffectiveGroupForWorkerOnDate(workerId, dateStr);

      if (!effectiveGroupId) {
        console.log(`[Recalc] Skipped ${dateStr}: no group for worker ${workerId}`);
        skipped++;
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      // Recalculate finance for this day using the effective group
      await calculateDailyFinanceFromAttendance(workerId, dateStr);
      recalculated++;

    } catch (error: any) {
      console.error(`[Recalc] Error on ${dateStr} for worker ${workerId}:`, error.message);
      skipped++;
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  console.log(`[Recalc] Worker ${workerId}: ✅ ${recalculated} days, ⏭️ ${skipped} skipped`);
  return { recalculated, skipped };
}

/**
 * Recalculate finance for all workers in a group for open periods
 * Used when group settings are modified
 */
export async function recalculateGroupFinanceForOpenPeriods(
  groupId: number
): Promise<{ workersAffected: number; daysRecalculated: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { workers } = await import('../../drizzle/schema');

  // Get last closed payroll date
  const lastClosedDate = await getLastClosedPayrollDate();
  
  // Calculate start date (day after last closed, or a reasonable default)
  let startDate: string;
  if (lastClosedDate) {
    const nextDay = new Date(lastClosedDate);
    nextDay.setDate(nextDay.getDate() + 1);
    startDate = nextDay.toISOString().split('T')[0];
  } else {
    // No closed payrolls, recalculate from 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    startDate = thirtyDaysAgo.toISOString().split('T')[0];
  }

  // End date is today
  const endDate = new Date().toISOString().split('T')[0];

  console.log(`[Recalc Group] Group ${groupId}: ${startDate} → ${endDate}`);

  // Get all workers in this group
  const groupWorkers = await db
    .select({ id: workers.id })
    .from(workers)
    .where(eq(workers.groupId, groupId));

  let totalDays = 0;
  const CONCURRENCY = 5; // نعالج عدة عمال بنفس الوقت بدل واحد تلو الثاني، بدون إغراق قاعدة البيانات
  for (let i = 0; i < groupWorkers.length; i += CONCURRENCY) {
    const batch = groupWorkers.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((worker) => recalculateWorkerFinanceForPeriod(worker.id, startDate, endDate))
    );
    for (const result of results) {
      totalDays += result.recalculated;
    }
  }

  console.log(`[Recalc Group] ✅ ${groupWorkers.length} workers, ${totalDays} days recalculated`);
  return { workersAffected: groupWorkers.length, daysRecalculated: totalDays };
}


