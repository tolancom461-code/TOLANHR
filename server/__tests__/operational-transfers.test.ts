import { beforeEach, describe, expect, it, vi } from 'vitest';

// Every persistence, notification and finance boundary is replaced in memory.
// This suite must never use a configured DATABASE_URL or a real connection.
const mocked = vi.hoisted(() => {
  const state = {
    selectQueue: [] as any[][],
    inserts: [] as Array<{ table: unknown; values: any }>,
    updates: [] as Array<{ table: unknown; values: any }>,
    insertError: null as Error | null,
    inTransaction: false,
    transactionEvents: [] as string[],
    selectQueries: [] as Array<{ table?: unknown; condition?: any; locked?: string }>,
  };

  const makeSelectQuery = () => {
    let rows: any[] | undefined;
    const result = () => (rows ??= state.selectQueue.shift() ?? []);
    const query: any = {};
    const selection: { table?: unknown; condition?: any; locked?: string } = {};
    state.selectQueries.push(selection);
    for (const method of ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'groupBy', 'limit', 'for']) {
      query[method] = vi.fn(() => query);
    }
    query.from = vi.fn((table: unknown) => { selection.table = table; return query; });
    query.where = vi.fn((condition: unknown) => { selection.condition = condition; return query; });
    query.for = vi.fn((locked: string) => { selection.locked = locked; return query; });
    query.then = (resolve: (value: any[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject);
    return query;
  };

  const db: any = {
    select: vi.fn(() => makeSelectQuery()),
    selectDistinct: vi.fn(() => makeSelectQuery()),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: any) => {
        if (state.insertError) throw state.insertError;
        state.inserts.push({ table, values });
        const query: any = {};
        query.onDuplicateKeyUpdate = vi.fn(() => query);
        query.then = (resolve: (value: any[]) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve([{ insertId: 71, affectedRows: 1 }]).then(resolve, reject);
        return query;
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: any) => ({
        where: vi.fn(async () => {
          state.updates.push({ table, values });
          return [{ affectedRows: 1 }];
        }),
      })),
    })),
    delete: vi.fn(() => ({ where: vi.fn(async () => [{ affectedRows: 1 }]) })),
  };
  db.transaction = vi.fn(async (callback: (tx: any) => unknown) => {
    state.inTransaction = true;
    state.transactionEvents.push('begin');
    try {
      const result = await callback(db);
      state.transactionEvents.push('commit');
      return result;
    } catch (error) {
      state.transactionEvents.push('rollback');
      throw error;
    } finally {
      state.inTransaction = false;
    }
  });

  return {
    state,
    db,
    assertOperationalAssignmentChangeAllowed: vi.fn(),
    assertOperationalCostCenterAccess: vi.fn(),
    assertOperationalTransferChangeAllowed: vi.fn(),
    recordOperationalAssignmentChange: vi.fn(),
    lockOperationalDayRows: vi.fn().mockResolvedValue(undefined),
    logAudit: vi.fn(),
    sendNotification: vi.fn(),
    sendNotificationToRoles: vi.fn(),
    cleanupOrphanFinanceRecords: vi.fn(),
    getApprovedUnpostedDeductionsForPeriod: vi.fn(),
    aggregatePayrollDataByCostCenter: vi.fn(),
    getActorLabel: vi.fn(),
    processAttendanceToFinance: vi.fn(),
    completeApprovedOperationalTransfer: vi.fn(),
  };
});

vi.mock('../db/connection', () => ({ getDb: vi.fn(async () => mocked.db) }));
vi.mock('../db/operational-days', () => ({
  assertOperationalAssignmentChangeAllowed: mocked.assertOperationalAssignmentChangeAllowed,
  assertOperationalCostCenterAccess: mocked.assertOperationalCostCenterAccess,
  assertOperationalTransferChangeAllowed: mocked.assertOperationalTransferChangeAllowed,
  recordOperationalAssignmentChange: mocked.recordOperationalAssignmentChange,
  lockOperationalDayRows: mocked.lockOperationalDayRows,
  OPERATIONAL_DAY_CONTROL_START_DATE: '2026-09-16',
}));
vi.mock('../db/audit', () => ({ logAudit: mocked.logAudit }));
vi.mock('../notifications', () => ({
  sendNotification: mocked.sendNotification,
  sendNotificationToRoles: mocked.sendNotificationToRoles,
  ADMIN_OWNER_ROLES: ['super_admin', 'executive'],
}));
vi.mock('../db/daily-finance', () => ({ processAttendanceToFinance: mocked.processAttendanceToFinance }));
vi.mock('../db/daily-work-assignments', () => ({
  completeApprovedOperationalTransfer: mocked.completeApprovedOperationalTransfer,
}));
vi.mock('../db/deductions', () => ({
  getApprovedUnpostedDeductionsForPeriod: mocked.getApprovedUnpostedDeductionsForPeriod,
  markDeductionsAsPosted: vi.fn(), addDeductionReasonNotes: vi.fn(),
}));
vi.mock('../db/finance-entries', () => ({ getDailyFinanceRecords: vi.fn() }));
vi.mock('../db/daily-finance-entries', () => ({ cleanupOrphanFinanceRecords: mocked.cleanupOrphanFinanceRecords }));
vi.mock('../db/recalculation', () => ({ getEffectiveGroupForWorkerOnDate: vi.fn() }));
vi.mock('../db/_shared', () => ({ getActorLabel: mocked.getActorLabel }));
vi.mock('../db/auto-finance', () => ({ aggregatePayrollDataByCostCenter: mocked.aggregatePayrollDataByCostCenter }));

