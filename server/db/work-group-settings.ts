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

// ============================================
// Work Group Settings Calculations (حسابات إعدادات مجموعات العمل)
// ============================================

/**
 * Calculate minute cost from daily wage and work minutes
 * Returns rounded to 4 decimal places
 */
export function calculateMinuteCost(dailyWage: number | null, workMinutes: number | null): number | null {
  if (!dailyWage || !workMinutes || workMinutes <= 0) return null;
  return Math.round((dailyWage / workMinutes) * 10000) / 10000;
}

/**
 * Calculate late penalty based on group settings
 * Formula: (dailyWage ÷ workMinutes) × lateMinutes × latePenaltyRate
 * Returns rounded to 2 decimal places
 */
export function calculateLatePenalty(
  dailyWage: number | null,
  workMinutes: number | null,
  lateMinutes: number,
  latePenaltyRate: number | null
): number {
  if (!dailyWage || !workMinutes || workMinutes <= 0 || !latePenaltyRate) return 0;
  const minuteCost = dailyWage / workMinutes;
  // latePenaltyRate is stored as percentage (e.g., 100 = 100% = 1x multiplier)
  const rateMultiplier = latePenaltyRate / 100;
  const penalty = minuteCost * lateMinutes * rateMultiplier;
  return Math.round(penalty * 100) / 100;
}

/**
 * Calculate early leave penalty based on group settings
 * Formula: (dailyWage ÷ workMinutes) × earlyLeaveMinutes × earlyLeavePenaltyRate
 * Returns rounded to 2 decimal places
 */
export function calculateEarlyLeavePenalty(
  dailyWage: number | null,
  workMinutes: number | null,
  earlyLeaveMinutes: number,
  earlyLeavePenaltyRate: number | null
): number {
  if (!dailyWage || !workMinutes || workMinutes <= 0 || !earlyLeavePenaltyRate) return 0;
  const minuteCost = dailyWage / workMinutes;
  // earlyLeavePenaltyRate is stored as percentage (e.g., 50 = 50% = 0.5x multiplier)
  const rateMultiplier = earlyLeavePenaltyRate / 100;
  const penalty = minuteCost * earlyLeaveMinutes * rateMultiplier;
  return Math.round(penalty * 100) / 100;
}


// ==================== Official Payroll Reports ====================

/**
 * Get official payroll report by group
 */
export async function getPayrollReportByGroup(
  periodStart: string,
  periodEnd: string,
  groupId?: number,
  costCenterId?: number
) {
  const db = await getDb();
  if (!db) return [];

  const { workers, groups, payrollBatches, payrollBatchItems } = await import('../../drizzle/schema');

  const startDateStr = periodStart.split('T')[0];
  const endDateStr = periodEnd.split('T')[0];

  const batchItems = await db
    .select({
      groupId: groups.id,
      groupName: groups.name,
      groupCode: groups.code,
      workerId: workers.id,
      basePay: payrollBatchItems.basePay,
      additions: payrollBatchItems.additions,
      deductions: payrollBatchItems.deductions,
      netSalary: payrollBatchItems.netSalary,
    })
    .from(payrollBatchItems)
    .innerJoin(payrollBatches, eq(payrollBatchItems.batchId, payrollBatches.id))
    .innerJoin(workers, eq(payrollBatchItems.workerId, workers.id))
    .innerJoin(groups, eq(workers.groupId, groups.id))
        .where(and(
      lte(payrollBatches.periodStart, endDateStr),
      gte(payrollBatches.periodEnd, startDateStr),
      inArray(payrollBatches.status, ['approved', 'paid']),
      groupId ? eq(workers.groupId, groupId) : undefined,
      costCenterId ? eq(groups.costCenterId, costCenterId) : undefined
    ));
  const groupMap = new Map<number, {
    groupName: string;
    groupCode: string;
    workerIds: Set<number>;
    totalSalary: number;
    totalDeductions: number;
    totalBonuses: number;
    totalNet: number;
  }>();

  batchItems.forEach((row) => {
    const existing = groupMap.get(row.groupId);
    const baseAmount = parseFloat(row.basePay || '0');
    const deductions = parseFloat(row.deductions || '0');
    const bonuses = parseFloat(row.additions || '0');
    const netAmount = parseFloat(row.netSalary || '0');

    if (existing) {
      existing.totalSalary += baseAmount;
      existing.totalDeductions += deductions;
      existing.totalBonuses += bonuses;
      existing.totalNet += netAmount;
      existing.workerIds.add(row.workerId);
    } else {
      groupMap.set(row.groupId, {
        groupName: row.groupName,
        groupCode: row.groupCode,
        workerIds: new Set([row.workerId]),
        totalSalary: baseAmount,
        totalDeductions: deductions,
        totalBonuses: bonuses,
        totalNet: netAmount,
      });
    }
  });

  return Array.from(groupMap.values()).map(data => ({
    groupName: data.groupName,
    groupCode: data.groupCode,
    workerCount: data.workerIds.size,
    totalSalary: data.totalSalary,
    totalDeductions: data.totalDeductions,
    totalBonuses: data.totalBonuses,
    totalNet: data.totalNet,
  }));
}

