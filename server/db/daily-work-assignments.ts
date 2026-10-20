import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { getAdministrativeWorkDate } from '../attendance-logic';
import {
  attendanceEvents,
  costCenters,
  dailyWorkAssignments,
  groups,
  restaurants,
  workers,
} from '../../drizzle/schema';
import { getDb } from './connection';
import { processAttendanceToFinance } from './daily-finance';
import { logAudit } from './audit';
import { getUserOperationScope } from './user-cost-centers';
import {
  assertOperationalAssignmentChangeAllowed,
  assertOperationalCostCenterAccess,
  recordOperationalAssignmentChange,
} from './operational-days';

// ============================================
// التشغيل - قرارات العمل اليومية
// ============================================

export function getCurrentOperationalWorkDate() {
  return getAdministrativeWorkDate(new Date());
}


const SCOPED_OPERATIONS_ROLES = new Set([
  'supervisor_tolan',
  'supervisor_malqa',
  'restaurant_operations',
]);

/**
 * ملخص سريع لبطاقات المجموعات في شاشة التشغيل.
 * يحسب الحاضرين فعلياً ومن تم توزيعهم، مع احترام نطاق مجموعات موظف التشغيل.
 */
export async function getGroupAssignmentProgressForCostCenterDate(
  costCenterId: number,
  workDate: string,
  actorUserId: number,
  actorRole: string
) {
  const db = await getDb();
  if (!db) return [];

  await assertOperationalCostCenterAccess(actorUserId, actorRole, costCenterId);

  let groupRows = await db
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .where(
      and(
        eq(groups.costCenterId, costCenterId),
        eq(groups.isActive, 1),
        eq(groups.isOperationalAssignmentExempt, 0)
      )
    )
    .orderBy(groups.name);

  if (SCOPED_OPERATIONS_ROLES.has(actorRole)) {
    const scopes = await getUserOperationScope(actorUserId);
    const scope = scopes.find((row: any) => Number(row.costCenterId) === Number(costCenterId));
    if (!scope) return [];
    if (!scope.allGroups) {
      const allowed = new Set((scope.groupIds || []).map(Number));
      groupRows = groupRows.filter((group) => allowed.has(Number(group.id)));
    }
  }

  if (groupRows.length === 0) return [];

  const groupIds = groupRows.map((group) => group.id);
  const workerRows = await db
    .select({ id: workers.id, groupId: workers.groupId })
    .from(workers)
    .where(inArray(workers.groupId, groupIds));

  const presentByGroup = new Map<number, number>();
  const assignedByGroup = new Map<number, number>();

  if (workerRows.length > 0) {
    const workerIds = workerRows.map((worker) => worker.id);
    const presentEvents = await db
      .select({ workerId: attendanceEvents.workerId })
      .from(attendanceEvents)
      .where(
        and(
          inArray(attendanceEvents.workerId, workerIds),
          eq(attendanceEvents.workDate, workDate),
          eq(attendanceEvents.eventType, 'check_in')
        )
      );

    const presentWorkerIds = new Set(presentEvents.map((event) => event.workerId));
    const presentWorkers = workerRows.filter((worker) => presentWorkerIds.has(worker.id));

    for (const worker of presentWorkers) {
      if (!worker.groupId) continue;
      presentByGroup.set(worker.groupId, (presentByGroup.get(worker.groupId) || 0) + 1);
    }

    if (presentWorkers.length > 0) {
      const assignments = await db
        .select({
          workerId: dailyWorkAssignments.workerId,
          restaurantId: dailyWorkAssignments.restaurantId,
        })
        .from(dailyWorkAssignments)
        .where(
          and(
            inArray(dailyWorkAssignments.workerId, presentWorkers.map((worker) => worker.id)),
            eq(dailyWorkAssignments.workDate, workDate)
          )
        );

      const assignedWorkerIds = new Set(
        assignments.filter((assignment) => !!assignment.restaurantId).map((assignment) => assignment.workerId)
      );

      for (const worker of presentWorkers) {
        if (!worker.groupId || !assignedWorkerIds.has(worker.id)) continue;
        assignedByGroup.set(worker.groupId, (assignedByGroup.get(worker.groupId) || 0) + 1);
      }
    }
  }

  return groupRows.map((group) => {
    const total = presentByGroup.get(group.id) || 0;
    const assigned = assignedByGroup.get(group.id) || 0;
    return {
      groupId: group.id,
      groupName: group.name,
      total,
      assigned,
      unassigned: Math.max(total - assigned, 0),
      completed: total > 0 && assigned >= total,
    };
  });
}

