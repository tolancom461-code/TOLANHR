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
import { calculateDailyFinanceFromAttendance, processAttendanceToFinance } from './daily-finance';
import { createTemporaryAssignment } from './temporary-assignments';

// ============================================
// إضافة / تعديل بصمات يدوية من داخل مسودة العمال
// ============================================

export async function addManualAttendanceForBatch(params: {
  workerId: number;
  workDate: string;
  eventType: 'check_in' | 'check_out';
  eventTime: string;
  addedBy: number;
  note?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { attendanceEvents, workers } = await import('../../drizzle/schema');

  const [worker] = await db.select().from(workers).where(eq(workers.id, params.workerId)).limit(1);
  if (!worker) throw new Error("العامل غير موجود");

  const eventTime = new Date(params.eventTime);

  const result = await db.insert(attendanceEvents).values({
    workerId: params.workerId,
    eventType: params.eventType,
    eventTime,
    workDate: params.workDate,
    method: 'manual_batch',
    verifiedBy: params.addedBy,
    note: params.note || 'تمت الإضافة يدوياً من دفعة العمال',
    isAutomatic: false,
  });

  try {
    await processAttendanceToFinance(params.workerId, params.workDate);
  } catch (error) {
    console.error('Error recalculating finance after manual punch:', error);
  }

  return { success: true, eventId: result[0].insertId };
}

export async function updateAttendanceEventForBatch(params: {
  eventId: number;
  newTime: string;
  updatedBy: number;
  note?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { attendanceEvents } = await import('../../drizzle/schema');

  const [original] = await db.select().from(attendanceEvents).where(eq(attendanceEvents.id, params.eventId)).limit(1);
  if (!original) throw new Error("سجل الحضور غير موجود");

  // ✅ أي تعديل يدوي على الوقت يغيّر طريقة التسجيل إلى "يدوي" (فقط إذا تغيّر الوقت فعلاً)
  const originalTime = new Date(original.eventTime).getTime();
  const updatedTime = new Date(params.newTime).getTime();

  await db.update(attendanceEvents).set({
    eventTime: new Date(params.newTime),
    note: params.note || 'تم التعديل يدوياً من دفعة العمال',
    verifiedBy: params.updatedBy,
    ...(originalTime !== updatedTime ? { method: 'manual' } : {}),
  }).where(eq(attendanceEvents.id, params.eventId));

  const workDate = original.workDate || getAdministrativeWorkDate(new Date(original.eventTime));
  try {
    await processAttendanceToFinance(original.workerId, workDate);
  } catch (error) {
    console.error('Error recalculating finance after update:', error);
  }

  return { success: true };
}

export async function updatePayrollItemNote(itemId: number, note: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { payrollBatchItems } = await import('../../drizzle/schema');

  await db.update(payrollBatchItems).set({ notes: note }).where(eq(payrollBatchItems.id, itemId));

  return { success: true };
}


// ============================================
// جلب العمال الغائبين عن الدفعة في تاريخ معين
// ============================================

export async function getAbsentWorkersForBatch(
  groupId: number,
  workDate: string,
  batchId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { workers, attendanceEvents, payrollBatchItems } = await import('../../drizzle/schema');

  // كل عمال المجموعة
  const allWorkers = await db
    .select({ id: workers.id, fullName: workers.fullName, code: workers.code })
    .from(workers)
    .where(eq(workers.groupId, groupId))
    .orderBy(workers.fullName);

  // العمال الذين لديهم بصمة في هذا التاريخ
  const presentWorkerIds = await db
    .select({ workerId: attendanceEvents.workerId })
    .from(attendanceEvents)
    .where(eq(attendanceEvents.workDate, sql`${workDate}`));

  const presentIds = new Set(presentWorkerIds.map((r: any) => r.workerId));

  // العمال الموجودون أصلاً في الدفعة
  const batchWorkerIds = await db
    .select({ workerId: payrollBatchItems.workerId })
    .from(payrollBatchItems)
    .where(eq(payrollBatchItems.batchId, batchId));

  const batchIds = new Set(batchWorkerIds.map((r: any) => r.workerId));

  // العمال الغائبون: ليس لهم بصمة في هذا التاريخ وليسوا في الدفعة
  const absentWorkers = allWorkers.filter(
    (w: any) => !presentIds.has(w.id) && !batchIds.has(w.id)
  );

  return absentWorkers;
}


// ============================================
// إضافة عامل جديد للدفعة مع بصماته
// ============================================

export async function addWorkerToBatch(params: {
  batchId: number;
  workerId: number;
  workDate: string;
  checkInTime: string;
  checkOutTime: string;
  addedBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { attendanceEvents, payrollBatchItems, payrollBatches, workers } = await import('../../drizzle/schema');

  const [batch] = await db.select().from(payrollBatches).where(eq(payrollBatches.id, params.batchId)).limit(1);
  if (!batch) throw new Error("الدفعة غير موجودة");
  if (batch.status !== 'draft') throw new Error("لا يمكن التعديل إلا في مسودة الدفعة");

  const [worker] = await db.select().from(workers).where(eq(workers.id, params.workerId)).limit(1);
  if (!worker) throw new Error("العامل غير موجود");

  // إضافة بصمة الحضور
  await db.insert(attendanceEvents).values({
    workerId: params.workerId,
    eventType: 'check_in',
    eventTime: new Date(params.checkInTime),
    workDate: params.workDate,
    method: 'manual_batch',
    verifiedBy: params.addedBy,
    note: 'تمت الإضافة يدوياً من دفعة العمال',
    isAutomatic: false,
  });

  // إضافة بصمة الانصراف
  await db.insert(attendanceEvents).values({
    workerId: params.workerId,
    eventType: 'check_out',
    eventTime: new Date(params.checkOutTime),
    workDate: params.workDate,
    method: 'manual_batch',
    verifiedBy: params.addedBy,
    note: 'تمت الإضافة يدوياً من دفعة العمال',
    isAutomatic: false,
  });

  // حساب المالية
  await processAttendanceToFinance(params.workerId, params.workDate);
  const financeData = await calculateDailyFinanceFromAttendance(params.workerId, params.workDate);

  // إضافة العامل لجدول الدفعة
  await db.insert(payrollBatchItems).values({
    batchId: params.batchId,
    workerId: params.workerId,
    groupId: worker.groupId || null,
    daysWorked: 1,
    baseAmount: String(financeData.baseAmount || 0),
    totalDeductions: String(financeData.deductions || 0),
    totalBonuses: String(financeData.bonuses || 0),
    netAmount: String((financeData.baseAmount || 0) - (financeData.deductions || 0) + (financeData.bonuses || 0)),
    notes: null,
  } as any);

  // تحديث إجمالي الدفعة
  const allItems = await db
    .select()
    .from(payrollBatchItems)
    .where(eq(payrollBatchItems.batchId, params.batchId));

  const totalAmount = allItems.reduce((sum: number, i: any) => sum + parseFloat(i.baseAmount || '0'), 0);
  const totalDeductions = allItems.reduce((sum: number, i: any) => sum + parseFloat(i.totalDeductions || '0'), 0);
  const totalBonuses = allItems.reduce((sum: number, i: any) => sum + parseFloat(i.totalBonuses || '0'), 0);

  await db.update(payrollBatches).set({
    totalWorkers: allItems.length,
    totalAmount: totalAmount.toFixed(2) as any,
    totalDeductions: totalDeductions.toFixed(2) as any,
    totalBonuses: totalBonuses.toFixed(2) as any,
  }).where(eq(payrollBatches.id, params.batchId));

  return { success: true, workerName: worker.fullName };
}


// ============================================
// إضافة عامل من مركز/مجموعة أخرى (نقل ليوم واحد عبر انتداب مؤقت)
// ============================================

/**
 * جلب العمال "الحاضرين فعلياً" في مجموعة معينة بتاريخ معين،
 * مع استبعاد أي عامل موجود بالفعل ضمن دفعة رواتب أخرى (غير مرفوضة) تغطي نفس التاريخ.
 * تُستخدم في نافذة "إضافة عامل من مركز آخر" داخل تفاصيل الدفعة.
 */
export async function getPresentWorkersForGroupOnDate(
  groupId: number,
  workDate: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { workers, attendanceEvents, payrollBatchItems, payrollBatches } = await import('../../drizzle/schema');

  // عمال هذه المجموعة حالياً
  const groupWorkers = await db
    .select({ id: workers.id, fullName: workers.fullName, code: workers.code })
    .from(workers)
    .where(eq(workers.groupId, groupId))
    .orderBy(workers.fullName);

  if (groupWorkers.length === 0) return [];

  const groupWorkerIds = groupWorkers.map(w => w.id);

  // العمال الذين لديهم بصمة حضور فعلية في هذا التاريخ (حاضرون)
  const presentEvents = await db
    .select({ workerId: attendanceEvents.workerId })
    .from(attendanceEvents)
    .where(
      and(
        inArray(attendanceEvents.workerId, groupWorkerIds),
        eq(attendanceEvents.workDate, sql`${workDate}`),
        eq(attendanceEvents.eventType, 'check_in')
      )
    );
  const presentWorkerIds = new Set(presentEvents.map(e => e.workerId));

  if (presentWorkerIds.size === 0) return [];

  // استبعاد من هم بالفعل ضمن دفعة أخرى (غير مرفوضة) تغطي هذا التاريخ
  const conflictingItems = await db
    .select({ workerId: payrollBatchItems.workerId })
    .from(payrollBatchItems)
    .innerJoin(payrollBatches, eq(payrollBatchItems.batchId, payrollBatches.id))
    .where(
      and(
        inArray(payrollBatchItems.workerId, Array.from(presentWorkerIds)),
        ne(payrollBatches.status, 'rejected_final'),
        lte(payrollBatches.periodStart, workDate),
        gte(payrollBatches.periodEnd, workDate)
      )
    );
  const alreadyInBatch = new Set(conflictingItems.map(i => i.workerId));

  return groupWorkers.filter(
    w => presentWorkerIds.has(w.id) && !alreadyInBatch.has(w.id)
  );
}

/**
 * إضافة عامل من مركز/مجموعة أخرى إلى دفعة موجودة، ليوم واحد فقط.
 * تُنشئ سجل "انتداب مؤقت" رسمي (يظهر أيضاً في صفحة الانتدابات المؤقتة)
 * ثم تضيف العامل كبند ضمن الدفعة الهدف تحت المجموعة المختارة.
 * أجر ذلك اليوم في مركزه الأصلي يُستبعد تلقائياً لاحقاً عبر منطق effective_group_id الموجود.
 */
export async function addWorkerFromOtherGroup(params: {
  batchId: number;
  targetGroupId: number;
  workerId: number;
  workDate: string;
  addedBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { payrollBatches, payrollBatchItems, groups, workers } = await import('../../drizzle/schema');

  // 1. الدفعة الهدف يجب أن تكون مسودة
  const [batch] = await db.select().from(payrollBatches).where(eq(payrollBatches.id, params.batchId)).limit(1);
  if (!batch) throw new Error("الدفعة غير موجودة");
  if (batch.status !== 'draft') throw new Error("لا يمكن التعديل إلا في مسودة الدفعة");

  // 2. العامل موجود
  const [worker] = await db.select().from(workers).where(eq(workers.id, params.workerId)).limit(1);
  if (!worker) throw new Error("العامل غير موجود");

  // 3. المجموعة الهدف موجودة ومرتبطة بمركز تكلفة
  const [targetGroup] = await db.select().from(groups).where(eq(groups.id, params.targetGroupId)).limit(1);
  if (!targetGroup) throw new Error("المجموعة الهدف غير موجودة");
  if (!targetGroup.costCenterId) throw new Error("المجموعة الهدف غير مرتبطة بمركز تكلفة");

  // 4. فحص التعارض: هل العامل موجود بالفعل ضمن دفعة أخرى (غير مرفوضة) تغطي هذا التاريخ؟
  const conflictingBatches = await db
    .select({
      batchCode: payrollBatches.batchCode,
      status: payrollBatches.status,
    })
    .from(payrollBatchItems)
    .innerJoin(payrollBatches, eq(payrollBatchItems.batchId, payrollBatches.id))
    .where(
      and(
        eq(payrollBatchItems.workerId, params.workerId),
        ne(payrollBatches.status, 'rejected_final'),
        lte(payrollBatches.periodStart, params.workDate),
        gte(payrollBatches.periodEnd, params.workDate)
      )
    );

  if (conflictingBatches.length > 0) {
    const statusMap: Record<string, string> = {
      draft: 'مسودة',
      under_accountant_review: 'قيد مراجعة المحاسب',
      returned_from_accountant: 'معادة من المحاسب',
      under_financial_review: 'قيد المراجعة المالية',
      returned_from_financial_review: 'معادة من المراجعة المالية',
      under_accounts_manager_review: 'قيد مراجعة المدير المالي',
      approved: 'معتمدة',
      paid: 'مدفوعة',
    };
    const c = conflictingBatches[0];
    throw new Error(
      `لا يمكن نقل العامل. العامل موجود بالفعل ضمن دفعة أخرى (${c.batchCode}) تغطي نفس اليوم.\n\nالحالة: ${statusMap[c.status || ''] || c.status}\n\nيرجى إزالته من تلك الدفعة أولاً إذا رغبت بنقله.`
    );
  }

  // 5. إنشاء سجل انتداب مؤقت رسمي ليوم واحد فقط (يتحقق أيضاً من عدم كون المركزين متطابقين، ومن عدم وجود تداخل مع انتداب آخر)
  await createTemporaryAssignment({
    workerId: params.workerId,
    toCostCenterId: targetGroup.costCenterId,
    toGroupId: params.targetGroupId,
    startDate: params.workDate,
    endDate: params.workDate,
    notes: `تمت الإضافة تلقائياً عبر دفعة الرواتب رقم ${batch.batchCode}`,
    createdBy: params.addedBy,
  });

  // 6. جلب البيانات المالية المحدثة لليوم (بعد إعادة الحساب التي أجراها createTemporaryAssignment)
  const financeData = await calculateDailyFinanceFromAttendance(params.workerId, params.workDate);

  if (!financeData.baseAmount || financeData.baseAmount <= 0) {
    // إلغاء الانتداب الذي أُنشئ للتو لأنه لا فائدة منه بدون بيانات مالية
    await db
      .update(temporaryAssignments)
      .set({ status: 'cancelled' })
      .where(
        and(
          eq(temporaryAssignments.workerId, params.workerId),
          eq(temporaryAssignments.startDate, params.workDate),
          eq(temporaryAssignments.endDate, params.workDate),
          eq(temporaryAssignments.toGroupId, params.targetGroupId)
        )
      );
    throw new Error("لا يوجد بصمة حضور فعلية محسوبة لهذا العامل في هذا التاريخ");
  }

  // 7. إضافة العامل كبند ضمن الدفعة الهدف تحت المجموعة المختارة
  await db.insert(payrollBatchItems).values({
    batchId: params.batchId,
    workerId: params.workerId,
    groupId: params.targetGroupId,
    daysWorked: 1,
    baseAmount: String(financeData.baseAmount || 0),
    totalDeductions: String(financeData.deductions || 0),
    totalBonuses: String(financeData.bonuses || 0),
    netAmount: String((financeData.baseAmount || 0) - (financeData.deductions || 0) + (financeData.bonuses || 0)),
    notes: 'منقول من مركز/مجموعة أخرى ليوم واحد (انتداب مؤقت)',
  } as any);

  // 8. تحديث إجمالي الدفعة
  const allItems = await db
    .select()
    .from(payrollBatchItems)
    .where(eq(payrollBatchItems.batchId, params.batchId));

  const totalAmount = allItems.reduce((sum: number, i: any) => sum + parseFloat(i.baseAmount || '0'), 0);
  const totalDeductions = allItems.reduce((sum: number, i: any) => sum + parseFloat(i.totalDeductions || '0'), 0);
  const totalBonuses = allItems.reduce((sum: number, i: any) => sum + parseFloat(i.totalBonuses || '0'), 0);

  await db.update(payrollBatches).set({
    totalWorkers: allItems.length,
    totalAmount: totalAmount.toFixed(2) as any,
    totalDeductions: totalDeductions.toFixed(2) as any,
    totalBonuses: totalBonuses.toFixed(2) as any,
  }).where(eq(payrollBatches.id, params.batchId));

  return { success: true, workerName: worker.fullName };
}

