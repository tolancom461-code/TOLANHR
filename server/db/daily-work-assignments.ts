import { and, eq, gte, inArray, lte, or } from 'drizzle-orm';
import { getAdministrativeWorkDate } from '../attendance-logic';
import {
  attendanceEvents,
  costCenters,
  dailyWorkAssignments,
  groups,
  operationalTransferRequests,
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
  assertOperationalTransferChangeAllowed,
  lockOperationalDayRows,
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

  const progressForGroup = async (group: (typeof groupRows)[number]) => {
    const workers = await getWorkersWithAssignmentForGroupDate(group.id, workDate, actorUserId, actorRole);
    const assigned = workers.filter(worker => worker.isTransferredOut || !!worker.currentRestaurantId).length;
    return {
      groupId: group.id, groupName: group.name, total: workers.length, assigned,
      unassigned: Math.max(workers.length - assigned, 0),
      transferred: workers.filter(worker => worker.isTransferredOut).length,
      completed: workers.length > 0 && assigned >= workers.length,
    };
  };
  // Keep large centers from flooding the shared connection pool with group queries.
  const progress: Array<Awaited<ReturnType<typeof progressForGroup>>> = [];
  for (let offset = 0; offset < groupRows.length; offset += 3) {
    progress.push(...await Promise.all(groupRows.slice(offset, offset + 3).map(progressForGroup)));
  }
  return progress;
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

  const transferRows = await db.select({
    id: operationalTransferRequests.id, workerId: operationalTransferRequests.workerId,
    sourceGroupId: operationalTransferRequests.sourceGroupId, toGroupId: operationalTransferRequests.toGroupId,
    status: operationalTransferRequests.status, financeReady: operationalTransferRequests.financeReady,
    toCostCenterName: costCenters.name,
  }).from(operationalTransferRequests)
    .leftJoin(costCenters, eq(costCenters.id, operationalTransferRequests.toCostCenterId))
    .where(and(eq(operationalTransferRequests.workDate, workDate),
      inArray(operationalTransferRequests.status, ['approved', 'completed']),
      or(eq(operationalTransferRequests.sourceGroupId, groupId), eq(operationalTransferRequests.toGroupId, groupId))));
  const incomingIds = transferRows.filter(row => row.toGroupId === groupId).map(row => row.workerId);
  const groupWorkers = await db
    .select({ id: workers.id, fullName: workers.fullName, code: workers.code, groupId: workers.groupId })
    .from(workers)
    .where(or(eq(workers.groupId, groupId), ...(incomingIds.length ? [inArray(workers.id, incomingIds)] : [])))
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
    const transfer = transferRows.find(row => row.workerId === worker.id);
    const incoming = !!transfer && transfer.toGroupId === groupId;
    const awaitingSite = incoming && transfer.status === 'approved';
    return {
      ...worker,
      currentRestaurantId: awaitingSite ? null : assignment?.restaurantId || null,
      currentRestaurantName: awaitingSite ? null : assignment?.restaurantName || null,
      siteCostCenterId: awaitingSite ? null : assignment?.siteCostCenterId || null,
      siteCostCenterName: awaitingSite ? null : assignment?.siteCostCenterName || null,
      sourceGroupId: transfer?.sourceGroupId || assignment?.sourceGroupId || worker.groupId || groupId,
      operationalGroupId: incoming ? transfer.toGroupId : assignment?.operationalGroupId || null,
      isIncomingTransfer: incoming,
      approvedTransferRequestId: incoming ? transfer.id : null,
      isTransferredOut: !!transfer && transfer.sourceGroupId === groupId && !incoming,
      transferToCostCenterName: transfer?.toCostCenterName || null,
      transferStatus: transfer?.status || null,
    };
  });
}

async function getDailyAssignmentSnapshot(workerId: number, workDate: string, database?: unknown) {
  const db = (database ?? await getDb()) as Awaited<ReturnType<typeof getDb>>;
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
type DailyWorkAssignmentInput = {
  workerId: number; restaurantId?: number | null; sourceGroupId: number;
  operationalGroupId?: number | null; workDate: string; assignedBy: number; actorRole: string;
};

export async function upsertDailyWorkAssignment(params: DailyWorkAssignmentInput) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const effects: Array<() => Promise<unknown>> = [];
  const result = await db.transaction(tx => upsertDailyWorkAssignmentInDatabase(params, tx, effects));
  for (const effect of effects) await effect();
  return result;
}