/**
 * عمال المجموعة الحاضرون فعلياً في اليوم التشغيلي، مع قرار التشغيل الحالي لكل عامل.
 * لا نغير سلوك الصفحة الأساسي: الحضور check_in شرط للظهور.
 */
export async function getWorkersWithAssignmentForGroupDate(
  groupId: number,
  workDate: string,
  actorUserId: number,
  actorRole: string
) {
  const db = await getDb();
  if (!db) return [];

  const [groupScope] = await db
    .select({
      costCenterId: groups.costCenterId,
      isOperationalAssignmentExempt: groups.isOperationalAssignmentExempt,
    })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  if (!groupScope) throw new Error('المجموعة المحددة غير موجودة');
  if (!groupScope.costCenterId) throw new Error('المجموعة المحددة غير مرتبطة بمركز تكلفة');
  await assertOperationalCostCenterAccess(actorUserId, actorRole, groupScope.costCenterId, groupId);
  if (SCOPED_OPERATIONS_ROLES.has(actorRole) && groupScope.isOperationalAssignmentExempt) {
    return [];
  }

  const groupWorkers = await db
    .select({ id: workers.id, fullName: workers.fullName, code: workers.code, groupId: workers.groupId })
    .from(workers)
    .where(eq(workers.groupId, groupId))
    .orderBy(workers.fullName);

  if (groupWorkers.length === 0) return [];

  const allWorkerIds = groupWorkers.map((w) => w.id);
  const presentEvents = await db
    .select({ workerId: attendanceEvents.workerId })
    .from(attendanceEvents)
    .where(
      and(
        inArray(attendanceEvents.workerId, allWorkerIds),
        eq(attendanceEvents.workDate, workDate),
        eq(attendanceEvents.eventType, 'check_in')
      )
    );

  const presentWorkerIds = new Set(presentEvents.map((e) => e.workerId));
  const presentGroupWorkers = groupWorkers.filter((w) => presentWorkerIds.has(w.id));
  if (presentGroupWorkers.length === 0) return [];

  const workerIds = presentGroupWorkers.map((w) => w.id);
  const existingAssignments = await db
    .select({
      workerId: dailyWorkAssignments.workerId,
      restaurantId: dailyWorkAssignments.restaurantId,
      restaurantName: restaurants.name,
      siteCostCenterId: restaurants.costCenterId,
      siteCostCenterName: costCenters.name,
      sourceGroupId: dailyWorkAssignments.sourceGroupId,
      operationalGroupId: dailyWorkAssignments.operationalGroupId,
    })
    .from(dailyWorkAssignments)
    .leftJoin(restaurants, eq(dailyWorkAssignments.restaurantId, restaurants.id))
    .leftJoin(costCenters, eq(restaurants.costCenterId, costCenters.id))
    .where(
      and(
        inArray(dailyWorkAssignments.workerId, workerIds),
        eq(dailyWorkAssignments.workDate, workDate)
      )
    );

  const assignmentByWorker = new Map(existingAssignments.map((a) => [a.workerId, a]));

  return presentGroupWorkers.map((worker) => {
    const assignment = assignmentByWorker.get(worker.id);
    return {
      ...worker,
      currentRestaurantId: assignment?.restaurantId || null,
      currentRestaurantName: assignment?.restaurantName || null,
      siteCostCenterId: assignment?.siteCostCenterId || null,
      siteCostCenterName: assignment?.siteCostCenterName || null,
      sourceGroupId: assignment?.sourceGroupId || worker.groupId || groupId,
      operationalGroupId: assignment?.operationalGroupId || null,
    };
  });
}

