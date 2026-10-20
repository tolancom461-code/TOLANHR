import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { getAdministrativeWorkDate } from '../attendance-logic';
import {
  attendanceEvents,
  costCenters,
  dailyWorkAssignments,
  groups,
  operationalDayEvents,
  operationalDays,
  payrollBatchItems,
  payrollBatches,
  userCostCenters,
  userOperationGroups,
  users,
  workers,
} from '../../drizzle/schema';
import { getDb } from './connection';

/**
 * تاريخ بدء تطبيق قفل اليوم التشغيلي في هذه النسخة.
 * الأيام الأقدم تبقى تاريخية ولا يفرض عليها الشرط الجديد عند إنشاء الرواتب.
 */
export const OPERATIONAL_DAY_CONTROL_START_DATE = '2026-09-16';

const SCOPED_OPERATIONS_ROLES = new Set([
  'supervisor_tolan',
  'supervisor_malqa',
  'restaurant_operations',
]);

const CLOSE_ROLES = new Set([
  // المالك في النظام يُعامل كسوبر أدمن، لذلك يغطي super_admin كلاً من الأدمن والمالك.
  'super_admin',
  'supervisor_tolan',
  'supervisor_malqa',
  'restaurant_operations',
]);

const CURRENT_DAY_EDIT_ROLES = new Set([
  'super_admin',
  'admin_affairs',
  'supervisor_tolan',
  'supervisor_malqa',
  'restaurant_operations',
]);

const REOPEN_EDIT_ROLES = new Set([
  'super_admin',
  'admin_affairs',
]);

function normalizeDate(value: string) {
  return value.split('T')[0];
}

function getCurrentWorkDate() {
  return getAdministrativeWorkDate(new Date());
}

export async function assertOperationalCostCenterAccess(
  userId: number,
  role: string,
  costCenterId: number,
  groupId?: number | null
) {
  // السوبر أدمن والشؤون الإدارية يريان جميع المراكز والمجموعات.
  // موظفو التشغيل مقيدون بالمركز ثم بنطاق المجموعات المحدد داخله.
  if (!SCOPED_OPERATIONS_ROLES.has(role)) return;

  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const [scope] = await db
    .select({ id: userCostCenters.id, allGroups: userCostCenters.allGroups })
    .from(userCostCenters)
    .where(
      and(
        eq(userCostCenters.userId, userId),
        eq(userCostCenters.costCenterId, costCenterId)
      )
    )
    .limit(1);

  if (!scope) {
    throw new Error('ليس لديك صلاحية تشغيل هذا المركز. يجب ربط موظف التشغيل بمركز التكلفة أولاً');
  }

  if (groupId && !scope.allGroups) {
    const [groupScope] = await db
      .select({ id: userOperationGroups.id })
      .from(userOperationGroups)
      .where(
        and(
          eq(userOperationGroups.userId, userId),
          eq(userOperationGroups.groupId, groupId)
        )
      )
      .limit(1);
    if (!groupScope) {
      throw new Error('ليس لديك صلاحية عرض أو تشغيل هذه المجموعة');
    }
  }
}

async function getAllowedOperationalGroupIds(userId: number, role: string, costCenterId: number): Promise<number[] | null> {
  if (!SCOPED_OPERATIONS_ROLES.has(role)) return null;
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const [scope] = await db
    .select({ allGroups: userCostCenters.allGroups })
    .from(userCostCenters)
    .where(and(eq(userCostCenters.userId, userId), eq(userCostCenters.costCenterId, costCenterId)))
    .limit(1);
  if (!scope) throw new Error('ليس لديك صلاحية تشغيل هذا المركز');
  if (scope.allGroups) return null;

  const rows = await db
    .select({ groupId: userOperationGroups.groupId })
    .from(userOperationGroups)
    .innerJoin(groups, eq(userOperationGroups.groupId, groups.id))
    .where(
      and(
        eq(userOperationGroups.userId, userId),
        eq(groups.costCenterId, costCenterId)
      )
    );
  return rows.map(row => row.groupId);
}

async function hasOperationalCloseGroupCoverage(
  costCenterId: number,
  allowedGroupIds: number[] | null
): Promise<boolean> {
  if (allowedGroupIds === null) return true;
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const requiredGroups = await db
    .select({ id: groups.id })
    .from(groups)
    .where(
      and(
        eq(groups.costCenterId, costCenterId),
        eq(groups.isOperationalAssignmentExempt, 0)
      )
    );

  const allowed = new Set(allowedGroupIds.map(Number));
  return requiredGroups.every((group) => allowed.has(Number(group.id)));
}

async function getCostCenter(costCenterId: number) {
  const db = await getDb();
  if (!db) return null;

  const [row] = await db
    .select({ id: costCenters.id, code: costCenters.code, name: costCenters.name })
    .from(costCenters)
    .where(eq(costCenters.id, costCenterId))
    .limit(1);

  return row || null;
}

type ClosingCenterType = 'tolan' | 'malqa';

function getClosingCenterType(center: { code?: string | null; name: string }): ClosingCenterType | null {
  const code = String(center.code || '').trim().toUpperCase();
  const name = String(center.name || '');
  if (code === 'CC01' || name.includes('تولان')) return 'tolan';
  if (code === 'CC06' || name.includes('الملقا')) return 'malqa';
  return null;
}

async function getOperationalDayRow(workDate: string, costCenterId: number) {
  const db = await getDb();
  if (!db) return null;

  const [row] = await db
    .select()
    .from(operationalDays)
    .where(
      and(
        eq(operationalDays.workDate, workDate),
        eq(operationalDays.costCenterId, costCenterId)
      )
    )
    .limit(1);

  return row || null;
}

async function ensureOperationalDayRow(workDate: string, costCenterId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const center = await getCostCenter(costCenterId);
  if (!center) throw new Error('مركز التكلفة المحدد غير موجود');

  await db
    .insert(operationalDays)
    .values({ workDate, costCenterId, status: 'open', revision: 0 })
    .onDuplicateKeyUpdate({
      set: { workDate, costCenterId },
    });

  const row = await getOperationalDayRow(workDate, costCenterId);
  if (!row) throw new Error('تعذر تهيئة اليوم التشغيلي لمركز التكلفة');
  return row;
}