import { dailyWorkAssignments, operationalTransferRequests, payrollBatches, payrollBatchItems, workerDailyFinance, workers } from '../../drizzle/schema';
import { MySqlDialect } from 'drizzle-orm/mysql-core';
import {
  approveOperationalTransferRequest,
  assertOperationalTransferDate,
  cancelOperationalTransferRequest,
  completeOperationalTransferRequest,
  createOperationalTransferRequest,
  getOperationalTransferOptions,
  getOperationalTransferWorkers,
  listOperationalTransferRequests,
  rejectOperationalTransferRequest,
} from '../db/operational-transfers';

const actualAssignments = await vi.importActual<typeof import('../db/daily-work-assignments')>('../db/daily-work-assignments');
const actualOperationalDays = await vi.importActual<typeof import('../db/operational-days')>('../db/operational-days');
const actualPayrollBatches = await vi.importActual<typeof import('../db/payroll-batches')>('../db/payroll-batches');

const workDate = '2026-10-17';
const receiver = { actorUserId: 20, actorRole: 'supervisor_malqa' };
const sender = { actorUserId: 10, actorRole: 'supervisor_tolan' };
const sourceGroup = { id: 11, name: 'Source group', costCenterId: 1, isActive: 1, isOperationalAssignmentExempt: 0 };
const targetGroup = { id: 22, name: 'Target group', costCenterId: 2, isActive: 1, isOperationalAssignmentExempt: 0 };
const request = {
  id: 71, workerId: 101, workDate,
  sourceGroupId: sourceGroup.id, sourceCostCenterId: sourceGroup.costCenterId,
  toGroupId: targetGroup.id, toCostCenterId: targetGroup.costCenterId,
  requestedBy: receiver.actorUserId, status: 'pending', activeKey: `101:${workDate}`,
  financeReady: 0, reviewedBy: null, reviewedAt: null, rejectionReason: null,
  completedBy: null, completedAt: null, restaurantId: null,
};
const createInput = {
  ...receiver, workDate, workerId: request.workerId,
  sourceGroupId: sourceGroup.id, toGroupId: targetGroup.id, toCostCenterId: targetGroup.costCenterId,
};

function scopeRows(costCenterId: number, groupIds: number[] = [], allGroups = 0) {
  return [[{ costCenterId, allGroups }], groupIds.map(groupId => ({ groupId }))];
}

function sourceWorkerRows() {
  return [[{ id: request.workerId, groupId: sourceGroup.id, status: 'active' }], [{ id: 901 }], []];
}

function queueCreate(overrides: { existing?: any[]; source?: typeof sourceGroup; present?: boolean } = {}) {
  mocked.state.selectQueue = [
    [overrides.source ?? sourceGroup], [targetGroup], ...scopeRows(2, [22]),
    [{ id: request.workerId, groupId: sourceGroup.id, status: 'active' }], overrides.present === false ? [] : [{ id: 901 }], [],
    overrides.existing ?? [], [request], [{ id: sender.actorUserId }],
  ];
}

function expectNoOperationalOrFinancialChanges() {
  for (const write of [...mocked.state.inserts, ...mocked.state.updates]) {
    expect(write.table).not.toBe(dailyWorkAssignments);
    expect(write.table).not.toBe(workerDailyFinance);
    expect(write.table).not.toBe(workers);
  }
  expect(mocked.processAttendanceToFinance).not.toHaveBeenCalled();
  expect(mocked.completeApprovedOperationalTransfer).not.toHaveBeenCalled();
}

beforeEach(() => {
    vi.clearAllMocks();
    mocked.state.selectQueue = [];
    mocked.state.inserts = [];
    mocked.state.updates = [];
    mocked.state.insertError = null;
    mocked.state.inTransaction = false;
    mocked.state.transactionEvents = [];
    mocked.state.selectQueries = [];
    mocked.assertOperationalTransferChangeAllowed.mockReset().mockResolvedValue(undefined);
    mocked.assertOperationalCostCenterAccess.mockReset().mockResolvedValue(undefined);
    mocked.assertOperationalAssignmentChangeAllowed.mockReset().mockResolvedValue({ isReopened: false });
    mocked.processAttendanceToFinance.mockReset().mockResolvedValue({ id: 1, created: false });
    mocked.completeApprovedOperationalTransfer.mockReset().mockResolvedValue({ success: true });
    mocked.sendNotification.mockResolvedValue(undefined);
    mocked.sendNotificationToRoles.mockResolvedValue(undefined);
    mocked.cleanupOrphanFinanceRecords.mockReset().mockResolvedValue({ deletedCount: 0 });
    mocked.getApprovedUnpostedDeductionsForPeriod.mockReset().mockResolvedValue([]);
    mocked.aggregatePayrollDataByCostCenter.mockReset().mockResolvedValue([]);
    mocked.getActorLabel.mockReset().mockResolvedValue('Test operator');
    mocked.logAudit.mockResolvedValue(undefined);
});

