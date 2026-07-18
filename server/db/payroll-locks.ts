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
// Payroll Lock Functions
// ============================================

// Check if payroll batch exists for a date (excluding cancelled and unlocked)
export async function checkPayrollBatchForDate(date: string, groupId?: number) {
  const db = await getDb();
  if (!db) return null;

  const baseConditions = and(
    sql`${payrollBatches.periodStart} <= ${date}`,
    sql`${payrollBatches.periodEnd} >= ${date}`,
    sql`${payrollBatches.status} != 'cancelled'`,
    sql`(${payrollBatches.isUnlocked} IS NULL OR ${payrollBatches.isUnlocked} = FALSE)`
  );

  // ✅ القفل مرتبط بالتاريخ + المجموعة: لو انمررت مجموعة، الدفعة تقفل التاريخ
  // فقط إذا كانت تشمل فعلياً عمالاً من نفس المجموعة (فحص عبر بنود الدفعة)
  if (groupId !== undefined && groupId !== null) {
    const result = await db
      .select()
      .from(payrollBatches)
      .where(
        and(
          baseConditions,
          sql`EXISTS (
            SELECT 1 FROM payroll_batch_items pbi
            WHERE pbi.batch_id = ${payrollBatches.id}
              AND pbi.group_id = ${groupId}
          )`
        )
      )
      .limit(1);
    return result.length > 0 ? result[0] : null;
  }

  const result = await db
    .select()
    .from(payrollBatches)
    .where(baseConditions)
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}


// Force unlock payroll batch (requires FORCE_UNLOCK_PAYROLL permission)
export async function forceUnlockPayroll(batchId: number, reason: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { payrollBatches, auditLog } = await import('../../drizzle/schema');
  
  // Get batch
  const [batch] = await db.select().from(payrollBatches).where(eq(payrollBatches.id, batchId)).limit(1);
  if (!batch) throw new Error("دفعة العمال غير موجودة");
  
  // Update batch to unlocked
  await db.update(payrollBatches).set({
    isUnlocked: true,
    unlockReason: reason,
    unlockedBy: userId,
    unlockedAt: new Date(),
  }).where(eq(payrollBatches.id, batchId));
  
  // Log the action
  await db.insert(auditLog).values({
    userId,
    action: 'FORCE_UNLOCK_PAYROLL',
    tableName: 'payroll_batches',
    recordId: batchId,
    oldValues: JSON.stringify({ isUnlocked: batch.isUnlocked }),
    newValues: JSON.stringify({ isUnlocked: true, unlockReason: reason }),
  });
  
  return { success: true, message: 'تم إلغاء قفل دفعة العمال بنجاح' };
}

// Re-lock payroll batch
export async function relockPayroll(batchId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { payrollBatches, auditLog } = await import('../../drizzle/schema');
  
  // Get batch
  const [batch] = await db.select().from(payrollBatches).where(eq(payrollBatches.id, batchId)).limit(1);
  if (!batch) throw new Error("دفعة العمال غير موجودة");
  
  // Update batch to locked
  await db.update(payrollBatches).set({
    isUnlocked: false,
    unlockReason: null,
    unlockedBy: null,
    unlockedAt: null,
  }).where(eq(payrollBatches.id, batchId));
  
  // Log the action
  await db.insert(auditLog).values({
    userId,
    action: 'RELOCK_PAYROLL',
    tableName: 'payroll_batches',
    recordId: batchId,
    oldValues: JSON.stringify({ isUnlocked: batch.isUnlocked }),
    newValues: JSON.stringify({ isUnlocked: false }),
  });
  
  return { success: true, message: 'تم إعادة قفل دفعة العمال بنجاح' };
}


