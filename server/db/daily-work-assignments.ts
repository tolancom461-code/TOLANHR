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
// صفحة "التشغيل" - تعيينات العمل اليومية
// ============================================

/**
 * جلب عمال مجموعة معينة مع تعيينهم الحالي (إن وُجد) لتاريخ معين
 * تُستخدم في صفحة التشغيل لعرض قائمة العمال وحالة كل منهم
 */
export async function getWorkersWithAssignmentForGroupDate(groupId: number, workDate: string) {
  const db = await getDb();
  if (!db) return [];

  const { attendanceEvents } = await import('../../drizzle/schema');

  const groupWorkers = await db
    .select({ id: workers.id, fullName: workers.fullName, code: workers.code })
    .from(workers)
    .where(eq(workers.groupId, groupId))
    .orderBy(workers.fullName);

  if (groupWorkers.length === 0) return [];

  const allWorkerIds = groupWorkers.map(w => w.id);

  // ✅ فقط العمال الحاضرون فعلياً في هذا التاريخ (لديهم بصمة حضور)
  const presentEvents = await db
    .select({ workerId: attendanceEvents.workerId })
    .from(attendanceEvents)
    .where(
      and(
        inArray(attendanceEvents.workerId, allWorkerIds),
        eq(attendanceEvents.workDate, workDate),
        eq(attendanceEvents.eventType, 'check_in')
      )
    );
  const presentWorkerIds = new Set(presentEvents.map(e => e.workerId));

  const presentGroupWorkers = groupWorkers.filter(w => presentWorkerIds.has(w.id));
  if (presentGroupWorkers.length === 0) return [];

  const workerIds = presentGroupWorkers.map(w => w.id);

  const existingAssignments = await db
    .select({
      workerId: dailyWorkAssignments.workerId,
      restaurantId: dailyWorkAssignments.restaurantId,
      restaurantName: restaurants.name,
    })
    .from(dailyWorkAssignments)
    .leftJoin(restaurants, eq(dailyWorkAssignments.restaurantId, restaurants.id))
    .where(
      and(
        inArray(dailyWorkAssignments.workerId, workerIds),
        eq(dailyWorkAssignments.workDate, workDate)
      )
    );

  const assignmentByWorker = new Map(existingAssignments.map(a => [a.workerId, a]));

  return presentGroupWorkers.map(w => ({
    ...w,
    currentRestaurantId: assignmentByWorker.get(w.id)?.restaurantId || null,
    currentRestaurantName: assignmentByWorker.get(w.id)?.restaurantName || null,
  }));
}

/**
 * حفظ/تحديث تعيين عامل لمطعم في تاريخ معين (مطعم واحد فقط لكل عامل لكل يوم)
 */
export async function upsertDailyWorkAssignment(params: {
  workerId: number;
  restaurantId: number;
  workDate: string;
  assignedBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select()
    .from(dailyWorkAssignments)
    .where(
      and(
        eq(dailyWorkAssignments.workerId, params.workerId),
        eq(dailyWorkAssignments.workDate, params.workDate)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(dailyWorkAssignments)
      .set({ restaurantId: params.restaurantId, assignedBy: params.assignedBy })
      .where(eq(dailyWorkAssignments.id, existing[0].id));
    return { success: true, updated: true };
  }

  await db.insert(dailyWorkAssignments).values({
    workerId: params.workerId,
    restaurantId: params.restaurantId,
    workDate: params.workDate,
    assignedBy: params.assignedBy,
  });
  return { success: true, updated: false };
}

/**
 * إزالة تعيين عامل من مطعم في تاريخ معين
 */
export async function removeDailyWorkAssignment(workerId: number, workDate: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(dailyWorkAssignments)
    .where(
      and(
        eq(dailyWorkAssignments.workerId, workerId),
        eq(dailyWorkAssignments.workDate, workDate)
      )
    );
  return { success: true };
}

/**
 * جلب أسماء المطاعم التي عمل بها عامل معين خلال فترة زمنية (لعرضها كملاحظة مرجعية في الدفعة)
 */
export async function getRestaurantNamesForWorkerPeriod(workerId: number, periodStart: string, periodEnd: string): Promise<string> {
  const db = await getDb();
  if (!db) return '';

  const rows = await db
    .selectDistinct({ name: restaurants.name })
    .from(dailyWorkAssignments)
    .leftJoin(restaurants, eq(dailyWorkAssignments.restaurantId, restaurants.id))
    .where(
      and(
        eq(dailyWorkAssignments.workerId, workerId),
        gte(dailyWorkAssignments.workDate, periodStart),
        lte(dailyWorkAssignments.workDate, periodEnd)
      )
    );

  return rows.map(r => r.name).filter(Boolean).join('، ');
}

