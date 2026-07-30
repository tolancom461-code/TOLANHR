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
// Operational Flags (البلاغات التشغيلية)
// ============================================

export async function createOperationalFlag(data: {
  flagType: string;
  workerId: number;
  groupId?: number;
  flagDate: string;
  endDate?: string;
  description: string;
  attachments?: string[];
  amount?: number;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { operationalFlags } = await import('../../drizzle/schema');

  const insertData: any = {
    flagType: data.flagType,
    workerId: data.workerId,
    groupId: data.groupId || null,
    flagDate: new Date(data.flagDate),
    endDate: data.endDate ? new Date(data.endDate) : null,
    description: data.description,
    attachments: data.attachments ? JSON.stringify(data.attachments) : null,
    amount: data.amount?.toString() || null,
    status: 'PENDING_ADMIN_ACTION',
    createdBy: data.createdBy,
  };

  const result = await db.insert(operationalFlags).values(insertData);

  return result[0].insertId;
}

export async function listOperationalFlags(filters?: {
  status?: string;
  workerId?: number;
  groupId?: number;
  flagType?: string;
  startDate?: string;
  endDate?: string;
}) {
  const db = await getDb();
  if (!db) return [];

  const { operationalFlags, workers, groups, users } = await import('../../drizzle/schema');

  let query = db
    .select({
      id: operationalFlags.id,
      workerId: operationalFlags.workerId,
      workerName: workers.fullName,
      workerCode: workers.code,
      groupId: operationalFlags.groupId,
      groupName: groups.name,
      flagDate: operationalFlags.flagDate,
      description: operationalFlags.description,
      status: operationalFlags.status,
      createdBy: operationalFlags.createdBy,
      createdByName: users.fullName,
      approvedBy: operationalFlags.approvedBy,
      approvedAt: operationalFlags.approvedAt,
      approvalNotes: operationalFlags.approvalNotes,
      createdAt: operationalFlags.createdAt,
      updatedAt: operationalFlags.updatedAt,
    })
    .from(operationalFlags)
    .leftJoin(workers, eq(operationalFlags.workerId, workers.id))
    .leftJoin(groups, eq(operationalFlags.groupId, groups.id))
    .leftJoin(users, eq(operationalFlags.createdBy, users.id));

  const conditions = [];

  if (filters?.status) {
    conditions.push(eq(operationalFlags.status, filters.status as any));
  }

  if (filters?.workerId) {
    conditions.push(eq(operationalFlags.workerId, filters.workerId));
  }

  if (filters?.groupId) {
    conditions.push(eq(operationalFlags.groupId, filters.groupId));
  }

  // flagType filter removed - not available in schema

  if (filters?.startDate) {
    conditions.push(sql`${operationalFlags.flagDate} >= ${filters.startDate}`);
  }

  if (filters?.endDate) {
    conditions.push(sql`${operationalFlags.flagDate} <= ${filters.endDate}`);
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  const results = await query.orderBy(desc(operationalFlags.createdAt));

  return results.map(r => ({
    ...r,
    // attachments field removed - not in schema
  }));
}

export async function getOperationalFlag(id: number) {
  const db = await getDb();
  if (!db) return null;

  const { operationalFlags, workers, groups, users } = await import('../../drizzle/schema');

  const [flag] = await db
    .select({
      id: operationalFlags.id,
      workerId: operationalFlags.workerId,
      workerName: workers.fullName,
      workerCode: workers.code,
      groupId: operationalFlags.groupId,
      groupName: groups.name,
      flagDate: operationalFlags.flagDate,
      description: operationalFlags.description,
      status: operationalFlags.status,
      createdBy: operationalFlags.createdBy,
      createdByName: users.fullName,
      approvedBy: operationalFlags.approvedBy,
      approvedAt: operationalFlags.approvedAt,
      approvalNotes: operationalFlags.approvalNotes,
      createdAt: operationalFlags.createdAt,
      updatedAt: operationalFlags.updatedAt,
    })
    .from(operationalFlags)
    .leftJoin(workers, eq(operationalFlags.workerId, workers.id))
    .leftJoin(groups, eq(operationalFlags.groupId, groups.id))
    .leftJoin(users, eq(operationalFlags.createdBy, users.id))
    .where(eq(operationalFlags.id, id))
    .limit(1);

  if (!flag) return null;

  return flag;
}

export async function approveOperationalFlag(
  flagId: number,
  approvedBy: number,
  notes?: string
): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const { operationalFlags } = await import('../../drizzle/schema');

  try {
    await db.update(operationalFlags)
      .set({
        status: 'approved',
        approvedBy,
        approvedAt: new Date(),
        approvalNotes: notes,
      })
      .where(eq(operationalFlags.id, flagId));

    return { success: true };
  } catch (error) {
    console.error('[Database] Error approving operational flag:', error);
    throw error;
  }
}

export async function rejectOperationalFlag(
  flagId: number,
  approvedBy: number,
  notes?: string
): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const { operationalFlags } = await import('../../drizzle/schema');

  try {
    await db.update(operationalFlags)
      .set({
        status: 'rejected',
        approvedBy,
        approvedAt: new Date(),
        approvalNotes: notes,
      })
      .where(eq(operationalFlags.id, flagId));

    return { success: true };
  } catch (error) {
    console.error('[Database] Error rejecting operational flag:', error);
    throw error;
  }
}

