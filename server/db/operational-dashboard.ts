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
// Operational Dashboard (العمليات التشغيلية)
// ============================================

/**
 * Get present workers for a specific date with optional filters
 */
export async function getPresentWorkers(workDateStr: string, groupId?: number, costCenterId?: number) {
  const db = await getDb();
  if (!db) return [];

  // Use administrative work_date (5 AM boundary) instead of calendar date

  // Get all check-in and check-out events for this administrative date
  const allEvents = await db
    .select({
      workerId: attendanceEvents.workerId,
      eventTime: attendanceEvents.eventTime,
      eventType: attendanceEvents.eventType,
    })
    .from(attendanceEvents)
    .where(
      eq(attendanceEvents.workDate, sql`${workDateStr}`)
    );

  const checkIns = allEvents.filter(e => e.eventType === 'check_in');

  if (checkIns.length === 0) return [];

  const workerIds = Array.from(new Set(checkIns.map(c => c.workerId)));
  
  // Get worker details
  const workerConditions: any[] = [inArray(workers.id, workerIds), eq(workers.status, 'active')];
  if (groupId) workerConditions.push(eq(workers.groupId, groupId));

  let workersList = await db
    .select({
      workerId: workers.id,
      workerCode: workers.code,
      workerName: workers.fullName,
      groupId: workers.groupId,
      groupName: groups.name,
      costCenterId: groups.costCenterId,
      costCenterName: costCenters.name,
    })
    .from(workers)
    .leftJoin(groups, eq(workers.groupId, groups.id))
    .leftJoin(costCenters, eq(groups.costCenterId, costCenters.id))
    .where(and(...workerConditions));

  if (costCenterId) {
    workersList = workersList.filter(w => w.costCenterId === costCenterId);
  }

// Map check-in and check-out times
  const checkInMap = new Map<number, Date>();
  const checkOutMap = new Map<number, Date>();
  for (const e of allEvents) {
    if (e.eventType === 'check_in') {
      if (!checkInMap.has(e.workerId) || e.eventTime < checkInMap.get(e.workerId)!) {
        checkInMap.set(e.workerId, e.eventTime);
      }
    } else if (e.eventType === 'check_out') {
      if (!checkOutMap.has(e.workerId) || e.eventTime > checkOutMap.get(e.workerId)!) {
        checkOutMap.set(e.workerId, e.eventTime);
      }
    }
  }

  return workersList.map(w => ({
    ...w,
    checkInTime: checkInMap.get(w.workerId) || null,
    checkOutTime: checkOutMap.get(w.workerId) || null,
  }));
}

/**
 * Get late workers for a specific date (workers who checked in after their scheduled start time)
 */