async function getDailyAssignmentSnapshot(workerId: number, workDate: string) {
  const db = await getDb();
  if (!db) return null;

  const [assignment] = await db
    .select({
      restaurantId: dailyWorkAssignments.restaurantId,
      restaurantName: restaurants.name,
      siteCostCenterId: restaurants.costCenterId,
      siteCostCenterName: costCenters.name,
      sourceGroupId: dailyWorkAssignments.sourceGroupId,
      operationalGroupId: dailyWorkAssignments.operationalGroupId,
    })
    .from(dailyWorkAssignments)
    .leftJoin(restaurants, eq(dailyWorkAssignments.restaurantId, restaurants.id))
    .leftJoin(costCenters, eq(restaurants.costCenterId, costCenters.id))
    .where(
      and(
        eq(dailyWorkAssignments.workerId, workerId),
        eq(dailyWorkAssignments.workDate, workDate)
      )
    )
    .limit(1);

  if (!assignment) return null;

  const groupIds = [assignment.sourceGroupId, assignment.operationalGroupId]
    .filter((id): id is number => !!id);
  const groupRows = groupIds.length
    ? await db
        .select({
          id: groups.id,
          name: groups.name,
          costCenterId: groups.costCenterId,
          costCenterName: costCenters.name,
        })
        .from(groups)
        .leftJoin(costCenters, eq(groups.costCenterId, costCenters.id))
        .where(inArray(groups.id, groupIds))
    : [];

  const groupById = new Map(groupRows.map((row) => [row.id, row]));
  const sourceGroup = assignment.sourceGroupId ? groupById.get(assignment.sourceGroupId) : undefined;
  const operationalGroup = assignment.operationalGroupId
    ? groupById.get(assignment.operationalGroupId)
    : undefined;
  const effectiveGroup = operationalGroup || sourceGroup;

  return {
    restaurantId: assignment.restaurantId,
    restaurantName: assignment.restaurantName || null,
    sourceGroupId: assignment.sourceGroupId || null,
    sourceGroupName: sourceGroup?.name || null,
    operationalGroupId: assignment.operationalGroupId || null,
    operationalGroupName: operationalGroup?.name || null,
    effectiveGroupId: effectiveGroup?.id || null,
    effectiveGroupName: effectiveGroup?.name || null,
    effectiveCostCenterId: effectiveGroup?.costCenterId || assignment.siteCostCenterId || null,
    effectiveCostCenterName: effectiveGroup?.costCenterName || assignment.siteCostCenterName || null,
    siteCostCenterId: assignment.siteCostCenterId || null,
    siteCostCenterName: assignment.siteCostCenterName || null,
  };
}

/**
 * حفظ قرار تشغيل العامل في يوم مفتوح.
 * الموقع والمجموعة يجب أن يكونا متسقين مع مركز التكلفة.
 * عند النقل التشغيلي، operationalGroupId هو المجموعة المالية/التشغيلية الفعالة لذلك اليوم.
 */