async function assertNoApprovedRequest(database: NonNullable<Awaited<ReturnType<typeof getDb>>>, workerId: number, workDate: string) {
  const [request] = await database.select({ id: operationalTransferRequests.id })
    .from(operationalTransferRequests).where(and(
      eq(operationalTransferRequests.workerId, workerId), eq(operationalTransferRequests.workDate, workDate),
      inArray(operationalTransferRequests.status, ['approved', 'completed']),
    )).limit(1).for('update');
  if (request) throw new Error('العامل مرتبط بطلب نقل معتمد؛ أكمل إجراءاته من تبويب النقل');
}

async function upsertDailyWorkAssignmentInDatabase(params: DailyWorkAssignmentInput, transaction: unknown, effects: Array<() => Promise<unknown>>) {
  const db = transaction as NonNullable<Awaited<ReturnType<typeof getDb>>>;
  const lockGroups = await db.select({ id: groups.id, costCenterId: groups.costCenterId })
    .from(groups).where(inArray(groups.id, [params.sourceGroupId, ...(params.operationalGroupId ? [params.operationalGroupId] : [])])).limit(2);
  const sourceGroup = lockGroups.find(group => group.id === params.sourceGroupId);
  if (!sourceGroup?.costCenterId) throw new Error('يجب ربط المجموعة الأساسية بمركز تكلفة قبل توزيع العامل');
  await lockOperationalDayRows(params.workDate, lockGroups.map(group => group.costCenterId).filter((id): id is number => !!id), db);

  const [worker] = await db
    .select({ id: workers.id, groupId: workers.groupId })
    .from(workers)
    .where(eq(workers.id, params.workerId))
    .limit(1).for('update');
  if (!worker) throw new Error('العامل غير موجود');
  await assertNoApprovedRequest(db, params.workerId, params.workDate);
  if (worker.groupId !== params.sourceGroupId) {
    throw new Error('العامل لا ينتمي إلى المجموعة المحددة حالياً');
  }

  const access = await assertOperationalAssignmentChangeAllowed({
    workDate: params.workDate,
    costCenterId: sourceGroup.costCenterId,
    actorUserId: params.assignedBy,
    actorRole: params.actorRole,
    groupId: params.sourceGroupId,
  }, db);
  const destination = lockGroups.find(group => group.id === params.operationalGroupId);
  if (destination?.costCenterId && destination.costCenterId !== sourceGroup.costCenterId) {
    await assertOperationalAssignmentChangeAllowed({ workDate: params.workDate, costCenterId: destination.costCenterId,
      actorUserId: params.assignedBy, actorRole: params.actorRole, groupId: destination.id }, db);
  }
  const beforeSnapshot = access.isReopened
    ? await getDailyAssignmentSnapshot(params.workerId, params.workDate, db)
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
        effects.push(() => processAttendanceToFinance(params.workerId, params.workDate));
      }

      await logAudit({
        tx: db,
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
      effects.push(async () => { await recordOperationalAssignmentChange({
        workDate: params.workDate,
        costCenterId: sourceGroup.costCenterId!,
        workerId: params.workerId,
        actorUserId: params.assignedBy,
        beforeValues: beforeSnapshot,
        afterValues: null,
      }); });
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
      targetGroup.id,
      db
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
        tx: db,
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
    effects.push(() => processAttendanceToFinance(params.workerId, params.workDate));
  }

  if (access.isReopened) {
    effects.push(async () => {
    const afterSnapshot = await getDailyAssignmentSnapshot(params.workerId, params.workDate);
    await recordOperationalAssignmentChange({
      workDate: params.workDate,
      costCenterId: sourceGroup.costCenterId!,
      workerId: params.workerId,
      actorUserId: params.assignedBy,
      beforeValues: beforeSnapshot,
      afterValues: afterSnapshot,
    }); });
  }

  return { success: true, updated: existing.length > 0 };
}

