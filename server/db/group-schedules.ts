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
import { recalculateGroupFinanceForOpenPeriods } from './recalculation';

// ============================================
// Group Schedules Functions
// ============================================

export async function getGroupSchedules(groupId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (groupId) {
    return await db.select().from(groupSchedules).where(eq(groupSchedules.groupId, groupId));
  }

  return await db.select().from(groupSchedules);
}

export async function updateGroupSchedule(
  id: number,
  startTime?: string,
  endTime?: string,
  requiredHours?: number,
  effectiveDate?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updates: any = {};
  if (startTime) updates.startTime = startTime;
  if (endTime) updates.endTime = endTime;
  if (requiredHours !== undefined) updates.requiredHours = requiredHours;
  if (effectiveDate !== undefined) updates.effectiveDate = effectiveDate;

  if (Object.keys(updates).length === 0) {
    throw new Error("No fields to update");
  }

  // Get the groupId before update for recalculation
  const [schedule] = await db.select().from(groupSchedules).where(eq(groupSchedules.id, id));
  
  const result = await db.update(groupSchedules)
    .set(updates)
    .where(eq(groupSchedules.id, id));

  // ✅ Automatic recalculation when schedule is updated
  if (schedule?.groupId) {
    try {
      await recalculateGroupFinanceForOpenPeriods(schedule.groupId);
      console.log(`[Schedule Updated] ✅ Recalculated group ${schedule.groupId}`);
    } catch (error: any) {
      console.error(`[Schedule Updated] ⚠️ Recalc failed:`, error.message);
    }
  }

  return result;
}