export async function upsertDailyWorkAssignment(params: {
  workerId: number;
  restaurantId?: number | null;
  sourceGroupId: number;
  operationalGroupId?: number | null;
  workDate: string;
  assignedBy: number;
  actorRole: string;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const [worker] = await db
    .select({ id: workers.id, groupId: workers.groupId })
    .from(workers)
    .where(eq(workers.id, params.workerId))
    .limit(1);
  if (!worker) throw new Error('العامل غير موجود');
  if (worker.groupId !== params.sourceGroupId) {
    throw new Error('العامل لا ينتمي إلى المجموعة المحددة حالياً');
  }

  const [sourceGroup] = await db
    .select({ id: groups.id, costCenterId: groups.costCenterId })
    .from(groups)
    .where(eq(groups.id, params.sourceGroupId))
    .limit(1);
  if (!sourceGroup) throw new Error('المجموعة الأساسية المحددة غير موجودة');
  if (!sourceGroup.costCenterId) throw new Error('يجب ربط المجموعة الأساسية بمركز تكلفة قبل توزيع العامل');

  const access = await assertOperationalAssignmentChangeAllowed({
    workDate: params.workDate,
    costCenterId: sourceGroup.costCenterId,
    actorUserId: params.assignedBy,
    actorRole: params.actorRole,
    groupId: params.sourceGroupId,
  });
  const beforeSnapshot = access.isReopened
    ? await getDailyAssignmentSnapshot(params.workerId, params.workDate)
    : null;

  const [present] = await db
    .select({ workerId: attendanceEvents.workerId })
    .from(attendanceEvents)
    .where(
      and(
        eq(attendanceEvents.workerId, params.workerId),
        eq(attendanceEvents.workDate, params.workDate),
        eq(attendanceEvents.eventType, 'check_in')
      )
    )
    .limit(1);
  if (!present) throw new Error('لا يمكن توزيع عامل غير حاضر في اليوم التشغيلي');

  const existing = await db
    .select({
      id: dailyWorkAssignments.id,
      restaurantId: dailyWorkAssignments.restaurantId,
      sourceGroupId: dailyWorkAssignments.sourceGroupId,
      operationalGroupId: dailyWorkAssignments.operationalGroupId,
    })
    .from(dailyWorkAssignments)
    .where(
      and(
        eq(dailyWorkAssignments.workerId, params.workerId),
        eq(dailyWorkAssignments.workDate, params.workDate)
      )
    )
    .limit(1);

  // إزالة الموقع تعني إلغاء قرار التشغيل بالكامل لهذا اليوم، بما فيه نقل المجموعة.
  if (!params.restaurantId) {
    if (existing.length) {
      const hadOperationalTransfer = !!existing[0].operationalGroupId;
      await db.delete(dailyWorkAssignments).where(eq(dailyWorkAssignments.id, existing[0].id));

      // إذا ألغينا نقلاً فعلياً بين المجموعات، أعد احتساب المالية على المجموعة الفعالة الجديدة.
      if (hadOperationalTransfer) {
        await processAttendanceToFinance(params.workerId, params.workDate);
      }

      await logAudit({
        userId: params.assignedBy,
        action: 'DELETE_OPERATIONAL_ASSIGNMENT',
        tableName: 'daily_work_assignments',
        recordId: existing[0].id,
        oldValues: {
          workerId: params.workerId,
          workDate: params.workDate,
          restaurantId: existing[0].restaurantId,
          sourceGroupId: existing[0].sourceGroupId,
          operationalGroupId: existing[0].operationalGroupId,
        },
        newValues: { workerId: params.workerId, workDate: params.workDate, removed: true },
      });
    }
    if (access.isReopened) {
      await recordOperationalAssignmentChange({
        workDate: params.workDate,
        costCenterId: sourceGroup.costCenterId,
        workerId: params.workerId,
        actorUserId: params.assignedBy,
        beforeValues: beforeSnapshot,
        afterValues: null,
      });
    }
    return { success: true, removed: true };
  }

  const [site] = await db
    .select({ id: restaurants.id, isActive: restaurants.isActive, costCenterId: restaurants.costCenterId })
    .from(restaurants)
    .where(eq(restaurants.id, params.restaurantId))
    .limit(1);
  if (!site) throw new Error('موقع التشغيل غير موجود');
  if (!site.isActive) throw new Error('موقع التشغيل غير نشط');
  if (!site.costCenterId) throw new Error('يجب ربط موقع التشغيل بمركز تكلفة قبل استخدامه');

  const normalizedOperationalGroupId =
    params.operationalGroupId && params.operationalGroupId !== params.sourceGroupId
      ? params.operationalGroupId
      : null;

  if (normalizedOperationalGroupId) {
    const [targetGroup] = await db
      .select({ id: groups.id, isActive: groups.isActive, costCenterId: groups.costCenterId })
      .from(groups)
      .where(eq(groups.id, normalizedOperationalGroupId))
      .limit(1);
    if (!targetGroup) throw new Error('المجموعة التشغيلية المحددة غير موجودة');
    if (!targetGroup.isActive) throw new Error('المجموعة التشغيلية المحددة غير نشطة');
    if (!targetGroup.costCenterId) throw new Error('يجب ربط المجموعة التشغيلية بمركز تكلفة قبل استخدامها');
    await assertOperationalCostCenterAccess(
      params.assignedBy,
      params.actorRole,
      targetGroup.costCenterId,
      targetGroup.id
    );
    if (targetGroup.costCenterId !== site.costCenterId) {
      throw new Error('المجموعة التشغيلية وموقع العمل يجب أن يتبعا نفس مركز التكلفة');
    }
  } else if (site.costCenterId !== sourceGroup.costCenterId) {
    throw new Error('عند اختيار موقع في مركز تكلفة مختلف يجب تسجيل نقل العامل إلى مجموعة تابعة لذلك المركز');
  }

  const values = {
    restaurantId: params.restaurantId,
    sourceGroupId: params.sourceGroupId,
    operationalGroupId: normalizedOperationalGroupId,
    assignedBy: params.assignedBy,
  };

  const previousOperationalGroupId = existing[0]?.operationalGroupId ?? null;

  let assignmentId: number | null = existing[0]?.id ?? null;
  if (existing.length > 0) {
    await db.update(dailyWorkAssignments).set(values).where(eq(dailyWorkAssignments.id, existing[0].id));
  } else {
    const insertResult = await db.insert(dailyWorkAssignments).values({
      workerId: params.workerId,
      workDate: params.workDate,
      ...values,
    });
    assignmentId = Number((insertResult as any).insertId) || null;
  }

  await logAudit({
    userId: params.assignedBy,
    action: existing.length > 0 ? 'UPDATE_OPERATIONAL_ASSIGNMENT' : 'CREATE_OPERATIONAL_ASSIGNMENT',
    tableName: 'daily_work_assignments',
    recordId: assignmentId,
    oldValues: existing.length > 0
      ? {
          workerId: params.workerId,
          workDate: params.workDate,
          restaurantId: existing[0].restaurantId,
          sourceGroupId: existing[0].sourceGroupId,
          operationalGroupId: existing[0].operationalGroupId,
        }
      : null,
    newValues: {
      workerId: params.workerId,
      workDate: params.workDate,
      restaurantId: params.restaurantId,
      sourceGroupId: params.sourceGroupId,
      operationalGroupId: normalizedOperationalGroupId,
    },
  });

  // الموقع وحده لا يغيّر المجموعة المالية. أعد الحساب فقط إذا تغيّرت المجموعة التشغيلية الفعالة.
  if (previousOperationalGroupId !== normalizedOperationalGroupId) {
    await processAttendanceToFinance(params.workerId, params.workDate);
  }

  if (access.isReopened) {
    const afterSnapshot = await getDailyAssignmentSnapshot(params.workerId, params.workDate);
    await recordOperationalAssignmentChange({
      workDate: params.workDate,
      costCenterId: sourceGroup.costCenterId,
      workerId: params.workerId,
      actorUserId: params.assignedBy,
      beforeValues: beforeSnapshot,
      afterValues: afterSnapshot,
    });
  }

  return { success: true, updated: existing.length > 0 };
}

export async function removeDailyWorkAssignment(
  workerId: number,
  workDate: string,
  actorUserId: number,
  actorRole: string
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const [workerScope] = await db
    .select({ costCenterId: groups.costCenterId, groupId: workers.groupId })
    .from(workers)
    .leftJoin(groups, eq(workers.groupId, groups.id))
    .where(eq(workers.id, workerId))
    .limit(1);
  if (!workerScope?.costCenterId) {
    throw new Error('لا يمكن تحديد مركز التكلفة الأساسي للعامل');
  }

  const access = await assertOperationalAssignmentChangeAllowed({
    workDate,
    costCenterId: workerScope.costCenterId,
    actorUserId,
    actorRole,
    groupId: workerScope.groupId || undefined,
  });
  const beforeSnapshot = access.isReopened
    ? await getDailyAssignmentSnapshot(workerId, workDate)
    : null;

  const [existingAssignment] = await db
    .select({
      id: dailyWorkAssignments.id,
      restaurantId: dailyWorkAssignments.restaurantId,
      sourceGroupId: dailyWorkAssignments.sourceGroupId,
      operationalGroupId: dailyWorkAssignments.operationalGroupId,
    })
    .from(dailyWorkAssignments)
    .where(and(eq(dailyWorkAssignments.workerId, workerId), eq(dailyWorkAssignments.workDate, workDate)))
    .limit(1);

  await db
    .delete(dailyWorkAssignments)
    .where(and(eq(dailyWorkAssignments.workerId, workerId), eq(dailyWorkAssignments.workDate, workDate)));

  // حذف قرار نقل تشغيلي يعيد العامل إلى المجموعة الفعالة البديلة (انتداب مؤقت/أساسية).
  if (existingAssignment?.operationalGroupId) {
    await processAttendanceToFinance(workerId, workDate);
  }

  if (existingAssignment) {
    await logAudit({
      userId: actorUserId,
      action: 'DELETE_OPERATIONAL_ASSIGNMENT',
      tableName: 'daily_work_assignments',
      recordId: existingAssignment.id,
      oldValues: {
        workerId,
        workDate,
        restaurantId: existingAssignment.restaurantId,
        sourceGroupId: existingAssignment.sourceGroupId,
        operationalGroupId: existingAssignment.operationalGroupId,
      },
      newValues: { workerId, workDate, removed: true },
    });
  }

  if (access.isReopened) {
    await recordOperationalAssignmentChange({
      workDate,
      costCenterId: workerScope.costCenterId,
      workerId,
      actorUserId,
      beforeValues: beforeSnapshot,
      afterValues: null,
    });
  }
  return { success: true };
}

/** جلب أسماء مواقع التشغيل التي عمل بها عامل خلال فترة؛ تبقى للاستخدام المرجعي الحالي. */
export async function getRestaurantNamesForWorkerPeriod(
  workerId: number,
  periodStart: string,
  periodEnd: string
): Promise<string> {
  const db = await getDb();
  if (!db) return '';

  const rows = await db
    .selectDistinct({ name: restaurants.name })
    .from(dailyWorkAssignments)
    .leftJoin(restaurants, eq(dailyWorkAssignments.restaurantId, restaurants.id))
    .where(
      and(
        eq(dailyWorkAssignments.workerId, workerId),
        gte(dailyWorkAssignments.workDate, periodStart),
        lte(dailyWorkAssignments.workDate, periodEnd)
      )
    );

  return rows.map((r) => r.name).filter(Boolean).join('، ');
}