/** Finalizes only the worker/day/destination approved by the source operator. */
export async function completeApprovedOperationalTransfer(params: {
  requestId: number; restaurantId: number; actorUserId: number; actorRole: string;
}) {
  if (!SCOPED_OPERATIONS_ROLES.has(params.actorRole) && !['super_admin', 'admin_affairs'].includes(params.actorRole)) {
    throw new Error('ليس لديك صلاحية استكمال النقل');
  }
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const [snapshot] = await db.select().from(operationalTransferRequests)
    .where(eq(operationalTransferRequests.id, params.requestId)).limit(1);
  if (!snapshot) throw new Error('طلب النقل غير موجود');
  await assertOperationalCostCenterAccess(params.actorUserId, params.actorRole, snapshot.toCostCenterId, snapshot.toGroupId);

  const outcome = await db.transaction(async tx => {
    // Same center-day lock order as request approval and day closure.
    await assertOperationalTransferChangeAllowed({ workDate: snapshot.workDate,
      sourceCostCenterId: snapshot.sourceCostCenterId, toCostCenterId: snapshot.toCostCenterId, tx });
    const [request] = await tx.select().from(operationalTransferRequests)
      .where(eq(operationalTransferRequests.id, params.requestId)).limit(1).for('update');
    if (!request || !['approved', 'completed'].includes(request.status) || !request.reviewedBy) {
      throw new Error('لا يمكن استكمال النقل قبل موافقة مسؤول المصدر');
    }
    if (request.status === 'completed') {
      if (request.restaurantId !== params.restaurantId) throw new Error('النقل مكتمل ولا يمكن تغيير موقعه من هذا الإجراء');
      return { request, alreadyReady: !!request.financeReady };
    }
    const [worker] = await tx.select({ id: workers.id, groupId: workers.groupId, status: workers.status })
      .from(workers).where(eq(workers.id, request.workerId)).limit(1).for('update');
    if (!worker || worker.status !== 'active' || worker.groupId !== request.sourceGroupId) {
      throw new Error('تغيرت حالة العامل أو مجموعته الأساسية؛ لا يمكن استكمال الطلب');
    }
    const groupRows = await tx.select({ id: groups.id, costCenterId: groups.costCenterId, isActive: groups.isActive,
      exempt: groups.isOperationalAssignmentExempt }).from(groups)
      .where(inArray(groups.id, [request.sourceGroupId, request.toGroupId]));
    const source = groupRows.find(group => group.id === request.sourceGroupId);
    const target = groupRows.find(group => group.id === request.toGroupId);
    if (!source?.isActive || !target?.isActive || source.exempt || target.exempt ||
      source.costCenterId !== request.sourceCostCenterId || target.costCenterId !== request.toCostCenterId) {
      throw new Error('تغيرت بيانات مجموعات النقل؛ راجع الطلب');
    }
    const [present] = await tx.select({ id: attendanceEvents.id }).from(attendanceEvents)
      .where(and(eq(attendanceEvents.workerId, request.workerId), eq(attendanceEvents.workDate, request.workDate),
        eq(attendanceEvents.eventType, 'check_in'))).limit(1);
    if (!present) throw new Error('لا يمكن نقل عامل غير حاضر في اليوم التشغيلي');
    const [site] = await tx.select({ id: restaurants.id, costCenterId: restaurants.costCenterId, isActive: restaurants.isActive })
      .from(restaurants).where(eq(restaurants.id, params.restaurantId)).limit(1);
    if (!site?.isActive || site.costCenterId !== request.toCostCenterId) {
      throw new Error('اختر موقع عمل نشطًا تابعًا لمركز الاستقبال');
    }
    const [existing] = await tx.select().from(dailyWorkAssignments)
      .where(and(eq(dailyWorkAssignments.workerId, request.workerId), eq(dailyWorkAssignments.workDate, request.workDate)))
      .limit(1).for('update');
    if (existing?.operationalGroupId && existing.operationalGroupId !== request.sourceGroupId) {
      throw new Error('تغير النقل التشغيلي للعامل بعد إنشاء الطلب');
    }
    const values = { restaurantId: site.id, sourceGroupId: request.sourceGroupId,
      operationalGroupId: request.toGroupId, assignedBy: params.actorUserId };
    if (existing) {
      await tx.update(dailyWorkAssignments).set(values).where(eq(dailyWorkAssignments.id, existing.id));
    } else {
      await tx.insert(dailyWorkAssignments).values({ workerId: request.workerId, workDate: request.workDate, ...values });
    }
    await tx.update(operationalTransferRequests).set({ status: 'completed', restaurantId: site.id,
      completedBy: params.actorUserId, completedAt: new Date().toISOString().slice(0, 19).replace('T', ' '), financeReady: 0 })
      .where(and(eq(operationalTransferRequests.id, request.id), eq(operationalTransferRequests.status, 'approved')));
    await logAudit({ userId: params.actorUserId, action: 'COMPLETE_OPERATIONAL_TRANSFER',
      tableName: 'daily_work_assignments', recordId: existing?.id,
      oldValues: existing || null, newValues: { workerId: request.workerId, workDate: request.workDate,
        requestId: request.id, ...values }, tx });
    return { request, alreadyReady: false };
  });
  if (!outcome.alreadyReady) {
    // Reuse the exact financial recalculation used by direct super-admin transfers.
    // The durable flag keeps both centers blocked if recalculation fails after commit.
    try {
      await processAttendanceToFinance(outcome.request.workerId, outcome.request.workDate);
    } catch (error) {
      throw new Error('تم تثبيت النقل وتعذر إكمال الاحتساب. أعد المحاولة من تبويب النقل قبل إغلاق اليوم', { cause: error });
    }
    await db.update(operationalTransferRequests).set({ financeReady: 1 })
      .where(and(eq(operationalTransferRequests.id, params.requestId), eq(operationalTransferRequests.status, 'completed')));
  }
  return { success: true, alreadyCompleted: outcome.alreadyReady };
}

