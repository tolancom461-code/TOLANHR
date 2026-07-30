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
// User Cost Centers (RBAC)
// ============================================

export async function assignUserCostCenters(userId: number, costCenterIds: number[], tx?: any) {
  const database = tx ?? (await getDb());
  if (!database) throw new Error('Database not available');
  
  // Delete existing assignments
  await database.delete(userCostCenters).where(eq(userCostCenters.userId, userId));
  
  // Insert new assignments
  if (costCenterIds.length > 0) {
    await database.insert(userCostCenters).values(
      costCenterIds.map(ccId => ({
        userId,
        costCenterId: ccId,
      }))
    );
  }
  
  return { success: true };
}

export async function getUserCostCenters(userId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const results = await db
    .select({
      id: userCostCenters.id,
      costCenterId: userCostCenters.costCenterId,
      costCenterCode: costCenters.code,
      costCenterName: costCenters.name,
    })
    .from(userCostCenters)
    .innerJoin(costCenters, eq(userCostCenters.costCenterId, costCenters.id))
    .where(eq(userCostCenters.userId, userId));
  
  return results;
}

export async function getUserCostCenterIds(userId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const results = await db
    .select({ costCenterId: userCostCenters.costCenterId })
    .from(userCostCenters)
    .where(eq(userCostCenters.userId, userId));
  
  return results.map(r => r.costCenterId);
}