/**
 * Get official payroll report by worker
 */
export async function getPayrollReportByWorker(
  periodStart: string,
  periodEnd: string,
  workerId?: number
) {
  const db = await getDb();
  if (!db) return [];

  const { workers, groups, payrollBatches, payrollBatchItems } = await import('../../drizzle/schema');

  const startDateStr = periodStart.split('T')[0];
  const endDateStr = periodEnd.split('T')[0];

  const batchItems = await db
    .select({
      workerId: workers.id,
      workerName: workers.fullName,
      workerCode: workers.code,
      groupName: groups.name,
      groupCode: groups.code,
      basePay: payrollBatchItems.basePay,
      additions: payrollBatchItems.additions,
      deductions: payrollBatchItems.deductions,
      netSalary: payrollBatchItems.netSalary,
    })
    .from(payrollBatchItems)
    .innerJoin(payrollBatches, eq(payrollBatchItems.batchId, payrollBatches.id))
    .innerJoin(workers, eq(payrollBatchItems.workerId, workers.id))
    .leftJoin(groups, eq(workers.groupId, groups.id))
        .where(and(
      lte(payrollBatches.periodStart, endDateStr),
      gte(payrollBatches.periodEnd, startDateStr),
      inArray(payrollBatches.status, ['approved', 'paid']),
      workerId ? eq(workers.id, workerId) : undefined
    ));
  const workerMap = new Map<number, {
    workerName: string;
    workerCode: string;
    groupName: string;
    groupCode: string;
    totalSalary: number;
    totalDeductions: number;
    totalBonuses: number;
    totalNet: number;
  }>();

  batchItems.forEach((row) => {
    const existing = workerMap.get(row.workerId);
    const baseAmount = parseFloat(row.basePay || '0');
    const deductions = parseFloat(row.deductions || '0');
    const bonuses = parseFloat(row.additions || '0');
    const netAmount = parseFloat(row.netSalary || '0');

    if (existing) {
      existing.totalSalary += baseAmount;
      existing.totalDeductions += deductions;
      existing.totalBonuses += bonuses;
      existing.totalNet += netAmount;
    } else {
      workerMap.set(row.workerId, {
        workerName: row.workerName,
        workerCode: row.workerCode,
        groupName: row.groupName || 'N/A',
        groupCode: row.groupCode || 'N/A',
        totalSalary: baseAmount,
        totalDeductions: deductions,
        totalBonuses: bonuses,
        totalNet: netAmount,
      });
    }
  });

  return Array.from(workerMap.values());
}

/**
 * Get official payroll report by cost center
 * Note: Returns same data as group report since workers don't have direct costCenterId
 */
export async function getPayrollReportByCostCenter(
  periodStart: string,
  periodEnd: string,
  costCenterId?: number
) {
  return await getPayrollReportByGroup(periodStart, periodEnd, undefined, costCenterId);
}

/**
 * Get official payroll report summary (all groups)
 */
export async function getPayrollReportSummary(
  periodStart: string,
  periodEnd: string,
  costCenterId?: number,
  groupId?: number
) {
  return await getPayrollReportByGroup(periodStart, periodEnd, groupId, costCenterId);
}