export async function removeDailyWorkAssignment(workerId: number, workDate: string, actorUserId: number, actorRole: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const effects: Array<() => Promise<unknown>> = [];
  const result = await db.transaction(tx => removeDailyWorkAssignmentInDatabase(workerId, workDate, actorUserId, actorRole, tx, effects));
  for (const effect of effects) await effect();
  return result;
}

async function removeDailyWorkAssignmentInDatabase(workerId: number, workDate: string, actorUserId: number, actorRole: string, transaction: unknown, effects: Array<() => Promise<unknown>>) {
  const db = transaction as NonNullable<Awaited<ReturnType<typeof getDb>>>;

  const [workerScope] = await db
    .select({ costCenterId: groups.costCenterId, groupId: workers.groupId })
    .from(workers)
    .leftJoin(groups, eq(workers.groupId, groups.id))
    .where(eq(workers.id, workerId))
    .limit(1);
  if (!workerScope?.costCenterId) {
    throw new Error('لا يمكن تحديد مركز التكلفة الأساسي للعامل');
  }
  await lockOperationalDayRows(workDate, [workerScope.costCenterId], db);
  const [currentWorker] = await db.select({ groupId: workers.groupId }).from(workers)
    .where(eq(workers.id, workerId)).limit(1).for('update');
  if (!currentWorker || currentWorker.groupId !== workerScope.groupId) throw new Error('تغيرت مجموعة العامل؛ أعد تحميل الشاشة');

  await assertNoApprovedRequest(db, workerId, workDate);
  const access = await assertOperationalAssignmentChangeAllowed({
    workDate,
    costCenterId: workerScope.costCenterId,
    actorUserId,
    actorRole,
    groupId: workerScope.groupId || undefined,
  }, db);
  const beforeSnapshot = access.isReopened
    ? await getDailyAssignmentSnapshot(workerId, workDate, db)
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
    effects.push(() => processAttendanceToFinance(workerId, workDate));
  }

  if (existingAssignment) {
    await logAudit({
      tx: db,
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
    effects.push(async () => { await recordOperationalAssignmentChange({
      workDate,
      costCenterId: workerScope.costCenterId!,
      workerId,
      actorUserId,
      beforeValues: beforeSnapshot,
      afterValues: null,
    }); });
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
