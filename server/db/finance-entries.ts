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
import { checkPayrollBatchForDate } from './payroll-locks';

// ============================================
// Finance Entry Functions
// ============================================

export async function addFinanceEntry(
  workerId: number,
  workDate: string,
  entryType: 'deduction' | 'bonus' | 'fine' | 'addition',
  amount: number,
  reason?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Check if payroll batch exists for this date
  // ✅ القفل مرتبط بالتاريخ + مجموعة العامل: دفعة مجموعة أخرى لا تمنع الإضافة
  const { workers: workersTable } = await import('../../drizzle/schema');
  const [feWorker] = await db.select().from(workersTable).where(eq(workersTable.id, workerId)).limit(1);
  const batch = await checkPayrollBatchForDate(workDate, feWorker?.groupId ?? undefined);
  if (batch) {
    throw new Error(`لا يمكن إضافة خصومات أو إضافات بعد إنشاء دفعة العمال لمجموعة هذا العامل. يجب حذف المسودة أولاً (دفعة رقم: ${batch.batchCode})`);
  }

  const { workerDailyFinance } = await import('../../drizzle/schema');
  
  // Get or create daily finance record
  const [existing] = await db
    .select()
    .from(workerDailyFinance)
    .where(and(
      eq(workerDailyFinance.workerId, workerId),
      eq(workerDailyFinance.workDate, sql`${workDate}`)
    ))
    .limit(1);
  
  if (existing) {
    let newDeductions = parseFloat(existing.deductions?.toString() || '0');
    let newBonuses = parseFloat(existing.bonuses?.toString() || '0');
    let notes = existing.notes || '';
    
    if (entryType === 'deduction' || entryType === 'fine') {
      newDeductions += amount;
    } else {
      newBonuses += amount;
    }
    
    if (reason) {
      notes += (notes ? '\n' : '') + `${entryType}: ${amount} - ${reason}`;
    }
    
    const baseAmount = parseFloat(existing.baseAmount?.toString() || '0');
    const netAmount = baseAmount - newDeductions + newBonuses;
    
    await db.update(workerDailyFinance).set({
      deductions: sql`${newDeductions}`,
      bonuses: sql`${newBonuses}`,
      netAmount: sql`${netAmount}`,
      notes,
      updatedAt: new Date(),
    }).where(eq(workerDailyFinance.id, existing.id));
    
    return { id: existing.id, netAmount };
  } else {
    const deductions = (entryType === 'deduction' || entryType === 'fine') ? amount : 0;
    const bonuses = (entryType === 'bonus' || entryType === 'addition') ? amount : 0;
    const netAmount = bonuses - deductions;
    
    const result = await db.insert(workerDailyFinance).values({
      workerId,
      workDate: sql`${workDate}`,
      baseAmount: sql`0`,
      deductions: sql`${deductions}`,
      bonuses: sql`${bonuses}`,
      netAmount: sql`${netAmount}`,
      notes: reason ? `${entryType}: ${amount} - ${reason}` : undefined,
    });
    
    return { id: (result as any).insertId, netAmount };
  }
}

export async function getDailyFinanceRecords(workerId: number, startDate: string, endDate: string) {
  const db = await getDb();
  if (!db) return [];

  const { workerDailyFinance } = await import('../../drizzle/schema');
  
  return await db
    .select()
    .from(workerDailyFinance)
    .where(and(
      eq(workerDailyFinance.workerId, workerId),
      gte(workerDailyFinance.workDate, sql`${startDate}`),
      lte(workerDailyFinance.workDate, sql`${endDate}`)
    ))
    .orderBy(workerDailyFinance.workDate);
}

// Old payroll batch functions removed - see new implementation below

