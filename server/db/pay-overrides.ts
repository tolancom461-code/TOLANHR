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

// ============================================
// ترحيل عمود "الملاحظات" (idempotent — نفس أسلوب باقي الترحيلات بالمشروع)
// ============================================
export async function runPayOverridesNotesMigration() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    await db.execute(sql`ALTER TABLE pay_overrides ADD COLUMN notes TEXT`);
    console.log('[Migration] ✅ Added notes column to pay_overrides');
  } catch (error: any) {
    console.log('[Migration] ℹ️  notes (pay_overrides): ' + (error.message || 'Already exists or error occurred'));
  }
}

export async function createPayOverride(data: {
  workerId: number;
  overrideDate: string;
  overrideType: 'bonus' | 'deduction' | 'advance' | 'emergency_call';
  amount: number;
  reason?: string;
  notes?: string;
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
    notes: data.notes,
    status: 'pending',
    createdBy: data.createdBy,
  });
  
  return { id: (result as any).insertId, success: true };
}

// ✅ إنشاء استثناء مباشر (معتمد فوراً) لأداة "التعبئة الجماعية بالمجموعة"
// ملاحظة هامة: لا يكتب على worker_daily_finance إطلاقاً (بعكس approveOverride)
// حتى لا يُحتسب المبلغ مرتين عند استدعاء aggregatePayrollData (التي تجمع من
// worker_daily_finance ومن pay_overrides المعتمدة كمصدرين منفصلين)
export async function createPayOverrideDirect(data: {
  workerId: number;
  overrideDate: string;
  overrideType: 'bonus' | 'deduction' | 'advance' | 'emergency_call';
  amount: number;
  reason?: string;
  notes?: string;
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
    notes: data.notes,
    status: 'approved',
    createdBy: data.createdBy,
    approvedBy: data.createdBy,
    approvedAt: new Date(),
  });

  return { id: (result as any).insertId, success: true };
}

// ✅ جلب العمال الذين لديهم سجل حضور فعلي في تاريخ معيّن ضمن مجموعة معيّنة
export async function getWorkersWithAttendanceOnDate(groupId: number, date: string) {
  const db = await getDb();
  if (!db) return [];

  const { attendanceEvents, workers } = await import('../../drizzle/schema');

  const result = await db
    .selectDistinct({
      workerId: workers.id,
      fullName: workers.fullName,
      code: workers.code,
    })
    .from(attendanceEvents)
    .innerJoin(workers, eq(attendanceEvents.workerId, workers.id))
    .where(and(
      eq(workers.groupId, groupId),
      eq(attendanceEvents.workDate, date)
    ));

  return result;
}

// ✅ إعادة حساب "الإضافي/الخصومات" لعامل من مصدرها الحقيقي (pay_overrides المعتمدة +
// worker_daily_finance) وتحديث بند الدفعة المسودة القائمة فوراً إن وُجدت
export async function syncOverrideToDraftBatch(workerId: number, overrideDate: string, groupId?: number) {
  const db = await getDb();
  if (!db) return null;

  const { checkPayrollBatchForDate } = await import('./payroll-locks');
  const { aggregatePayrollData } = await import('./advanced-payroll');
  const { updateBatchItem } = await import('./payroll-batches');

  const batch = await checkPayrollBatchForDate(overrideDate, groupId);
  console.log('[syncOverrideToDraftBatch] workerId=', workerId, 'groupId=', groupId, 'batch found=', batch ? { id: batch.id, status: batch.status, periodStart: batch.periodStart, periodEnd: batch.periodEnd } : null);
  if (!batch || batch.status !== 'draft') return null;

  const [item] = await db
    .select()
    .from(payrollBatchItems)
    .where(and(eq(payrollBatchItems.batchId, batch.id), eq(payrollBatchItems.workerId, workerId)))
    .limit(1);
  console.log('[syncOverrideToDraftBatch] item found=', item ? { id: item.id, currentTotalBonuses: item.totalBonuses } : null);
  if (!item) return null;

  const aggregated = await aggregatePayrollData(workerId, batch.periodStart, batch.periodEnd);
  console.log('[syncOverrideToDraftBatch] aggregated=', aggregated);

  await updateBatchItem({
    itemId: item.id,
    totalBonuses: aggregated.bonuses,
    totalDeductions: aggregated.deductionsTotal,
  });

  return { batchId: batch.id, itemId: item.id };
}

// ============================================
// ✅ أرشيف الاستثناءات (كل السجلات بكل الحالات) + التعديل + الحذف
// ============================================

