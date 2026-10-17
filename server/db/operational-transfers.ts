import { and, desc, eq, getTableColumns, inArray, isNotNull, ne, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import {
  attendanceEvents, costCenters, dailyWorkAssignments, groups,
  operationalTransferRequests, restaurants, userCostCenters, userOperationGroups, users, workers,
} from '../../drizzle/schema';
import { getDb } from './connection';
import { logAudit } from './audit';
import { assertOperationalTransferChangeAllowed } from './operational-days';
import { completeApprovedOperationalTransfer } from './daily-work-assignments';
import { sendNotification } from '../notifications';

export type OperationalTransferActor = { actorUserId: number; actorRole: string };
type Transfer = typeof operationalTransferRequests.$inferSelect;
const OPERATION_ROLES = ['supervisor_tolan', 'supervisor_malqa', 'restaurant_operations'] as const;
const ADMIN_ROLES = new Set(['super_admin', 'admin_affairs']);

function assertActor(actor: OperationalTransferActor) {
  if (!ADMIN_ROLES.has(actor.actorRole) && !(OPERATION_ROLES as readonly string[]).includes(actor.actorRole)) {
    throw new Error('ليس لديك صلاحية إدارة طلبات النقل التشغيلي');
  }
}

// YYYY-MM-DD فقط: يرفض التواريخ التي يقوم JavaScript بتصحيحها تلقائيًا مثل 2026-02-31.
export function assertOperationalTransferDate(workDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) throw new Error('تاريخ اليوم التشغيلي غير صحيح');
  const parsed = new Date(`${workDate}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== workDate) {
    throw new Error('تاريخ اليوم التشغيلي غير صحيح');
  }
}

async function database() {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  return db;
}

async function getActorScope(db: any, actor: OperationalTransferActor) {
  assertActor(actor);
  if (ADMIN_ROLES.has(actor.actorRole)) return null;
  const centers: { costCenterId: number; allGroups: number | null }[] = await db
    .select({ costCenterId: userCostCenters.costCenterId, allGroups: userCostCenters.allGroups })
    .from(userCostCenters).where(eq(userCostCenters.userId, actor.actorUserId));
  const groupRows: { groupId: number }[] = await db
    .select({ groupId: userOperationGroups.groupId }).from(userOperationGroups)
    .where(eq(userOperationGroups.userId, actor.actorUserId));
  return { centers, groupIds: new Set(groupRows.map(row => row.groupId)) };
}

type Scope = Awaited<ReturnType<typeof getActorScope>>;
function hasScope(scope: Scope, centerId: number, groupId?: number) {
  if (!scope) return true;
  const center = scope.centers.find(row => row.costCenterId === centerId);
  return !!center && (groupId === undefined || !!center.allGroups || scope.groupIds.has(groupId));
}

function assertScope(scope: Scope, centerId: number, groupId?: number) {
  if (!hasScope(scope, centerId, groupId)) throw new Error('ليس لديك صلاحية تشغيل المركز أو المجموعة المطلوبة');
}

async function getActiveGroup(db: any, groupId: number) {
  const [group] = await db.select({
    id: groups.id, name: groups.name, costCenterId: groups.costCenterId,
    isActive: groups.isActive, isOperationalAssignmentExempt: groups.isOperationalAssignmentExempt,
  }).from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!group || !group.isActive || !group.costCenterId || group.isOperationalAssignmentExempt) {
    throw new Error('اختر مجموعة تشغيل نشطة مرتبطة بمركز تكلفة وغير مستثناة من التوزيع');
  }
  return group as { id: number; name: string; costCenterId: number };
}

async function assertPresentSourceWorker(db: any, transfer: {
  workerId: number; sourceGroupId: number; workDate: string;
}) {
  // يُستخدم القفل نفسه أثناء الاستكمال؛ الانتماء الأساسي لا يتغير بالنقل اليومي.
  const [worker] = await db.select({ id: workers.id, groupId: workers.groupId, status: workers.status })
    .from(workers).where(eq(workers.id, transfer.workerId)).limit(1).for('update');
  if (!worker || worker.groupId !== transfer.sourceGroupId) throw new Error('العامل لم يعد تابعًا لمجموعة المصدر المحددة');
  if (worker.status !== 'active') throw new Error('لا يمكن نقل عامل غير نشط');
  const [present] = await db.select({ id: attendanceEvents.id }).from(attendanceEvents)
    .where(and(eq(attendanceEvents.workerId, transfer.workerId), eq(attendanceEvents.workDate, transfer.workDate),
      eq(attendanceEvents.eventType, 'check_in'))).limit(1);
  if (!present) throw new Error('لا يمكن طلب نقل عامل غير حاضر في اليوم التشغيلي');
  const [assignment] = await db.select({ operationalGroupId: dailyWorkAssignments.operationalGroupId })
    .from(dailyWorkAssignments).where(and(eq(dailyWorkAssignments.workerId, transfer.workerId),
      eq(dailyWorkAssignments.workDate, transfer.workDate))).limit(1).for('update');
  if (assignment?.operationalGroupId && assignment.operationalGroupId !== transfer.sourceGroupId) {
    throw new Error('للعامل نقل تشغيلي قائم في هذا اليوم؛ راجع توزيعه الحالي أولًا');
  }
}

async function readRequest(db: any, id: number, lock = false): Promise<Transfer> {
  const query = db.select().from(operationalTransferRequests).where(eq(operationalTransferRequests.id, id)).limit(1);
  const [request] = await (lock ? query.for('update') : query);
  if (!request) throw new Error('طلب النقل غير موجود');
  return request;
}

async function validateGroups(db: any, request: Pick<Transfer, 'sourceGroupId' | 'sourceCostCenterId' | 'toGroupId' | 'toCostCenterId'>) {
  const source = await getActiveGroup(db, request.sourceGroupId);
  const target = await getActiveGroup(db, request.toGroupId);
  if (source.costCenterId !== request.sourceCostCenterId || target.costCenterId !== request.toCostCenterId) {
    throw new Error('تغير مركز إحدى المجموعات؛ ألغ الطلب وأنشئ طلبًا جديدًا');
  }
  if (source.costCenterId === target.costCenterId) throw new Error('النقل هنا مخصص بين مركزي تكلفة مختلفين');
}

async function notifySource(request: Transfer, title: string, message: string) {
  try {
    const db = await database();
    const recipients = await db.select({ id: users.id }).from(users)
      .innerJoin(userCostCenters, and(eq(userCostCenters.userId, users.id),
        eq(userCostCenters.costCenterId, request.sourceCostCenterId)))
      .leftJoin(userOperationGroups, and(eq(userOperationGroups.userId, users.id),
        eq(userOperationGroups.groupId, request.sourceGroupId)))
      .where(and(eq(users.isActive, 1), inArray(users.role, [...OPERATION_ROLES]),
        or(eq(userCostCenters.allGroups, 1), isNotNull(userOperationGroups.id))));
    await Promise.all(Array.from(new Set(recipients.map(row => row.id))).map(userId => sendNotification({
      userId, title, message, type: 'info',
      link: `/operations/staffing?tab=transfers&view=incoming&workDate=${request.workDate}&costCenterId=${request.sourceCostCenterId}`,
    })));
  } catch (error) {
    // نجاح العملية لا يتحول إلى فشل عند تعذر الإشعار، كي لا يعيد المستخدم الطلب.
    console.error('[Operational transfer notification]', error);
  }
}

async function notifyRequester(request: Transfer, title: string, message: string, type: 'success' | 'warning' | 'info' = 'info') {
  try {
    await sendNotification({ userId: request.requestedBy, title, message, type,
      link: `/operations/staffing?tab=transfers&view=outgoing&workDate=${request.workDate}&costCenterId=${request.toCostCenterId}` });
  } catch (error) {
    console.error('[Operational transfer notification]', error);
  }
}

export async function getOperationalTransferOptions(params: {
  workDate: string; toCostCenterId: number;
} & OperationalTransferActor) {
  assertOperationalTransferDate(params.workDate);
  const db = await database();
  const scope = await getActorScope(db, params);
  assertScope(scope, params.toCostCenterId);
  const groupRows = await db.select({ id: groups.id, name: groups.name,
    costCenterId: groups.costCenterId, costCenterName: costCenters.name })
    .from(groups).innerJoin(costCenters, eq(groups.costCenterId, costCenters.id))
    .where(and(eq(groups.isActive, 1), eq(groups.isOperationalAssignmentExempt, 0), eq(costCenters.isActive, 1)))
    .orderBy(costCenters.name, groups.name);
  const sites = await db.select({ id: restaurants.id, name: restaurants.name }).from(restaurants)
    .where(and(eq(restaurants.costCenterId, params.toCostCenterId), eq(restaurants.isActive, 1))).orderBy(restaurants.name);
  return {
    sourceGroups: groupRows.filter(row => row.costCenterId !== params.toCostCenterId),
    destinationGroups: groupRows.filter(row => row.costCenterId === params.toCostCenterId && hasScope(scope, params.toCostCenterId, row.id))
      .map(({ id, name }) => ({ id, name })),
    sites,
  };
}

export async function getOperationalTransferWorkers(params: {
  workDate: string; toCostCenterId: number; sourceGroupId: number;
} & OperationalTransferActor) {
  assertOperationalTransferDate(params.workDate);
  const db = await database();
  assertScope(await getActorScope(db, params), params.toCostCenterId);
  const source = await getActiveGroup(db, params.sourceGroupId);
  if (source.costCenterId === params.toCostCenterId) throw new Error('اختر مجموعة تابعة لمركز التكلفة الآخر');
  // يُكشف الاسم والكود فقط، ولا تُمنح صلاحية الاطلاع على بقية بيانات عمال المركز الآخر.
  const presentWorkers = await db.selectDistinct({ id: workers.id, fullName: workers.fullName, code: workers.code })
    .from(workers).innerJoin(attendanceEvents, and(eq(attendanceEvents.workerId, workers.id),
      eq(attendanceEvents.workDate, params.workDate), eq(attendanceEvents.eventType, 'check_in')))
    .where(and(eq(workers.groupId, params.sourceGroupId), eq(workers.status, 'active'))).orderBy(workers.fullName);
  if (!presentWorkers.length) return [];
  const ids = presentWorkers.map(row => row.id);
  const active = await db.select({ workerId: operationalTransferRequests.workerId }).from(operationalTransferRequests)
    .where(and(inArray(operationalTransferRequests.workerId, ids), eq(operationalTransferRequests.workDate, params.workDate),
      isNotNull(operationalTransferRequests.activeKey)));
  const assignments = await db.select({ workerId: dailyWorkAssignments.workerId }).from(dailyWorkAssignments)
    .where(and(inArray(dailyWorkAssignments.workerId, ids), eq(dailyWorkAssignments.workDate, params.workDate),
      isNotNull(dailyWorkAssignments.operationalGroupId), ne(dailyWorkAssignments.operationalGroupId, params.sourceGroupId)));
  const unavailable = new Set([...active, ...assignments].map(row => row.workerId));
  return presentWorkers.filter(row => !unavailable.has(row.id));
}

export async function listOperationalTransferRequests(params: {
  workDate: string; costCenterId: number;
} & OperationalTransferActor) {
  assertOperationalTransferDate(params.workDate);
  const db = await database();
  const scope = await getActorScope(db, params);
  assertScope(scope, params.costCenterId);
  const sourceGroup = alias(groups, 'transfer_source_group');
  const targetGroup = alias(groups, 'transfer_target_group');
  const sourceCenter = alias(costCenters, 'transfer_source_center');
  const targetCenter = alias(costCenters, 'transfer_target_center');
  const requester = alias(users, 'transfer_requester');
  const reviewer = alias(users, 'transfer_reviewer');
  const rows = await db.select({ ...getTableColumns(operationalTransferRequests),
    workerName: workers.fullName, workerCode: workers.code,
    sourceGroupName: sourceGroup.name, toGroupName: targetGroup.name,
    sourceCostCenterName: sourceCenter.name, toCostCenterName: targetCenter.name,
    requestedByName: requester.fullName, reviewedByName: reviewer.fullName, restaurantName: restaurants.name,
  }).from(operationalTransferRequests)
    .innerJoin(workers, eq(workers.id, operationalTransferRequests.workerId))
    .innerJoin(sourceGroup, eq(sourceGroup.id, operationalTransferRequests.sourceGroupId))
    .innerJoin(targetGroup, eq(targetGroup.id, operationalTransferRequests.toGroupId))
    .innerJoin(sourceCenter, eq(sourceCenter.id, operationalTransferRequests.sourceCostCenterId))
    .innerJoin(targetCenter, eq(targetCenter.id, operationalTransferRequests.toCostCenterId))
    .innerJoin(requester, eq(requester.id, operationalTransferRequests.requestedBy))
    .leftJoin(reviewer, eq(reviewer.id, operationalTransferRequests.reviewedBy))
    .leftJoin(restaurants, eq(restaurants.id, operationalTransferRequests.restaurantId))
    .where(and(eq(operationalTransferRequests.workDate, params.workDate), or(
      eq(operationalTransferRequests.sourceCostCenterId, params.costCenterId),
      eq(operationalTransferRequests.toCostCenterId, params.costCenterId))))
    .orderBy(desc(operationalTransferRequests.createdAt), desc(operationalTransferRequests.id));
  return rows.filter(row => row.sourceCostCenterId === params.costCenterId
    ? hasScope(scope, row.sourceCostCenterId, row.sourceGroupId)
    : hasScope(scope, row.toCostCenterId, row.toGroupId)).map(row => {
    const incoming = row.sourceCostCenterId === params.costCenterId;
    const sourceAccess = incoming && hasScope(scope, row.sourceCostCenterId, row.sourceGroupId);
    const targetAccess = !incoming && hasScope(scope, row.toCostCenterId, row.toGroupId);
    return { ...row, direction: incoming ? 'incoming' as const : 'outgoing' as const,
      canApprove: sourceAccess && row.status === 'pending',
      canReject: sourceAccess && row.status === 'pending',
      canCancel: targetAccess && row.requestedBy === params.actorUserId && (row.status === 'pending' || row.status === 'approved'),
      canComplete: targetAccess && (row.status === 'approved' || (row.status === 'completed' && !row.financeReady)),
    };
  });
}

export async function createOperationalTransferRequest(params: {
  workDate: string; workerId: number; sourceGroupId: number; toGroupId: number; toCostCenterId: number;
} & OperationalTransferActor) {
  assertActor(params);
  assertOperationalTransferDate(params.workDate);
  const db = await database();
  let request: Transfer;
  try {
    request = await db.transaction(async tx => {
      const source = await getActiveGroup(tx, params.sourceGroupId);
      const target = await getActiveGroup(tx, params.toGroupId);
      if (target.costCenterId !== params.toCostCenterId) throw new Error('المجموعة المستقبلة لا تتبع مركز التكلفة المحدد');
      if (source.costCenterId === params.toCostCenterId) throw new Error('النقل هنا مخصص بين مركزي تكلفة مختلفين');
      assertScope(await getActorScope(tx, params), params.toCostCenterId, params.toGroupId);
      await assertOperationalTransferChangeAllowed({ workDate: params.workDate,
        sourceCostCenterId: source.costCenterId, toCostCenterId: params.toCostCenterId, tx });
      await assertPresentSourceWorker(tx, params);
      const activeKey = `${params.workerId}:${params.workDate}`;
      const [existing] = await tx.select({ id: operationalTransferRequests.id }).from(operationalTransferRequests)
        .where(eq(operationalTransferRequests.activeKey, activeKey)).limit(1);
      if (existing) throw new Error('للعامل طلب نقل قائم أو نقل مكتمل في هذا اليوم');
      const result = await tx.insert(operationalTransferRequests).values({
        workerId: params.workerId, workDate: params.workDate,
        sourceGroupId: params.sourceGroupId, sourceCostCenterId: source.costCenterId,
        toGroupId: params.toGroupId, toCostCenterId: params.toCostCenterId,
        requestedBy: params.actorUserId, activeKey, status: 'pending', financeReady: 0,
      });
      const id = Number((result as any)[0]?.insertId ?? (result as any).insertId);
      if (!id) throw new Error('تعذر إنشاء طلب النقل');
      const created = await readRequest(tx, id);
      await logAudit({ userId: params.actorUserId, action: 'CREATE_OPERATIONAL_TRANSFER_REQUEST',
        tableName: 'operational_transfer_requests', recordId: id, newValues: created, tx });
      return created;
    });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY' || error?.cause?.code === 'ER_DUP_ENTRY') {
      throw new Error('للعامل طلب نقل قائم أو نقل مكتمل في هذا اليوم');
    }
    throw error;
  }
  await notifySource(request, 'طلب نقل عامل', `طلب نقل ليوم ${request.workDate} بانتظار موافقتك من تبويب النقل.`);
  return { success: true, id: request.id };
}

export async function approveOperationalTransferRequest(params: { id: number } & OperationalTransferActor) {
  assertActor(params);
  const db = await database();
  // قراءة أولية لتحديد مركزي الأقفال؛ تُعاد قراءة الطلب بقفل بعد قفل اليومين.
  const snapshot = await readRequest(db, params.id);
  const request = await db.transaction(async tx => {
    assertScope(await getActorScope(tx, params), snapshot.sourceCostCenterId, snapshot.sourceGroupId);
    await assertOperationalTransferChangeAllowed({ workDate: snapshot.workDate,
      sourceCostCenterId: snapshot.sourceCostCenterId, toCostCenterId: snapshot.toCostCenterId, tx });
    const current = await readRequest(tx, params.id, true);
    if (current.status !== 'pending') throw new Error('الطلب لم يعد بانتظار الموافقة');
    await validateGroups(tx, current);
    await assertPresentSourceWorker(tx, current);
    await tx.update(operationalTransferRequests).set({ status: 'approved', reviewedBy: params.actorUserId,
      reviewedAt: new Date().toISOString().slice(0, 19).replace('T', ' '), rejectionReason: null })
      .where(and(eq(operationalTransferRequests.id, params.id), eq(operationalTransferRequests.status, 'pending')));
    await logAudit({ userId: params.actorUserId, action: 'APPROVE_OPERATIONAL_TRANSFER_REQUEST',
      tableName: 'operational_transfer_requests', recordId: params.id,
      oldValues: { status: current.status }, newValues: { status: 'approved' }, tx });
    return current;
  });
  await notifyRequester(request, 'تمت الموافقة على نقل العامل', `نقل يوم ${request.workDate} معتمد. اختر موقع العمل لإكمال النقل.`, 'success');
  return { success: true };
}

export async function rejectOperationalTransferRequest(params: { id: number; reason: string } & OperationalTransferActor) {
  assertActor(params);
  const reason = params.reason.trim();
  if (!reason || reason.length > 500) throw new Error('سبب الرفض إلزامي وبحد أقصى 500 حرف');
  const db = await database();
  const request = await db.transaction(async tx => {
    const current = await readRequest(tx, params.id, true);
    assertScope(await getActorScope(tx, params), current.sourceCostCenterId, current.sourceGroupId);
    if (current.status !== 'pending') throw new Error('لا يمكن رفض طلب تمت معالجته');
    await tx.update(operationalTransferRequests).set({ status: 'rejected', activeKey: null,
      reviewedBy: params.actorUserId, reviewedAt: new Date().toISOString().slice(0, 19).replace('T', ' '), rejectionReason: reason })
      .where(and(eq(operationalTransferRequests.id, params.id), eq(operationalTransferRequests.status, 'pending')));
    await logAudit({ userId: params.actorUserId, action: 'REJECT_OPERATIONAL_TRANSFER_REQUEST',
      tableName: 'operational_transfer_requests', recordId: params.id,
      oldValues: { status: current.status }, newValues: { status: 'rejected', rejectionReason: reason }, tx });
    return current;
  });
  await notifyRequester(request, 'تم رفض طلب نقل العامل', `طلب يوم ${request.workDate}: ${reason}`, 'warning');
  return { success: true };
}

export async function cancelOperationalTransferRequest(params: { id: number } & OperationalTransferActor) {
  assertActor(params);
  const db = await database();
  const request = await db.transaction(async tx => {
    const current = await readRequest(tx, params.id, true);
    assertScope(await getActorScope(tx, params), current.toCostCenterId, current.toGroupId);
    if (current.requestedBy !== params.actorUserId) throw new Error('إلغاء الطلب متاح لمقدم الطلب فقط');
    if (current.status !== 'pending' && current.status !== 'approved') throw new Error('لا يمكن إلغاء طلب انتهى أو اكتمل نقله');
    await tx.update(operationalTransferRequests).set({ status: 'cancelled', activeKey: null })
      .where(and(eq(operationalTransferRequests.id, params.id), inArray(operationalTransferRequests.status, ['pending', 'approved'])));
    await logAudit({ userId: params.actorUserId, action: 'CANCEL_OPERATIONAL_TRANSFER_REQUEST',
      tableName: 'operational_transfer_requests', recordId: params.id,
      oldValues: { status: current.status }, newValues: { status: 'cancelled' }, tx });
    return current;
  });
  await notifySource(request, 'تم إلغاء طلب نقل العامل', `ألغى مقدم الطلب نقل يوم ${request.workDate}.`);
  return { success: true };
}

export async function completeOperationalTransferRequest(params: {
  id: number; restaurantId: number;
} & OperationalTransferActor) {
  assertActor(params);
  const db = await database();
  const request = await readRequest(db, params.id);
  assertScope(await getActorScope(db, params), request.toCostCenterId, request.toGroupId);
  // تنفيذ ذري للتوزيع والحالة ثم إعادة استخدام احتساب النقل الحالي؛ تعيد الدالة الفحص داخل القفل.
  const result = await completeApprovedOperationalTransfer({ requestId: params.id, restaurantId: params.restaurantId,
    actorUserId: params.actorUserId, actorRole: params.actorRole });
  await notifySource(request, 'اكتمل نقل العامل', `اكتمل نقل يوم ${request.workDate} وتحديد موقع العمل في المركز المستقبِل.`);
  return result;
}
