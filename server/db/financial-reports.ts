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
// Financial Reports Functions
// ============================================

/**
 * Get financial report for a single worker
 * Returns detailed breakdown of attendance, deductions, bonuses, and net amount
 */
export async function getWorkerFinancialReport(
  workerId: number,
  startDate: Date,
  endDate: Date
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Convert to YYYY-MM-DD strings to avoid timezone issues
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  // Get worker info
  const worker = await db
    .select()
    .from(workers)
    .where(eq(workers.id, workerId))
    .limit(1);

  if (!worker.length) throw new Error("Worker not found");

  // Get daily finance records - use DATE() cast to avoid timezone issues
  const financeRecords = await db
    .select()
    .from(workerDailyFinance)
    .where(
      and(
        eq(workerDailyFinance.workerId, workerId),
        sql`DATE(${workerDailyFinance.workDate}) >= ${startDateStr}`,
        sql`DATE(${workerDailyFinance.workDate}) <= ${endDateStr}`
      )
    )
    .orderBy(workerDailyFinance.workDate);

  // Get approved pay overrides in the period
  const overrides = await db
    .select()
    .from(payOverrides)
    .where(
      and(
        eq(payOverrides.workerId, workerId),
        eq(payOverrides.status, 'approved'),
        sql`DATE(${payOverrides.overrideDate}) >= ${startDateStr}`,
        sql`DATE(${payOverrides.overrideDate}) <= ${endDateStr}`
      )
    );

  // Calculate totals
  let totalBaseAmount = 0;
  let totalDeductions = 0;
  let totalBonuses = 0;
  let totalNetAmount = 0;
  let totalDaysWorked = 0;
  let totalLateMinutes = 0;
  let totalEarlyLeaveMinutes = 0;

  financeRecords.forEach(record => {
    totalBaseAmount += parseFloat(record.baseAmount || '0');
    totalDeductions += parseFloat(record.deductions || '0');
    totalBonuses += parseFloat(record.bonuses || '0');
    totalNetAmount += parseFloat(record.netAmount || '0');
    totalDaysWorked++;
    totalLateMinutes += record.lateMinutes || 0;
    totalEarlyLeaveMinutes += record.earlyLeaveMinutes || 0;
  });

  // Add overrides to totals
  overrides.forEach(override => {
    const amount = parseFloat(override.amount || '0');
    if (override.overrideType === 'bonus') {
      totalBonuses += amount;
      totalNetAmount += amount;
    } else if (override.overrideType === 'deduction') {
      totalDeductions += amount;
      totalNetAmount -= amount;
    }
  });

  return {
    worker: worker[0],
    period: { startDate, endDate },
    summary: {
      totalDaysWorked,
      totalBaseAmount: totalBaseAmount.toFixed(2),
      totalDeductions: totalDeductions.toFixed(2),
      totalBonuses: totalBonuses.toFixed(2),
      totalNetAmount: totalNetAmount.toFixed(2),
      totalLateMinutes,
      totalEarlyLeaveMinutes,
    },
    dailyRecords: financeRecords,
    overrides,
  };
}

/**
 * Get financial report for a group
 * Returns aggregated data for all workers in the group
 */
export async function getGroupFinancialReport(
  groupId: number,
  startDate: Date,
  endDate: Date
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get group info
  const group = await db
    .select({
      id: groups.id,
      code: groups.code,
      name: groups.name,
      costCenterId: groups.costCenterId,
    })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group.length) throw new Error("Group not found");

  // Get all workers in the group
  const groupWorkers = await db
    .select()
    .from(workers)
    .where(eq(workers.groupId, groupId));

  const workerIds = groupWorkers.map(w => w.id);

  if (workerIds.length === 0) {
    return {
      group: group[0],
      period: { startDate, endDate },
      summary: {
        totalWorkers: 0,
        totalDaysWorked: 0,
        totalBaseAmount: '0.00',
        totalDeductions: '0.00',
        totalBonuses: '0.00',
        totalNetAmount: '0.00',
      },
      workerReports: [],
    };
  }

  // Get financial reports for all workers
  const workerReports = await Promise.all(
    workerIds.map(workerId => getWorkerFinancialReport(workerId, startDate, endDate))
  );

  // Calculate group totals
  let totalDaysWorked = 0;
  let totalBaseAmount = 0;
  let totalDeductions = 0;
  let totalBonuses = 0;
  let totalNetAmount = 0;

  workerReports.forEach(report => {
    totalDaysWorked += report.summary.totalDaysWorked;
    totalBaseAmount += parseFloat(report.summary.totalBaseAmount);
    totalDeductions += parseFloat(report.summary.totalDeductions);
    totalBonuses += parseFloat(report.summary.totalBonuses);
    totalNetAmount += parseFloat(report.summary.totalNetAmount);
  });

  return {
    group: group[0],
    period: { startDate, endDate },
    summary: {
      totalWorkers: workerIds.length,
      totalDaysWorked,
      totalBaseAmount: totalBaseAmount.toFixed(2),
      totalDeductions: totalDeductions.toFixed(2),
      totalBonuses: totalBonuses.toFixed(2),
      totalNetAmount: totalNetAmount.toFixed(2),
    },
    workerReports: workerReports.map(r => ({
      workerId: r.worker.id,
      workerCode: r.worker.code,
      workerName: r.worker.fullName,
      ...r.summary,
    })),
  };
}

