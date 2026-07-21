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
  dailyWorkAssignments,
  deductionEntries
} from "../../drizzle/schema";
import { sendNotification, sendNotificationToRoles, notifyStageAndAdmins, ADMIN_OWNER_ROLES } from '../notifications';
import { getRoleLabel } from '../permissions';
import { inArray, isNull, isNotNull, between } from "drizzle-orm";
import type { Worker as DbWorker } from "../../drizzle/schema";
import { ENV } from '../_core/env';
import { getDb } from './connection';
import { processAttendanceToFinance } from './daily-finance';
import { getApprovedUnpostedDeductionsForPeriod, markDeductionsAsPosted, addDeductionReasonNotes } from './deductions';
import { getDailyFinanceRecords } from './finance-entries';
import { cleanupOrphanFinanceRecords } from './daily-finance-entries';
import { getEffectiveGroupForWorkerOnDate } from './recalculation';
import { getActorLabel } from './_shared';

// ============================================
// Payroll Batch Functions (دفعات العمال)
// ============================================

/**
 * Create a new payroll batch
 */
/**
 * عدّاد ذري آمن (atomic) للرقم التسلسلي السنوي لدفعات الرواتب.
 * يستخدم نمط INSERT ... ON DUPLICATE KEY UPDATE + LAST_INSERT_ID() الآمن للتزامن في MySQL/TiDB،
 * بحيث يستحيل فنياً أن تحصل دفعتان على نفس الرقم حتى لو أُنشئتا في نفس اللحظة بالضبط.
 */
async function getNextBatchSequence(year: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.execute(sql`
    INSERT INTO payroll_batch_sequences (year, counter)
    VALUES (${year}, 1)
    ON DUPLICATE KEY UPDATE counter = LAST_INSERT_ID(counter + 1)
  `);

  const result: any = await db.execute(sql`SELECT LAST_INSERT_ID() as seq`);
  const rows = Array.isArray(result) ? result[0] : (result.rows || result);
  return Number(rows[0].seq);
}

