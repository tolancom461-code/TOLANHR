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
import { createGroup } from './groups';
import { saveWeeklySchedules } from './auto-finance';

// ============================================
// Helper Functions for Testing
// ============================================

// createTestGroup removed - use createGroup with saveWeeklySchedules instead

/**
 * Create a test worker with custom parameters
 */
export async function createTestWorker(data: {
  code: string;
  fullName: string;
  groupId: number;
  dailyRate?: number;
  status: 'active' | 'inactive';
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const result = await db.insert(workers).values({
    code: data.code,
    fullName: data.fullName,
    groupId: data.groupId,
    dailyRate: data.dailyRate?.toString(),
    status: data.status,
  });

  return {
    id: result[0].insertId as number,
    ...data,
  };
}

/**
 * Delete a test worker by ID
 */
export async function deleteTestWorker(workerId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  await db.delete(workers).where(eq(workers.id, workerId));
}

/**
 * Delete a test group by ID
 */
export async function deleteTestGroup(groupId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  await db.delete(groups).where(eq(groups.id, groupId));
}

/**
 * Calculate daily finance from attendance (simplified)
 */
export async function calculateDailyFinance(workerId: number, date: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Get worker
  const worker = await db.select().from(workers).where(eq(workers.id, workerId)).limit(1);
  if (!worker || worker.length === 0) {
    throw new Error(`Worker ${workerId} not found`);
  }

  // Get group
  if (!worker[0].groupId) {
    throw new Error('Worker has no group assigned');
  }
  const group = await db.select().from(groups).where(eq(groups.id, worker[0].groupId!)).limit(1);
  if (!group || group.length === 0) {
    throw new Error(`Group ${worker[0].groupId} not found`);
  }

  // Get attendance events for the date
  const events = await db
    .select()
    .from(attendanceEvents)
    .where(
      and(
        eq(attendanceEvents.workerId, workerId),
        sql`DATE(${attendanceEvents.eventTime}) = ${date}`
      )
    );

  // Simple calculation: if attended, get daily wage
  const dailyWage = typeof group[0].dailyWage === 'string' ? parseFloat(group[0].dailyWage) : (group[0].dailyWage as unknown as number) || 0;
  const baseAmount = events.length > 0 ? dailyWage : 0;
  const deductions = 0;
  const bonuses = 0;

  return {
    baseAmount,
    deductions,
    bonuses,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
  };
}




