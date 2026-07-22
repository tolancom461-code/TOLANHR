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
import { getDb } from './connection';
import { calculateDailyFinanceFromAttendance, createOrUpdateDailyFinance } from './daily-finance';

// ============================================
// Advanced Payroll System (نظام العمال المتقدم)
// ============================================

/**
 * Calculate daily finances for a period with double payment protection
 * Returns only unlocked days (lockedBatchId IS NULL)
 */
export async function calculateDailyFinancesForPeriod(
  workerId: number,
  periodStart: string,
  periodEnd: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { workerDailyFinance, attendanceEvents, workers, groups } = await import('../../drizzle/schema');

  // Get worker
  const [worker] = await db.select().from(workers).where(eq(workers.id, workerId)).limit(1);
  if (!worker) throw new Error("Worker not found");

  // Get all dates in period
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const dates: string[] = [];
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toLocaleDateString('en-CA');
    dates.push(dateStr);
  }

  // Calculate finances for each date
  const results = [];
  for (const date of dates) {
    // Check if day is already locked
    const [existing] = await db
      .select()
      .from(workerDailyFinance)
      .where(
        and(
          eq(workerDailyFinance.workerId, workerId),
          eq(workerDailyFinance.workDate, sql`${date}`)
        )
      )
      .limit(1);

    // Skip if locked
    if (existing && existing.lockedBatchId) {
      continue;
    }

    // Calculate finance for this day
    const finance = await calculateDailyFinanceFromAttendance(workerId, date);
    
    // Create or update daily finance
    await createOrUpdateDailyFinance(workerId, date, finance);
    
    results.push({
      date,
      workerId,
      ...finance,
    });
  }

  return results;
}

/**
 * Get unlocked daily finances for a period
 * Only returns days that haven't been locked by an approved batch
 */
export async function getUnlockedDailyFinances(
  workerId: number,
  periodStart: string,
  periodEnd: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { workerDailyFinance } = await import('../../drizzle/schema');

  const records = await db
    .select()
    .from(workerDailyFinance)
    .where(
      and(
        eq(workerDailyFinance.workerId, workerId),
        sql`${workerDailyFinance.workDate} >= ${periodStart}`,
        sql`${workerDailyFinance.workDate} <= ${periodEnd}`,
        isNull(workerDailyFinance.lockedBatchId) // Only unlocked days
      )
    )
    .orderBy(workerDailyFinance.workDate);

  return records;
}

/**
 * Lock daily finances for a batch (called when batch is approved)
 * Sets lockedBatchId for all days in the batch
 */
export async function lockDailyFinancesForBatch(
  batchId: number,
  workerIds: number[],
  periodStart: string,
  periodEnd: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { workerDailyFinance } = await import('../../drizzle/schema');

  // Lock all daily finances for this batch
  await db
    .update(workerDailyFinance)
    .set({ lockedBatchId: batchId })
    .where(
      and(
        inArray(workerDailyFinance.workerId, workerIds),
        sql`${workerDailyFinance.workDate} >= ${periodStart}`,
        sql`${workerDailyFinance.workDate} <= ${periodEnd}`,
        isNull(workerDailyFinance.lockedBatchId) // Only unlock unlocked days
      )
    );

  return { success: true };
}

/**
 * Unlock daily finances for a batch (called when batch is rejected or reverted)
 */
export async function unlockDailyFinancesForBatch(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { workerDailyFinance } = await import('../../drizzle/schema');

  // Unlock all daily finances for this batch
  await db
    .update(workerDailyFinance)
    .set({ lockedBatchId: null })
    .where(eq(workerDailyFinance.lockedBatchId, batchId));

  return { success: true };
}

/**
 * Aggregate payroll data for a period
 * Combines daily finances + pay overrides
 */
export async function aggregatePayrollData(
  workerId: number,
  periodStart: string,
  periodEnd: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { workerDailyFinance, payOverrides } = await import('../../drizzle/schema');

  // Get daily finances (unlocked only)
  const dailyFinances = await db
    .select()
    .from(workerDailyFinance)
    .where(
      and(
        eq(workerDailyFinance.workerId, workerId),
        sql`${workerDailyFinance.workDate} >= ${periodStart}`,
        sql`${workerDailyFinance.workDate} <= ${periodEnd}`,
        isNull(workerDailyFinance.lockedBatchId)
      )
    );
  if (dailyFinances.length > 0) {
  }

  // Get pay overrides (approved only)
  const overrides = await db
    .select()
    .from(payOverrides)
    .where(
      and(
        eq(payOverrides.workerId, workerId),
        sql`${payOverrides.overrideDate} >= ${periodStart}`,
        sql`${payOverrides.overrideDate} <= ${periodEnd}`,
        eq(payOverrides.status, 'approved')
      )
    );
  console.log('[aggregatePayrollData] workerId=', workerId, 'periodStart=', periodStart, 'periodEnd=', periodEnd, 'overrides found=', overrides.length, overrides);

  // Calculate totals
  const daysWorked = dailyFinances.length;
  const baseAmount = dailyFinances.reduce((sum, r) => sum + parseFloat(r.baseAmount || '0'), 0);
  const deductions = dailyFinances.reduce((sum, r) => sum + parseFloat(r.deductions || '0'), 0);
  const bonuses = dailyFinances.reduce((sum, r) => sum + parseFloat(r.bonuses || '0'), 0);

  // Add overrides
  let totalOverrides = 0;
  const bonusesFromOverrides = overrides
    .filter(o => o.overrideType === 'bonus')
    .reduce((sum, o) => sum + parseFloat(o.amount || '0'), 0);
  
  const deductionsFromOverrides = overrides
    .filter(o => o.overrideType === 'deduction')
    .reduce((sum, o) => sum + parseFloat(o.amount || '0'), 0);

  const netAmount = baseAmount - deductions + bonuses + bonusesFromOverrides - deductionsFromOverrides;

  return {
    workerId,
    periodStart,
    periodEnd,
    daysWorked,
    baseAmount: baseAmount.toFixed(2),
    deductions: deductions.toFixed(2),
    bonuses: (bonuses + bonusesFromOverrides).toFixed(2),
    deductionsTotal: (deductions + deductionsFromOverrides).toFixed(2),
    netAmount: netAmount.toFixed(2),
    dailyFinances,
    overrides,
  };
}

/**
 * Check if any days in period are locked for a worker
 */
export async function checkLockedDaysInPeriod(
  workerId: number,
  periodStart: string,
  periodEnd: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { workerDailyFinance } = await import('../../drizzle/schema');

  const lockedDays = await db
    .select()
    .from(workerDailyFinance)
    .where(
      and(
        eq(workerDailyFinance.workerId, workerId),
        sql`${workerDailyFinance.workDate} >= ${periodStart}`,
        sql`${workerDailyFinance.workDate} <= ${periodEnd}`,
        isNotNull(workerDailyFinance.lockedBatchId)
      )
    );

  return {
    hasLockedDays: lockedDays.length > 0,
    lockedDaysCount: lockedDays.length,
    lockedDays: lockedDays.map(d => ({
      date: d.workDate,
      batchId: d.lockedBatchId,
    })),
  };
}


