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
// Pay Overrides Functions
// ============================================

export async function createPayOverride(data: {
  workerId: number;
  overrideDate: string;
  overrideType: 'bonus' | 'deduction' | 'advance' | 'emergency_call';
  amount: number;
  reason?: string;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { payOverrides } = await import('../../drizzle/schema');
  
  const result = await db.insert(payOverrides).values({
    workerId: data.workerId,
    overrideDate: sql`${data.overrideDate}`,
    overrideType: data.overrideType,
    amount: sql`${data.amount}`,
    reason: data.reason,
    status: 'pending',
    createdBy: data.createdBy,
  });
  
  return { id: (result as any).insertId, success: true };
}

export async function getPendingOverrides(groupId?: number) {
  const db = await getDb();
  if (!db) return [];

  const { payOverrides, workers } = await import('../../drizzle/schema');
  
  let query = db
    .select({
      id: payOverrides.id,
      workerId: payOverrides.workerId,
      workerName: workers.fullName,
      workerCode: workers.code,
      groupId: workers.groupId,
      overrideDate: payOverrides.overrideDate,
      overrideType: payOverrides.overrideType,
      amount: payOverrides.amount,
      reason: payOverrides.reason,
      status: payOverrides.status,
      createdAt: payOverrides.createdAt,
    })
    .from(payOverrides)
    .innerJoin(workers, eq(payOverrides.workerId, workers.id))
    .where(eq(payOverrides.status, 'pending'))
    .orderBy(desc(payOverrides.createdAt));
  
  const results = await query;
  
  if (groupId) {
    return results.filter(r => r.groupId === groupId);
  }
  
  return results;
}

export async function approveOverride(overrideId: number, approvedBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { payOverrides, workerDailyFinance } = await import('../../drizzle/schema');
  
  // Get override
  const [override] = await db.select().from(payOverrides).where(eq(payOverrides.id, overrideId)).limit(1);
  if (!override) throw new Error("الاستثناء غير موجود");
  if (override.status !== 'pending') throw new Error("الاستثناء تم معالجته مسبقاً");
  
  // Update override status
  await db.update(payOverrides).set({
    status: 'approved',
    approvedBy,
    approvedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(payOverrides.id, overrideId));
  
  // Apply to daily finance
  const workDate = override.overrideDate;
  const amount = parseFloat(override.amount?.toString() || '0');
  
  // Get or create daily finance record
  const [existing] = await db
    .select()
    .from(workerDailyFinance)
    .where(and(
      eq(workerDailyFinance.workerId, override.workerId),
      eq(workerDailyFinance.workDate, workDate)
    ))
    .limit(1);
  
  if (existing) {
    let newDeductions = parseFloat(existing.deductions?.toString() || '0');
    let newBonuses = parseFloat(existing.bonuses?.toString() || '0');
    
    if (override.overrideType === 'deduction' || override.overrideType === 'advance') {
      newDeductions += amount;
    } else {
      newBonuses += amount;
    }
    
    const baseAmount = parseFloat(existing.baseAmount?.toString() || '0');
    const netAmount = baseAmount - newDeductions + newBonuses;
    
    await db.update(workerDailyFinance).set({
      deductions: sql`${newDeductions}`,
      bonuses: sql`${newBonuses}`,
      netAmount: sql`${netAmount}`,
      updatedAt: new Date(),
    }).where(eq(workerDailyFinance.id, existing.id));
  } else {
    // Create new record
    const deductions = (override.overrideType === 'deduction' || override.overrideType === 'advance') ? amount : 0;
    const bonuses = (override.overrideType === 'bonus' || override.overrideType === 'emergency_call') ? amount : 0;
    
    await db.insert(workerDailyFinance).values({
      workerId: override.workerId,
      workDate: workDate,
      baseAmount: sql`0`,
      deductions: sql`${deductions}`,
      bonuses: sql`${bonuses}`,
      netAmount: sql`${bonuses - deductions}`,
    });
  }
  
  return { success: true };
}

export async function rejectOverride(overrideId: number, approvedBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { payOverrides } = await import('../../drizzle/schema');
  
  await db.update(payOverrides).set({
    status: 'rejected',
    approvedBy,
    approvedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(payOverrides.id, overrideId));
  
  return { success: true };
}