export async function getOverlappingPayrollBatchesForOperationalDay(
  workDate: string,
  costCenterId: number
) {
  const db = await getDb();
  if (!db) return [];

  // 1) القفل المباشر: أي دفعة تخص نفس مركز التكلفة وتشمل التاريخ.
  const directBatches = await db
    .select({
      id: payrollBatches.id,
      batchCode: payrollBatches.batchCode,
      status: payrollBatches.status,
      periodStart: payrollBatches.periodStart,
      periodEnd: payrollBatches.periodEnd,
      costCenterId: payrollBatches.costCenterId,
    })
    .from(payrollBatches)
    .where(
      and(
        lte(payrollBatches.periodStart, workDate),
        gte(payrollBatches.periodEnd, workDate),
        eq(payrollBatches.costCenterId, costCenterId)
      )
    )
    .orderBy(desc(payrollBatches.createdAt));

  // 2) القفل العابر للمراكز: إذا خرج عامل من هذا المركز بقرار نقل تشغيلي
  //    ودخل فعلياً في بند دفعة مركز الوجهة، فإعادة فتح مركز المصدر قد تجعل
  //    التشغيل يناقض الـPayroll الموجودة. لذلك تعتبر تلك الدفعة قافلة أيضاً.
  const sourceGroupRows = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.costCenterId, costCenterId));

  const sourceGroupIds = new Set(sourceGroupRows.map((row) => row.id));
  if (sourceGroupIds.size === 0) {
    return directBatches.map((batch) => ({
      ...batch,
      lockReason: 'direct' as const,
      linkedWorkers: [] as Array<{ workerId: number; workerCode: string; workerName: string }>,
    }));
  }

  const transferRows = await db
    .select({
      workerId: dailyWorkAssignments.workerId,
      sourceGroupId: dailyWorkAssignments.sourceGroupId,
      operationalGroupId: dailyWorkAssignments.operationalGroupId,
      workerBaseGroupId: workers.groupId,
      workerCode: workers.code,
      workerName: workers.fullName,
    })
    .from(dailyWorkAssignments)
    .innerJoin(workers, eq(dailyWorkAssignments.workerId, workers.id))
    .where(
      and(
        eq(dailyWorkAssignments.workDate, workDate),
        isNotNull(dailyWorkAssignments.operationalGroupId)
      )
    );

  const outgoingTransfers = transferRows.filter((row) => {
    const sourceGroupId = row.sourceGroupId ?? row.workerBaseGroupId;
    return !!sourceGroupId && sourceGroupIds.has(sourceGroupId) && !!row.operationalGroupId;
  });

  if (outgoingTransfers.length === 0) {
    return directBatches.map((batch) => ({
      ...batch,
      lockReason: 'direct' as const,
      linkedWorkers: [] as Array<{ workerId: number; workerCode: string; workerName: string }>,
    }));
  }

  const destinationGroupIds = Array.from(
    new Set(
      outgoingTransfers
        .map((row) => row.operationalGroupId)
        .filter((id): id is number => !!id)
    )
  );

  const destinationGroups = destinationGroupIds.length > 0
    ? await db
        .select({ id: groups.id, costCenterId: groups.costCenterId })
        .from(groups)
        .where(inArray(groups.id, destinationGroupIds))
    : [];

  const destinationCenterByGroup = new Map(
    destinationGroups
      .filter((row): row is { id: number; costCenterId: number } => !!row.costCenterId)
      .map((row) => [row.id, row.costCenterId])
  );

  const crossCenterTransfers = outgoingTransfers.filter((row) => {
    if (!row.operationalGroupId) return false;
    const destinationCostCenterId = destinationCenterByGroup.get(row.operationalGroupId);
    return !!destinationCostCenterId && destinationCostCenterId !== costCenterId;
  });

  if (crossCenterTransfers.length === 0) {
    return directBatches.map((batch) => ({
      ...batch,
      lockReason: 'direct' as const,
      linkedWorkers: [] as Array<{ workerId: number; workerCode: string; workerName: string }>,
    }));
  }

  const transferByWorkerAndGroup = new Map<string, (typeof crossCenterTransfers)[number]>();
  for (const transfer of crossCenterTransfers) {
    transferByWorkerAndGroup.set(
      `${transfer.workerId}:${transfer.operationalGroupId}`,
      transfer
    );
  }
  const transferredWorkerIds = Array.from(new Set(crossCenterTransfers.map((row) => row.workerId)));

  const linkedBatchRows = await db
    .select({
      id: payrollBatches.id,
      batchCode: payrollBatches.batchCode,
      status: payrollBatches.status,
      periodStart: payrollBatches.periodStart,
      periodEnd: payrollBatches.periodEnd,
      costCenterId: payrollBatches.costCenterId,
      workerId: payrollBatchItems.workerId,
      itemGroupId: payrollBatchItems.groupId,
    })
    .from(payrollBatches)
    .innerJoin(payrollBatchItems, eq(payrollBatchItems.batchId, payrollBatches.id))
    .where(
      and(
        lte(payrollBatches.periodStart, workDate),
        gte(payrollBatches.periodEnd, workDate),
        inArray(payrollBatchItems.workerId, transferredWorkerIds)
      )
    )
    .orderBy(desc(payrollBatches.createdAt));

  const linkedByBatchId = new Map<number, any>();

  for (const row of linkedBatchRows) {
    if (!row.itemGroupId) continue;
    const transfer = transferByWorkerAndGroup.get(`${row.workerId}:${row.itemGroupId}`);
    if (!transfer) continue;

    const destinationCostCenterId = destinationCenterByGroup.get(row.itemGroupId);
    if (!destinationCostCenterId || row.costCenterId !== destinationCostCenterId) continue;

    const existing = linkedByBatchId.get(row.id);
    const linkedWorker = {
      workerId: transfer.workerId,
      workerCode: transfer.workerCode,
      workerName: transfer.workerName,
    };

    if (existing) {
      if (!existing.linkedWorkers.some((worker) => worker.workerId === linkedWorker.workerId)) {
        existing.linkedWorkers.push(linkedWorker);
      }
      continue;
    }

    linkedByBatchId.set(row.id, {
      id: row.id,
      batchCode: row.batchCode,
      status: row.status,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      costCenterId: row.costCenterId,
      lockReason: 'transferred_worker',
      linkedWorkers: [linkedWorker],
    });
  }

  const merged = new Map<number, any>();
  for (const batch of directBatches) {
    merged.set(batch.id, {
      ...batch,
      lockReason: 'direct' as const,
      linkedWorkers: [] as Array<{ workerId: number; workerCode: string; workerName: string }>,
    });
  }
  for (const batch of linkedByBatchId.values()) {
    if (!merged.has(batch.id)) merged.set(batch.id, batch);
  }

  return Array.from(merged.values());
}