export async function checkUnresolvedFlags(workerId?: number, groupId?: number, dateRange?: { start: string; end: string }) {
  const db = await getDb();
  if (!db) return { hasUnresolved: false, count: 0, flags: [] };

  const { operationalFlags } = await import('../../drizzle/schema');

  const conditions = [eq(operationalFlags.status, 'PENDING_ADMIN_ACTION' as any)];

  if (workerId) {
    conditions.push(eq(operationalFlags.workerId, workerId));
  }

  if (groupId) {
    conditions.push(eq(operationalFlags.groupId, groupId));
  }

  if (dateRange) {
    conditions.push(sql`${operationalFlags.flagDate} >= ${dateRange.start}`);
    conditions.push(sql`${operationalFlags.flagDate} <= ${dateRange.end}`);
  }

  const flags = await db
    .select()
    .from(operationalFlags)
    .where(and(...conditions));

  return {
    hasUnresolved: flags.length > 0,
    count: flags.length,
    flags: flags.map(f => ({
      id: f.id,
      workerId: f.workerId,
      flagDate: f.flagDate,
      description: f.description,
      status: f.status,
    })),
  };
}


// ============================================
// Atomic Permissions + Data Scope System
// نظام الصلاحيات الذرية + النطاق
// ============================================

/**
 * Check if a user has a specific permission on a specific scope
 * التحقق من صلاحية محددة على نطاق محدد
 * NOTE: All users have full permissions now.
 */

export async function updateUserRole(userId: number, role: 'guard' | 'supervisor_tolan' | 'supervisor_malqa' | 'admin_affairs' | 'accountant' | 'auditor' | 'finance_manager' | 'executive' | 'super_admin' | 'restaurant_operations' | 'data_entry', tx?: any) {
  const database = tx ?? (await getDb());
  if (!database) throw new Error('Database not available');
  await database
    .update(users)
    .set({ role })
    .where(eq(users.id, userId));
}



// ============================================
// Simplified Operational Flags (البلاغات التشغيلية المبسطة)
// ============================================

export async function createSimplifiedOperationalFlag(data: {
  workerId: number;
  groupId?: number;
  flagDate: Date;
  description: string;
  createdBy: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const { operationalFlags } = await import('../../drizzle/schema');

  try {
    const result = await db.insert(operationalFlags).values({
      workerId: data.workerId,
      groupId: data.groupId,
      flagDate: data.flagDate,
      description: data.description,
      status: 'pending',
      createdBy: data.createdBy,
    });

    return (result as any).insertId || 0;
  } catch (error) {
    console.error('[Database] Error creating operational flag:', error);
    throw error;
  }
}

export async function getPendingOperationalFlags(): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const { operationalFlags, workers } = await import('../../drizzle/schema');

  try {
    const flags = await db
      .select({
        id: operationalFlags.id,
        workerId: operationalFlags.workerId,
        groupId: operationalFlags.groupId,
        flagDate: operationalFlags.flagDate,
        description: operationalFlags.description,
        status: operationalFlags.status,
        createdBy: operationalFlags.createdBy,
        createdAt: operationalFlags.createdAt,
        worker: {
          id: workers.id,
          fullName: workers.fullName,
          code: workers.code,
        },
      })
      .from(operationalFlags)
      .leftJoin(workers, eq(operationalFlags.workerId, workers.id))
      .where(eq(operationalFlags.status, 'pending'))
      .orderBy(desc(operationalFlags.createdAt));

    return flags;
  } catch (error) {
    console.error('[Database] Error getting pending operational flags:', error);
    throw error;
  }
}

// Duplicate functions removed - already defined earlier in the file

export async function checkPendingFlagsBeforePayroll(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const { operationalFlags } = await import('../../drizzle/schema');

  try {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(operationalFlags)
      .where(eq(operationalFlags.status, 'pending'));

    return result[0]?.count || 0;
  } catch (error) {
    console.error('[Database] Error checking pending flags:', error);
    throw error;
  }
}


export async function listAllOperationalFlags(): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const { operationalFlags, workers } = await import('../../drizzle/schema');

  try {
    const flags = await db
      .select({
        id: operationalFlags.id,
        workerId: operationalFlags.workerId,
        groupId: operationalFlags.groupId,
        flagDate: operationalFlags.flagDate,
        description: operationalFlags.description,
        status: operationalFlags.status,
        createdBy: operationalFlags.createdBy,
        createdAt: operationalFlags.createdAt,
        worker: {
          id: workers.id,
          fullName: workers.fullName,
          code: workers.code,
        },
      })
      .from(operationalFlags)
      .leftJoin(workers, eq(operationalFlags.workerId, workers.id))
      .orderBy(desc(operationalFlags.createdAt));

    return flags;
  } catch (error) {
    console.error('[Database] Error listing all operational flags:', error);
    throw error;
  }
}


