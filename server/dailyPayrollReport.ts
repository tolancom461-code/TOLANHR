import { eq, and, inArray, gte, lte } from "drizzle-orm";
import { getDb } from "./db";

export async function getDailyPayrollReport(
  periodStart: string,
  periodEnd: string,
  costCenterId?: number,
  groupIds?: number[]
) {
  const db = await getDb();
  if (!db) return [];

  const { workers, groups, costCenters, payrollBatches, payrollBatchItems } = await import('../drizzle/schema');

  const startDateStr = periodStart.split('T')[0];
  const endDateStr = periodEnd.split('T')[0];

  const conditions = [
    lte(payrollBatches.periodStart, endDateStr),
    gte(payrollBatches.periodEnd, startDateStr),
    inArray(payrollBatches.status, ['approved', 'paid']),
  ];

  if (costCenterId) {
    conditions.push(eq(groups.costCenterId, costCenterId));
  }

  const batchItems = await db
    .select({
      groupId: groups.id,
      groupName: groups.name,
      workerId: payrollBatchItems.workerId,
      baseAmount: payrollBatchItems.baseAmount,
      totalDeductions: payrollBatchItems.totalDeductions,
      totalBonuses: payrollBatchItems.totalBonuses,
      netAmount: payrollBatchItems.netAmount,
    })
    .from(payrollBatchItems)
    .innerJoin(payrollBatches, eq(payrollBatchItems.batchId, payrollBatches.id))
    .innerJoin(workers, eq(payrollBatchItems.workerId, workers.id))
    .innerJoin(groups, eq(payrollBatchItems.groupId, groups.id))
    .where(and(...conditions));

  const groupMap = new Map<number, {
    groupName: string;
    workerIds: Set<number>;
    totalSalary: number;
    totalDeductions: number;
    totalBonuses: number;
    totalNet: number;
  }>();

  batchItems.forEach((row) => {
    if (groupIds && groupIds.length > 0 && !groupIds.includes(row.groupId)) return;

    const existing = groupMap.get(row.groupId);
    const base = parseFloat(row.baseAmount || '0');
    const deductions = parseFloat(row.totalDeductions || '0');
    const bonuses = parseFloat(row.totalBonuses || '0');
    const net = parseFloat(row.netAmount || '0');

    if (existing) {
      existing.totalSalary += base;
      existing.totalDeductions += deductions;
      existing.totalBonuses += bonuses;
      existing.totalNet += net;
      existing.workerIds.add(row.workerId);
    } else {
      groupMap.set(row.groupId, {
        groupName: row.groupName,
        workerIds: new Set([row.workerId]),
        totalSalary: base,
        totalDeductions: deductions,
        totalBonuses: bonuses,
        totalNet: net,
      });
    }
  });

  return Array.from(groupMap.values()).map((data, index) => ({
    rowIndex: index + 1,
    groupName: data.groupName,
    workerCount: data.workerIds.size,
    totalSalary: data.totalSalary,
    totalDeductions: data.totalDeductions,
    totalBonuses: data.totalBonuses,
    totalNet: data.totalNet,
  }));
}

export async function getDailyPayrollGroups(costCenterId?: number) {
  const db = await getDb();
  if (!db) return [];

  const { groups } = await import('../drizzle/schema');

  if (costCenterId) {
    return await db
      .select({ id: groups.id, name: groups.name })
      .from(groups)
      .where(eq(groups.costCenterId, costCenterId));
  }

  return await db
    .select({ id: groups.id, name: groups.name })
    .from(groups);
}
