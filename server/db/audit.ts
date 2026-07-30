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
// Audit Log Helper
// ============================================
/**
 * Helper function to log audit trail entries
 * يسجل كل العمليات المهمة في سجل التدقيق
 */
export async function logAudit(params: {
  userId?: number | null;
  action: string;
  tableName: string;
  recordId?: number | null;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string;
  /**
   * معاملة Drizzle اختيارية — لو مُررت، تصير كتابة السجل القديم جزءاً من
   * نفس الـ transaction الخاصة بعملية v2 (فترة التشغيل المزدوج، قسم 12).
   */
  tx?: any;
}) {
  try {
    const db = params.tx ?? (await getDb());
    if (!db) return;
    await db.insert(auditLog).values({
      userId: params.userId || null,
      action: params.action,
      tableName: params.tableName,
      recordId: params.recordId || null,
      oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
      newValues: params.newValues ? JSON.stringify(params.newValues) : null,
      ipAddress: params.ipAddress || null,
    });
  } catch (error) {
    console.error('[logAudit] Error logging audit:', error);
    // Don't throw - audit logging should never break the main operation
    // (إلا لو كنا داخل transaction خاصة بـ v2 التي تتطلب rollback عند الفشل —
    // في هذه الحالة raise سيحدث من استدعاء logAuditV2 المرافق، وليس من هنا)
  }
}