describe('operational transfers (isolated, without a database connection)', () => {
  it.each(['2026-02-31', '2026-13-01', '17-10-2026', '2026-10-17T00:00:00Z'])(
    'rejects invalid operational dates: %s', value => {
      expect(() => assertOperationalTransferDate(value)).toThrow('تاريخ اليوم التشغيلي غير صحيح');
      expect(mocked.db.select).not.toHaveBeenCalled();
    },
  );

  it('creates a pending full-day request without changing assignment, base group or finance', async () => {
    queueCreate();

    await expect(createOperationalTransferRequest(createInput)).resolves.toEqual({ success: true, id: request.id });

    expect(mocked.state.inserts).toEqual([{ table: operationalTransferRequests, values: expect.objectContaining({
      workerId: request.workerId, workDate, sourceGroupId: 11, sourceCostCenterId: 1,
      toGroupId: 22, toCostCenterId: 2, requestedBy: receiver.actorUserId,
      activeKey: `101:${workDate}`, status: 'pending', financeReady: 0,
    }) }]);
    expect(mocked.assertOperationalTransferChangeAllowed).toHaveBeenCalledWith(expect.objectContaining({
      workDate, sourceCostCenterId: 1, toCostCenterId: 2, tx: mocked.db,
    }));
    expect(mocked.sendNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: sender.actorUserId }));
    expectNoOperationalOrFinancialChanges();
  });

  it('rejects a request to a destination group outside the requesting operator scope', async () => {
    mocked.state.selectQueue = [[sourceGroup], [targetGroup], ...scopeRows(2, [23])];

    await expect(createOperationalTransferRequest(createInput)).rejects.toThrow('ليس لديك صلاحية');
    expect(mocked.state.inserts).toHaveLength(0);
    expect(mocked.sendNotification).not.toHaveBeenCalled();
  });

  it('rejects a transfer within the same cost center', async () => {
    queueCreate({ source: { ...sourceGroup, costCenterId: 2 } });

    await expect(createOperationalTransferRequest(createInput)).rejects.toThrow('مركزي تكلفة مختلفين');
    expect(mocked.state.inserts).toHaveLength(0);
  });

  it('rejects a worker without attendance on the requested work date', async () => {
    queueCreate({ present: false });

    await expect(createOperationalTransferRequest(createInput)).rejects.toThrow('غير حاضر');
    expect(mocked.state.inserts).toHaveLength(0);
  });

  it('rejects a second active or completed transfer for the same worker and date', async () => {
    queueCreate({ existing: [{ id: 99 }] });

    await expect(createOperationalTransferRequest(createInput)).rejects.toThrow('طلب نقل قائم أو نقل مكتمل');
    expect(mocked.state.inserts).toHaveLength(0);
    expectNoOperationalOrFinancialChanges();
  });

  it('reports a concurrent duplicate-key conflict as an existing transfer', async () => {
    queueCreate();
    mocked.state.insertError = Object.assign(new Error('Duplicate key'), { code: 'ER_DUP_ENTRY' });

    await expect(createOperationalTransferRequest(createInput)).rejects.toThrow('طلب نقل قائم أو نقل مكتمل');
    expect(mocked.sendNotification).not.toHaveBeenCalled();
  });

  it.each(['اليوم التشغيلي مغلق', 'توجد دفعة رواتب'])('does not create a transfer when either day is protected: %s', async message => {
    queueCreate();
    mocked.assertOperationalTransferChangeAllowed.mockRejectedValueOnce(new Error(message));

    await expect(createOperationalTransferRequest(createInput)).rejects.toThrow(message);
    expect(mocked.state.inserts).toHaveLength(0);
    expect(mocked.sendNotification).not.toHaveBeenCalled();
    expectNoOperationalOrFinancialChanges();
  });

  it('allows source group approval without requiring destination scope or applying financial changes', async () => {
    mocked.state.selectQueue = [[request], ...scopeRows(1, [11]), [request], [sourceGroup], [targetGroup], ...sourceWorkerRows()];

    await expect(approveOperationalTransferRequest({ id: request.id, ...sender })).resolves.toEqual({ success: true });

    expect(mocked.state.updates).toEqual([{ table: operationalTransferRequests, values: expect.objectContaining({
      status: 'approved', reviewedBy: sender.actorUserId, rejectionReason: null,
    }) }]);
    expect(mocked.sendNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: receiver.actorUserId }));
    expectNoOperationalOrFinancialChanges();
  });

  it.each([
    { label: 'the destination center only', centerId: 2, groupId: 22 },
    { label: 'another group in the source center', centerId: 1, groupId: 12 },
  ])('rejects approval by an operator assigned to $label', async ({ centerId, groupId }) => {
    mocked.state.selectQueue = [[request], ...scopeRows(centerId, [groupId])];

    await expect(approveOperationalTransferRequest({ id: request.id, ...receiver })).rejects.toThrow('ليس لديك صلاحية');
    expect(mocked.state.updates).toHaveLength(0);
    expect(mocked.sendNotification).not.toHaveBeenCalled();
  });

  it('does not approve a request once either operational day has been closed', async () => {
    mocked.state.selectQueue = [[request], ...scopeRows(1, [11])];
    mocked.assertOperationalTransferChangeAllowed.mockRejectedValueOnce(new Error('اليوم التشغيلي مغلق'));

    await expect(approveOperationalTransferRequest({ id: request.id, ...sender })).rejects.toThrow('مغلق');
    expect(mocked.state.updates).toHaveLength(0);
  });

  it.each(['approved', 'completed', 'rejected', 'cancelled'])('does not approve an already processed %s request', async status => {
    mocked.state.selectQueue = [[request], ...scopeRows(1, [11]), [{ ...request, status }]];

    await expect(approveOperationalTransferRequest({ id: request.id, ...sender })).rejects.toThrow('لم يعد بانتظار الموافقة');
    expect(mocked.state.updates).toHaveLength(0);
  });

  it.each(['', '   ', '\n\t', 'x'.repeat(501)])('requires a written rejection reason of up to 500 characters', async reason => {
    await expect(rejectOperationalTransferRequest({ id: request.id, reason, ...sender })).rejects.toThrow('سبب الرفض إلزامي');
    expect(mocked.db.select).not.toHaveBeenCalled();
    expect(mocked.state.updates).toHaveLength(0);
  });

  it('stores the rejection reason and releases the worker for a new request', async () => {
    mocked.state.selectQueue = [[request], ...scopeRows(1, [11])];

    await expect(rejectOperationalTransferRequest({ id: request.id, reason: '  العامل مطلوب في موقعه  ', ...sender })).resolves.toEqual({ success: true });

    expect(mocked.state.updates).toEqual([{ table: operationalTransferRequests, values: expect.objectContaining({
      status: 'rejected', activeKey: null, rejectionReason: 'العامل مطلوب في موقعه', reviewedBy: sender.actorUserId,
    }) }]);
    expectNoOperationalOrFinancialChanges();
  });

  it.each(['pending', 'approved'])('lets the requester cancel a %s transfer before completion', async status => {
    mocked.state.selectQueue = [[{ ...request, status }], ...scopeRows(2, [22]), []];

    await expect(cancelOperationalTransferRequest({ id: request.id, ...receiver })).resolves.toEqual({ success: true });

    expect(mocked.state.updates).toEqual([{ table: operationalTransferRequests, values: { status: 'cancelled', activeKey: null } }]);
    expectNoOperationalOrFinancialChanges();
  });

  it('does not let another destination operator cancel the requester transfer', async () => {
    mocked.state.selectQueue = [[request], ...scopeRows(2, [22])];

    await expect(cancelOperationalTransferRequest({ id: request.id, ...receiver, actorUserId: 21 })).rejects.toThrow('لمقدم الطلب فقط');
    expect(mocked.state.updates).toHaveLength(0);
  });

  it('does not let the requester cancel a completed transfer', async () => {
    mocked.state.selectQueue = [[{ ...request, status: 'completed' }], ...scopeRows(2, [22])];

    await expect(cancelOperationalTransferRequest({ id: request.id, ...receiver })).rejects.toThrow('لا يمكن إلغاء');
    expect(mocked.state.updates).toHaveLength(0);
  });

  it('delegates completion to the existing assignment and finance path after destination authorization', async () => {
    mocked.state.selectQueue = [[{ ...request, status: 'approved' }], ...scopeRows(2, [22]), []];

    await expect(completeOperationalTransferRequest({ id: request.id, restaurantId: 301, ...receiver })).resolves.toEqual({ success: true });

    expect(mocked.completeApprovedOperationalTransfer).toHaveBeenCalledOnce();
    expect(mocked.completeApprovedOperationalTransfer).toHaveBeenCalledWith({
      requestId: request.id, restaurantId: 301, ...receiver,
    });
  });

  it('rejects completion by an operator lacking the receiving group scope', async () => {
    mocked.state.selectQueue = [[{ ...request, status: 'approved' }], ...scopeRows(1, [11])];

    await expect(completeOperationalTransferRequest({ id: request.id, restaurantId: 301, ...sender })).rejects.toThrow('ليس لديك صلاحية');
    expect(mocked.completeApprovedOperationalTransfer).not.toHaveBeenCalled();
  });

  it('does not notify completion when assignment or financial completion fails', async () => {
    mocked.state.selectQueue = [[{ ...request, status: 'approved' }], ...scopeRows(2, [22])];
    mocked.completeApprovedOperationalTransfer.mockRejectedValueOnce(new Error('الموقع لا يتبع المركز المستقبِل'));

    await expect(completeOperationalTransferRequest({ id: request.id, restaurantId: 999, ...receiver })).rejects.toThrow('الموقع');
    expect(mocked.sendNotification).not.toHaveBeenCalled();
  });

  it('lists only requests inside the selected destination group scope', async () => {
    mocked.state.selectQueue = [...scopeRows(2, [22]), [
      { ...request, id: 71, status: 'approved' },
      { ...request, id: 72, toGroupId: 23 },
      { ...request, id: 73, status: 'pending' },
      { ...request, id: 74, status: 'completed', financeReady: 0 },
      { ...request, id: 75, status: 'completed', financeReady: 1 },
    ]];

    const rows = await listOperationalTransferRequests({ workDate, costCenterId: 2, ...receiver });

    expect(rows.map(row => row.id)).toEqual([71, 73, 74, 75]);
    expect(rows.find(row => row.id === 71)).toMatchObject({ canApprove: false, canReject: false, canComplete: true, canCancel: true });
    expect(rows.find(row => row.id === 73)).toMatchObject({ canApprove: false, canComplete: false, canCancel: true });
    expect(rows.find(row => row.id === 74)).toMatchObject({ canComplete: true, canCancel: false });
    expect(rows.find(row => row.id === 75)).toMatchObject({ canComplete: false, canCancel: false });
  });

  it('shows source requests for approval only to the assigned source group', async () => {
    mocked.state.selectQueue = [...scopeRows(1, [11]), [{ ...request }, { ...request, id: 72, sourceGroupId: 12 }]];

    const rows = await listOperationalTransferRequests({ workDate, costCenterId: 1, ...sender });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 71, canApprove: true, canReject: true, canCancel: false, canComplete: false });
  });

  it('limits destination choices to the operator groups while showing groups in other centers', async () => {
    mocked.state.selectQueue = [...scopeRows(2, [22]), [sourceGroup, targetGroup, { ...targetGroup, id: 23 }], [{ id: 301, name: 'Receiving site' }]];

    const options = await getOperationalTransferOptions({ workDate, toCostCenterId: 2, ...receiver });

    expect(options.sourceGroups.map(group => group.id)).toEqual([11]);
    expect(options.destinationGroups).toEqual([{ id: 22, name: targetGroup.name }]);
    expect(options.sites).toEqual([{ id: 301, name: 'Receiving site' }]);
  });

  it('removes workers who already have a request or an existing operational transfer', async () => {
    mocked.state.selectQueue = [...scopeRows(2, [22]), [sourceGroup], [
      { id: 101, fullName: 'Available worker', code: 'A101' },
      { id: 102, fullName: 'Pending worker', code: 'A102' },
      { id: 103, fullName: 'Transferred worker', code: 'A103' },
    ], [{ workerId: 102 }], [{ workerId: 103 }]];

    const rows = await getOperationalTransferWorkers({ workDate, toCostCenterId: 2, sourceGroupId: 11, ...receiver });

    expect(rows).toEqual([{ id: 101, fullName: 'Available worker', code: 'A101' }]);
  });

  it('rejects roles that are not allowed to manage operational transfers', async () => {
    await expect(createOperationalTransferRequest({ ...createInput, actorRole: 'accountant' })).rejects.toThrow('ليس لديك صلاحية إدارة');
    expect(mocked.db.select).not.toHaveBeenCalled();
  });
});