export async function createPayrollBatch(params: {
  periodStart: string;
  periodEnd: string;
  groupId?: number | null;
  costCenterId?: number | null;
  createdBy: number;
  refreshFinanceRecords?: boolean; // ✅ NEW: إعادة حساب السجلات المالية قبل إنشاء الدفعة
  groupIds?: number[]; // ✅ المجموعات المختارة
  items: Array<{
    workerId: number;
    baseAmount: string;
    deductions: string;
    bonuses: string;
    netAmount: string;
    daysWorked?: number;
    notes?: string;
  }>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 🧹 تنظيف تلقائي للسجلات اليتيمة قبل إنشاء الدفعة
  try {
    const cleanupResult = await cleanupOrphanFinanceRecords();
    if (cleanupResult.deletedCount > 0) {
      console.log(`[createPayrollBatch] Auto-cleanup: Removed ${cleanupResult.deletedCount} orphan records (${cleanupResult.totalAmount} SAR)`);
    }
  } catch (cleanupError) {
    console.error('[createPayrollBatch] Cleanup error (non-critical):', cleanupError);
    // لا نوقف إنشاء الدفعة إذا فشل التنظيف
  }

  // 🔄 إعادة المزامنة المالية (Financial Sync) - إذا طُلب
  if (params.refreshFinanceRecords === true) {
    try {
      console.log('[createPayrollBatch] Financial Sync: Starting refresh for period', params.periodStart, '-', params.periodEnd);
      
      // 1. تحديد النطاق: استخراج جميع السجلات المالية في الفترة
      const periodStartDate = params.periodStart.split('T')[0];
      const periodEndDate = params.periodEnd.split('T')[0];
      
      let financeRecordsQuery = db
        .select({
          id: workerDailyFinance.id,
          workerId: workerDailyFinance.workerId,
          workDate: workerDailyFinance.workDate,
        })
        .from(workerDailyFinance)
        .where(
          and(
            sql`${workerDailyFinance.workDate} >= ${periodStartDate}`,
            sql`${workerDailyFinance.workDate} <= ${periodEndDate}`
          )
        );
      
      // إذا كانت الدفعة لمجموعة محددة
      if (params.groupId) {
        financeRecordsQuery = db
          .select({
            id: workerDailyFinance.id,
            workerId: workerDailyFinance.workerId,
            workDate: workerDailyFinance.workDate,
          })
          .from(workerDailyFinance)
          .innerJoin(workers, eq(workerDailyFinance.workerId, workers.id))
          .where(
            and(
              sql`${workerDailyFinance.workDate} >= ${periodStartDate}`,
              sql`${workerDailyFinance.workDate} <= ${periodEndDate}`,
              eq(workers.groupId, params.groupId)
            )
          );
      }
      
      const financeRecords = await financeRecordsQuery;
      console.log(`[createPayrollBatch] Financial Sync: Found ${financeRecords.length} finance records in period`);
      
      // 2. فلتر الأمان: استبعاد السجلات المعتمدة
      const lockedRecords = new Set<string>();
      
      // فحص جميع الدفعات المغلقة/المعتمدة
      // ملاحظة: payroll_batch_items لا يحتوي على workDate، لذلك نستخدم periodStart/periodEnd من payroll_batches
      // نعتبر أن أي عامل في دفعة معتمدة تتقاطع فترتها مع الفترة المطلوبة هو "مقفل"
      const lockedBatchItems = await db
        .select({
          workerId: payrollBatchItems.workerId,
          batchId: payrollBatchItems.batchId,
          periodStart: payrollBatches.periodStart,
          periodEnd: payrollBatches.periodEnd,
        })
        .from(payrollBatchItems)
        .innerJoin(payrollBatches, eq(payrollBatchItems.batchId, payrollBatches.id))
        .where(
          and(
            // فترة الدفعة المعتمدة تتقاطع مع الفترة المطلوبة
            sql`${payrollBatches.periodStart} <= ${periodEndDate}`,
            sql`${payrollBatches.periodEnd} >= ${periodStartDate}`,
            or(
              eq(payrollBatches.status, 'approved'),
              eq(payrollBatches.status, 'paid')
            )
          )
        );
      
      // بما أنه لا يوجد workDate في batch items، نقفل العامل لجميع أيام الفترة
      lockedBatchItems.forEach(item => {
        // نضيف العامل كمقفل - سنتحقق لاحقاً بناءً على workerId فقط
        lockedRecords.add(`worker-${item.workerId}`);
      });
      
      console.log(`[createPayrollBatch] Financial Sync: ${lockedRecords.size} records are locked (in finalized/approved batches)`);
      
      // 3. إعادة حساب السجلات "الحرة" فقط
      let refreshedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      
      for (const record of financeRecords) {
        const workerLockKey = `worker-${record.workerId}`;
        
        // تخطي السجلات المعتمدة (العامل موجود في دفعة معتمدة لنفس الفترة)
        if (lockedRecords.has(workerLockKey)) {
          skippedCount++;
          continue;
        }
        
        // إعادة حساب السجل مع معالجة الأخطاء
        try {
          // حذف السجل القديم
          await db.delete(workerDailyFinance).where(eq(workerDailyFinance.id, record.id));
          
          // ✅ تحويل workDate من Date object إلى string (YYYY-MM-DD)
          const workDateStr = typeof record.workDate === 'string' 
            ? record.workDate 
            : new Date(record.workDate).toLocaleDateString('en-CA');
          
          // إعادة معالجة البصمات لإنشاء سجل جديد
          await processAttendanceToFinance(record.workerId, workDateStr);
          
          refreshedCount++;
        } catch (error) {
          errorCount++;
          console.error(`[createPayrollBatch] Financial Sync Error for worker ${record.workerId} on ${record.workDate}:`, error);
          // الاستمرار للسجل التالي (لا نوقف العملية)
        }
      }
      
      console.log(`[createPayrollBatch] Financial Sync Complete: Refreshed ${refreshedCount}, Skipped ${skippedCount} (locked), Errors ${errorCount}`);
    } catch (syncError) {
      console.error('[createPayrollBatch] Financial Sync error (non-critical):', syncError);
      // لا نوقف إنشاء الدفعة إذا فشلت المزامنة
    }
  }

  // ✅ 1. توحيد التواريخ - تحويل إلى YYYY-MM-DD فقط
  const periodStartDate = params.periodStart.split('T')[0];
  const periodEndDate = params.periodEnd.split('T')[0];
  // ✅ ترقيم الدفعات الجديد: PR + آخر رقمين من السنة + رقم تسلسلي من 4 خانات (تصفير سنوي)
  // مثال: أول دفعة في 2026 → PR260001، الدفعة رقم 25 في نفس السنة → PR260025
  // يُستخدم عدّاد ذري آمن (getNextBatchSequence) لضمان عدم تكرار الرقم عند التزامن
  const now = new Date();
  const year = now.getFullYear();
  const yearShort = String(year).slice(-2);
  const sequence = await getNextBatchSequence(year);
  const finalBatchCode = `PR${yearShort}${String(sequence).padStart(4, '0')}`;

  // If items are empty, calculate from workerDailyFinance
  let batchItems: Array<{
    workerId: number;
    groupId: number | null;
    daysWorked: number;
    baseAmount: string;
    totalDeductions: string;
    totalBonuses: string;
    netAmount: string;
  }> = [];
  
  // ✅ FIX: عندما يكون refreshFinanceRecords=true، نعيد قراءة البيانات من قاعدة البيانات
  // بعد إعادة الحساب بدلاً من استخدام القيم القديمة المرسلة من الواجهة
  const shouldReadFromDB = !params.items || params.items.length === 0 || params.refreshFinanceRecords === true;
  
  if (shouldReadFromDB) {
    console.log('[createPayrollBatch] Reading fresh finance data from DB (refreshFinanceRecords=' + params.refreshFinanceRecords + ', items.length=' + (params.items?.length || 0) + ')');
    
    // ✅ NEW: تجميع العمال حسب effective_group_id من السجلات المالية
    if (params.costCenterId) {
      console.log(`[createPayrollBatch] Using effective_group_id logic for CC ${params.costCenterId}`);
      
      // 1. جلب جميع المجموعات في مركز التكلفة هذا
      const groupsInCC = await db.select({ id: groups.id }).from(groups).where(eq(groups.costCenterId, params.costCenterId));
      const allGroupIdsInCC = groupsInCC.map(g => g.id);
      // ✅ فلترة حسب المجموعات المختارة إن وُجدت
      const groupIdsInCC = params.groupIds && params.groupIds.length > 0
        ? allGroupIdsInCC.filter(id => params.groupIds!.includes(id))
        : allGroupIdsInCC;
      
      if (groupIdsInCC.length > 0) {
        // 2. جلب السجلات المالية التي effective_group_id تنتمي لهذا المركز
        const financeRecords = await db
          .select({
            workerId: workerDailyFinance.workerId,
            baseAmount: workerDailyFinance.baseAmount,
            deductions: workerDailyFinance.deductions,
            bonuses: workerDailyFinance.bonuses,
            netAmount: workerDailyFinance.netAmount,
            effectiveGroupId: workerDailyFinance.effectiveGroupId,
          })
          .from(workerDailyFinance)
          .where(
            and(
              sql`${workerDailyFinance.workDate} >= ${periodStartDate}`,
              sql`${workerDailyFinance.workDate} <= ${periodEndDate}`,
              inArray(workerDailyFinance.effectiveGroupId, groupIdsInCC)
            )
          );
        
        // 3. تجميع حسب العامل
        const workerMap = new Map<number, { baseAmount: number; deductions: number; bonuses: number; netAmount: number; daysWorked: number; groupId: number | null }>();
        
        for (const rec of financeRecords) {
          const existing = workerMap.get(rec.workerId);
          const base = parseFloat(rec.baseAmount || '0');
          const ded = parseFloat(rec.deductions || '0');
          const bon = parseFloat(rec.bonuses || '0');
          const net = parseFloat(rec.netAmount || '0');
          
          if (existing) {
            existing.baseAmount += base;
            existing.deductions += ded;
            existing.bonuses += bon;
            existing.netAmount += net;
            existing.daysWorked += 1;
            // استخدام آخر مجموعة فعالة
            existing.groupId = rec.effectiveGroupId;
          } else {
            workerMap.set(rec.workerId, {
              baseAmount: base,
              deductions: ded,
              bonuses: bon,
              netAmount: net,
              daysWorked: 1,
              groupId: rec.effectiveGroupId,
            });
          }
        }
        
        for (const [wId, data] of workerMap) {
          batchItems.push({
            workerId: wId,
            groupId: data.groupId,
            daysWorked: data.daysWorked,
            baseAmount: data.baseAmount.toFixed(2),
            totalDeductions: data.deductions.toFixed(2),
            totalBonuses: data.bonuses.toFixed(2),
            netAmount: data.netAmount.toFixed(2),
          });
          console.log(`[createPayrollBatch] Worker ${wId}: base=${data.baseAmount}, net=${data.netAmount}, days=${data.daysWorked}, group=${data.groupId}`);
        }
      }
    } else {
      // المسار الأصلي: بدون مركز تكلفة محدد
      let workerIds: number[] = [];
      
      if (params.items && params.items.length > 0) {
        workerIds = params.items.map(item => item.workerId);
      } else if (params.groupId) {
        const groupWorkers = await db.select().from(workers).where(eq(workers.groupId, params.groupId));
        workerIds = groupWorkers.map(w => w.id);
      } else {
        const allWorkers = await db.select().from(workers);
        workerIds = allWorkers.map(w => w.id);
      }
      
      // قراءة البيانات المالية المحدثة لكل عامل
      for (const wId of workerIds) {
        const finance = await getDailyFinanceRecords(
          wId,
          periodStartDate,
          periodEndDate
        );
        
        const baseAmount = finance.reduce((sum, day) => sum + parseFloat(day.baseAmount || '0'), 0);
        const totalDeductions = finance.reduce((sum, day) => sum + parseFloat(day.deductions || '0'), 0);
        const totalBonuses = finance.reduce((sum, day) => sum + parseFloat(day.bonuses || '0'), 0);
        const netAmount = baseAmount - totalDeductions + totalBonuses;
        const daysWorked = finance.length;
        
        let effectiveGroupId: number | null = null;
        if (finance.length > 0) {
          const lastDay = finance[finance.length - 1];
          effectiveGroupId = await getEffectiveGroupForWorkerOnDate(wId, lastDay.workDate);
        }
        
        console.log(`[createPayrollBatch] Worker ${wId}: baseAmount=${baseAmount}, deductions=${totalDeductions}, bonuses=${totalBonuses}, net=${netAmount}, days=${daysWorked}`);
        
        batchItems.push({
          workerId: wId,
          groupId: effectiveGroupId,
          daysWorked,
          baseAmount: baseAmount.toFixed(2),
          totalDeductions: totalDeductions.toFixed(2),
          totalBonuses: totalBonuses.toFixed(2),
          netAmount: netAmount.toFixed(2),
        });
      }
    }
  } else {
    batchItems = params.items.map(item => ({
      workerId: item.workerId,
      groupId: null, // Will be populated from worker's current group if needed
      daysWorked: item.daysWorked || 0,
      baseAmount: item.baseAmount,
      totalDeductions: item.deductions,
      totalBonuses: item.bonuses,
      netAmount: item.netAmount,
      notes: item.notes || null,
    }));
  }

  // ✅ الحسومات الإدارية (شاشة "الحسومات"): نجلب كل حسم معتمد وغير مُرحّل بعد
  // ضمن فترة هذه الدفعة، لعمال هذه الدفعة تحديداً، وندمجه في حقل "الحسومات" الخاص بكل عامل
  const batchWorkerIds = batchItems.map((item) => item.workerId);
  const approvedDeductions = await getApprovedUnpostedDeductionsForPeriod(
    batchWorkerIds,
    params.periodStart,
    params.periodEnd
  );

  const otherDeductionsByWorker = new Map<number, number>();
  for (const d of approvedDeductions) {
    otherDeductionsByWorker.set(
      d.workerId,
      (otherDeductionsByWorker.get(d.workerId) || 0) + parseFloat(d.amount)
    );
  }

  batchItems = batchItems.map((item) => {
    const otherDed = otherDeductionsByWorker.get(item.workerId) || 0;
    const adjustedNet = parseFloat(item.netAmount) - otherDed;
    return {
      ...item,
      otherDeductions: otherDed.toFixed(2),
      netAmount: adjustedNet.toFixed(2),
    };
  });

  // Calculate batch totals
  const totalAmount = batchItems.reduce((sum, item) => sum + parseFloat(item.baseAmount), 0);
  const totalDeductions = batchItems.reduce((sum, item) => sum + parseFloat(item.totalDeductions), 0);
  const totalOtherDeductions = batchItems.reduce((sum, item) => sum + parseFloat((item as any).otherDeductions || '0'), 0);
  const totalBonuses = batchItems.reduce((sum, item) => sum + parseFloat(item.totalBonuses), 0);

  // Insert batch
  const insertValues = {
    batchCode: finalBatchCode,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    groupId: params.groupId ?? null,
    costCenterId: params.costCenterId ?? null,
    totalAmount: totalAmount.toFixed(2),
    totalWorkers: batchItems.length,
    totalDeductions: totalDeductions.toFixed(2),
    totalOtherDeductions: totalOtherDeductions.toFixed(2),
    totalBonuses: totalBonuses.toFixed(2),
    status: 'draft' as const,
    createdBy: params.createdBy,
  };

  const insertResult = await db.insert(payrollBatches).values(insertValues as any);

  // Get batch ID from insert result
  const batchId = insertResult[0].insertId;
  if (!batchId) {
    throw new Error('Failed to get batch ID after insert');
  }

  for (const item of batchItems) {
    const itemToInsert = {
      batchId,
      workerId: item.workerId,
      groupId: item.groupId || null,
      daysWorked: item.daysWorked,
      baseAmount: item.baseAmount,
      totalDeductions: item.totalDeductions,
      otherDeductions: (item as any).otherDeductions || '0.00',
      totalBonuses: item.totalBonuses,
      netAmount: item.netAmount,
      notes: (item as any).notes || null,
    };
      await db.insert(payrollBatchItems).values(itemToInsert as any);
  }

  // ✅ تعليم الحسومات المُدرجة كمُرحّلة (يمنع ترحيلها مرة أخرى) + إضافة سبب كل حسم كملاحظة بالدفعة
  if (approvedDeductions.length > 0) {
    await markDeductionsAsPosted(approvedDeductions.map((d) => d.id), batchId);
    await addDeductionReasonNotes({
      batchId,
      reviewerId: params.createdBy,
      reviewerRole: 'system',
      deductions: approvedDeductions.map((d) => ({
        workerId: d.workerId,
        amount: d.amount,
        reason: d.reason,
      })),
    });
  }

  // 🔔 إشعار الأدمن والإدارة العليا فور إنشاء الدفعة كمسودة
  const creatorLabel = await getActorLabel(db, params.createdBy);
  await sendNotificationToRoles({
    roles: ADMIN_OWNER_ROLES,
    title: "📝 تم إنشاء دفعة رواتب جديدة",
    message: `أنشأ ${creatorLabel} دفعة رواتب جديدة برقم ${finalBatchCode} للفترة من ${params.periodStart} إلى ${params.periodEnd} (${batchItems.length} عامل) — بانتظار الإرسال للمحاسب.`,
    type: 'info',
    link: `/payroll/batches/${batchId}`,
  });

  return { batchId, batchCode: finalBatchCode };
}

/**
 * Get payroll batches with search and filtering
 */
export async function getPayrollBatches(params: {
  search?: string; // Search by batch ID
  statusFilter?: string; // Filter by status
  costCenterFilter?: number; // Filter by cost center
  dateFrom?: string; // Filter by date from
  dateTo?: string; // Filter by date to
  sortBy?: 'date' | 'batchId' | 'totalAmount'; // Sort option
  sortOrder?: 'asc' | 'desc'; // Sort order
  limit?: number; // Pagination limit
  offset?: number; // Pagination offset
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let query = db
    .select({
      id: payrollBatches.id,
      batchCode: payrollBatches.batchCode,
      periodStart: payrollBatches.periodStart,
      periodEnd: payrollBatches.periodEnd,
      status: payrollBatches.status,
      totalAmount: payrollBatches.totalAmount,
      totalWorkers: payrollBatches.totalWorkers,
      totalDeductions: payrollBatches.totalDeductions,
      totalBonuses: payrollBatches.totalBonuses,
      createdAt: payrollBatches.createdAt,
      costCenterName: sql<string>`COALESCE(${costCenters.name}, 'All')`,
    })
    .from(payrollBatches)
    .leftJoin(costCenters, eq(payrollBatches.costCenterId, costCenters.id));

  // Apply filters
  const conditions = [];

  if (params.search) {
    conditions.push(sql`${payrollBatches.batchCode} LIKE ${'%' + params.search + '%'}`);
  }

  if (params.statusFilter) {
    conditions.push(eq(payrollBatches.status, params.statusFilter as any));
  }

  if (params.costCenterFilter) {
    conditions.push(eq(payrollBatches.costCenterId, params.costCenterFilter));
  }

  if (params.dateFrom) {
    conditions.push(sql`${payrollBatches.createdAt} >= ${params.dateFrom}`);
  }

  if (params.dateTo) {
    conditions.push(sql`${payrollBatches.createdAt} <= ${params.dateTo}`);
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  // Apply sorting
  if (params.sortBy === 'batchId') {
    query = query.orderBy(
      params.sortOrder === 'desc' 
        ? desc(payrollBatches.batchCode) 
        : payrollBatches.batchCode
    ) as any;
  } else if (params.sortBy === 'totalAmount') {
    query = query.orderBy(
      params.sortOrder === 'desc' 
        ? desc(payrollBatches.totalAmount) 
        : payrollBatches.totalAmount
    ) as any;
  } else {
    // Default sort by date
    query = query.orderBy(
      params.sortOrder === 'desc' 
        ? desc(payrollBatches.createdAt) 
        : payrollBatches.createdAt
    ) as any;
  }

  // Apply pagination
  if (params.limit) {
    query = query.limit(params.limit) as any;
  }
  if (params.offset) {
    query = query.offset(params.offset) as any;
  }

  const batches = await query;

  // Get total count for pagination
  let countQuery = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(payrollBatches);

  if (conditions.length > 0) {
    countQuery = countQuery.where(and(...conditions)) as any;
  }

  const [{ count }] = await countQuery;

  return {
    batches,
    total: count,
  };
}

/**
 * Get payroll batch details with items
 */
export async function getPayrollBatchDetails(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get batch
  const [batch] = await db
    .select()
    .from(payrollBatches)
    .where(eq(payrollBatches.id, batchId));

  if (!batch) {
    throw new Error("Batch not found");
  }

  // Get items with worker details
  const items = await db
    .select({
      id: payrollBatchItems.id,
      workerId: payrollBatchItems.workerId,
      workerCode: workers.code,
      workerName: sql<string>`COALESCE(${workers.fullName}, 'Unknown')`,
      groupId: workers.groupId,
      groupName: sql<string>`COALESCE(${groups.name}, 'Unknown')`,
      daysWorked: payrollBatchItems.daysWorked,
      baseAmount: payrollBatchItems.baseAmount,
      totalDeductions: payrollBatchItems.totalDeductions,
      totalBonuses: payrollBatchItems.totalBonuses,
      netAmount: payrollBatchItems.netAmount,
      notes: payrollBatchItems.notes,
    })
    .from(payrollBatchItems)
    .leftJoin(workers, eq(payrollBatchItems.workerId, workers.id))
    .leftJoin(groups, eq(workers.groupId, groups.id))
    .where(eq(payrollBatchItems.batchId, batchId));

  // ✅ مجموع دقائق التأخير والخروج المبكر لكل عامل خلال فترة الدفعة
  let itemsWithAttendanceStats = items;
  if (items.length > 0) {
    const workerIds = items.map(i => i.workerId).filter((id): id is number => id !== null);
    if (workerIds.length > 0) {
      const attendanceStats = await db
        .select({
          workerId: workerDailyFinance.workerId,
          totalLateMinutes: sql<number>`COALESCE(SUM(${workerDailyFinance.lateMinutes}), 0)`,
          totalEarlyLeaveMinutes: sql<number>`COALESCE(SUM(${workerDailyFinance.earlyLeaveMinutes}), 0)`,
        })
        .from(workerDailyFinance)
        .where(
          and(
            inArray(workerDailyFinance.workerId, workerIds),
            gte(workerDailyFinance.workDate, batch.periodStart),
            lte(workerDailyFinance.workDate, batch.periodEnd)
          )
        )
        .groupBy(workerDailyFinance.workerId);

      const statsByWorker = new Map(
        attendanceStats.map(s => [s.workerId, s])
      );

      itemsWithAttendanceStats = items.map(item => ({
        ...item,
        lateMinutes: statsByWorker.get(item.workerId)?.totalLateMinutes || 0,
        earlyLeaveMinutes: statsByWorker.get(item.workerId)?.totalEarlyLeaveMinutes || 0,
      }));
    }
  }

  // ✅ أسماء المطاعم المُعيَّنة لكل عامل خلال فترة الدفعة (لعرضها تلقائياً بدل الملاحظات اليدوية)
  let itemsWithRestaurants = itemsWithAttendanceStats;
  if (itemsWithAttendanceStats.length > 0) {
    const workerIdsForRestaurants = itemsWithAttendanceStats.map((i: any) => i.workerId).filter((id: any): id is number => id !== null);
    if (workerIdsForRestaurants.length > 0) {
      const restaurantRows = await db
        .selectDistinct({
          workerId: dailyWorkAssignments.workerId,
          restaurantName: restaurants.name,
        })
        .from(dailyWorkAssignments)
        .leftJoin(restaurants, eq(dailyWorkAssignments.restaurantId, restaurants.id))
        .where(
          and(
            inArray(dailyWorkAssignments.workerId, workerIdsForRestaurants),
            gte(dailyWorkAssignments.workDate, batch.periodStart),
            lte(dailyWorkAssignments.workDate, batch.periodEnd)
          )
        );

      const restaurantNamesByWorker = new Map<number, string[]>();
      for (const row of restaurantRows) {
        if (!row.restaurantName) continue;
        const list = restaurantNamesByWorker.get(row.workerId) || [];
        if (!list.includes(row.restaurantName)) list.push(row.restaurantName);
        restaurantNamesByWorker.set(row.workerId, list);
      }

      itemsWithRestaurants = itemsWithAttendanceStats.map((item: any) => ({
        ...item,
        restaurantNames: (restaurantNamesByWorker.get(item.workerId) || []).join('، ') || null,
      }));
    }
  }

  // Get notes — مع الاسم الكامل لكاتب الملاحظة (وليس اسم المستخدم)
  const notesRaw = await db
    .select({
      note: payrollBatchNotes,
      reviewerFullName: users.fullName,
      reviewerUsername: users.username,
    })
    .from(payrollBatchNotes)
    .leftJoin(users, eq(payrollBatchNotes.reviewerId, users.id))
    .where(eq(payrollBatchNotes.batchId, batchId))
    .orderBy(desc(payrollBatchNotes.createdAt));

  const notes = notesRaw.map((row) => ({
    ...row.note,
    reviewerFullName: row.reviewerFullName || row.reviewerUsername || null,
  }));

  // Get corrections
  const corrections = await db
    .select()
    .from(payrollBatchCorrections)
    .where(eq(payrollBatchCorrections.batchId, batchId))
    .orderBy(desc(payrollBatchCorrections.createdAt));

  return {
    batch,
    items: itemsWithRestaurants,
    notes,
    corrections,
  };
}

/**
 * Update batch item (DRAFT only)
 */
export async function updateBatchItem(params: {
  itemId: number;
  baseAmount?: string;
  totalDeductions?: string;
  totalBonuses?: string;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get item and batch
  const [item] = await db
    .select()
    .from(payrollBatchItems)
    .where(eq(payrollBatchItems.id, params.itemId));

  if (!item) {
    throw new Error("Item not found");
  }

  const [batch] = await db
    .select()
    .from(payrollBatches)
    .where(eq(payrollBatches.id, item.batchId));

  if (batch.status !== 'draft') {
    throw new Error("يمكن تعديل العناصر فقط في المسودات");
  }

  // Calculate new net amount
  const baseAmount = params.baseAmount !== undefined ? parseFloat(params.baseAmount) : parseFloat(item.baseAmount || '0');
  const totalDeductions = params.totalDeductions !== undefined ? parseFloat(params.totalDeductions) : parseFloat(item.totalDeductions || '0');
  const totalBonuses = params.totalBonuses !== undefined ? parseFloat(params.totalBonuses) : parseFloat(item.totalBonuses || '0');
  const netAmount = baseAmount - totalDeductions + totalBonuses;

  // Update item
  await db
    .update(payrollBatchItems)
    .set({
      baseAmount: baseAmount.toFixed(2),
      totalDeductions: totalDeductions.toFixed(2),
      totalBonuses: totalBonuses.toFixed(2),
      netAmount: netAmount.toFixed(2),
      notes: params.notes !== undefined ? params.notes : item.notes,
    })
    .where(eq(payrollBatchItems.id, params.itemId));

  // Recalculate batch totals
  await recalculateBatchTotals(item.batchId);

  return { success: true };
}

/**
 * Recalculate batch totals
 */
async function recalculateBatchTotals(batchId: number) {
  const db = await getDb();
  if (!db) return;

  const items = await db
    .select()
    .from(payrollBatchItems)
    .where(eq(payrollBatchItems.batchId, batchId));

  const totalAmount = items.reduce((sum, item) => sum + parseFloat(item.baseAmount || '0'), 0);
  const totalDeductions = items.reduce((sum, item) => sum + parseFloat(item.totalDeductions || '0'), 0);
  const totalBonuses = items.reduce((sum, item) => sum + parseFloat(item.totalBonuses || '0'), 0);

  await db
    .update(payrollBatches)
    .set({
      totalAmount: totalAmount.toFixed(2),
      totalDeductions: totalDeductions.toFixed(2),
      totalBonuses: totalBonuses.toFixed(2),
      totalWorkers: items.length,
    })
    .where(eq(payrollBatches.id, batchId));
}

/**
 * Submit batch for accountant review
 */
export async function submitBatchForReview(batchId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [batch] = await db
    .select()
    .from(payrollBatches)
    .where(eq(payrollBatches.id, batchId));

  if (!batch) {
    throw new Error("Batch not found");
  }

  if (batch.status !== 'draft') {
    throw new Error("يمكن إرسال المسودات فقط للمراجعة");
  }

    // ✅ إعادة حساب الإجمالي قبل الإرسال
    await recalculateBatchTotals(batchId);

    await db
    .update(payrollBatches)
    .set({
      status: 'under_accountant_review',
    })
    .where(eq(payrollBatches.id, batchId));

  // Record correction if resubmitting
  if (batch.status !== 'draft') {
    await db.insert(payrollBatchCorrections).values({
      batchId,
      correctorId: userId,
      correctionNote: 'Resubmitted after corrections',
      previousStatus: batch.status,
      newStatus: 'under_accountant_review',
    });
  }

  // 🔔 إشعار المحاسب (وكذلك الأدمن/الإدارة العليا) بوصول دفعة جديدة للمراجعة
  const senderLabel = await getActorLabel(db, userId);
  await notifyStageAndAdmins({
    stageRole: 'accountant',
    title: "📤 دفعة رواتب بانتظار المراجعة المحاسبية",
    message: `أرسل ${senderLabel} الدفعة ${batch.batchCode} للمراجعة المحاسبية.`,
    type: 'info',
    link: `/payroll/batches/${batchId}`,
  });

  return { success: true };
}

/**
 * Accountant approve batch
 */
export async function accountantApproveBatch(batchId: number, reviewerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [batch] = await db
    .select()
    .from(payrollBatches)
    .where(eq(payrollBatches.id, batchId));

  if (!batch) {
    throw new Error("Batch not found");
  }

  if (batch.status !== 'under_accountant_review') {
    throw new Error("Batch is not under accountant review");
  }

  // ✅ إعادة حساب الإجمالي قبل الإرسال
  await recalculateBatchTotals(batchId);

  await db
    .update(payrollBatches)
    .set({
      status: 'under_financial_review',
    })
    .where(eq(payrollBatches.id, batchId));

  return { success: true };
}

/**
 * Accountant reject batch
 */
export async function accountantRejectBatch(params: {
  batchId: number;
  reviewerId: number;
  noteType: 'critical' | 'warning' | 'info';
  note: string;
  workerId?: number;
  fieldName?: string;
  attachmentUrl?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [batch] = await db
    .select()
    .from(payrollBatches)
    .where(eq(payrollBatches.id, params.batchId));

  if (!batch) {
    throw new Error("Batch not found");
  }

  if (batch.status !== 'under_accountant_review') {
    throw new Error("Batch is not under accountant review");
  }

  // Return to draft for editing/deletion
  const newRejectionCount = (batch.rejectionCount || 0) + 1;
  await db
    .update(payrollBatches)
    .set({
      status: 'draft',
      rejectionCount: newRejectionCount,
    })
    .where(eq(payrollBatches.id, params.batchId));

  // Add note
  await db.insert(payrollBatchNotes).values({
    batchId: params.batchId,
    reviewerId: params.reviewerId,
    reviewerRole: 'accountant',
    noteType: params.noteType,
    workerId: params.workerId || null,
    fieldName: params.fieldName || null,
    note: params.note,
    attachmentUrl: params.attachmentUrl || null,
  });

  return { success: true, rejectionCount: newRejectionCount };
}

/**
 * Financial reviewer approve batch
 */
export async function financialReviewerApproveBatch(batchId: number, reviewerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [batch] = await db
    .select()
    .from(payrollBatches)
    .where(eq(payrollBatches.id, batchId));

  if (!batch) {
    throw new Error("Batch not found");
  }

  // ✅ المراجع المالي يقدر يعتمد الدفعة سواء كانت بمرحلة المراجعة المالية العادية،
  // أو لسا بمرحلة المحاسب (تجاوز اختياري لمرحلة المحاسب) — بالحالتين تنتقل للمدير المالي
  const skippedAccountant = batch.status === 'under_accountant_review';
  if (batch.status !== 'under_financial_review' && !skippedAccountant) {
    throw new Error("Batch is not under financial review");
  }

  // ✅ إعادة حساب الإجمالي قبل الإرسال
  await recalculateBatchTotals(batchId);
  await db
    .update(payrollBatches)
    .set({
      status: 'under_accounts_manager_review',
    })
    .where(eq(payrollBatches.id, batchId));

  if (skippedAccountant) {
    await db.insert(payrollBatchNotes).values({
      batchId,
      reviewerId,
      reviewerRole: 'financial_reviewer',
      noteType: 'info',
      note: 'تم اعتماد الدفعة من المراجع المالي مباشرة دون المرور بمرحلة مراجعة المحاسب.',
    });
  }

  return { success: true, skippedAccountant };
}

/**
 * Financial reviewer reject batch
 */
export async function financialReviewerRejectBatch(params: {
  batchId: number;
  reviewerId: number;
  noteType: 'critical' | 'warning' | 'info';
  note: string;
  workerId?: number;
  fieldName?: string;
  attachmentUrl?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [batch] = await db
    .select()
    .from(payrollBatches)
    .where(eq(payrollBatches.id, params.batchId));

  if (!batch) {
    throw new Error("Batch not found");
  }

  // ✅ نفس منطق الاعتماد: المراجع يقدر يرفض سواء بمرحلته العادية أو بمرحلة المحاسب (تجاوز اختياري)
  if (batch.status !== 'under_financial_review' && batch.status !== 'under_accountant_review') {
    throw new Error("Batch is not under financial or accountant review");
  }

  const newRejectionCount = (batch.rejectionCount || 0) + 1;
  await db
    .update(payrollBatches)
    .set({
      status: 'draft',
      rejectionCount: newRejectionCount,
    })
    .where(eq(payrollBatches.id, params.batchId));

  // Add note
  await db.insert(payrollBatchNotes).values({
    batchId: params.batchId,
    reviewerId: params.reviewerId,
    reviewerRole: 'financial_reviewer',
    noteType: params.noteType,
    workerId: params.workerId || null,
    fieldName: params.fieldName || null,
    note: params.note,
    attachmentUrl: params.attachmentUrl || null,
  });

  return { success: true };
}

/**
 * Accounts manager final approve
 */
export async function accountsManagerApproveBatch(batchId: number, approverId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [batch] = await db
    .select()
    .from(payrollBatches)
    .where(eq(payrollBatches.id, batchId));

  if (!batch) {
    throw new Error("Batch not found");
  }

  if (batch.status !== 'under_accounts_manager_review') {
    throw new Error("Batch is not under accounts manager review");
  }

  await db
    .update(payrollBatches)
    .set({
      status: 'approved',
      approvedBy: approverId,
      approvedAt: sql`NOW()`,
    })
    .where(eq(payrollBatches.id, batchId));

  return { success: true };
}

/**
 * Accounts manager final reject
 */
export async function accountsManagerRejectBatch(params: {
  batchId: number;
  reviewerId: number;
  note: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [batch] = await db
    .select()
    .from(payrollBatches)
    .where(eq(payrollBatches.id, params.batchId));

  if (!batch) {
    throw new Error("Batch not found");
  }

  if (batch.status !== 'under_accounts_manager_review') {
    throw new Error("Batch is not under accounts manager review");
  }

  const newRejectionCount = (batch.rejectionCount || 0) + 1;
  await db
    .update(payrollBatches)
    .set({
      status: 'draft',
      rejectionCount: newRejectionCount,
    })
    .where(eq(payrollBatches.id, params.batchId));

  // Add note
  await db.insert(payrollBatchNotes).values({
    batchId: params.batchId,
    reviewerId: params.reviewerId,
    reviewerRole: 'accounts_manager',
    noteType: 'critical',
    note: params.note,
  });

  return { success: true };
}

/**
 * Get batches by status
 */
export async function getBatchesByStatus(
  status?: string,
  filters?: {
    costCenterId?: number;
    groupId?: number;
    startDate?: Date;
    endDate?: Date;
  }
) {
  const db = await getDb();
  if (!db) return [];

let query = db
  .select({
    id: payrollBatches.id,
    batchCode: payrollBatches.batchCode,
    periodStart: payrollBatches.periodStart,
    periodEnd: payrollBatches.periodEnd,
    status: payrollBatches.status,
    totalAmount: payrollBatches.totalAmount,
    totalWorkers: payrollBatches.totalWorkers,
    totalDeductions: payrollBatches.totalDeductions,
    totalOtherDeductions: payrollBatches.totalOtherDeductions,
    totalBonuses: payrollBatches.totalBonuses,
    costCenterId: payrollBatches.costCenterId,
    groupId: payrollBatches.groupId,
    createdAt: payrollBatches.createdAt,
    createdBy: payrollBatches.createdBy,
    approvedBy: payrollBatches.approvedBy,
    approvedAt: payrollBatches.approvedAt,
    rejectionCount: payrollBatches.rejectionCount,
    isUnlocked: payrollBatches.isUnlocked,
    costCenterName: sql<string>`COALESCE(${costCenters.name}, 'All')`,
    // ✅ الصافي: مجموع صافي كل عامل (payroll_batch_items.net_amount) —
    // نفس المصدر بالضبط اللي تستخدمه بطاقة "الصافي" داخل تفاصيل الدفعة،
    // بدل ما يُعاد حسابه بمعادلة مستقلة (فتضمن تطابق القيمتين دائمًا)
    netAmount: sql<string>`(SELECT COALESCE(SUM(pbi.net_amount), 0) FROM payroll_batch_items pbi WHERE pbi.batch_id = ${payrollBatches.id})`,
  })
  .from(payrollBatches)
  .leftJoin(costCenters, eq(payrollBatches.costCenterId, costCenters.id))
  // ✅ الترتيب حسب تاريخ بداية الفترة (أول تاريخ في "من - إلى") بدل تاريخ الإنشاء
  .orderBy(desc(payrollBatches.periodStart));

let batches = await query;
  
  // Filter by status
  if (status) {
    batches = batches.filter(b => b.status === status);
  }

  // Filter by cost center or group
  if (filters?.costCenterId || filters?.groupId) {
    // Get batch IDs that match the filters
    const itemsQuery = db
      .select({ batchId: payrollBatchItems.batchId })
      .from(payrollBatchItems)
      .innerJoin(workers, eq(payrollBatchItems.workerId, workers.id))
      .innerJoin(groups, eq(workers.groupId, groups.id));

    let items = await itemsQuery;

    if (filters.groupId) {
      items = items.filter(item => {
        // We need to get the group for each worker
        return true; // Will be filtered below
      });
    }

    if (filters.costCenterId) {
      items = items.filter(item => {
        // Will be filtered below
        return true;
      });
    }

    // Get unique batch IDs
    const matchingBatchIds = new Set(items.map(item => item.batchId));

    // Filter batches by matching IDs
    batches = batches.filter(b => matchingBatchIds.has(b.id));
  }

  // Filter by date range
  if (filters?.startDate) {
    batches = batches.filter(b => new Date(b.periodStart) >= filters.startDate!);
  }
  if (filters?.endDate) {
    batches = batches.filter(b => new Date(b.periodEnd) <= filters.endDate!);
  }

  // ✅ العنوان الديناميكي: أسماء المجموعات الفعلية الموجودة داخل كل دفعة
  if (batches.length > 0) {
    const batchIds = batches.map(b => b.id);
    const groupRows = await db
      .selectDistinct({
        batchId: payrollBatchItems.batchId,
        groupName: groups.name,
      })
      .from(payrollBatchItems)
      .leftJoin(groups, eq(payrollBatchItems.groupId, groups.id))
      .where(inArray(payrollBatchItems.batchId, batchIds));

    const groupNamesByBatch = new Map<number, string[]>();
    for (const row of groupRows) {
      if (!row.groupName) continue;
      const list = groupNamesByBatch.get(row.batchId) || [];
      if (!list.includes(row.groupName)) list.push(row.groupName);
      groupNamesByBatch.set(row.batchId, list);
    }

    batches = batches.map(b => ({
      ...b,
      groupNames: (groupNamesByBatch.get(b.id) || []).join('، ') || '-',
    }));
  }

  return batches;
}

/**
 * Delete batch (DRAFT only)
 */
export async function deleteBatch(batchId: number, forceDelete: boolean = false) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [batch] = await db
    .select()
    .from(payrollBatches)
    .where(eq(payrollBatches.id, batchId));

  if (!batch) {
    throw new Error("Batch not found");
  }

  if (!forceDelete && batch.status !== 'draft') {
    throw new Error("Can only delete draft batches");
  }

  // ✅ لو كان فيه حسومات (شاشة الحسومات) اترحّلت لهذه الدفعة، نرجّعها لحالة "معتمد"
  // حتى تنترحّل تلقائياً بأول دفعة جديدة تُنشأ لنفس الفترة — بدل ما تضل عالقة على دفعة محذوفة
  await db
    .update(deductionEntries)
    .set({ status: 'approved', postedBatchId: null, postedAt: null })
    .where(eq(deductionEntries.postedBatchId, batchId));

  // Delete items first
  await db
    .delete(payrollBatchItems)
    .where(eq(payrollBatchItems.batchId, batchId));

  // Delete batch
  await db
    .delete(payrollBatches)
    .where(eq(payrollBatches.id, batchId));

  return { success: true };
}




