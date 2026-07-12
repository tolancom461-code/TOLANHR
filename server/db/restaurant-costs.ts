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
// تقرير تكاليف المطاعم
// ============================================

/**
 * تقرير تكلفة العمالة لكل مطعم خلال فترة زمنية، مبني من السجل المالي اليومي
 * مربوطاً بتعيينات العمل اليومية (وليس من دفعات الرواتب مباشرة، لأنها مجمّعة لفترة كاملة)
 */
export async function getRestaurantCostReport(startDate: string, endDate: string) {
  const db = await getDb();
  if (!db) return { restaurants: [], unassigned: null };

  // كل السجلات المالية اليومية ضمن الفترة، مربوطة بتعيين المطعم لنفس اليوم (إن وُجد)
  const rows = await db
    .select({
      workerId: workerDailyFinance.workerId,
      workDate: workerDailyFinance.workDate,
      netAmount: workerDailyFinance.netAmount,
      restaurantId: dailyWorkAssignments.restaurantId,
      restaurantName: restaurants.name,
    })
    .from(workerDailyFinance)
    .leftJoin(
      dailyWorkAssignments,
      and(
        eq(workerDailyFinance.workerId, dailyWorkAssignments.workerId),
        eq(workerDailyFinance.workDate, dailyWorkAssignments.workDate)
      )
    )
    .leftJoin(restaurants, eq(dailyWorkAssignments.restaurantId, restaurants.id))
    .where(
      and(
        gte(workerDailyFinance.workDate, startDate),
        lte(workerDailyFinance.workDate, endDate)
      )
    );

  const byRestaurant = new Map<number, { restaurantId: number; restaurantName: string; workerIds: Set<number>; totalCost: number }>();
  let unassignedWorkerIds = new Set<number>();
  let unassignedCost = 0;

  for (const row of rows) {
    const cost = parseFloat(row.netAmount || '0');
    if (row.restaurantId && row.restaurantName) {
      if (!byRestaurant.has(row.restaurantId)) {
        byRestaurant.set(row.restaurantId, {
          restaurantId: row.restaurantId,
          restaurantName: row.restaurantName,
          workerIds: new Set(),
          totalCost: 0,
        });
      }
      const entry = byRestaurant.get(row.restaurantId)!;
      entry.workerIds.add(row.workerId);
      entry.totalCost += cost;
    } else {
      // ✅ عامل حاضر فعلياً لكن بلا تعيين مطعم لذلك اليوم — يُعرض في فئة "غير محدد" منفصلة
      unassignedWorkerIds.add(row.workerId);
      unassignedCost += cost;
    }
  }

  const restaurantsResult = Array.from(byRestaurant.values())
    .map(r => ({
      restaurantId: r.restaurantId,
      restaurantName: r.restaurantName,
      workerCount: r.workerIds.size,
      totalCost: Math.round(r.totalCost * 100) / 100,
    }))
    .sort((a, b) => b.totalCost - a.totalCost);

  return {
    restaurants: restaurantsResult,
    unassigned: unassignedWorkerIds.size > 0 ? {
      workerCount: unassignedWorkerIds.size,
      totalCost: Math.round(unassignedCost * 100) / 100,
    } : null,
  };
}

