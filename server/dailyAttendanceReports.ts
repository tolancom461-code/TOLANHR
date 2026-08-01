import { eq, and, inArray, gte, lte } from "drizzle-orm";
import { getDb } from "./db";

export async function getDailyAttendanceReportData(
  periodStart: string,
  periodEnd: string,
  costCenterId?: number,
  groupIds?: number[],
  workerIds?: number[]
) {
  const db = await getDb();
  if (!db) return [];

  const { workers, groups, payrollBatches, payrollBatchItems } = await import('../drizzle/schema');

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

  const items = await db
    .select({
      workerId: payrollBatchItems.workerId,
      workerName: workers.fullName,
      workerCode: workers.code,
      groupId: groups.id,
      groupName: groups.name,
      daysWorked: payrollBatchItems.daysWorked,
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

  // ✅ دمج (لو نفس العامل ظهر في أكثر من دفعة ضمن نفس الفترة، نجمع أرقامه بدل تكراره كصفين)
  const workerMap = new Map<number, {
    workerId: number;
    workerName: string;
    workerCode: string;
    groupId: number;
    groupName: string;
    daysWorked: number;
    baseAmount: number;
    totalDeductions: number;
    totalBonuses: number;
    netAmount: number;
  }>();

  items.forEach((row) => {
    if (groupIds && groupIds.length > 0 && !groupIds.includes(row.groupId)) return;
    if (workerIds !== undefined && !workerIds.includes(row.workerId)) return;

    const daysWorked = row.daysWorked || 0;
    const baseAmount = parseFloat(row.baseAmount || '0');
    const totalDeductions = parseFloat(row.totalDeductions || '0');
    const totalBonuses = parseFloat(row.totalBonuses || '0');
    const netAmount = parseFloat(row.netAmount || '0');

    const existing = workerMap.get(row.workerId);
    if (existing) {
      existing.daysWorked += daysWorked;
      existing.baseAmount += baseAmount;
      existing.totalDeductions += totalDeductions;
      existing.totalBonuses += totalBonuses;
      existing.netAmount += netAmount;
    } else {
      workerMap.set(row.workerId, {
        workerId: row.workerId,
        workerName: row.workerName,
        workerCode: row.workerCode,
        groupId: row.groupId,
        groupName: row.groupName,
        daysWorked,
        baseAmount,
        totalDeductions,
        totalBonuses,
        netAmount,
      });
    }
  });

  return Array.from(workerMap.values());
}

export async function getDailyAttendanceReportGroups(costCenterId?: number) {
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
