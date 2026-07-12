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
// تقرير تغطية المجموعات (المجموعات التي فاتها إنشاء دفعة رواتب)
// ============================================

/**
 * لكل مجموعة لديها حضور فعلي: يقارن "آخر يوم شملته أي دفعة رواتب" بـ"آخر يوم حضور فعلي مسجَّل"
 * ويعرض فقط المجموعات التي لديها فجوة (أيام عمل حقيقية لم تُدرج بعد في أي دفعة).
 * إذا لم يُنشأ لها أي دفعة إطلاقاً من قبل، تُحسب الفجوة من أول يوم حضور مسجَّل لها في النظام.
 */
export async function getGroupCoverageReport(filters?: {
  startDate?: string;
  endDate?: string;
  groupId?: number;
  costCenterId?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const groupConditions = [];
  if (filters?.groupId) groupConditions.push(eq(groups.id, filters.groupId));
  if (filters?.costCenterId) groupConditions.push(eq(groups.costCenterId, filters.costCenterId));

  const allGroups = await db
    .select({
      id: groups.id,
      name: groups.name,
      costCenterId: groups.costCenterId,
      costCenterName: costCenters.name,
    })
    .from(groups)
    .leftJoin(costCenters, eq(groups.costCenterId, costCenters.id))
    .where(groupConditions.length > 0 ? and(...groupConditions) : undefined);

  if (allGroups.length === 0) return [];

  const groupIds = allGroups.map(g => g.id);

  // ✅ كل فترات كل الدفعات (غير المرفوضة نهائياً) لكل مجموعة — وليس آخر دفعة فقط
  const batchRows = await db
    .select({
      groupId: payrollBatchItems.groupId,
      periodStart: payrollBatches.periodStart,
      periodEnd: payrollBatches.periodEnd,
    })
    .from(payrollBatchItems)
    .innerJoin(payrollBatches, eq(payrollBatchItems.batchId, payrollBatches.id))
    .where(
      and(
        inArray(payrollBatchItems.groupId, groupIds),
        ne(payrollBatches.status, 'rejected_final')
      )
    );

  const batchRangesByGroup = new Map<number, Array<{ start: string; end: string }>>();
  for (const row of batchRows) {
    if (!row.groupId) continue;
    const ranges = batchRangesByGroup.get(row.groupId) || [];
    ranges.push({ start: row.periodStart, end: row.periodEnd });
    batchRangesByGroup.set(row.groupId, ranges);
  }

  // كل أيام الحضور الفعلي (فيها بصمة حضور حقيقية) لكل مجموعة، ضمن فترة الفلترة إن حُددت
  const attendanceConditions = [
    inArray(workers.groupId, groupIds),
    isNotNull(workerDailyFinance.checkInTime),
  ];
  if (filters?.startDate) attendanceConditions.push(gte(workerDailyFinance.workDate, filters.startDate));
  if (filters?.endDate) attendanceConditions.push(lte(workerDailyFinance.workDate, filters.endDate));

  const attendanceRows = await db
    .select({
      groupId: workers.groupId,
      workDate: workerDailyFinance.workDate,
    })
    .from(workerDailyFinance)
    .innerJoin(workers, eq(workerDailyFinance.workerId, workers.id))
    .where(and(...attendanceConditions));

  const datesByGroup = new Map<number, Set<string>>();
  for (const row of attendanceRows) {
    if (!row.groupId) continue;
    const dates = datesByGroup.get(row.groupId) || new Set<string>();
    dates.add(row.workDate);
    datesByGroup.set(row.groupId, dates);
  }

  // هل هذا اليوم مُغطى بأي دفعة (بغض النظر عن ترتيبها الزمني)؟
  const isDateCovered = (ranges: Array<{ start: string; end: string }>, date: string) =>
    ranges.some(r => date >= r.start && date <= r.end);

  const results: Array<{
    groupId: number;
    groupName: string;
    costCenterId: number | null;
    costCenterName: string | null;
    missingDates: string[]; // كل يوم فيه حضور فعلي ولم يُدرج ضمن أي دفعة، مرتب تصاعدياً
  }> = [];

  for (const g of allGroups) {
    const dates = datesByGroup.get(g.id);
    if (!dates || dates.size === 0) continue; // لا يوجد أي حضور لهذه المجموعة إطلاقاً — لا داعي لعرضها

    const ranges = batchRangesByGroup.get(g.id) || [];
    const missingDates = Array.from(dates)
      .filter(d => !isDateCovered(ranges, d))
      .sort((a, b) => a.localeCompare(b));

    if (missingDates.length === 0) continue; // كل أيامها مُغطاة، لا داعي لعرضها

    results.push({
      groupId: g.id,
      groupName: g.name,
      costCenterId: g.costCenterId,
      costCenterName: g.costCenterName,
      missingDates,
    });
  }

  results.sort((a, b) => b.missingDates.length - a.missingDates.length);
  return results;
}

export async function getAllRestaurants(includeInactive = false) {
  const db = await getDb();
  if (!db) return [];

  const conditions = includeInactive ? [] : [eq(restaurants.isActive, 1)];

  return await db
    .select()
    .from(restaurants)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(restaurants.name);
}

export async function createRestaurant(name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const trimmed = name.trim();
  if (!trimmed) throw new Error("اسم المطعم مطلوب");

  const existing = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.name, trimmed))
    .limit(1);
  if (existing.length > 0) throw new Error("يوجد مطعم بنفس الاسم مسبقاً");

  const result = await db.insert(restaurants).values({ name: trimmed });
  return { id: (result as any).insertId, name: trimmed };
}

export async function updateRestaurant(id: number, params: { name?: string; isActive?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: any = {};
  if (params.name !== undefined) updateData.name = params.name.trim();
  if (params.isActive !== undefined) updateData.isActive = params.isActive ? 1 : 0;

  await db.update(restaurants).set(updateData).where(eq(restaurants.id, id));
  return { success: true };
}

export async function deleteRestaurant(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // لا نحذف نهائياً إن كان له تعيينات سابقة (حفاظاً على السجل التاريخي)، بل نعطّله فقط
  const hasAssignments = await db
    .select({ id: dailyWorkAssignments.id })
    .from(dailyWorkAssignments)
    .where(eq(dailyWorkAssignments.restaurantId, id))
    .limit(1);

  if (hasAssignments.length > 0) {
    await db.update(restaurants).set({ isActive: 0 }).where(eq(restaurants.id, id));
    return { success: true, softDeleted: true };
  }

  await db.delete(restaurants).where(eq(restaurants.id, id));
  return { success: true, softDeleted: false };
}