export async function getOverridesArchive(filters?: { groupId?: number }) {
  const db = await getDb();
  if (!db) return [];

  const { payOverrides, workers, groups } = await import('../../drizzle/schema');

  const rows = await db
    .select({
      id: payOverrides.id,
      workerId: payOverrides.workerId,
      workerName: workers.fullName,
      workerCode: workers.code,
      groupId: workers.groupId,
      groupName: groups.name,
      overrideDate: payOverrides.overrideDate,
      overrideType: payOverrides.overrideType,
      amount: payOverrides.amount,
      reason: payOverrides.reason,
      notes: payOverrides.notes,
      status: payOverrides.status,
      createdAt: payOverrides.createdAt,
      approvedAt: payOverrides.approvedAt,
    })
    .from(payOverrides)
    .innerJoin(workers, eq(payOverrides.workerId, workers.id))
    .leftJoin(groups, eq(workers.groupId, groups.id))
    .orderBy(desc(payOverrides.createdAt));

  if (filters?.groupId) {
    return rows.filter(r => r.groupId === filters.groupId);
  }
  return rows;
}

export async function updateOverride(params: {
  overrideId: number;
  overrideDate: string;
  overrideType: 'bonus' | 'deduction' | 'advance' | 'emergency_call';
  amount: number;
  notes?: string;
  reason?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { checkPayrollBatchForDate } = await import('./payroll-locks');

  const [existing] = await db.select().from(payOverrides).where(eq(payOverrides.id, params.overrideId)).limit(1);
  if (!existing) throw new Error("الاستثناء غير موجود");

  const worker = await (await import('./workers')).getWorkerById(existing.workerId);
  const groupId = worker?.groupId ?? undefined;

  // ✅ منع التعديل إذا كانت الدفعة (بتاريخها القديم) قد تجاوزت مرحلة المسودة
  const oldBatch = await checkPayrollBatchForDate(existing.overrideDate, groupId);
  if (oldBatch && oldBatch.status !== 'draft') {
    throw new Error(`لا يمكن تعديل هذا الاستثناء لأن دفعة الرواتب المرتبطة به (${oldBatch.batchCode}) تجاوزت مرحلة المسودة.`);
  }

  await db.update(payOverrides).set({
    overrideDate: sql`${params.overrideDate}`,
    overrideType: params.overrideType,
    amount: sql`${params.amount}`,
    notes: params.notes,
    reason: params.reason,
    updatedAt: new Date(),
  }).where(eq(payOverrides.id, params.overrideId));

  // ✅ مزامنة كل من الدفعة القديمة (إن تغيّر التاريخ) والدفعة الجديدة
  let syncedOld = null;
  let syncedNew = null;
  if (oldBatch && oldBatch.status === 'draft') {
    syncedOld = await syncOverrideToDraftBatch(existing.workerId, existing.overrideDate, groupId);
  }
  if (params.overrideDate !== existing.overrideDate) {
    syncedNew = await syncOverrideToDraftBatch(existing.workerId, params.overrideDate, groupId);
  } else {
    syncedNew = syncedOld;
  }

  return { success: true, syncedOld, syncedNew };
}

export async function deleteOverride(overrideId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { checkPayrollBatchForDate } = await import('./payroll-locks');

  const [existing] = await db.select().from(payOverrides).where(eq(payOverrides.id, overrideId)).limit(1);
  if (!existing) throw new Error("الاستثناء غير موجود");

  const worker = await (await import('./workers')).getWorkerById(existing.workerId);
  const groupId = worker?.groupId ?? undefined;

  // ✅ منع الحذف إذا كانت الدفعة تجاوزت مرحلة المسودة
  const batch = await checkPayrollBatchForDate(existing.overrideDate, groupId);
  if (batch && batch.status !== 'draft') {
    throw new Error(`لا يمكن حذف هذا الاستثناء لأن دفعة الرواتب المرتبطة به (${batch.batchCode}) تجاوزت مرحلة المسودة.`);
  }

  await db.delete(payOverrides).where(eq(payOverrides.id, overrideId));

  // ✅ إعادة حساب الإضافي في المسودة (إن وُجدت) بعد الحذف — سينقص المبلغ تلقائياً
  let synced = null;
  if (batch && batch.status === 'draft') {
    synced = await syncOverrideToDraftBatch(existing.workerId, existing.overrideDate, groupId);
  }

  return { success: true, synced };
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