export async function getLateWorkers(workDateStr: string, groupId?: number, costCenterId?: number) {
  const db = await getDb();
  if (!db) return [];

  // Use administrative work_date (5 AM boundary) instead of calendar date
  const dayOfWeek = new Date(workDateStr).getDay(); // 0=Sunday

  // Get all check-in events for this administrative date
  const checkIns = await db
    .select({
      workerId: attendanceEvents.workerId,
      eventTime: attendanceEvents.eventTime,
    })
    .from(attendanceEvents)
    .where(and(
      eq(attendanceEvents.workDate, sql`${workDateStr}`),
      eq(attendanceEvents.eventType, 'check_in')
    ));

  if (checkIns.length === 0) return [];

  // Get first check-in per worker
  const firstCheckIn = new Map<number, Date>();
  for (const ci of checkIns) {
    if (!firstCheckIn.has(ci.workerId) || ci.eventTime < firstCheckIn.get(ci.workerId)!) {
      firstCheckIn.set(ci.workerId, ci.eventTime);
    }
  }

  const workerIds = Array.from(firstCheckIn.keys());

  // Get worker details with group info
  const workerConditions: any[] = [inArray(workers.id, workerIds), eq(workers.status, 'active')];
  if (groupId) workerConditions.push(eq(workers.groupId, groupId));

  let workersList = await db
    .select({
      workerId: workers.id,
      workerCode: workers.code,
      workerName: workers.fullName,
      groupId: workers.groupId,
      groupName: groups.name,
      costCenterId: groups.costCenterId,
      costCenterName: costCenters.name,
    })
    .from(workers)
    .leftJoin(groups, eq(workers.groupId, groups.id))
    .leftJoin(costCenters, eq(groups.costCenterId, costCenters.id))
    .where(and(...workerConditions));

  if (costCenterId) {
    workersList = workersList.filter(w => w.costCenterId === costCenterId);
  }

  // Get schedules for all groups
  const groupIds = Array.from(new Set(workersList.map(w => w.groupId).filter(Boolean))) as number[];
  let schedules: any[] = [];
  if (groupIds.length > 0) {
    schedules = await db
      .select()
      .from(groupSchedules)
      .where(and(
        inArray(groupSchedules.groupId, groupIds),
        eq(groupSchedules.dayOfWeek, dayOfWeek),
        eq(groupSchedules.isActive, true)
      ));
  }

  const scheduleMap = new Map<number, string>();
  for (const s of schedules) {
    scheduleMap.set(s.groupId, s.startTime);
  }

  // Filter late workers
  const lateWorkers: any[] = [];
  for (const w of workersList) {
    const scheduledStart = w.groupId ? scheduleMap.get(w.groupId) : null;
    if (!scheduledStart) continue;

    const checkInTime = firstCheckIn.get(w.workerId);
    if (!checkInTime) continue;

    // Parse scheduled start time
    const [hours, minutes] = scheduledStart.split(':').map(Number);
    const scheduledDate = new Date(workDateStr + 'T00:00:00');
    scheduledDate.setHours(hours, minutes, 0, 0);

    // Check if late (more than 5 minutes grace)
    const diffMinutes = (checkInTime.getTime() - scheduledDate.getTime()) / (1000 * 60);
    if (diffMinutes > 5) {
      lateWorkers.push({
        ...w,
        checkInTime,
        scheduledStart,
        lateMinutes: Math.round(diffMinutes),
      });
    }
  }

  return lateWorkers;
}

/**
 * Get absent workers with cost center info
 */
export async function getAbsentWorkersWithDetails(workDateStr: string, groupId?: number, costCenterId?: number) {
  const db = await getDb();
  if (!db) return [];

  // Use administrative work_date (5 AM boundary) instead of calendar date

  // Get all active workers
  const workerConditions: any[] = [eq(workers.status, 'active')];
  if (groupId) workerConditions.push(eq(workers.groupId, groupId));

  let allWorkers = await db
    .select({
      workerId: workers.id,
      workerCode: workers.code,
      workerName: workers.fullName,
      groupId: workers.groupId,
      groupName: groups.name,
      costCenterId: groups.costCenterId,
      costCenterName: costCenters.name,
    })
    .from(workers)
    .leftJoin(groups, eq(workers.groupId, groups.id))
    .leftJoin(costCenters, eq(groups.costCenterId, costCenters.id))
    .where(and(...workerConditions));

  if (costCenterId) {
    allWorkers = allWorkers.filter(w => w.costCenterId === costCenterId);
  }

  // Get workers who checked in (using administrative work_date)
  const checkIns = await db
    .select({ workerId: attendanceEvents.workerId })
    .from(attendanceEvents)
    .where(and(
      eq(attendanceEvents.workDate, sql`${workDateStr}`),
      eq(attendanceEvents.eventType, 'check_in')
    ))
    .groupBy(attendanceEvents.workerId);

  const presentIds = new Set(checkIns.map(c => c.workerId));

  return allWorkers.filter(w => !presentIds.has(w.workerId));
}

/**
 * Get operational dashboard stats for a specific date
 */
export async function getOperationalDashboardStats(workDateStr: string, groupId?: number, costCenterId?: number) {
  const [present, absent, late] = await Promise.all([
    getPresentWorkers(workDateStr, groupId, costCenterId),
    getAbsentWorkersWithDetails(workDateStr, groupId, costCenterId),
    getLateWorkers(workDateStr, groupId, costCenterId),
  ]);

  return {
    presentCount: present.length,
    absentCount: absent.length,
    lateCount: late.length,
  };
}