describe('approved transfer completion and financial recovery (real helper, mocked boundaries)', () => {
  const approved = { ...request, status: 'approved', reviewedBy: sender.actorUserId };
  const completionInput = { requestId: request.id, restaurantId: 301, ...receiver };
  const completed = { ...approved, status: 'completed', restaurantId: 301, completedBy: receiver.actorUserId };

  function queueCompletion(existing: any[] = []) {
    mocked.state.selectQueue = [
      [approved], [approved], [{ id: request.workerId, groupId: 11, status: 'active' }],
      [sourceGroup, targetGroup], [{ id: 901 }], [{ id: 301, costCenterId: 2, isActive: 1 }], existing,
    ];
  }

  function assignmentWrites() {
    return [...mocked.state.inserts, ...mocked.state.updates].filter(write => write.table === dailyWorkAssignments);
  }

  it('commits the approved destination assignment before calling the same finance processor used by direct transfers', async () => {
    queueCompletion();
    mocked.processAttendanceToFinance.mockImplementationOnce(async (workerId, date) => {
      expect([workerId, date]).toEqual([request.workerId, workDate]);
      expect(mocked.state.inTransaction).toBe(false);
      expect(mocked.state.transactionEvents).toEqual(['begin', 'commit']);
      expect(mocked.state.updates.filter(write => write.table === operationalTransferRequests)).toEqual([
        { table: operationalTransferRequests, values: expect.objectContaining({ status: 'completed', financeReady: 0 }) },
      ]);
      return { id: 1, created: false };
    });

    await expect(actualAssignments.completeApprovedOperationalTransfer(completionInput)).resolves.toEqual({
      success: true, alreadyCompleted: false,
    });

    expect(mocked.assertOperationalCostCenterAccess).toHaveBeenCalledWith(receiver.actorUserId, receiver.actorRole, 2, 22);
    expect(mocked.assertOperationalTransferChangeAllowed).toHaveBeenCalledWith(expect.objectContaining({
      workDate, sourceCostCenterId: 1, toCostCenterId: 2, tx: mocked.db,
    }));
    expect(assignmentWrites()).toEqual([{ table: dailyWorkAssignments, values: {
      workerId: request.workerId, workDate, sourceGroupId: 11, operationalGroupId: 22,
      restaurantId: 301, assignedBy: receiver.actorUserId,
    } }]);
    expect(mocked.processAttendanceToFinance).toHaveBeenCalledOnce();
    expect(mocked.state.updates.filter(write => write.table === operationalTransferRequests)).toEqual([
      { table: operationalTransferRequests, values: expect.objectContaining({ status: 'completed', financeReady: 0 }) },
      { table: operationalTransferRequests, values: { financeReady: 1 } },
    ]);
    expect([...mocked.state.inserts, ...mocked.state.updates].some(write => write.table === workers)).toBe(false);
  });

  it('replaces an existing source site assignment while preserving the worker base group', async () => {
    queueCompletion([{ id: 501, workerId: request.workerId, sourceGroupId: 11, operationalGroupId: null, restaurantId: 201 }]);

    await actualAssignments.completeApprovedOperationalTransfer(completionInput);

    expect(mocked.state.inserts.filter(write => write.table === dailyWorkAssignments)).toHaveLength(0);
    expect(mocked.state.updates.filter(write => write.table === dailyWorkAssignments)).toEqual([
      { table: dailyWorkAssignments, values: { sourceGroupId: 11, operationalGroupId: 22, restaurantId: 301, assignedBy: receiver.actorUserId } },
    ]);
    expect(mocked.processAttendanceToFinance).toHaveBeenCalledWith(request.workerId, workDate);
  });

  it('retains financeReady=0 after finance failure and retries without writing the assignment a second time', async () => {
    queueCompletion();
    mocked.processAttendanceToFinance.mockRejectedValueOnce(new Error('Temporary finance failure'));

    await expect(actualAssignments.completeApprovedOperationalTransfer(completionInput)).rejects.toThrow('تم تثبيت النقل وتعذر إكمال الاحتساب');

    expect(mocked.state.transactionEvents).toEqual(['begin', 'commit']);
    expect(mocked.state.updates.filter(write => write.table === operationalTransferRequests)).toEqual([
      { table: operationalTransferRequests, values: expect.objectContaining({ status: 'completed', financeReady: 0 }) },
    ]);
    expect(assignmentWrites()).toHaveLength(1);
    mocked.state.selectQueue = [[completed], [completed]];

    await expect(actualAssignments.completeApprovedOperationalTransfer(completionInput)).resolves.toEqual({
      success: true, alreadyCompleted: false,
    });

    expect(mocked.processAttendanceToFinance).toHaveBeenCalledTimes(2);
    expect(mocked.processAttendanceToFinance).toHaveBeenNthCalledWith(2, request.workerId, workDate);
    expect(assignmentWrites()).toHaveLength(1);
    expect(mocked.state.updates.at(-1)).toEqual({ table: operationalTransferRequests, values: { financeReady: 1 } });
  });

  it('does not repeat assignment or finance when completion is already financially ready', async () => {
    mocked.state.selectQueue = [[{ ...completed, financeReady: 1 }], [{ ...completed, financeReady: 1 }]];

    await expect(actualAssignments.completeApprovedOperationalTransfer(completionInput)).resolves.toEqual({
      success: true, alreadyCompleted: true,
    });

    expect(assignmentWrites()).toHaveLength(0);
    expect(mocked.state.updates).toHaveLength(0);
    expect(mocked.processAttendanceToFinance).not.toHaveBeenCalled();
  });

  it('does not let a financial retry change the completed work site', async () => {
    mocked.state.selectQueue = [[completed], [completed]];

    await expect(actualAssignments.completeApprovedOperationalTransfer({ ...completionInput, restaurantId: 302 })).rejects.toThrow('لا يمكن تغيير موقعه');

    expect(assignmentWrites()).toHaveLength(0);
    expect(mocked.processAttendanceToFinance).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'pending', row: request },
    { label: 'approved without source reviewer', row: { ...approved, reviewedBy: null } },
    { label: 'rejected', row: { ...approved, status: 'rejected' } },
    { label: 'cancelled', row: { ...approved, status: 'cancelled' } },
  ])('refuses completion of $label requests', async ({ row }) => {
    mocked.state.selectQueue = [[row], [row]];

    await expect(actualAssignments.completeApprovedOperationalTransfer(completionInput)).rejects.toThrow('قبل موافقة مسؤول المصدر');

    expect(assignmentWrites()).toHaveLength(0);
    expect(mocked.processAttendanceToFinance).not.toHaveBeenCalled();
  });

  it('enforces destination group scope before entering the completion transaction', async () => {
    mocked.state.selectQueue = [[approved]];
    mocked.assertOperationalCostCenterAccess.mockRejectedValueOnce(new Error('ليس لديك صلاحية المجموعة المستقبلة'));

    await expect(actualAssignments.completeApprovedOperationalTransfer(completionInput)).rejects.toThrow('المجموعة المستقبلة');

    expect(mocked.assertOperationalCostCenterAccess).toHaveBeenCalledWith(receiver.actorUserId, receiver.actorRole, 2, 22);
    expect(mocked.db.transaction).not.toHaveBeenCalled();
    expect(mocked.processAttendanceToFinance).not.toHaveBeenCalled();
  });

  it('refuses a work site outside the approved destination center', async () => {
    queueCompletion();
    mocked.state.selectQueue[5] = [{ id: 301, costCenterId: 1, isActive: 1 }];

    await expect(actualAssignments.completeApprovedOperationalTransfer(completionInput)).rejects.toThrow('تابعًا لمركز الاستقبال');

    expect(assignmentWrites()).toHaveLength(0);
    expect(mocked.processAttendanceToFinance).not.toHaveBeenCalled();
  });
});