/**
 * نطاق الإغلاق هو مركز التكلفة الأساسي للعامل (مجموعة العامل الأساسية).
 * النقل إلى مركز آخر لا ينقل مسؤولية إغلاق اليوم؛ مركز المصدر هو الذي اعتمد قرار النقل.
 */
async function getPresentAndUnassignedWorkers(workDate: string, costCenterId: number, allowedGroupIds?: number[] | null) {
  const db = await getDb();
  if (!db) return { presentCount: 0, assignedCount: 0, unassignedWorkers: [] as any[] };
  if (allowedGroupIds && allowedGroupIds.length === 0) {
    return { presentCount: 0, assignedCount: 0, unassignedWorkers: [] as any[] };
  }

  const presentWorkers = await db
    .selectDistinct({
      workerId: workers.id,
      workerCode: workers.code,
      workerName: workers.fullName,
      groupId: workers.groupId,
    })
    .from(attendanceEvents)
    .innerJoin(workers, eq(attendanceEvents.workerId, workers.id))
    .innerJoin(groups, eq(workers.groupId, groups.id))
    .where(
      and(
        eq(attendanceEvents.workDate, workDate),
        eq(attendanceEvents.eventType, 'check_in'),
        eq(groups.costCenterId, costCenterId),
        eq(groups.isOperationalAssignmentExempt, 0),
        ...(allowedGroupIds ? [inArray(groups.id, allowedGroupIds)] : [])
      )
    );

  if (presentWorkers.length === 0) {
    return { presentCount: 0, assignedCount: 0, unassignedWorkers: [] as any[] };
  }

  const workerIds = presentWorkers.map((worker) => worker.workerId);
  const assignments = await db
    .select({ workerId: dailyWorkAssignments.workerId })
    .from(dailyWorkAssignments)
    .where(
      and(
        eq(dailyWorkAssignments.workDate, workDate),
        inArray(dailyWorkAssignments.workerId, workerIds)
      )
    );

  const assignedIds = new Set(assignments.map((row) => row.workerId));
  const unassignedWorkers = presentWorkers.filter((worker) => !assignedIds.has(worker.workerId));

  return {
    presentCount: presentWorkers.length,
    assignedCount: presentWorkers.length - unassignedWorkers.length,
    unassignedWorkers,
  };
}

async function getRevisionAssignmentChanges(
  workDate: string,
  costCenterId: number,
  revision: number,
  allowedGroupIds?: number[] | null
) {
  const db = await getDb();
  if (!db || revision <= 0) return [];
  if (allowedGroupIds && allowedGroupIds.length === 0) return [];

  return await db
    .select({
      id: operationalDayEvents.id,
      workDate: operationalDayEvents.workDate,
      costCenterId: operationalDayEvents.costCenterId,
      revision: operationalDayEvents.revision,
      workerId: operationalDayEvents.workerId,
      workerCode: workers.code,
      workerName: workers.fullName,
      actorUserId: operationalDayEvents.actorUserId,
      actorName: users.fullName,
      beforeValues: operationalDayEvents.beforeValues,
      afterValues: operationalDayEvents.afterValues,
      createdAt: operationalDayEvents.createdAt,
    })
    .from(operationalDayEvents)
    .leftJoin(workers, eq(operationalDayEvents.workerId, workers.id))
    .leftJoin(users, eq(operationalDayEvents.actorUserId, users.id))
    .where(
      and(
        eq(operationalDayEvents.workDate, workDate),
        eq(operationalDayEvents.costCenterId, costCenterId),
        eq(operationalDayEvents.revision, revision),
        eq(operationalDayEvents.eventType, 'assignment_changed'),
        ...(allowedGroupIds ? [inArray(workers.groupId, allowedGroupIds)] : [])
      )
    )
    .orderBy(operationalDayEvents.createdAt, operationalDayEvents.id);
}

function canEditAssignmentsForState(params: {
  role: string;
  workDate: string;
  status: 'open' | 'closed';
  revision: number;
  hasPayrollBatch: boolean;
}) {
  const { role, workDate, status, revision, hasPayrollBatch } = params;
  const currentWorkDate = getCurrentWorkDate();

  if (workDate < OPERATIONAL_DAY_CONTROL_START_DATE) return false;
  if (workDate > currentWorkDate) return false;
  if (status !== 'open') return false;
  if (hasPayrollBatch) return false;

  // بعد إعادة الفتح: التعديل للشؤون الإدارية/السوبر أدمن فقط، والتشغيل يراجع ثم يغلق.
  if (revision > 0) return REOPEN_EDIT_ROLES.has(role);

  // قبل أول إغلاق، يبقى اليوم المفتوح قابلاً للتوزيع بواسطة موظف التشغيل المسؤول
  // حتى لو مر عليه يوم أو أكثر. النطاق ما زال محمياً بمركز التكلفة المسند للمستخدم.
  return CURRENT_DAY_EDIT_ROLES.has(role);
}