/**
 * Get financial report for a cost center
 * Returns aggregated data for all groups in the cost center
 */
export async function getCostCenterFinancialReport(
  costCenterId: number,
  startDate: Date,
  endDate: Date
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get cost center info
  const costCenter = await db
    .select()
    .from(costCenters)
    .where(eq(costCenters.id, costCenterId))
    .limit(1);

  if (!costCenter.length) throw new Error("Cost center not found");

  // Get all groups in the cost center
  const costCenterGroups = await db
    .select()
    .from(groups)
    .where(eq(groups.costCenterId, costCenterId));

  const groupIds = costCenterGroups.map(g => g.id);

  if (groupIds.length === 0) {
    return {
      costCenter: costCenter[0],
      period: { startDate, endDate },
      summary: {
        totalGroups: 0,
        totalWorkers: 0,
        totalDaysWorked: 0,
        totalBaseAmount: '0.00',
        totalDeductions: '0.00',
        totalBonuses: '0.00',
        totalNetAmount: '0.00',
      },
      groupReports: [],
    };
  }

  // Get financial reports for all groups
  const groupReports = await Promise.all(
    groupIds.map(groupId => getGroupFinancialReport(groupId, startDate, endDate))
  );

  // Calculate cost center totals
  let totalWorkers = 0;
  let totalDaysWorked = 0;
  let totalBaseAmount = 0;
  let totalDeductions = 0;
  let totalBonuses = 0;
  let totalNetAmount = 0;

  groupReports.forEach(report => {
    totalWorkers += report.summary.totalWorkers;
    totalDaysWorked += report.summary.totalDaysWorked;
    totalBaseAmount += parseFloat(report.summary.totalBaseAmount);
    totalDeductions += parseFloat(report.summary.totalDeductions);
    totalBonuses += parseFloat(report.summary.totalBonuses);
    totalNetAmount += parseFloat(report.summary.totalNetAmount);
  });

  return {
    costCenter: costCenter[0],
    period: { startDate, endDate },
    summary: {
      totalGroups: groupIds.length,
      totalWorkers,
      totalDaysWorked,
      totalBaseAmount: totalBaseAmount.toFixed(2),
      totalDeductions: totalDeductions.toFixed(2),
      totalBonuses: totalBonuses.toFixed(2),
      totalNetAmount: totalNetAmount.toFixed(2),
    },
    groupReports: groupReports.map(r => ({
      groupId: r.group.id,
      groupCode: r.group.code,
      groupName: r.group.name,
      ...r.summary,
    })),
  };
}

/**
 * Get all financial reports summary (all cost centers)
 */
export async function getAllFinancialReportsSummary(
  startDate: Date,
  endDate: Date
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get all cost centers
  const allCostCenters = await db.select().from(costCenters);

  if (allCostCenters.length === 0) {
    return {
      period: { startDate, endDate },
      summary: {
        totalCostCenters: 0,
        totalGroups: 0,
        totalWorkers: 0,
        totalDaysWorked: 0,
        totalBaseAmount: '0.00',
        totalDeductions: '0.00',
        totalBonuses: '0.00',
        totalNetAmount: '0.00',
      },
      costCenterReports: [],
    };
  }

  // Get financial reports for all cost centers
  const costCenterReports = await Promise.all(
    allCostCenters.map(cc => getCostCenterFinancialReport(cc.id, startDate, endDate))
  );

  // Calculate overall totals
  let totalGroups = 0;
  let totalWorkers = 0;
  let totalDaysWorked = 0;
  let totalBaseAmount = 0;
  let totalDeductions = 0;
  let totalBonuses = 0;
  let totalNetAmount = 0;

  costCenterReports.forEach(report => {
    totalGroups += report.summary.totalGroups;
    totalWorkers += report.summary.totalWorkers;
    totalDaysWorked += report.summary.totalDaysWorked;
    totalBaseAmount += parseFloat(report.summary.totalBaseAmount);
    totalDeductions += parseFloat(report.summary.totalDeductions);
    totalBonuses += parseFloat(report.summary.totalBonuses);
    totalNetAmount += parseFloat(report.summary.totalNetAmount);
  });

  return {
    period: { startDate, endDate },
    summary: {
      totalCostCenters: allCostCenters.length,
      totalGroups,
      totalWorkers,
      totalDaysWorked,
      totalBaseAmount: totalBaseAmount.toFixed(2),
      totalDeductions: totalDeductions.toFixed(2),
      totalBonuses: totalBonuses.toFixed(2),
      totalNetAmount: totalNetAmount.toFixed(2),
    },
    costCenterReports: costCenterReports.map(r => ({
      costCenterId: r.costCenter.id,
      costCenterCode: r.costCenter.code,
      costCenterName: r.costCenter.name,
      ...r.summary,
    })),
  };
}