describe('day closure while transfers are incomplete (real function, mocked connection)', () => {
  it.each([
    { costCenterId: 1, status: 'approved', financeReady: 0 },
    { costCenterId: 2, status: 'approved', financeReady: 0 },
    { costCenterId: 1, status: 'completed', financeReady: 0 },
    { costCenterId: 2, status: 'completed', financeReady: 0 },
  ])('blocks center $costCenterId for a $status transfer with financeReady=$financeReady', async ({ costCenterId, status, financeReady }) => {
    const center = { id: costCenterId, code: 'TEST', name: 'Test center' };
    const day = { id: 801, workDate, costCenterId, status: 'open', revision: 0 };
    mocked.state.selectQueue = [[center], [center], [day], [day], [{ id: request.id, status, financeReady }]];

    await expect(actualOperationalDays.closeOperationalDay({
      workDate, costCenterId, actorUserId: 1, actorRole: 'super_admin',
    })).rejects.toThrow('أكمل النقل قبل إغلاق اليوم');

    expect(mocked.state.updates).toHaveLength(0);
    expect(mocked.state.transactionEvents).toEqual(['begin', 'rollback']);
    expect(mocked.processAttendanceToFinance).not.toHaveBeenCalled();
  });
});

describe('payroll creation with incomplete transfers (real guard, mocked connection)', () => {
  const period = { periodStart: '2026-10-01', periodEnd: workDate };

  it.each([
    { costCenterId: 1, status: 'approved', financeReady: 0 },
    { costCenterId: 2, status: 'approved', financeReady: 0 },
    { costCenterId: 1, status: 'completed', financeReady: 0 },
    { costCenterId: 2, status: 'completed', financeReady: 0 },
  ])('refuses payroll for center $costCenterId when a transfer is $status and financeReady=$financeReady', async ({ costCenterId, status, financeReady }) => {
    mocked.state.selectQueue = [[{ id: request.id, workDate, status, financeReady }]];

    await expect(actualPayrollBatches.assertNoIncompleteOperationalTransfersForPayroll({ ...period, costCenterId }))
      .rejects.toThrow('لا يمكن إنشاء دفعة الرواتب لوجود نقل معتمد غير مكتمل');

    expect(mocked.state.inserts).toHaveLength(0);
    expect(mocked.state.updates).toHaveLength(0);
    expect(mocked.processAttendanceToFinance).not.toHaveBeenCalled();
  });

  it('allows the guard to return when no incomplete transfers exist in the payroll scope', async () => {
    mocked.state.selectQueue = [[]];

    await expect(actualPayrollBatches.assertNoIncompleteOperationalTransfersForPayroll({ ...period, costCenterId: 2 }))
      .resolves.toBeUndefined();
  });

  it('checks the period, both centers, both groups, explicit workers and incomplete financial states', async () => {
    mocked.state.selectQueue = [[]];

    await actualPayrollBatches.assertNoIncompleteOperationalTransfersForPayroll({
      periodStart: `${period.periodStart}T00:00:00Z`, periodEnd: `${workDate}T23:59:59Z`,
      costCenterId: 2, groupId: 11, groupIds: [11, 22, 11], workerIds: [101, 101], tx: mocked.db,
    });

    const selection = mocked.state.selectQueries[0];
    const query = new MySqlDialect().sqlToQuery(selection.condition);
    expect(selection.table).toBe(operationalTransferRequests);
    expect(selection.locked).toBe('update');
    expect(query.sql).toContain('`source_cost_center_id`');
    expect(query.sql).toContain('`to_cost_center_id`');
    expect(query.sql).toContain('`source_group_id`');
    expect(query.sql).toContain('`to_group_id`');
    expect(query.sql).toContain('`worker_id`');
    expect(query.sql).toContain('`finance_ready`');
    expect(query.params).toEqual(expect.arrayContaining([period.periodStart, workDate, 'approved', 'completed', 0, 2, 11, 22, 101]));
    expect(query.params.filter(value => value === 11)).toHaveLength(2);
    expect(query.params.filter(value => value === 101)).toHaveLength(1);
  });

  it('blocks the actual payroll entry point before transaction or financial work when a transfer is already incomplete', async () => {
    mocked.state.selectQueue = [[{ id: request.id, workDate }]];

    await expect(actualPayrollBatches.createPayrollBatch({ ...period, costCenterId: 2, createdBy: 1, items: [] }))
      .rejects.toThrow('نقل معتمد غير مكتمل');

    expect(mocked.db.transaction).not.toHaveBeenCalled();
    expect(mocked.state.inserts).toHaveLength(0);
    expect(mocked.processAttendanceToFinance).not.toHaveBeenCalled();
  });

  it('rechecks under the center-day locks to block an approval committed while payroll was waiting', async () => {
    mocked.state.selectQueue = [[], [{ id: request.id, workDate }]];

    await expect(actualPayrollBatches.createPayrollBatch({
      periodStart: workDate, periodEnd: workDate, costCenterId: 2, createdBy: 1, items: [],
    })).rejects.toThrow('نقل معتمد غير مكتمل');

    expect(mocked.lockOperationalDayRows).toHaveBeenCalledWith(workDate, [2], mocked.db);
    expect(mocked.state.selectQueries[1].locked).toBe('update');
    expect(mocked.state.transactionEvents).toEqual(['begin', 'rollback']);
    expect(mocked.state.inserts).toHaveLength(0);
    expect(mocked.processAttendanceToFinance).not.toHaveBeenCalled();
  });

  it('releases the payroll queue after a failed request so the following request can be checked', async () => {
    mocked.state.selectQueue = [[{ id: 71, workDate: '2026-10-15' }], [{ id: 72, workDate: '2026-10-16' }]];
    const input = { ...period, costCenterId: 2, createdBy: 1, items: [] };

    await expect(actualPayrollBatches.createPayrollBatch(input)).rejects.toThrow('2026-10-15');
    await expect(actualPayrollBatches.createPayrollBatch(input)).rejects.toThrow('2026-10-16');

    expect(mocked.db.select).toHaveBeenCalledTimes(2);
    expect(mocked.db.transaction).not.toHaveBeenCalled();
  });

  it('keeps a second payroll creation outside the transaction until the first attempt releases the queue', async () => {
    let releaseFirst!: () => void;
    let firstEntered!: () => void;
    const gate = new Promise<void>(resolve => { releaseFirst = resolve; });
    const entered = new Promise<void>(resolve => { firstEntered = resolve; });
    mocked.state.selectQueue = [[], [{ id: 72, workDate: '2026-10-16' }]];
    mocked.db.transaction.mockImplementationOnce(async () => {
      firstEntered();
      await gate;
      throw new Error('First payroll attempt failed');
    });
    const input = { periodStart: workDate, periodEnd: workDate, costCenterId: 2, createdBy: 1, items: [] };
    const first = actualPayrollBatches.createPayrollBatch(input).catch(error => error);
    await entered;
    const second = actualPayrollBatches.createPayrollBatch(input).catch(error => error);
    // Flush scheduling microtasks while the first transaction remains explicitly gated.
    await Promise.resolve();
    await Promise.resolve();
    expect(mocked.db.select).toHaveBeenCalledTimes(1);
    expect(mocked.db.transaction).toHaveBeenCalledOnce();
    releaseFirst();

    const [firstFailure, secondFailure] = await Promise.all([first, second]);

    expect(firstFailure).toBeInstanceOf(Error);
    expect(firstFailure.message).toBe('First payroll attempt failed');
    expect(secondFailure).toBeInstanceOf(Error);
    expect(secondFailure.message).toContain('2026-10-16');
    expect(mocked.db.select).toHaveBeenCalledTimes(2);
    expect(mocked.db.transaction).toHaveBeenCalledOnce();
  });

  it('initializes and reads the annual sequence on the batch transaction and uses it for the resulting batch', async () => {
    mocked.state.selectQueue = [[], [], []];
    const executed: Array<{ text: string; params: unknown[] }> = [];
    const execute = vi.fn(async (query: any) => {
      const compiled = new MySqlDialect().sqlToQuery(query);
      executed.push({ text: compiled.sql, params: compiled.params });
      return compiled.sql.includes('SELECT LAST_INSERT_ID()') ? [[{ seq: 1 }]] : [{ affectedRows: 1 }];
    });
    // The pool-level object deliberately has no execute method. The sequence must
    // use this transaction object, rather than acquiring an independent connection.
    const tx = { ...mocked.db, execute };
    mocked.db.transaction.mockImplementationOnce(async (callback: (database: any) => unknown) => callback(tx));
    mocked.aggregatePayrollDataByCostCenter.mockResolvedValueOnce([{
      workerId: request.workerId, groupId: 22, daysWorked: 1,
      baseAmount: '100.00', deductions: '0.00', bonuses: '0.00', netAmount: '100.00',
    }]);

    const outcome = await actualPayrollBatches.createPayrollBatch({
      periodStart: workDate, periodEnd: workDate, costCenterId: 2, createdBy: 1, items: [],
    });

    const expectedCode = `PR${String(new Date().getFullYear()).slice(-2)}0001`;
    expect(outcome).toEqual({ batchId: 71, batchCode: expectedCode });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(executed[0].text).toContain('VALUES (?, LAST_INSERT_ID(1))');
    expect(executed[0].params).toEqual([new Date().getFullYear()]);
    expect(executed[1].text).toContain('SELECT LAST_INSERT_ID() as seq');
    expect(mocked.lockOperationalDayRows).toHaveBeenCalledWith(workDate, [2], tx);
    expect(mocked.state.inserts.find(write => write.table === payrollBatches)?.values).toMatchObject({
      batchCode: expectedCode, totalWorkers: 1, totalAmount: '100.00',
    });
    expect(mocked.state.inserts.find(write => write.table === payrollBatchItems)?.values).toMatchObject({
      batchId: 71, workerId: request.workerId, netAmount: '100.00',
    });
  });
});