export async function getOperationalDayStatus(
  workDateInput: string,
  costCenterId: number,
  role: string,
  userId: number
) {
  const workDate = normalizeDate(workDateInput);
  const currentWorkDate = getCurrentWorkDate();
  await assertOperationalCostCenterAccess(userId, role, costCenterId);
  const allowedGroupIds = await getAllowedOperationalGroupIds(userId, role, costCenterId);
  const hasCloseGroupCoverage = await hasOperationalCloseGroupCoverage(costCenterId, allowedGroupIds);
  const center = await getCostCenter(costCenterId);
  if (!center) throw new Error('مركز التكلفة المحدد غير موجود');

  const row = await getOperationalDayRow(workDate, costCenterId);
  const status = (row?.status || 'open') as 'open' | 'closed';
  const revision = row?.revision || 0;
  const batches = await getOverlappingPayrollBatchesForOperationalDay(workDate, costCenterId);
  const attendance = await getPresentAndUnassignedWorkers(workDate, costCenterId, allowedGroupIds);
  const pendingChanges = status === 'open' && revision > 0
    ? await getRevisionAssignmentChanges(workDate, costCenterId, revision, allowedGroupIds)
    : [];

  const hasPayrollBatch = batches.length > 0;
  const isTracked = workDate >= OPERATIONAL_DAY_CONTROL_START_DATE;

  return {
    workDate,
    costCenterId,
    costCenterName: center.name,
    controlStartDate: OPERATIONAL_DAY_CONTROL_START_DATE,
    currentWorkDate,
    isTracked,
    status,
    revision,
    isReopened: status === 'open' && revision > 0,
    closedBy: row?.closedBy || null,
    closedAt: row?.closedAt || null,
    reopenedBy: row?.reopenedBy || null,
    reopenedAt: row?.reopenedAt || null,
    reopenReason: row?.reopenReason || null,
    presentCount: attendance.presentCount,
    assignedCount: attendance.assignedCount,
    unassignedCount: attendance.unassignedWorkers.length,
    unassignedWorkers: attendance.unassignedWorkers,
    pendingChanges,
    hasPayrollBatch,
    payrollBatches: batches,
    capabilities: {
      canEditAssignments: canEditAssignmentsForState({
        role,
        workDate,
        status,
        revision,
        hasPayrollBatch,
      }),
      canClose:
        isTracked &&
        status === 'open' &&
        workDate <= currentWorkDate &&
        CLOSE_ROLES.has(role) &&
        // المجموعات المستثناة من إلزام التوزيع لا تمنع مشرفًا يغطي جميع المجموعات المطلوبة فعليًا من الإغلاق.
        hasCloseGroupCoverage,
      // الشؤون الإدارية والسوبر أدمن يستطيعان إعادة الفتح؛ موظف التشغيل يراجع ثم يغلق.
      canReopen:
        isTracked &&
        status === 'closed' &&
        REOPEN_EDIT_ROLES.has(role) &&
        !hasPayrollBatch,
    },
  };
}

export async function getOpenOperationalDays(costCenterId: number, role: string, userId: number) {
  const db = await getDb();
  if (!db) return [];

  await assertOperationalCostCenterAccess(userId, role, costCenterId);
  const allowedGroupIds = await getAllowedOperationalGroupIds(userId, role, costCenterId);
  const center = await getCostCenter(costCenterId);
  if (!center) throw new Error('مركز التكلفة المحدد غير موجود');
  if (allowedGroupIds && allowedGroupIds.length === 0) return [];

  const currentWorkDate = getCurrentWorkDate();
  const attendanceDates = await db
    .selectDistinct({ workDate: attendanceEvents.workDate })
    .from(attendanceEvents)
    .innerJoin(workers, eq(attendanceEvents.workerId, workers.id))
    .innerJoin(groups, eq(workers.groupId, groups.id))
    .where(
      and(
        eq(attendanceEvents.eventType, 'check_in'),
        isNotNull(attendanceEvents.workDate),
        eq(groups.costCenterId, costCenterId),
        ...(allowedGroupIds ? [inArray(groups.id, allowedGroupIds)] : []),
        gte(attendanceEvents.workDate, OPERATIONAL_DAY_CONTROL_START_DATE),
        lte(attendanceEvents.workDate, currentWorkDate)
      )
    )
    .orderBy(desc(attendanceEvents.workDate))
    .limit(365);

  const dates = attendanceDates
    .map((row) => row.workDate)
    .filter((date): date is string => !!date);

  if (dates.length === 0) return [];

  const rows = await db
    .select({
      workDate: operationalDays.workDate,
      status: operationalDays.status,
      revision: operationalDays.revision,
      reopenedAt: operationalDays.reopenedAt,
    })
    .from(operationalDays)
    .where(
      and(
        eq(operationalDays.costCenterId, costCenterId),
        inArray(operationalDays.workDate, dates)
      )
    );

  const byDate = new Map(rows.map((row) => [row.workDate, row]));
  return dates
    .map((workDate) => {
      const row = byDate.get(workDate);
      return {
        workDate,
        costCenterId,
        costCenterName: center.name,
        status: row?.status || 'open',
        revision: row?.revision || 0,
        isReopened: (row?.status || 'open') === 'open' && (row?.revision || 0) > 0,
      };
    })
    .filter((row) => row.status !== 'closed');
}

type FinalOperationalRecordType =
  | 'group_called'
  | 'emergency_called'
  | 'games_closed'
  | 'restaurants_closed';

const FINAL_OPERATIONAL_RECORD_TYPES: FinalOperationalRecordType[] = [
  'group_called',
  'emergency_called',
  'games_closed',
  'restaurants_closed',
];

const OPERATIONAL_RECORD_ROLES = new Set([
  'super_admin',
  'supervisor_tolan',
  'supervisor_malqa',
  'restaurant_operations',
]);

function addOneCalendarDay(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * يحول الوقت الذي يدخله المشرف إلى تاريخ/وقت فعلي داخل اليوم التشغيلي 04:40 -> 04:39.
 * 00:00..04:39 تقع في اليوم الميلادي التالي مع بقاء work_date كما هو.
 */
function resolveOperationalEventAt(workDateInput: string, time: string) {
  const workDate = normalizeDate(workDateInput);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error('صيغة الوقت غير صحيحة');
  }
  const calendarDate = time < '04:40' ? addOneCalendarDay(workDate) : workDate;
  return `${calendarDate} ${time}:00`;
}

function getFinalRecordKey(type: FinalOperationalRecordType, groupId?: number | null, workerId?: number | null) {
  if (type === 'group_called') {
    if (!groupId) throw new Error('المجموعة مطلوبة لتسجيل وقت الاستدعاء');
    return `group_called:${groupId}`;
  }
  if (type === 'emergency_called') {
    if (!workerId) throw new Error('العامل مطلوب لتسجيل الاستدعاء الطارئ');
    return `emergency_called:${workerId}`;
  }
  return type;
}

function assertRecordRole(role: string, type: FinalOperationalRecordType) {
  if (!OPERATIONAL_RECORD_ROLES.has(role)) {
    throw new Error('ليس لديك صلاحية تسجيل بيانات اليوم التشغيلي');
  }
  if (type === 'games_closed' && role !== 'supervisor_tolan' && role !== 'super_admin') {
    throw new Error('وقت إغلاق الألعاب يسجله مشرف تولان فقط');
  }
  if (type === 'restaurants_closed' && role !== 'supervisor_malqa' && role !== 'super_admin') {
    throw new Error('وقت إغلاق المطاعم يسجله مشرف الملقا فقط');
  }
}

