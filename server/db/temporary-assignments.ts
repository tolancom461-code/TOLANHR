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
import { recalculateWorkerFinanceForPeriod } from './recalculation';

// ============================================
// Temporary Assignments (الانتدابات المؤقتة)
// ============================================

/**
 * Get all temporary assignments with filters
 */
export async function getTemporaryAssignments(filters?: {
  workerId?: number;
  costCenterId?: number;
  status?: string;
  startDate?: string;
  endDate?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions: any[] = [];

  if (filters?.workerId) {
    conditions.push(eq(temporaryAssignments.workerId, filters.workerId));
  }
  if (filters?.costCenterId) {
    conditions.push(
      or(
        eq(temporaryAssignments.fromCostCenterId, filters.costCenterId),
        eq(temporaryAssignments.toCostCenterId, filters.costCenterId)
      )
    );
  }
  if (filters?.status) {
    conditions.push(eq(temporaryAssignments.status, filters.status as any));
  }
  if (filters?.startDate) {
    conditions.push(gte(temporaryAssignments.startDate, filters.startDate.split('T')[0]));
  }
  if (filters?.endDate) {
    conditions.push(lte(temporaryAssignments.endDate, filters.endDate.split('T')[0]));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select({
      id: temporaryAssignments.id,
      workerId: temporaryAssignments.workerId,
      workerName: workers.fullName,
      workerCode: workers.code,
      fromCostCenterId: temporaryAssignments.fromCostCenterId,
      fromCostCenterName: sql<string>`fc.name`,
      toCostCenterId: temporaryAssignments.toCostCenterId,
      toCostCenterName: sql<string>`tc.name`,
      groupName: groups.name,
      startDate: temporaryAssignments.startDate,
      endDate: temporaryAssignments.endDate,
      notes: temporaryAssignments.notes,
      status: temporaryAssignments.status,
      createdBy: temporaryAssignments.createdBy,
      createdByName: users.fullName,
      createdAt: temporaryAssignments.createdAt,
    })
    .from(temporaryAssignments)
    .leftJoin(workers, eq(temporaryAssignments.workerId, workers.id))
    .leftJoin(groups, eq(workers.groupId, groups.id))
    .leftJoin(sql`cost_centers fc`, sql`${temporaryAssignments.fromCostCenterId} = fc.id`)
    .leftJoin(sql`cost_centers tc`, sql`${temporaryAssignments.toCostCenterId} = tc.id`)
    .leftJoin(users, eq(temporaryAssignments.createdBy, users.id))
    .where(whereClause)
    .orderBy(desc(temporaryAssignments.createdAt));

  return results;
}

/**
 * Format date to YYYY-MM-DD for database
 */
function formatDateForDB(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Create a new temporary assignment
 */
export async function createTemporaryAssignment(params: {
  workerId: number;
  toCostCenterId: number;
  toGroupId: number;
  startDate: string;
  endDate: string;
  notes?: string;
  createdBy: number;
}) {
  // Format dates to YYYY-MM-DD
  const formattedStartDate = formatDateForDB(params.startDate);
  const formattedEndDate = formatDateForDB(params.endDate);
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get worker's current group and cost center
  const worker = await db
    .select({
      id: workers.id,
      groupId: workers.groupId,
      costCenterId: groups.costCenterId,
    })
    .from(workers)
    .leftJoin(groups, eq(workers.groupId, groups.id))
    .where(eq(workers.id, params.workerId));

  if (!worker[0]) throw new Error("العامل غير موجود");

  const fromCostCenterId = worker[0].costCenterId;

  if (fromCostCenterId === params.toCostCenterId) {
    throw new Error("لا يمكن انتداب العامل إلى نفس مركز التكلفة الأصلي");
  }

  // Check for overlapping assignments
  const overlapping = await db
    .select()
    .from(temporaryAssignments)
    .where(
      and(
        eq(temporaryAssignments.workerId, params.workerId),
        eq(temporaryAssignments.status, 'active'),
        // Overlap check: existing.start <= new.end AND existing.end >= new.start
        lte(temporaryAssignments.startDate, formattedEndDate),
        gte(temporaryAssignments.endDate, formattedStartDate)
      )
    );

  if (overlapping.length > 0) {
    throw new Error("يوجد انتداب متداخل لنفس العامل في نفس الفترة");
  }

  const fromGroupId = worker[0].groupId;

  const [result] = await db
    .insert(temporaryAssignments)
    .values({
      workerId: params.workerId,
      fromCostCenterId,
      fromGroupId,
      toCostCenterId: params.toCostCenterId,
      toGroupId: params.toGroupId,
      startDate: formattedStartDate,
      endDate: formattedEndDate,
      notes: params.notes || null,
      status: 'active',
      createdBy: params.createdBy,
    } as any);

  const assignmentId = result.insertId;

  // ✅ Automatic recalculation for the assignment period
  try {
    await recalculateWorkerFinanceForPeriod(params.workerId, params.startDate, params.endDate);
    console.log(`[Assignment Created] ✅ Recalculated worker ${params.workerId} for ${params.startDate} → ${params.endDate}`);
  } catch (error: any) {
    console.error(`[Assignment Created] ⚠️ Recalc failed:`, error.message);
  }

  return { id: assignmentId };
}

/**
 * Cancel a temporary assignment
 */
export async function cancelTemporaryAssignment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [existing] = await db
    .select()
    .from(temporaryAssignments)
    .where(eq(temporaryAssignments.id, id));
  if (!existing) throw new Error("الانتداب غير موجود");
  if (existing.status === 'cancelled') throw new Error("الانتداب ملغي مسبقاً");
  
  await db
    .update(temporaryAssignments)
    .set({ status: 'cancelled' })
    .where(eq(temporaryAssignments.id, id));

  // ✅ Automatic recalculation when assignment is cancelled
  try {
    const startDate = existing.startDate.toISOString().split('T')[0];
    const endDate = existing.endDate.toISOString().split('T')[0];
    await recalculateWorkerFinanceForPeriod(existing.workerId, startDate, endDate);
    console.log(`[Assignment Cancelled] ✅ Recalculated worker ${existing.workerId} for ${startDate} → ${endDate}`);
  } catch (error: any) {
    console.error(`[Assignment Cancelled] ⚠️ Recalc failed:`, error.message);
  }

  return { success: true };
}

/**
 * Get active temporary assignments for a worker in a date range
 * Used by payroll calculation
 */
export async function getWorkerAssignmentsInPeriod(
  workerId: number,
  periodStart: string,
  periodEnd: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const assignments = await db
    .select()
    .from(temporaryAssignments)
    .where(
      and(
        eq(temporaryAssignments.workerId, workerId),
        eq(temporaryAssignments.status, 'active'),
        lte(temporaryAssignments.startDate, periodEnd.split('T')[0]),
        gte(temporaryAssignments.endDate, periodStart.split('T')[0])
      )
    );

  return assignments;
}

/**
 * Get all active assignments TO a specific cost center in a date range
 * Used to find workers assigned to this cost center from other groups
 */
export async function getAssignmentsToCostCenter(
  costCenterId: number,
  periodStart: string,
  periodEnd: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const assignments = await db
    .select({
      id: temporaryAssignments.id,
      workerId: temporaryAssignments.workerId,
      workerName: workers.fullName,
      workerCode: workers.code,
      fromCostCenterId: temporaryAssignments.fromCostCenterId,
      toCostCenterId: temporaryAssignments.toCostCenterId,
      startDate: temporaryAssignments.startDate,
      endDate: temporaryAssignments.endDate,
      groupName: groups.name,
      dailyRate: workers.dailyRate,
      groupDailyWage: groups.dailyWage,
    })
    .from(temporaryAssignments)
    .leftJoin(workers, eq(temporaryAssignments.workerId, workers.id))
    .leftJoin(groups, eq(workers.groupId, groups.id))
    .where(
      and(
        eq(temporaryAssignments.toCostCenterId, costCenterId),
        eq(temporaryAssignments.status, 'active'),
        lte(temporaryAssignments.startDate, periodEnd.split('T')[0]),
        gte(temporaryAssignments.endDate, periodStart.split('T')[0])
      )
    );

  return assignments;
}

/**
 * Get assignments FROM a specific cost center in a date range
 * Used to find workers who left this cost center temporarily
 */
export async function getAssignmentsFromCostCenter(
  costCenterId: number,
  periodStart: string,
  periodEnd: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const assignments = await db
    .select({
      id: temporaryAssignments.id,
      workerId: temporaryAssignments.workerId,
      startDate: temporaryAssignments.startDate,
      endDate: temporaryAssignments.endDate,
      toCostCenterId: temporaryAssignments.toCostCenterId,
    })
    .from(temporaryAssignments)
    .where(
      and(
        eq(temporaryAssignments.fromCostCenterId, costCenterId),
        eq(temporaryAssignments.status, 'active'),
        lte(temporaryAssignments.startDate, periodEnd.split('T')[0]),
        gte(temporaryAssignments.endDate, periodStart.split('T')[0])
      )
    );

  return assignments;
}

/**
 * Calculate assignment days overlap with a period
 * Returns the number of days the assignment overlaps with the given period
 */
export function calculateAssignmentDays(
  assignmentStart: string | Date,
  assignmentEnd: string | Date,
  periodStart: string,
  periodEnd: string
): number {
  const aStart = new Date(assignmentStart);
  const aEnd = new Date(assignmentEnd);
  const pStart = new Date(periodStart);
  const pEnd = new Date(periodEnd);

  // Overlap start = max(assignmentStart, periodStart)
  const overlapStart = aStart > pStart ? aStart : pStart;
  // Overlap end = min(assignmentEnd, periodEnd)
  const overlapEnd = aEnd < pEnd ? aEnd : pEnd;

  if (overlapStart > overlapEnd) return 0;

  // Calculate days (inclusive)
  const diffTime = overlapEnd.getTime() - overlapStart.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return diffDays;
}


/**
 * Update a temporary assignment
 */
export async function updateTemporaryAssignment(id: number, params: {
  toCostCenterId?: number;
  toGroupId?: number;
  startDate?: string;
  endDate?: string;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Get current assignment
  const [current] = await db
    .select()
    .from(temporaryAssignments)
    .where(eq(temporaryAssignments.id, id));

  if (!current) throw new Error('الانتداب غير موجود');
  if (current.status !== 'active') throw new Error('لا يمكن تعديل انتداب غير نشط');

  const updateData: any = {};
  if (params.toCostCenterId) updateData.toCostCenterId = params.toCostCenterId;
  if (params.toGroupId) updateData.toGroupId = params.toGroupId;
  if (params.startDate) updateData.startDate = formatDateForDB(params.startDate);
  if (params.endDate) updateData.endDate = formatDateForDB(params.endDate);
  if (params.notes !== undefined) updateData.notes = params.notes;

  await db
    .update(temporaryAssignments)
    .set(updateData)
    .where(eq(temporaryAssignments.id, id));

  // ✅ Automatic recalculation for the affected period
  // Use the wider range (old + new dates) to cover all changes
  try {
    const oldStart = current.startDate.toISOString().split('T')[0];
    const oldEnd = current.endDate.toISOString().split('T')[0];
    const newStart = params.startDate || oldStart;
    const newEnd = params.endDate || oldEnd;
    
    // Calculate the full affected range
    const recalcStart = new Date(oldStart) < new Date(newStart) ? oldStart : newStart;
    const recalcEnd = new Date(oldEnd) > new Date(newEnd) ? oldEnd : newEnd;
    
    await recalculateWorkerFinanceForPeriod(current.workerId, recalcStart, recalcEnd);
    console.log(`[Assignment Updated] ✅ Recalculated worker ${current.workerId} for ${recalcStart} → ${recalcEnd}`);
  } catch (error: any) {
    console.error(`[Assignment Updated] ⚠️ Recalc failed:`, error.message);
  }

  return { success: true, id };
}

/**
 * Delete a temporary assignment permanently
 */
export async function deleteTemporaryAssignment(id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Get current assignment
  const [current] = await db
    .select()
    .from(temporaryAssignments)
    .where(eq(temporaryAssignments.id, id));

  if (!current) throw new Error('الانتداب غير موجود');

  await db
    .delete(temporaryAssignments)
    .where(eq(temporaryAssignments.id, id));

  return { success: true, id };
}