/**
 * Create operational flag from supervisor action
 */
export async function createOperationalFlagFromAction(data: {
  workerId: number;
  groupId?: number;
  costCenterId?: number;
  flagDate: string;
  flagType: 'confirm_attendance' | 'confirm_absence' | 'transfer';
  description: string;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const result = await db.insert(operationalFlags).values({
    workerId: data.workerId,
    groupId: data.groupId || null,
    costCenterId: data.costCenterId || null,
    flagDate: sql`${data.flagDate}`,
    flagType: data.flagType,
    description: data.description,
    status: 'pending',
    createdBy: data.createdBy,
  });

  return result[0].insertId;
}

/**
 * Get operational flags with filters for the review page
 */
export async function getOperationalFlagsForReview(filters?: {
  status?: string;
  flagType?: string;
  groupId?: number;
  costCenterId?: number;
  startDate?: string;
  endDate?: string;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions: any[] = [];

  if (filters?.status) {
    conditions.push(eq(operationalFlags.status, filters.status as any));
  }

  if (filters?.flagType) {
    conditions.push(eq(operationalFlags.flagType, filters.flagType as any));
  }

  if (filters?.groupId) {
    conditions.push(eq(operationalFlags.groupId, filters.groupId));
  }

  if (filters?.costCenterId) {
    conditions.push(eq(operationalFlags.costCenterId, filters.costCenterId));
  }

  if (filters?.startDate) {
    conditions.push(sql`${operationalFlags.flagDate} >= ${filters.startDate}`);
  }

  if (filters?.endDate) {
    conditions.push(sql`${operationalFlags.flagDate} <= ${filters.endDate}`);
  }

  const results = await db
    .select({
      id: operationalFlags.id,
      workerId: operationalFlags.workerId,
      workerName: workers.fullName,
      workerCode: workers.code,
      groupId: operationalFlags.groupId,
      groupName: groups.name,
      costCenterId: operationalFlags.costCenterId,
      costCenterName: costCenters.name,
      flagDate: operationalFlags.flagDate,
      flagType: operationalFlags.flagType,
      description: operationalFlags.description,
      status: operationalFlags.status,
      createdBy: operationalFlags.createdBy,
      createdByName: users.fullName,
      approvedBy: operationalFlags.approvedBy,
      approvedAt: operationalFlags.approvedAt,
      approvalNotes: operationalFlags.approvalNotes,
      createdAt: operationalFlags.createdAt,
    })
    .from(operationalFlags)
    .leftJoin(workers, eq(operationalFlags.workerId, workers.id))
    .leftJoin(groups, eq(operationalFlags.groupId, groups.id))
    .leftJoin(costCenters, eq(operationalFlags.costCenterId, costCenters.id))
    .leftJoin(users, eq(operationalFlags.createdBy, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(operationalFlags.createdAt));

  return results;
}

/**
 * Get count of pending operational flags
 */
export async function getPendingOperationalFlagsCount() {
  const db = await getDb();
  if (!db) return 0;

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(operationalFlags)
    .where(eq(operationalFlags.status, 'pending'));

  return result[0]?.count || 0;
}

/**
 * Get count of pending operational flags filtered by period and cost center
 * Used before creating payroll batches to ensure all flags for the same period/cost center are resolved
 */
export async function getPendingOperationalFlagsForPeriod(
  periodStart: string,
  periodEnd: string,
  costCenterId: number | null,
  groupIds?: number[] // ✅ إذا حُددت، يُقصر الفحص على هذه المجموعات فقط بدل كل مركز التكلفة
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const startDate = periodStart.split('T')[0];
  const endDate = periodEnd.split('T')[0];

  const conditions = [
    eq(operationalFlags.status, 'pending'),
    gte(operationalFlags.flagDate, startDate),
    lte(operationalFlags.flagDate, endDate),
  ];

  // If costCenterId is provided, filter by it
  if (costCenterId) {
    conditions.push(eq(operationalFlags.costCenterId, costCenterId));
  }

  // ✅ إذا حُددت مجموعات معينة، يُقصر الفحص عليها فقط
  if (groupIds && groupIds.length > 0) {
    conditions.push(inArray(operationalFlags.groupId, groupIds));
  }

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(operationalFlags)
    .where(and(...conditions));

  return result[0]?.count || 0;
}

/**
 * Check for duplicate payroll batch with same period and cost center
 * Prevents creating duplicate batches for the same data
 */
export async function checkDuplicatePayrollBatch(
  periodStart: string,
  periodEnd: string,
  costCenterId: number | null,
  selectedGroupIds?: number[] // ✅ المجموعات المختارة للدفعة الجديدة
): Promise<{ isDuplicate: boolean; existingBatchCode: string | null; existingStatus: string | null }> {
  const db = await getDb();
  if (!db) return { isDuplicate: false, existingBatchCode: null, existingStatus: null };

  const startDate = periodStart.split('T')[0];
  const endDate = periodEnd.split('T')[0];

  const conditions = [
    eq(payrollBatches.periodStart, startDate),
    eq(payrollBatches.periodEnd, endDate),
  ];

  // Match cost center (including null = null)
  if (costCenterId) {
    conditions.push(eq(payrollBatches.costCenterId, costCenterId));
  } else {
    conditions.push(sql`${payrollBatches.costCenterId} IS NULL`);
  }

  const existingBatches = await db
    .select({
      batchCode: payrollBatches.batchCode,
      status: payrollBatches.status,
      id: payrollBatches.id,
    })
    .from(payrollBatches)
    .where(and(...conditions));

  if (existingBatches.length === 0) {
    return { isDuplicate: false, existingBatchCode: null, existingStatus: null };
  }

  // ✅ إذا لم تُحدد مجموعات → تعامل كالسابق (أي دفعة موجودة = تكرار)
  if (!selectedGroupIds || selectedGroupIds.length === 0) {
    const existing = existingBatches[0];
    const statusMap: Record<string, string> = {
      'draft': 'مسودة',
      'under_accountant_review': 'قيد مراجعة المحاسب',
      'under_financial_review': 'قيد المراجعة المالية',
      'under_accounts_manager_review': 'قيد مراجعة المدير المالي',
      'approved': 'معتمدة',
      'rejected_final': 'مرفوضة',
      'paid': 'مدفوعة',
    };
    return {
      isDuplicate: true,
      existingBatchCode: existing.batchCode,
      existingStatus: statusMap[existing.status || ''] || existing.status,
    };
  }

  // ✅ إذا حُددت مجموعات → تحقق من التداخل مع الدفعات الموجودة
  for (const existingBatch of existingBatches) {
    // جلب عمال الدفعة الموجودة ومجموعاتهم
    const existingItems = await db
      .select({ groupId: payrollBatchItems.groupId })
      .from(payrollBatchItems)
      .where(eq(payrollBatchItems.batchId, existingBatch.id));

    const existingGroupIds = new Set(
      existingItems.map(i => i.groupId).filter(Boolean)
    );

    // هل يوجد تداخل بين المجموعات الجديدة والمجموعات الموجودة؟
    const hasOverlap = selectedGroupIds.some(id => existingGroupIds.has(id));

    if (hasOverlap) {
      const overlappingGroupIds = selectedGroupIds.filter(id => existingGroupIds.has(id));
      const statusMap: Record<string, string> = {
        'draft': 'مسودة',
        'under_accountant_review': 'قيد مراجعة المحاسب',
        'under_financial_review': 'قيد المراجعة المالية',
        'under_accounts_manager_review': 'قيد مراجعة المدير المالي',
        'approved': 'معتمدة',
        'rejected_final': 'مرفوضة',
        'paid': 'مدفوعة',
      };
      return {
        isDuplicate: true,
        existingBatchCode: existingBatch.batchCode,
        existingStatus: statusMap[existingBatch.status || ''] || existingBatch.status,
      };
    }
  }

  // لا يوجد تداخل → يُسمح بالإنشاء
  return { isDuplicate: false, existingBatchCode: null, existingStatus: null };
}