async function getGroupScope(groupId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({ id: groups.id, name: groups.name, costCenterId: groups.costCenterId, isActive: groups.isActive })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  return row || null;
}

export async function getOperationalGroupWorkers(
  groupId: number,
  actorUserId: number,
  actorRole: string
) {
  const db = await getDb();
  if (!db) return [];

  const group = await getGroupScope(groupId);
  if (!group?.costCenterId) throw new Error('المجموعة المحددة غير مرتبطة بمركز تكلفة');
  await assertOperationalCostCenterAccess(actorUserId, actorRole, group.costCenterId, groupId);

  return await db
    .select({ id: workers.id, code: workers.code, fullName: workers.fullName })
    .from(workers)
    .where(and(eq(workers.groupId, groupId), eq(workers.status, 'active')))
    .orderBy(workers.fullName, workers.code);
}

export async function getOperationalRecordsForDay(
  workDateInput: string,
  costCenterId: number,
  actorUserId: number,
  actorRole: string
) {
  const db = await getDb();
  if (!db) return [];

  const workDate = normalizeDate(workDateInput);
  await assertOperationalCostCenterAccess(actorUserId, actorRole, costCenterId);
  const allowedGroupIds = await getAllowedOperationalGroupIds(actorUserId, actorRole, costCenterId);
  const visibilityCondition = allowedGroupIds === null
    ? inArray(operationalDayEvents.eventType, FINAL_OPERATIONAL_RECORD_TYPES)
    : allowedGroupIds.length > 0
      ? and(
          inArray(operationalDayEvents.eventType, FINAL_OPERATIONAL_RECORD_TYPES),
          or(
            inArray(operationalDayEvents.eventType, ['games_closed', 'restaurants_closed']),
            inArray(operationalDayEvents.groupId, allowedGroupIds)
          )
        )
      : inArray(operationalDayEvents.eventType, ['games_closed', 'restaurants_closed']);

  return await db
    .select({
      id: operationalDayEvents.id,
      workDate: operationalDayEvents.workDate,
      costCenterId: operationalDayEvents.costCenterId,
      eventType: operationalDayEvents.eventType,
      groupId: operationalDayEvents.groupId,
      groupName: groups.name,
      workerId: operationalDayEvents.workerId,
      workerCode: workers.code,
      workerName: workers.fullName,
      eventAt: operationalDayEvents.eventAt,
      note: operationalDayEvents.note,
      actorUserId: operationalDayEvents.actorUserId,
      actorName: users.fullName,
      createdAt: operationalDayEvents.createdAt,
    })
    .from(operationalDayEvents)
    .leftJoin(groups, eq(operationalDayEvents.groupId, groups.id))
    .leftJoin(workers, eq(operationalDayEvents.workerId, workers.id))
    .leftJoin(users, eq(operationalDayEvents.actorUserId, users.id))
    .where(
      and(
        eq(operationalDayEvents.workDate, workDate),
        eq(operationalDayEvents.costCenterId, costCenterId),
        visibilityCondition
      )
    )
    .orderBy(operationalDayEvents.createdAt, operationalDayEvents.id);
}

