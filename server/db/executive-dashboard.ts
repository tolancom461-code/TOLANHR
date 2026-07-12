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
// Executive Finance Dashboard (لوحة الإدارة العليا المالية)
// ============================================

export async function getExecutiveFinanceSummary(
  periodStart: string,
  periodEnd: string,
  groupId?: number,
  costCenterId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { workerDailyFinance, workers, groups, costCenters } = await import('../../drizzle/schema');

  // Build conditions
  const conditions: any[] = [
    sql`${workerDailyFinance.workDate} >= ${periodStart}`,
    sql`${workerDailyFinance.workDate} <= ${periodEnd}`,
  ];

  if (groupId) {
    conditions.push(eq(workers.groupId, groupId));
  }

  if (costCenterId) {
    conditions.push(eq(groups.costCenterId, costCenterId));
  }

  // Get all daily finance records with worker/group/cost center info
  const records = await db
    .select({
      baseAmount: workerDailyFinance.baseAmount,
      deductions: workerDailyFinance.deductions,
      bonuses: workerDailyFinance.bonuses,
      netAmount: workerDailyFinance.netAmount,
      groupId: workers.groupId,
      groupName: groups.name,
      groupCode: groups.code,
      costCenterId: groups.costCenterId,
      costCenterName: costCenters.name,
      costCenterCode: costCenters.code,
    })
    .from(workerDailyFinance)
    .innerJoin(workers, eq(workerDailyFinance.workerId, workers.id))
    .leftJoin(groups, eq(workers.groupId, groups.id))
    .leftJoin(costCenters, eq(groups.costCenterId, costCenters.id))
    .where(and(...conditions));

  // Calculate grand total
  let totalBase = 0;
  let totalDeductions = 0;
  let totalBonuses = 0;
  let totalNet = 0;

  // Group by cost center
  const byCostCenter: Record<string, { id: number; name: string; code: string; total: number }> = {};
  // Group by group
  const byGroup: Record<string, { id: number; name: string; code: string; total: number }> = {};

  for (const r of records) {
    const base = parseFloat(r.baseAmount || '0');
    const ded = parseFloat(r.deductions || '0');
    const bon = parseFloat(r.bonuses || '0');
    const net = parseFloat(r.netAmount || '0');

    totalBase += base;
    totalDeductions += ded;
    totalBonuses += bon;
    totalNet += net;

    // By cost center
    if (r.costCenterId && r.costCenterName) {
      const ccKey = String(r.costCenterId);
      if (!byCostCenter[ccKey]) {
        byCostCenter[ccKey] = { id: r.costCenterId, name: r.costCenterName, code: r.costCenterCode || '', total: 0 };
      }
      byCostCenter[ccKey].total += net;
    }

    // By group
    if (r.groupId && r.groupName) {
      const gKey = String(r.groupId);
      if (!byGroup[gKey]) {
        byGroup[gKey] = { id: r.groupId, name: r.groupName, code: r.groupCode || '', total: 0 };
      }
      byGroup[gKey].total += net;
    }
  }

  return {
    periodStart,
    periodEnd,
    totalBase: totalBase.toFixed(2),
    totalDeductions: totalDeductions.toFixed(2),
    totalBonuses: totalBonuses.toFixed(2),
    totalNet: totalNet.toFixed(2),
    byCostCenter: Object.values(byCostCenter).map(c => ({
      ...c,
      total: c.total.toFixed(2),
    })),
    byGroup: Object.values(byGroup).map(g => ({
      ...g,
      total: g.total.toFixed(2),
    })),
  };
}


