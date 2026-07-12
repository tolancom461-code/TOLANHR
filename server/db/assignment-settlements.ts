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
import { getDb, safeParseDecimal, safeParseInt } from './connection';

// ============================================
// Assignment Settlements (تسويات الانتدابات)
// ============================================

/**
 * فحص الانتدابات النشطة للعمال في دفعة معينة
 * يبحث عن أي عامل في الدفعة لديه انتداب نشط خلال فترة الدفعة
 * ويعيد قائمة بالتسويات المطلوبة
 */
export async function checkBatchAssignments(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 1. جلب بيانات الدفعة
  const [batch] = await db
    .select()
    .from(payrollBatches)
    .where(eq(payrollBatches.id, batchId))
    .limit(1);

  if (!batch) throw new Error("الدفعة غير موجودة");

  const periodStart = typeof batch.periodStart === 'string' ? batch.periodStart : new Date(batch.periodStart).toLocaleDateString('en-CA');
  const periodEnd = typeof batch.periodEnd === 'string' ? batch.periodEnd : new Date(batch.periodEnd).toLocaleDateString('en-CA');
  const batchCostCenterId = batch.costCenterId;

  // 2. جلب عمال الدفعة
  const batchItems = await db
    .select({
      itemId: payrollBatchItems.id,
      workerId: payrollBatchItems.workerId,
      groupId: payrollBatchItems.groupId,
      baseAmount: payrollBatchItems.baseAmount,
      netAmount: payrollBatchItems.netAmount,
      daysWorked: payrollBatchItems.daysWorked,
    })
    .from(payrollBatchItems)
    .where(eq(payrollBatchItems.batchId, batchId));

  const workerIds = batchItems.map(item => item.workerId);
  if (workerIds.length === 0) return { hasAssignments: false, assignments: [], batch };

  // 3. البحث عن انتدابات نشطة لهؤلاء العمال خلال فترة الدفعة
  const activeAssignments = await db
    .select({
      id: temporaryAssignments.id,
      workerId: temporaryAssignments.workerId,
      fromCostCenterId: temporaryAssignments.fromCostCenterId,
      fromGroupId: temporaryAssignments.fromGroupId,
      toCostCenterId: temporaryAssignments.toCostCenterId,
      toGroupId: temporaryAssignments.toGroupId,
      startDate: temporaryAssignments.startDate,
      endDate: temporaryAssignments.endDate,
      notes: temporaryAssignments.notes,
    })
    .from(temporaryAssignments)
    .where(
      and(
        inArray(temporaryAssignments.workerId, workerIds),
        eq(temporaryAssignments.status, 'active'),
        lte(temporaryAssignments.startDate, periodEnd.split('T')[0]),
        gte(temporaryAssignments.endDate, periodStart.split('T')[0])
      )
    );

  if (activeAssignments.length === 0) return { hasAssignments: false, assignments: [], batch };

  // 4. التحقق من التسويات المطبقة مسبقاً لهذه الدفعة
  const existingSettlements = await db
    .select()
    .from(assignmentSettlements)
    .where(
      and(
        eq(assignmentSettlements.fromBatchId, batchId),
        eq(assignmentSettlements.status, 'applied')
      )
    );

  const settledAssignmentIds = new Set(existingSettlements.map(s => s.assignmentId));

  // 5. بناء قائمة التسويات المطلوبة
  const pendingSettlements: Array<{
    assignmentId: number;
    workerId: number;
    workerName: string;
    fromCostCenterId: number | null;
    fromCostCenterName: string;
    toCostCenterId: number;
    toCostCenterName: string;
    toGroupId: number;
    toGroupName: string;
    startDate: string;
    endDate: string;
    days: number;
    dailyAmount: number;
    totalAmount: number;
    alreadySettled: boolean;
  }> = [];

  // جلب أسماء مراكز التكلفة والمجموعات
  const allCostCenters = await db.select().from(costCenters);
  const allGroups = await db.select().from(groups);
  const allWorkers = await db.select({ id: workers.id, fullName: workers.fullName }).from(workers).where(inArray(workers.id, workerIds));

  const ccMap = new Map(allCostCenters.map(cc => [cc.id, cc.name]));
  const groupMap = new Map(allGroups.map(g => [g.id, g.name]));
  const workerMap = new Map(allWorkers.map(w => [w.id, w.fullName]));

  for (const assignment of activeAssignments) {
    const batchItem = batchItems.find(item => item.workerId === assignment.workerId);
    if (!batchItem) continue;

    // حساب عدد أيام الانتداب المتداخلة مع فترة الدفعة
    const assignStart = typeof assignment.startDate === 'string' ? assignment.startDate : new Date(assignment.startDate).toLocaleDateString('en-CA');
    const assignEnd = typeof assignment.endDate === 'string' ? assignment.endDate : new Date(assignment.endDate).toLocaleDateString('en-CA');
    
    const overlapStart = assignStart > periodStart ? assignStart : periodStart;
    const overlapEnd = assignEnd < periodEnd ? assignEnd : periodEnd;
    
    const startMs = new Date(overlapStart + 'T00:00:00').getTime();
    const endMs = new Date(overlapEnd + 'T00:00:00').getTime();
    const days = Math.max(1, Math.floor((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1);

    // حساب المبلغ اليومي من بيانات الدفعة
    const totalDaysWorked = safeParseInt(batchItem.daysWorked) || 1;
    const dailyAmount = safeParseDecimal(batchItem.netAmount) / totalDaysWorked;
    const totalAmount = Math.round(dailyAmount * days * 100) / 100;

    pendingSettlements.push({
      assignmentId: assignment.id,
      workerId: assignment.workerId,
      workerName: workerMap.get(assignment.workerId) || `عامل #${assignment.workerId}`,
      fromCostCenterId: assignment.fromCostCenterId,
      fromCostCenterName: ccMap.get(assignment.fromCostCenterId!) || 'غير محدد',
      toCostCenterId: assignment.toCostCenterId,
      toCostCenterName: ccMap.get(assignment.toCostCenterId) || 'غير محدد',
      toGroupId: assignment.toGroupId,
      toGroupName: groupMap.get(assignment.toGroupId) || 'غير محدد',
      startDate: assignStart,
      endDate: assignEnd,
      days,
      dailyAmount: Math.round(dailyAmount * 100) / 100,
      totalAmount,
      alreadySettled: settledAssignmentIds.has(assignment.id),
    });
  }

  return {
    hasAssignments: pendingSettlements.length > 0,
    assignments: pendingSettlements,
    batch,
  };
}

/**
 * تطبيق تسويات الانتدابات على دفعة معينة
 * 1. يخصم مبلغ العامل المنتدب من دفعة المركز الأصلي
 * 2. يضيف العامل بالمبلغ في دفعة المركز المنتدب إليه (إذا وُجدت) أو ينشئ بند تسوية
 * 3. يحفظ قيد التسوية في جدول assignment_settlements
 */
export async function applyAssignmentSettlements(params: {
  batchId: number;
  assignmentIds: number[];
  appliedBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { batchId, assignmentIds, appliedBy } = params;

  // فحص الانتدابات المطلوبة
  const checkResult = await checkBatchAssignments(batchId);
  if (!checkResult.hasAssignments) {
    return { success: true, message: "لا توجد انتدابات تحتاج تسوية", settlements: [] };
  }

  const settlementsToApply = checkResult.assignments.filter(
    a => assignmentIds.includes(a.assignmentId) && !a.alreadySettled
  );

  if (settlementsToApply.length === 0) {
    return { success: true, message: "جميع التسويات المحددة مطبقة مسبقاً", settlements: [] };
  }

  const appliedSettlements: any[] = [];

  for (const settlement of settlementsToApply) {
    // 1. خصم المبلغ من بند العامل في الدفعة الأصلية
    const [batchItem] = await db
      .select()
      .from(payrollBatchItems)
      .where(
        and(
          eq(payrollBatchItems.batchId, batchId),
          eq(payrollBatchItems.workerId, settlement.workerId)
        )
      )
      .limit(1);

    if (!batchItem) continue;

    const currentNet = safeParseDecimal(batchItem.netAmount);
    const currentBase = safeParseDecimal(batchItem.baseAmount);
    const newNet = Math.max(0, currentNet - settlement.totalAmount);
    const newBase = Math.max(0, currentBase - settlement.totalAmount);
    const currentDays = safeParseInt(batchItem.daysWorked);
    const newDays = Math.max(0, currentDays - settlement.days);

    // تحديث بند العامل في الدفعة الأصلية (خصم مبلغ أيام الانتداب)
    await db.update(payrollBatchItems)
      .set({
        netAmount: String(newNet),
        baseAmount: String(newBase),
        daysWorked: newDays,
        notes: `${batchItem.notes || ''} | تسوية انتداب: -${settlement.totalAmount} ر.س (${settlement.days} يوم → ${settlement.toCostCenterName})`.trim(),
      })
      .where(eq(payrollBatchItems.id, batchItem.id));

    // 2. البحث عن دفعة المركز المنتدب إليه لنفس الفترة
    const periodStart = typeof checkResult.batch.periodStart === 'string' ? checkResult.batch.periodStart : new Date(checkResult.batch.periodStart).toLocaleDateString('en-CA');
    const periodEnd = typeof checkResult.batch.periodEnd === 'string' ? checkResult.batch.periodEnd : new Date(checkResult.batch.periodEnd).toLocaleDateString('en-CA');

    const [targetBatch] = await db
      .select()
      .from(payrollBatches)
      .where(
        and(
          eq(payrollBatches.costCenterId, settlement.toCostCenterId),
          eq(payrollBatches.periodStart, new Date(periodStart + 'T00:00:00')),
          eq(payrollBatches.periodEnd, new Date(periodEnd + 'T00:00:00')),
          eq(payrollBatches.status, 'draft')
        )
      )
      .limit(1);

    let toBatchId: number | null = null;

    if (targetBatch) {
      toBatchId = targetBatch.id;

      // التحقق من أن العامل ليس موجوداً مسبقاً في الدفعة المستهدفة
      const [existingItem] = await db
        .select()
        .from(payrollBatchItems)
        .where(
          and(
            eq(payrollBatchItems.batchId, targetBatch.id),
            eq(payrollBatchItems.workerId, settlement.workerId)
          )
        )
        .limit(1);

      if (existingItem) {
        // العامل موجود - نضيف المبلغ إلى بنده الحالي
        const existingNet = safeParseDecimal(existingItem.netAmount);
        const existingBase = safeParseDecimal(existingItem.baseAmount);
        const existingDays = safeParseInt(existingItem.daysWorked);

        await db.update(payrollBatchItems)
          .set({
            netAmount: String(existingNet + settlement.totalAmount),
            baseAmount: String(existingBase + settlement.totalAmount),
            daysWorked: existingDays + settlement.days,
            notes: `${existingItem.notes || ''} | تسوية انتداب: +${settlement.totalAmount} ر.س (${settlement.days} يوم من ${settlement.fromCostCenterName})`.trim(),
          })
          .where(eq(payrollBatchItems.id, existingItem.id));
      } else {
        // العامل غير موجود - نضيفه كبند جديد
        await db.insert(payrollBatchItems).values({
          batchId: targetBatch.id,
          workerId: settlement.workerId,
          groupId: settlement.toGroupId,
          daysWorked: settlement.days,
          baseAmount: String(settlement.totalAmount),
          totalDeductions: "0.00",
          totalBonuses: "0.00",
          netAmount: String(settlement.totalAmount),
          notes: `تسوية انتداب: +${settlement.totalAmount} ر.س (${settlement.days} يوم من ${settlement.fromCostCenterName})`,
        });
      }

      // تحديث إجماليات الدفعة المستهدفة
      const targetItems = await db
        .select()
        .from(payrollBatchItems)
        .where(eq(payrollBatchItems.batchId, targetBatch.id));

      const targetTotalAmount = targetItems.reduce((sum, item) => sum + safeParseDecimal(item.baseAmount), 0);
      const targetTotalWorkers = targetItems.length;

      await db.update(payrollBatches)
        .set({
          totalAmount: String(targetTotalAmount),
          totalWorkers: targetTotalWorkers,
        })
        .where(eq(payrollBatches.id, targetBatch.id));
    }

    // 3. تحديث إجماليات الدفعة الأصلية
    const sourceItems = await db
      .select()
      .from(payrollBatchItems)
      .where(eq(payrollBatchItems.batchId, batchId));

    const sourceTotalAmount = sourceItems.reduce((sum, item) => sum + safeParseDecimal(item.baseAmount), 0);

    await db.update(payrollBatches)
      .set({
        totalAmount: String(sourceTotalAmount),
      })
      .where(eq(payrollBatches.id, batchId));

    // 4. حفظ قيد التسوية
    const settlementDate = typeof checkResult.batch.periodStart === 'string' ? checkResult.batch.periodStart : new Date(checkResult.batch.periodStart).toLocaleDateString('en-CA');

    await db.insert(assignmentSettlements).values({
      assignmentId: settlement.assignmentId,
      workerId: settlement.workerId,
      fromBatchId: batchId,
      toBatchId: toBatchId,
      fromCostCenterId: settlement.fromCostCenterId,
      toCostCenterId: settlement.toCostCenterId,
      amount: String(settlement.totalAmount),
      days: settlement.days,
      settlementDate: new Date(settlementDate + 'T00:00:00'),
      status: 'applied',
      appliedBy: appliedBy,
      notes: `تسوية انتداب ${settlement.workerName}: ${settlement.totalAmount} ر.س (${settlement.days} يوم) من ${settlement.fromCostCenterName} إلى ${settlement.toCostCenterName}`,
    });

    appliedSettlements.push({
      assignmentId: settlement.assignmentId,
      workerId: settlement.workerId,
      workerName: settlement.workerName,
      amount: settlement.totalAmount,
      days: settlement.days,
      fromCostCenter: settlement.fromCostCenterName,
      toCostCenter: settlement.toCostCenterName,
      toBatchId,
      toBatchExists: !!targetBatch,
    });
  }

return {
    success: true,
    message: `تم تطبيق ${appliedSettlements.length} تسوية بنجاح`,
    settlements: appliedSettlements,
  };
}