export async function createFinalOperationalRecord(params: {
  workDate: string;
  costCenterId: number;
  type: FinalOperationalRecordType;
  time: string;
  actorUserId: number;
  actorRole: string;
  groupId?: number | null;
  workerId?: number | null;
  note?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const workDate = normalizeDate(params.workDate);
  const currentWorkDate = getCurrentWorkDate();
  assertRecordRole(params.actorRole, params.type);
  await assertOperationalCostCenterAccess(params.actorUserId, params.actorRole, params.costCenterId);

  if (params.type === 'games_closed' || params.type === 'restaurants_closed') {
    const center = await getCostCenter(params.costCenterId);
    if (!center) throw new Error('مركز التكلفة المحدد غير موجود');
    const closingCenterType = getClosingCenterType(center);
    if (params.type === 'games_closed' && closingCenterType !== 'tolan') {
      throw new Error('إغلاق الحديقة متاح لمركز تولان فقط');
    }
    if (params.type === 'restaurants_closed' && closingCenterType !== 'malqa') {
      throw new Error('إغلاق المطاعم متاح لمركز الملقا فقط');
    }
  }

  if (workDate < OPERATIONAL_DAY_CONTROL_START_DATE) {
    throw new Error('هذا التاريخ يسبق بدء تطبيق دورة اليوم التشغيلي');
  }
  if (workDate > currentWorkDate) {
    throw new Error('لا يمكن تسجيل بيانات ليوم تشغيلي مستقبلي');
  }

  let group = null as Awaited<ReturnType<typeof getGroupScope>>;
  if (params.groupId) {
    group = await getGroupScope(params.groupId);
    if (!group) throw new Error('المجموعة المحددة غير موجودة');
    if (!group.costCenterId || group.costCenterId !== params.costCenterId) {
      throw new Error('المجموعة لا تتبع مركز التكلفة المحدد');
    }
    if (!group.isActive) throw new Error('المجموعة المحددة غير نشطة');
    await assertOperationalCostCenterAccess(
      params.actorUserId,
      params.actorRole,
      params.costCenterId,
      params.groupId
    );
  }

  if (params.type === 'group_called' && !params.groupId) {
    throw new Error('المجموعة مطلوبة لتسجيل وقت الاستدعاء');
  }

  if (params.type === 'emergency_called') {
    if (!params.groupId || !params.workerId) {
      throw new Error('المجموعة والعامل مطلوبان للاستدعاء الطارئ');
    }
    const [worker] = await db
      .select({ id: workers.id, groupId: workers.groupId, status: workers.status })
      .from(workers)
      .where(eq(workers.id, params.workerId))
      .limit(1);
    if (!worker || worker.groupId !== params.groupId) {
      throw new Error('العامل لا ينتمي إلى المجموعة المحددة');
    }
    if (worker.status !== 'active') throw new Error('العامل المحدد غير نشط');
    if (!params.note?.trim()) throw new Error('سبب الاستدعاء الطارئ مطلوب');
  }

  const eventKey = getFinalRecordKey(params.type, params.groupId, params.workerId);
  const [existing] = await db
    .select({ id: operationalDayEvents.id })
    .from(operationalDayEvents)
    .where(
      and(
        eq(operationalDayEvents.workDate, workDate),
        eq(operationalDayEvents.costCenterId, params.costCenterId),
        eq(operationalDayEvents.eventKey, eventKey)
      )
    )
    .limit(1);
  if (existing) {
    throw new Error('تم تثبيت هذا السجل مسبقاً ولا يمكن تعديله أو تسجيله مرة أخرى');
  }

  const eventAt = resolveOperationalEventAt(workDate, params.time);
  const insertResult = await db.insert(operationalDayEvents).values({
    workDate,
    costCenterId: params.costCenterId,
    eventType: params.type,
    eventKey,
    groupId: params.groupId || null,
    workerId: params.workerId || null,
    actorUserId: params.actorUserId,
    eventAt,
    note: params.note?.trim() || null,
  });

  return {
    id: Number((insertResult as any)[0]?.insertId ?? (insertResult as any).insertId) || null,
    workDate,
    costCenterId: params.costCenterId,
    type: params.type,
    groupId: params.groupId || null,
    workerId: params.workerId || null,
    eventAt,
    note: params.note?.trim() || null,
  };
}

export async function getOperationalRecordsReport(params: {
  startDate: string;
  endDate: string;
  actorUserId: number;
  actorRole: string;
  costCenterId?: number;
  groupId?: number;
  type?: FinalOperationalRecordType;
}) {
  const db = await getDb();
  if (!db) return [];

  const startDate = normalizeDate(params.startDate);
  const endDate = normalizeDate(params.endDate);
  if (startDate > endDate) throw new Error('تاريخ البداية يجب أن يسبق تاريخ النهاية');

  const conditions: any[] = [
    gte(operationalDayEvents.workDate, startDate),
    lte(operationalDayEvents.workDate, endDate),
    params.type
      ? eq(operationalDayEvents.eventType, params.type)
      : inArray(operationalDayEvents.eventType, FINAL_OPERATIONAL_RECORD_TYPES),
  ];

  if (params.groupId) {
    conditions.push(
      or(
        eq(operationalDayEvents.groupId, params.groupId),
        inArray(operationalDayEvents.eventType, ['games_closed', 'restaurants_closed'])
      )
    );
  }

  if (SCOPED_OPERATIONS_ROLES.has(params.actorRole)) {
    const scopeRows = await db
      .select({ costCenterId: userCostCenters.costCenterId })
      .from(userCostCenters)
      .where(eq(userCostCenters.userId, params.actorUserId));
    const allowedCenterIds = scopeRows.map(row => row.costCenterId);
    if (allowedCenterIds.length === 0) return [];

    if (params.groupId) {
      const group = await getGroupScope(params.groupId);
      if (!group?.costCenterId) throw new Error('المجموعة المحددة غير مرتبطة بمركز تكلفة');
      await assertOperationalCostCenterAccess(
        params.actorUserId,
        params.actorRole,
        group.costCenterId,
        params.groupId
      );
    }

    const centersToShow = params.costCenterId ? [params.costCenterId] : allowedCenterIds;
    if (params.costCenterId && !allowedCenterIds.includes(params.costCenterId)) {
      throw new Error('ليس لديك صلاحية استعراض هذا المركز');
    }

    const centerVisibility: any[] = [];
    for (const centerId of centersToShow) {
      const allowedGroupIds = await getAllowedOperationalGroupIds(
        params.actorUserId,
        params.actorRole,
        centerId
      );
      if (allowedGroupIds === null) {
        centerVisibility.push(eq(operationalDayEvents.costCenterId, centerId));
      } else if (allowedGroupIds.length > 0) {
        centerVisibility.push(
          and(
            eq(operationalDayEvents.costCenterId, centerId),
            or(
              inArray(operationalDayEvents.eventType, ['games_closed', 'restaurants_closed']),
              inArray(operationalDayEvents.groupId, allowedGroupIds)
            )
          )
        );
      } else {
        centerVisibility.push(
          and(
            eq(operationalDayEvents.costCenterId, centerId),
            inArray(operationalDayEvents.eventType, ['games_closed', 'restaurants_closed'])
          )
        );
      }
    }
    if (centerVisibility.length === 0) return [];
    conditions.push(or(...centerVisibility));
  } else if (params.costCenterId) {
    conditions.push(eq(operationalDayEvents.costCenterId, params.costCenterId));
  }

  return await db
    .select({
      id: operationalDayEvents.id,
      workDate: operationalDayEvents.workDate,
      costCenterId: operationalDayEvents.costCenterId,
      costCenterName: costCenters.name,
      eventType: operationalDayEvents.eventType,
      groupId: operationalDayEvents.groupId,
      groupName: groups.name,
      workerId: operationalDayEvents.workerId,
      workerCode: workers.code,
      workerName: workers.fullName,
      eventAt: operationalDayEvents.eventAt,
      note: operationalDayEvents.note,
      actorUserId: operationalDayEvents.actorUserId,
      actorName: users.fullName,
      createdAt: operationalDayEvents.createdAt,
    })
    .from(operationalDayEvents)
    .leftJoin(costCenters, eq(operationalDayEvents.costCenterId, costCenters.id))
    .leftJoin(groups, eq(operationalDayEvents.groupId, groups.id))
    .leftJoin(workers, eq(operationalDayEvents.workerId, workers.id))
    .leftJoin(users, eq(operationalDayEvents.actorUserId, users.id))
    .where(and(...conditions))
    .orderBy(desc(operationalDayEvents.workDate), desc(operationalDayEvents.eventAt), desc(operationalDayEvents.id));
}

export async function closeOperationalDay(params: {
  workDate: string;
  costCenterId: number;
  actorUserId: number;
  actorRole: string;
  acknowledgeChanges?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const workDate = normalizeDate(params.workDate);
  const currentWorkDate = getCurrentWorkDate();

  if (!CLOSE_ROLES.has(params.actorRole)) {
    throw new Error('إغلاق اليوم التشغيلي متاح فقط للأدمن أو المالك أو موظف التشغيل');
  }
  if (workDate < OPERATIONAL_DAY_CONTROL_START_DATE) {
    throw new Error('هذا التاريخ يسبق بدء تطبيق دورة إغلاق اليوم التشغيلي');
  }
  if (workDate > currentWorkDate) {
    throw new Error('لا يمكن إغلاق يوم تشغيلي مستقبلي');
  }

  await assertOperationalCostCenterAccess(params.actorUserId, params.actorRole, params.costCenterId);
  const allowedGroupIds = await getAllowedOperationalGroupIds(
    params.actorUserId,
    params.actorRole,
    params.costCenterId
  );
  const hasCloseGroupCoverage = await hasOperationalCloseGroupCoverage(
    params.costCenterId,
    allowedGroupIds
  );
  if (!hasCloseGroupCoverage) {
    throw new Error('لا يمكن إغلاق اليوم التشغيلي لأن صلاحية المشرف لا تشمل جميع المجموعات المطلوبة للتوزيع في المركز');
  }
  const center = await getCostCenter(params.costCenterId);
  if (!center) throw new Error('مركز التكلفة المحدد غير موجود');

  const day = await ensureOperationalDayRow(workDate, params.costCenterId);
  if (day.status === 'closed') {
    return { success: true, alreadyClosed: true };
  }

  const attendance = await getPresentAndUnassignedWorkers(workDate, params.costCenterId);
  if (attendance.unassignedWorkers.length > 0) {
    const preview = attendance.unassignedWorkers
      .slice(0, 10)
      .map((worker) => `${worker.workerName} (${worker.workerCode})`)
      .join('، ');
    const rest = attendance.unassignedWorkers.length > 10
      ? `، و${attendance.unassignedWorkers.length - 10} عامل آخر`
      : '';
    throw new Error(
      `لا يمكن إغلاق اليوم التشغيلي لمركز ${center.name}. يوجد ${attendance.unassignedWorkers.length} عامل حاضر بدون موقع تشغيل: ${preview}${rest}`
    );
  }

  const pendingChanges = day.revision > 0
    ? await getRevisionAssignmentChanges(workDate, params.costCenterId, day.revision)
    : [];

  if (pendingChanges.length > 0 && !params.acknowledgeChanges) {
    throw new Error('توجد تعديلات إدارية بعد إعادة فتح اليوم. يجب مراجعتها قبل الإغلاق');
  }

  await db
    .update(operationalDays)
    .set({
      status: 'closed',
      closedBy: params.actorUserId,
      closedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(operationalDays.id, day.id));

  await db.insert(operationalDayEvents).values({
    workDate,
    costCenterId: params.costCenterId,
    eventType: 'closed',
    revision: day.revision,
    actorUserId: params.actorUserId,
    note: pendingChanges.length > 0
      ? `تم إغلاق مركز ${center.name} بعد مراجعة ${pendingChanges.length} تعديل تشغيلي`
      : `تم إغلاق اليوم التشغيلي لمركز ${center.name}`,
  });

  return {
    success: true,
    reviewedChanges: pendingChanges.length,
    presentCount: attendance.presentCount,
    costCenterId: params.costCenterId,
    costCenterName: center.name,
  };
}

export async function reopenOperationalDay(params: {
  workDate: string;
  costCenterId: number;
  actorUserId: number;
  actorRole: string;
  reason: string;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const workDate = normalizeDate(params.workDate);
  if (!REOPEN_EDIT_ROLES.has(params.actorRole)) {
    throw new Error('إعادة فتح اليوم التشغيلي متاحة للشؤون الإدارية أو السوبر أدمن فقط');
  }
  if (workDate < OPERATIONAL_DAY_CONTROL_START_DATE) {
    throw new Error('هذا التاريخ يسبق بدء تطبيق دورة إغلاق اليوم التشغيلي');
  }

  const center = await getCostCenter(params.costCenterId);
  if (!center) throw new Error('مركز التكلفة المحدد غير موجود');

  const day = await getOperationalDayRow(workDate, params.costCenterId);
  if (!day || day.status !== 'closed') {
    throw new Error(`اليوم التشغيلي لمركز ${center.name} غير مغلق حالياً`);
  }

  const batches = await getOverlappingPayrollBatchesForOperationalDay(workDate, params.costCenterId);
  if (batches.length > 0) {
    const protectedBatch = batches.find((batch) => batch.status === 'approved' || batch.status === 'paid');
    if (protectedBatch) {
      throw new Error(
        `لا يمكن إعادة فتح اليوم التشغيلي لمركز ${center.name} لأن الدفعة ${protectedBatch.batchCode} حالتها ${protectedBatch.status}. الدفعات المعتمدة أو المدفوعة تاريخ مالي محفوظ ولا يسمح بتعديل أيامها التشغيلية.`
      );
    }

    const codes = batches.slice(0, 5).map((batch) => `${batch.batchCode} (${batch.status})`).join('، ');
    throw new Error(
      `لا يمكن إعادة فتح اليوم التشغيلي لمركز ${center.name} لوجود دفعة رواتب تشمل هذا التاريخ: ${codes}. احذف مسودة/دفعة الرواتب أولاً ثم أعد فتح اليوم للتعديل.`
    );
  }

  const reason = params.reason.trim();
  if (!reason) throw new Error('سبب إعادة فتح اليوم التشغيلي مطلوب');

  const nextRevision = (day.revision || 0) + 1;
  await db
    .update(operationalDays)
    .set({
      status: 'open',
      revision: nextRevision,
      reopenedBy: params.actorUserId,
      reopenedAt: sql`CURRENT_TIMESTAMP`,
      reopenReason: reason,
    })
    .where(eq(operationalDays.id, day.id));

  await db.insert(operationalDayEvents).values({
    workDate,
    costCenterId: params.costCenterId,
    eventType: 'reopened',
    revision: nextRevision,
    actorUserId: params.actorUserId,
    note: reason,
  });

  return { success: true, revision: nextRevision, costCenterId: params.costCenterId };
}

export async function assertOperationalAssignmentChangeAllowed(params: {
  workDate: string;
  costCenterId: number;
  actorUserId: number;
  actorRole: string;
  groupId?: number;
}) {
  const workDate = normalizeDate(params.workDate);
  const currentWorkDate = getCurrentWorkDate();

  await assertOperationalCostCenterAccess(
    params.actorUserId,
    params.actorRole,
    params.costCenterId,
    params.groupId
  );

  if (workDate > currentWorkDate) {
    throw new Error('لا يمكن تعديل توزيع يوم تشغيلي مستقبلي');
  }

  // للأيام التاريخية قبل تفعيل الميزة نحافظ على السلوك القديم: لا تعديل للأيام السابقة.
  if (workDate < OPERATIONAL_DAY_CONTROL_START_DATE) {
    if (workDate !== currentWorkDate) {
      throw new Error(`اليوم التشغيلي ${workDate} تاريخي ومقفل للتعديل`);
    }
  }

  const row = await getOperationalDayRow(workDate, params.costCenterId);
  const status = (row?.status || 'open') as 'open' | 'closed';
  const revision = row?.revision || 0;

  if (status === 'closed') {
    throw new Error('اليوم التشغيلي لهذا المركز مغلق. يجب على الشؤون الإدارية إعادة فتحه قبل أي تعديل');
  }

  const batches = await getOverlappingPayrollBatchesForOperationalDay(workDate, params.costCenterId);
  if (batches.length > 0) {
    const protectedBatch = batches.find((batch) => batch.status === 'approved' || batch.status === 'paid');
    if (protectedBatch) {
      throw new Error(
        `لا يمكن تعديل توزيع هذا المركز في هذا اليوم لأن الدفعة ${protectedBatch.batchCode} معتمدة/مدفوعة ولا يسمح بتغيير تاريخها التشغيلي.`
      );
    }
    const codes = batches.slice(0, 5).map((batch) => batch.batchCode).join('، ');
    throw new Error(`لا يمكن تعديل توزيع هذا المركز في هذا اليوم لوجود دفعة رواتب (${codes}). احذف الدفعة أولاً ثم عدّل اليوم التشغيلي.`);
  }

  if (revision > 0) {
    if (!REOPEN_EDIT_ROLES.has(params.actorRole)) {
      throw new Error('اليوم أعيد فتحه للتصحيح. التعديل متاح للشؤون الإدارية أو السوبر أدمن فقط حتى يعيد موظف التشغيل إغلاقه');
    }
    return { revision, isReopened: true };
  }

  // اليوم المفتوح الذي لم يُغلق سابقاً يظل قابلاً للتعديل بواسطة موظف التشغيل المسؤول
  // حتى لو أصبح يوماً سابقاً. الأيام المعاد فتحها عولجت أعلاه وتبقى للإدارة فقط.
  if (!CURRENT_DAY_EDIT_ROLES.has(params.actorRole)) {
    throw new Error('ليس لديك صلاحية تعديل توزيع العمال في اليوم التشغيلي');
  }

  return { revision: 0, isReopened: false };
}

export async function recordOperationalAssignmentChange(params: {
  workDate: string;
  costCenterId: number;
  workerId: number;
  actorUserId: number;
  beforeValues: Record<string, unknown> | null;
  afterValues: Record<string, unknown> | null;
}) {
  const db = await getDb();
  if (!db) return;

  const workDate = normalizeDate(params.workDate);
  const day = await getOperationalDayRow(workDate, params.costCenterId);
  if (!day || day.status !== 'open' || (day.revision || 0) <= 0) return;

  await db.insert(operationalDayEvents).values({
    workDate,
    costCenterId: params.costCenterId,
    eventType: 'assignment_changed',
    revision: day.revision,
    workerId: params.workerId,
    actorUserId: params.actorUserId,
    beforeValues: params.beforeValues as any,
    afterValues: params.afterValues as any,
  });
}

/**
 * شرط إنشاء Payroll: الإغلاق تشغيلياً مستقل لكل مركز تكلفة.
 * عند وجود costCenterId في الدفعة، نفحص أيام الحضور لذلك المركز فقط.
 * وإذا كانت الدفعة بلا مركز محدد، نفحص جميع المراكز التي لديها حضور فعلي داخل الفترة.
 */
export async function getUnclosedOperationalDaysForPayroll(
  periodStartInput: string,
  periodEndInput: string,
  costCenterId?: number | null
) {
  const db = await getDb();
  if (!db) return [];

  const periodStart = normalizeDate(periodStartInput);
  const periodEnd = normalizeDate(periodEndInput);
  const guardedStart = periodStart > OPERATIONAL_DAY_CONTROL_START_DATE
    ? periodStart
    : OPERATIONAL_DAY_CONTROL_START_DATE;

  if (guardedStart > periodEnd) return [];

  const attendanceConditions = [
    eq(attendanceEvents.eventType, 'check_in'),
    isNotNull(attendanceEvents.workDate),
    gte(attendanceEvents.workDate, guardedStart),
    lte(attendanceEvents.workDate, periodEnd),
  ];
  if (costCenterId) {
    attendanceConditions.push(eq(groups.costCenterId, costCenterId));
  }

  const attendanceScopes = await db
    .selectDistinct({
      workDate: attendanceEvents.workDate,
      costCenterId: groups.costCenterId,
      costCenterName: costCenters.name,
    })
    .from(attendanceEvents)
    .innerJoin(workers, eq(attendanceEvents.workerId, workers.id))
    .innerJoin(groups, eq(workers.groupId, groups.id))
    .leftJoin(costCenters, eq(groups.costCenterId, costCenters.id))
    .where(and(...attendanceConditions))
    .orderBy(attendanceEvents.workDate);

  const scopes = attendanceScopes.filter(
    (row): row is { workDate: string; costCenterId: number; costCenterName: string | null } =>
      !!row.workDate && !!row.costCenterId
  );
  if (scopes.length === 0) return [];

  const dates = Array.from(new Set(scopes.map((row) => row.workDate)));
  const centerIds = Array.from(new Set(scopes.map((row) => row.costCenterId)));
  const rows = await db
    .select({
      workDate: operationalDays.workDate,
      costCenterId: operationalDays.costCenterId,
      status: operationalDays.status,
    })
    .from(operationalDays)
    .where(
      and(
        inArray(operationalDays.workDate, dates),
        inArray(operationalDays.costCenterId, centerIds)
      )
    );

  const statusByScope = new Map(
    rows.map((row) => [`${row.workDate}:${row.costCenterId}`, row.status])
  );

  return scopes
    .filter((row) => statusByScope.get(`${row.workDate}:${row.costCenterId}`) !== 'closed')
    .map((row) => ({
      workDate: row.workDate,
      costCenterId: row.costCenterId,
      costCenterName: row.costCenterName || `#${row.costCenterId}`,
    }));
}
